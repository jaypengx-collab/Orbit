// ---- cloudflare-worker/sync-proxy-worker.js ----
// Optional server-side proxy for cross-device sync (see the main repo's
// src/sync.js). Without this Worker, every device talks straight to
// Firestore's REST API and the pairing code is the *only* gate - anyone who
// enables sync is trusting Firestore's security rules alone, which can only
// check the shape of a request (does the code match the pattern, is the
// payload a small string), never how many requests a caller has made. This
// Worker adds the one thing rules structurally cannot: a real, cross-request
// rate limit, the same way gemini-proxy-worker.js does for the AI import
// feature.
//
// This requires more setup than the AI proxy, because closing the gap
// properly means closing Firestore's direct, ruleset-gated door entirely -
// otherwise an abuser just skips this Worker and hits Firestore directly,
// same as before. That means:
//   1. This Worker authenticates to Firestore as a Google Cloud *service
//      account* (FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY below), not as
//      an anonymous client. Service-account access is treated the same as
//      the Admin SDK: it bypasses Firestore Security Rules entirely, by
//      design - the rules only ever gated unauthenticated client access.
//   2. Once this Worker is live, set the Firestore rule for
//      /orbit-schedules/{code} to `allow read, write: if false`. That closes
//      the direct-client door completely - real, unauthenticated public
//      access - since actual devices now only ever reach this Worker, and
//      this Worker's own traffic to Firestore ignores that rule anyway
//      (see point 1). See README's cross-device sync section for the exact
//      rule text and the full one-time setup this needs.
//
// Deploying this Worker is entirely optional - src/sync.js falls back to
// talking to Firestore directly (its original behavior) when
// VITE_ORBIT_SYNC_PROXY_URL isn't set, exactly like a fork that skips the AI
// import feature falls back to nothing. Setting this up only matters for
// the shared, publicly-deployed instance of Orbit AI, where "some stranger
// scripts a flood of writes/reads" is an actual cost to the project owner,
// not a self-hosted fork with its own Firebase project the forker pays for
// and abuses at their own risk.

// Must match the code format the client generates (src/sync.js's
// CODE_ALPHABET/CODE_LENGTH) and the Firestore rule regex - rejecting a
// malformed code here means it never even reaches Firestore, and the error
// message is the same either way.
const CODE_PATTERN = /^[2-9A-HJ-NP-Z]{8}$/;

// Same cap as the Firestore rule (request.resource.data.payload.size() <
// 20000) - checked again here so an oversized write is rejected before ever
// spending a Firestore call on it, not because the rule can't be trusted.
const MAX_PAYLOAD_LENGTH = 20000;

const ALLOWED_ORIGINS = ['https://jaypengx-collab.github.io'];

function isAllowedOrigin(origin) {
  return ALLOWED_ORIGINS.includes(origin) || /^http:\/\/localhost:\d+$/.test(origin || '');
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : 'null',
    'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin'
  };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' }
  });
}

// ---- Rate limiting (Workers KV - see gemini-proxy-worker.js's isRateLimited
// for the same pattern and its reasoning) ----
//
// Sync's own legitimate traffic looks nothing like the AI import feature's:
// two paired devices poll every 8 seconds *for as long as the tab stays
// open*, so a single active device is ~450 requests/hour all on its own,
// and a shared IP (school Wi-Fi, one household) can easily be several
// devices at once. Reads (GET, i.e. polling) need a limit generous enough
// that this normal, legitimate traffic pattern never trips it - it's only
// meant to catch a genuine scripted flood, not "several classmates behind
// the same NAT". Writes (PATCH) are rarer in normal use (only when a
// manager device actually has unsaved changes to publish) so they get a
// much tighter cap, since a write is also the only request that can create
// throwaway Firestore documents or burn write quota.
const READ_RATE_LIMIT = 6000;
const WRITE_RATE_LIMIT = 300;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_WINDOW_SECONDS = RATE_WINDOW_MS / 1000;

async function isRateLimitedKV(kv, ip, kind, limit) {
  const bucket = Math.floor(Date.now() / RATE_WINDOW_MS);
  // "sync" prefix keeps this Worker's keys distinct from
  // gemini-proxy-worker.js's `rl:` keys, in case both are ever pointed at
  // the same KV namespace to save creating a second one.
  const key = `syncrl:${kind}:${ip}:${bucket}`;
  const count = Number((await kv.get(key)) || '0');
  if (count >= limit) return true;
  await kv.put(key, String(count + 1), { expirationTtl: RATE_WINDOW_SECONDS + 60 });
  return false;
}

const requestLog = new Map();
function isRateLimitedInMemory(ip, kind, limit) {
  const mapKey = `${kind}:${ip}`;
  const now = Date.now();
  const timestamps = (requestLog.get(mapKey) || []).filter(time => now - time < RATE_WINDOW_MS);
  const limited = timestamps.length >= limit;
  timestamps.push(now);
  requestLog.set(mapKey, timestamps);
  return limited;
}

// kind is 'read' or 'write' - see the two constants above for why they're
// capped differently. Returns { limited, backend } - see
// gemini-proxy-worker.js's isRateLimited for why backend is surfaced as a
// response header instead of just a boolean.
async function isRateLimited(env, ip, kind) {
  const limit = kind === 'write' ? WRITE_RATE_LIMIT : READ_RATE_LIMIT;
  if (env.RATE_LIMIT_KV) {
    try {
      return { limited: await isRateLimitedKV(env.RATE_LIMIT_KV, ip, kind, limit), backend: 'kv' };
    } catch (error) {
      return {
        limited: isRateLimitedInMemory(ip, kind, limit),
        backend: `kv-error:${(error && error.message) || error}`
      };
    }
  }
  return { limited: isRateLimitedInMemory(ip, kind, limit), backend: 'memory-no-binding' };
}

// ---- Firestore access as a service account (bypasses security rules - see
// the top-of-file comment for why that's the point) ----

function base64UrlFromBytes(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function base64UrlFromString(str) {
  return base64UrlFromBytes(new TextEncoder().encode(str));
}
function pemToDer(pem) {
  const b64 = pem
    .trim()
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// Cached per-isolate (module scope) so a burst of requests on the same
// isolate reuses one access token instead of round-tripping to Google's
// OAuth endpoint on every single Firestore call - the token is valid for an
// hour, refetched a little early rather than right at expiry.
let cachedToken = null;
async function getAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiry > now + 60) return cachedToken.token;

  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: env.FIREBASE_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  };
  const unsigned = `${base64UrlFromString(JSON.stringify(header))}.${base64UrlFromString(JSON.stringify(claim))}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(env.FIREBASE_PRIVATE_KEY),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned)
  );
  const jwt = `${unsigned}.${base64UrlFromBytes(new Uint8Array(signature))}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${encodeURIComponent(jwt)}`
  });
  if (!response.ok) {
    throw new Error(`Google OAuth token exchange failed: ${await response.text()}`);
  }
  const data = await response.json();
  cachedToken = { token: data.access_token, expiry: now + (data.expires_in || 3600) };
  return cachedToken.token;
}

function firestoreDocUrl(env, code) {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)/documents/orbit-schedules/${encodeURIComponent(code)}`;
}
async function firestoreErrorMessage(response) {
  const errorJson = await response.json().catch(() => ({}));
  return errorJson.error?.message || response.statusText || `HTTP ${response.status}`;
}

async function firestoreGet(env, code) {
  const token = await getAccessToken(env);
  const response = await fetch(firestoreDocUrl(env, code), {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (response.status === 404) return { exists: false, updateTime: '', payload: '' };
  if (!response.ok) throw new Error(await firestoreErrorMessage(response));
  const doc = await response.json();
  return {
    exists: true,
    updateTime: doc.updateTime || '',
    payload: doc.fields?.payload?.stringValue || ''
  };
}

async function firestorePatch(env, code, payload) {
  const token = await getAccessToken(env);
  const response = await fetch(`${firestoreDocUrl(env, code)}?updateMask.fieldPaths=payload`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { payload: { stringValue: payload } } })
  });
  if (!response.ok) throw new Error(await firestoreErrorMessage(response));
  const doc = await response.json();
  return { updateTime: doc.updateTime || '' };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'GET' && request.method !== 'PATCH') {
      return json({ error: { message: 'GET or PATCH only' } }, 405, headers);
    }

    const code = (new URL(request.url).searchParams.get('code') || '').trim().toUpperCase();
    if (!CODE_PATTERN.test(code)) {
      return json({ error: { message: 'Invalid pairing code' } }, 400, headers);
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const kind = request.method === 'GET' ? 'read' : 'write';
    const rateLimit = await isRateLimited(env, ip, kind);
    // Diagnostic only, same reasoning as gemini-proxy-worker.js's identical
    // header - not sensitive, just which code path ran.
    headers['X-RateLimit-Backend'] = rateLimit.backend;
    if (rateLimit.limited) {
      return json({ error: { message: '請求過於頻繁，請稍後再試。' } }, 429, headers);
    }

    if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
      return json({ error: { message: 'Worker 尚未設定 Firebase 服務帳戶。' } }, 500, headers);
    }

    try {
      if (request.method === 'GET') {
        const result = await firestoreGet(env, code);
        return json(result, 200, headers);
      }
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: { message: 'Invalid JSON body' } }, 400, headers);
      }
      const payload = body?.payload;
      if (typeof payload !== 'string' || !payload || payload.length > MAX_PAYLOAD_LENGTH) {
        return json({ error: { message: 'Missing or invalid payload' } }, 400, headers);
      }
      const result = await firestorePatch(env, code, payload);
      return json(result, 200, headers);
    } catch (error) {
      return json({ error: { message: error.message || 'Upstream request failed' } }, 502, headers);
    }
  }
};
