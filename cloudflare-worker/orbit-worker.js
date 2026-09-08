// ---- cloudflare-worker/orbit-worker.js ----
// A single Cloudflare Worker serving both of Orbit AI's optional
// server-side features, routed by path:
//
//   POST      /gemini  - AI schedule-photo import (see src/gemini-ocr.js).
//                         Holds the real Gemini API key server-side so end
//                         users never need one of their own.
//   GET/PATCH/DELETE /sync - cross-device sync (see src/sync.js). Holds a
//                         Firebase service-account key server-side and
//                         proxies Firestore, so the pairing code isn't the
//                         only thing standing between the internet and
//                         that Firestore project. DELETE wipes the shared
//                         document outright (see orbitSyncDeleteForEveryone).
//
// Combined into one file/one deployment purely for setup convenience - one
// Worker, one KV binding, one set of secrets to manage - not for any
// technical reason: Cloudflare's Workers Free plan daily request cap
// (100,000/day) is per-account, not per-Worker, so splitting these into
// two Workers never bought any extra headroom in the first place.
//
// The two features still have very different trust boundaries - /gemini
// only ever runs a fixed prompt against a submitted image, while /sync
// holds credentials with full read/write access to the shared Firestore
// project - so each validates and rate-limits its own requests
// independently (see isRateLimited: every call passes its own `feature`
// key, so a burst against one path can never eat into the other's quota)
// and neither path touches the other's secrets or code.
//
// Both features are entirely optional. Not configuring GEMINI_API_KEY (see
// handleGeminiRequest) or the FIREBASE_* secrets (see handleSyncRequest)
// just makes that one path return a "not configured" error - the other
// still works normally. See README for the one-time setup each needs
// (paste this file into a new Worker in the Cloudflare dashboard, set
// whichever secrets apply, point the matching VITE_ORBIT_..._PROXY_URL env
// var at this Worker's *.workers.dev URL with /gemini or /sync appended).

const ALLOWED_ORIGINS = ['https://jaypengx-collab.github.io'];

function isAllowedOrigin(origin) {
  return ALLOWED_ORIGINS.includes(origin) || /^http:\/\/localhost:\d+$/.test(origin || '');
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : 'null',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
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

// ---- Shared rate limiting (Workers KV, one counter per feature+IP+hour) ----
//
// Real, cross-request rate limiting via Workers KV (env.RATE_LIMIT_KV - see
// README, an optional but recommended one-time binding), shared across
// every edge location - unlike a plain in-memory Map (kept below as
// isRateLimitedInMemory, used only as a fallback if the KV binding is
// missing or a KV call errors): Workers run many isolates in parallel
// across Cloudflare's edge, so an in-memory counter resets per isolate and
// a distributed burst of requests can blow straight through it. KV is
// still not a hard security boundary on its own (an abuser can spread
// requests across enough source IPs to dodge a per-IP counter), but it
// closes the specific gap of "just send enough requests to outrun a single
// isolate's memory." The real, unconditional backstop underneath both is
// Cloudflare's own free-plan daily request cap.
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_WINDOW_SECONDS = RATE_WINDOW_MS / 1000;

async function isRateLimitedKV(kv, bucketKey, limit) {
  const windowBucket = Math.floor(Date.now() / RATE_WINDOW_MS);
  const key = `rl:${bucketKey}:${windowBucket}`;
  const count = Number((await kv.get(key)) || '0');
  if (count >= limit) return true;
  // expirationTtl a little past the window so a key never outlives its own
  // bucket by much, instead of accumulating in the namespace forever.
  await kv.put(key, String(count + 1), { expirationTtl: RATE_WINDOW_SECONDS + 60 });
  return false;
}

const requestLog = new Map();
function isRateLimitedInMemory(bucketKey, limit) {
  const now = Date.now();
  const timestamps = (requestLog.get(bucketKey) || []).filter(time => now - time < RATE_WINDOW_MS);
  const limited = timestamps.length >= limit;
  timestamps.push(now);
  requestLog.set(bucketKey, timestamps);
  return limited;
}

// `feature` keys the counter (e.g. 'gemini', 'sync:read', 'sync:write') so
// every call site's limit is tracked completely independently of every
// other's - see the top-of-file comment for why that separation matters.
// Returns { limited, backend } rather than a plain boolean so the caller
// can surface `backend` as a diagnostic response header - there's no way
// to inspect a live Worker's internal state otherwise (no log access from
// outside the Cloudflare dashboard), and "is the binding even wired up"
// has turned out to need a real, checkable answer more than once.
async function isRateLimited(env, ip, feature, limit) {
  const bucketKey = `${feature}:${ip}`;
  if (env.RATE_LIMIT_KV) {
    try {
      return { limited: await isRateLimitedKV(env.RATE_LIMIT_KV, bucketKey, limit), backend: 'kv' };
    } catch (error) {
      return {
        limited: isRateLimitedInMemory(bucketKey, limit),
        backend: `kv-error:${(error && error.message) || error}`
      };
    }
  }
  return { limited: isRateLimitedInMemory(bucketKey, limit), backend: 'memory-no-binding' };
}

// ==== /gemini - AI schedule-photo import ====================================

// Exact copy of the prompt that used to live in src/gemini-ocr.js's
// AIVisionProcessor.buildPrompt() - kept here now instead, since the whole
// point of moving it server-side is that the client no longer sends it.
const GEMINI_PROMPT = `Extract the class timetable from the attached file(s) and return it as a single JSON object. Focus on the timetable only — ignore background, margins, decorations, and unrelated content; it may only occupy part of the frame.

When more than one file is attached, they describe ONE timetable together, not several: read all of them first, then answer once. They are given in the order the user chose them, and a later file is normally there to fill in or correct what an earlier one left vague — for example a timetable photo with placeholder or generic slot names followed by a screenshot of the student's own enrolled classes, where the second file supplies the real subject and teacher names for the first file's slots. Prefer the more specific, more legible source for any given detail, and prefer a later file when two disagree about the same slot. Never emit a slot twice because two files showed it.

Return valid JSON only, matching this exact schema:
{
  "bellTimes": [],
  "breakTimes": [{"name":"午休","start":"12:00","end":"13:00"}],
  "teacherDB": {"國文": ["國文", "陳老師", "A101"], "英文": ["英文", "王老師", "B202"]},
  "locationDB": {"國文":"A101", "英文":"B202"},
  "weeklySchedule": {"1": ["國文","英文",null], "2": [], "3": [], "4": [], "5": []},
  "reverseWeek": false,
  "countdownEvents": [{"name":"116 學測","startDate":"2027-01-22","endDate":"2027-01-24"}]
}

Interpret the timetable visually and use your best judgment to reconstruct its structure. Rules:
- Read class period times from the image when available. Use 24-hour "HH:MM" strings, one entry per period in order, exactly as shown (either ["08:10","09:00"] or {"start":"08:10","end":"09:00"} is acceptable). Preserve the actual times; never invent, guess, or fall back to standard/default school times. If no class times are visible anywhere, return an empty bellTimes array.
- Identify visible subjects, teachers, classrooms, breaks, and other timetable information.
- teacherDB: one entry per distinct subject actually visible in the photo — do not invent subjects that aren't shown. Use the subject's Chinese name as its own key in this object; if two subjects share the same name, make the keys distinct (e.g. append the teacher's name). Value is [full subject name, teacher name, classroom]. Use "" for teacher/location when that information is not readable.
- locationDB maps each subject key to its visible classroom/location; use "" when not visible.
- weeklySchedule: keys "1" through "5" (Monday–Friday) are REQUIRED and must all be present, even as an empty array — never omit or truncate "5" (Friday) even if it is partially cut off in the photo. Add "6" (Saturday) and/or "0" (Sunday) ONLY if the photo actually shows a column for that day; otherwise omit them entirely. Keep each day's array aligned with the detected periods (one entry per bellTimes index). Use null when a slot is genuinely empty or cannot be identified; every non-null entry must be a key that exists in teacherDB.
- If odd/even weeks contain alternatives in the same slot, combine them with "/" (e.g. "國文/公民") and do the same for the corresponding teacher names, using one shared key for that slot.
- Set reverseWeek to true only when the photo clearly indicates a reversed odd/even week orientation; otherwise false.
- Add breakTimes only for explicitly shown non-class periods such as lunch or cleaning — not empty/free periods.
- Add countdownEvents only for clearly visible events/exams with a readable calendar date, formatted as "YYYY-MM-DD". Set startDate and endDate to the same date for a single-day event; use the visible first and last dates for a multi-day event/exam period. Only include dates you can actually read; otherwise return an empty array.
- Do not invent information. When uncertain, prefer an empty value or null. Combining two files is not inventing; guessing at something neither of them shows is.
- Every field in the response schema you are given must be present, even when empty.
- Keep all fields internally consistent.
- Return ONLY the raw JSON object — no markdown fences, no comments, no extra text.`;

// Must match src/gemini-ocr.js's AIVisionProcessor.geminiModels exactly -
// this is the actual enforcement point that stops the model name from being
// an arbitrary passthrough to Gemini's API. Ordered fastest-first there and
// mirrored here; see that file for why the order flipped.
const GEMINI_ALLOWED_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.7-flash',
  'gemini-2.5-flash'
];

// The exact shape src/gemini-ocr.js's normalizeAIOutput() reads back,
// handed to the model as a response schema rather than only described in
// prompt prose. Constrained decoding is the single biggest lever this proxy
// has on how long a request takes: the model can no longer spend output
// tokens on a markdown fence, a preamble, a trailing explanation or a
// differently-shaped object, so there are simply fewer tokens to generate,
// and the client's own fence-stripping/brace-hunting salvage path in
// parseResponse() stops being the normal case. It is not a substitute for
// the prompt - the prompt still says what to extract and what not to invent
// - only for the half of it that describes JSON punctuation.
//
// Deliberately loose in two places: bellTimes/breakTimes times stay plain
// strings (normalizeTime() already accepts and repairs several forms, and a
// stricter pattern would make the model drop a period it could otherwise
// half-read), and weeklySchedule is a fixed set of seven arrays because a
// schema cannot express "these keys are required, the others optional".
const GEMINI_TIME_RANGE_SCHEMA = {
  type: 'object',
  properties: { start: { type: 'string' }, end: { type: 'string' } },
  required: ['start', 'end']
};
const GEMINI_DAY_SCHEMA = { type: 'array', items: { type: 'string', nullable: true } };
const GEMINI_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    bellTimes: { type: 'array', items: GEMINI_TIME_RANGE_SCHEMA },
    breakTimes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          start: { type: 'string' },
          end: { type: 'string' }
        },
        required: ['name', 'start', 'end']
      }
    },
    // The subject keys are the model's own choice (the prompt asks for the
    // Chinese subject name), so this is a free-form map of key -> [subject,
    // teacher, location] rather than a fixed property list.
    teacherDB: {
      type: 'object',
      additionalProperties: { type: 'array', items: { type: 'string' } }
    },
    locationDB: { type: 'object', additionalProperties: { type: 'string' } },
    weeklySchedule: {
      type: 'object',
      properties: {
        0: GEMINI_DAY_SCHEMA,
        1: GEMINI_DAY_SCHEMA,
        2: GEMINI_DAY_SCHEMA,
        3: GEMINI_DAY_SCHEMA,
        4: GEMINI_DAY_SCHEMA,
        5: GEMINI_DAY_SCHEMA,
        6: GEMINI_DAY_SCHEMA
      },
      required: ['1', '2', '3', '4', '5']
    },
    reverseWeek: { type: 'boolean' },
    countdownEvents: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          startDate: { type: 'string' },
          endDate: { type: 'string' }
        },
        required: ['name', 'startDate', 'endDate']
      }
    }
  },
  required: ['bellTimes', 'teacherDB', 'weeklySchedule']
};

// Same reasoning as AIVisionProcessor.buildGenerationConfig() (which this
// replaces client-side) - plain structured extraction gets no benefit from
// the models' default "thinking" pass, and different model families expose
// that knob differently.
function buildGenerationConfig(model) {
  return {
    response_mime_type: 'application/json',
    response_schema: GEMINI_RESPONSE_SCHEMA,
    temperature: 0.1,
    maxOutputTokens: 8192,
    thinkingConfig: /^gemini-2\./.test(model) ? { thinkingBudget: 0 } : { thinkingLevel: 'low' }
  };
}

// What a single submitted file may be. Images and PDFs are the two things
// Gemini actually *looks at* rather than flattening to text (see its
// document-understanding docs), and between them they cover every way a
// student realistically has a timetable on their phone: a photo, a
// screenshot, an iPhone HEIC straight out of the camera roll, or the PDF
// the school published. Anything else is refused here rather than being
// forwarded and billed for.
const GEMINI_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf'
];
// A downscaled JPEG (see src/gemini-ocr.js's encodeCanvasAsJpeg) is
// realistically a few hundred KB base64-encoded; this caps well above that
// so a legitimate photo - or a pass-through PDF the browser could not
// re-encode - is never rejected, while still bounding how much upstream
// bandwidth/tokens one request can burn.
const MAX_FILE_BASE64_LENGTH = 10_000_000;
// Gemini's own inline-data ceiling for a whole request is 20MB; this stays
// under it with room for the prompt, and is what stops "send several files
// at once" from turning into an unbounded upload.
const MAX_TOTAL_BASE64_LENGTH = 18_000_000;
const MAX_FILES_PER_REQUEST = 6;

const GEMINI_RATE_LIMIT = 20;

// Reads either the current `files: [{mime_type, data}, ...]` body or the
// older single-`image` one, so a client still running from a stale service
// worker cache keeps working after this Worker is redeployed. Returns a
// plain error string rather than throwing - every failure here is a 400
// with that message.
function readGeminiFiles(body) {
  const files = Array.isArray(body?.files) ? body.files : body?.image ? [body.image] : null;
  if (!files || !files.length) return { error: 'Missing or invalid files' };
  if (files.length > MAX_FILES_PER_REQUEST) {
    return { error: `At most ${MAX_FILES_PER_REQUEST} files per request` };
  }
  let total = 0;
  for (const file of files) {
    if (
      !file ||
      typeof file.mime_type !== 'string' ||
      !GEMINI_ALLOWED_MIME_TYPES.includes(file.mime_type) ||
      typeof file.data !== 'string' ||
      !file.data ||
      file.data.length > MAX_FILE_BASE64_LENGTH
    ) {
      return { error: 'Missing or invalid files' };
    }
    total += file.data.length;
  }
  if (total > MAX_TOTAL_BASE64_LENGTH) return { error: 'Submitted files are too large' };
  return { files };
}

async function handleGeminiRequest(request, env, headers, ip) {
  // A warm-up ping, sent the moment the user opens the file picker (see
  // src/gemini-ocr.js's warmUpGeminiProxy) - long before there's anything
  // to actually send. It exists purely to pay the connection's setup cost
  // (DNS, TLS, and this Worker's own first-request initialization) while
  // the user is still choosing a file, instead of on the critical path
  // afterwards. Deliberately does no work, calls nothing upstream, and is
  // not rate-limited: it must stay far cheaper than the request it is
  // warming the path for, or it would be a worse denial-of-service target
  // than the real endpoint.
  if (request.method === 'GET') return json({ ok: true }, 200, headers);
  if (request.method !== 'POST') return json({ error: { message: 'POST only' } }, 405, headers);

  const rateLimit = await isRateLimited(env, ip, 'gemini', GEMINI_RATE_LIMIT);
  // Diagnostic only - not sensitive (no IPs, no counts, just which code
  // path ran) - on every response so it can be checked with one curl
  // request instead of needing dashboard log access.
  headers['X-RateLimit-Backend'] = rateLimit.backend;
  if (rateLimit.limited) {
    return json({ error: { message: '請求過於頻繁，請稍後再試。' } }, 429, headers);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: { message: 'Invalid JSON body' } }, 400, headers);
  }
  const { model } = body || {};
  if (!GEMINI_ALLOWED_MODELS.includes(model)) {
    return json({ error: { message: 'Unsupported model' } }, 400, headers);
  }
  const parsedFiles = readGeminiFiles(body);
  if (parsedFiles.error) return json({ error: { message: parsedFiles.error } }, 400, headers);
  if (!env.GEMINI_API_KEY) {
    return json({ error: { message: 'Worker 尚未設定 GEMINI_API_KEY。' } }, 500, headers);
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${env.GEMINI_API_KEY}`;
  // Every submitted file goes into one part list, in the order the user
  // picked them, so the model reads them as one document rather than as
  // separate jobs - that is the whole point of allowing several: a
  // timetable photo whose subjects are placeholders plus a screenshot of
  // the class list that names them only works if one request sees both.
  // The prompt leads, so the instructions are in context before the first
  // file rather than after the last.
  const contents = [
    {
      parts: [
        { text: GEMINI_PROMPT },
        ...parsedFiles.files.map(file => ({
          inline_data: { mime_type: file.mime_type, data: file.data }
        }))
      ]
    }
  ];
  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, generationConfig: buildGenerationConfig(model) })
    });
    // Piped straight through rather than parsed and re-serialized here: the
    // body is JSON the client parses itself either way, and buffering the
    // whole thing in the Worker first only adds the upstream's full
    // download time to every request before a single byte reaches the
    // browser.
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { ...headers, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return json({ error: { message: error.message || 'Upstream request failed' } }, 502, headers);
  }
}

// ==== /sync - cross-device sync proxy =======================================
//
// Requires more setup than /gemini, because closing the gap properly means
// closing Firestore's direct, ruleset-gated door entirely - otherwise an
// abuser just skips this Worker and hits Firestore directly, same as
// before. That means:
//   1. This Worker authenticates to Firestore as a Google Cloud *service
//      account* (FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY below), not
//      as an anonymous client. Service-account access is treated the same
//      as the Admin SDK: it bypasses Firestore Security Rules entirely, by
//      design - the rules only ever gated unauthenticated client access.
//   2. Once this Worker is live, set the Firestore rule for
//      /orbit-schedules/{doc} to `allow read, write: if false`. That
//      closes the direct-client door completely - real, unauthenticated
//      public access - since actual devices now only ever reach this
//      Worker, and this Worker's own traffic to Firestore ignores that
//      rule anyway (see point 1). See README's cross-device sync section
//      for the exact rule text and the full one-time setup this needs.
//
// One shared sync code plus a separate manager passcode, with the passcode
// gating *only* write access - not two parallel codes:
//   - Creating a sync (POST, below) mints a plain sync code (the document's
//     own ID, same as the original single-code design) and a separate,
//     unrelated *manager passcode*, returning both to the caller once. Only
//     the passcode's SHA-256 hash is ever stored, as `managerPasscodeHash`
//     on the document, so a leak of the Firestore data itself can't be
//     turned back into a working passcode.
//   - GET (read/poll) never needs the passcode - anyone with the sync code
//     can read, exactly like the original design. Optionally supplying
//     `&passcode=` resolves whether that passcode is *this* document's
//     manager passcode (`role: 'manager'` in the response if so) - used at
//     join time and by an already-joined device unlocking manager mode
//     later, never by ordinary polling.
//   - PATCH (write) and DELETE both require the correct passcode - in the
//     JSON body for PATCH, as a query param for DELETE (which this app
//     never sends a body with). Missing or wrong passcode is a 403,
//     distinct from a nonexistent/mistyped code (its own message) - this is
//     the actual fix for what used to be true only by UI convention
//     (src/sync.js's applyEditorRoleLock): previously *any* holder of the
//     single code could PATCH or DELETE, because there was nothing else to
//     check.

// Must match the code/passcode format the client (and this Worker's own
// generateSyncCode below) produce - rejecting a malformed code here means
// it never even reaches Firestore, and the error message is the same
// either way. Passcodes reuse the exact same shape - they're just another
// random string from the same alphabet, generated the same way.
const SYNC_CODE_PATTERN = /^[2-9A-HJ-NP-Z]{8}$/;
const SYNC_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const SYNC_CODE_LENGTH = 8;

function generateSyncCode() {
  const bytes = new Uint8Array(SYNC_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => SYNC_CODE_ALPHABET[byte % SYNC_CODE_ALPHABET.length]).join('');
}

// Passcodes are high-entropy and randomly generated (never user-chosen), so
// a plain, fast SHA-256 - no salt, no slow KDF - is enough: there's no weak
// human-picked passphrase here for an attacker to dictionary-guess, only a
// ~40-bit random string they'd have to brute force from scratch either way.
// This exists purely so a leak of the Firestore data itself (e.g. project
// access, a misconfigured export) doesn't also hand over live write access
// - the hash can't be turned back into the passcode.
async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

// Same cap as the Firestore rule (request.resource.data.payload.size() <
// 20000) - checked again here so an oversized write is rejected before ever
// spending a Firestore call on it, not because the rule can't be trusted.
const MAX_PAYLOAD_LENGTH = 20000;

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
const SYNC_READ_RATE_LIMIT = 6000;
const SYNC_WRITE_RATE_LIMIT = 300;
// A manager deleting the whole shared document (see src/sync.js's
// orbitSyncDeleteForEveryone) is rare and destructive by nature - once per
// pairing at most in any normal flow - so this gets its own tight limit,
// tighter than an ordinary write, on its own counter (kind 'delete') rather
// than sharing the write bucket.
const SYNC_DELETE_RATE_LIMIT = 20;
// Creating a brand new pairing (see src/sync.js's orbitSyncCreate) is just
// as rare/one-off as deleting one - same tight cap, own counter.
const SYNC_CREATE_RATE_LIMIT = 20;
// A GET that also carries a passcode is a credential check (join-time role
// resolution, or an existing viewer device unlocking manager mode) - unlike
// ordinary polling there's no legitimate reason to do this often, so it
// gets its own bucket at the same tight cap as an actual write rather than
// sharing the generous read bucket polling needs. (Not that brute-forcing
// an 8-character passcode is remotely feasible at any rate limit - this is
// just not the bucket meant for high-frequency legitimate traffic.)
const SYNC_VERIFY_RATE_LIMIT = 300;

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
    // Handles pasting the key straight out of the downloaded JSON's
    // `private_key` string value, literal backslash-n escapes and all,
    // instead of the JSON-decoded value with real line breaks - a common
    // copy-paste artifact since Cloudflare's secret box is a single text
    // field either way. Order matters: this must run before the generic
    // whitespace strip below, since a *real* newline is already whitespace
    // but a literal `\n` (backslash then the letter n) is two ordinary,
    // non-whitespace characters that would otherwise survive into the
    // base64 string and corrupt it.
    .replace(/\\n/g, '')
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
let cachedFirebaseToken = null;
async function getFirebaseAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedFirebaseToken && cachedFirebaseToken.expiry > now + 60) {
    return cachedFirebaseToken.token;
  }

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
  cachedFirebaseToken = { token: data.access_token, expiry: now + (data.expires_in || 3600) };
  return cachedFirebaseToken.token;
}

function firestoreDocUrl(env, code) {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)/documents/orbit-schedules/${encodeURIComponent(code)}`;
}
async function firestoreErrorMessage(response) {
  const errorJson = await response.json().catch(() => ({}));
  return errorJson.error?.message || response.statusText || `HTTP ${response.status}`;
}

async function firestoreGet(env, code) {
  const token = await getFirebaseAccessToken(env);
  const response = await fetch(firestoreDocUrl(env, code), {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (response.status === 404) {
    return { exists: false, updateTime: '', payload: '', managerPasscodeHash: '' };
  }
  if (!response.ok) throw new Error(await firestoreErrorMessage(response));
  const doc = await response.json();
  return {
    exists: true,
    updateTime: doc.updateTime || '',
    payload: doc.fields?.payload?.stringValue || '',
    managerPasscodeHash: doc.fields?.managerPasscodeHash?.stringValue || ''
  };
}

// Seeds both fields the document will ever have at once - `payload` and the
// passcode hash it'll be checked against for every future write. Explicitly
// listing both in updateMask (rather than the single-field mask an ordinary
// write uses - see firestorePatch below) is what makes this a real create
// instead of a same-shaped update: without it there'd be nothing here
// distinguishing "first write" from "later write", and no way to seed
// managerPasscodeHash at all through the single-field write path.
async function firestoreCreate(env, code, managerPasscodeHash, payload) {
  const token = await getFirebaseAccessToken(env);
  const response = await fetch(
    `${firestoreDocUrl(env, code)}?updateMask.fieldPaths=payload&updateMask.fieldPaths=managerPasscodeHash`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          payload: { stringValue: payload },
          managerPasscodeHash: { stringValue: managerPasscodeHash }
        }
      })
    }
  );
  if (!response.ok) throw new Error(await firestoreErrorMessage(response));
  const doc = await response.json();
  return { updateTime: doc.updateTime || '' };
}

// An ordinary write - the single-field mask means this can never touch
// managerPasscodeHash, however it's called, so a write is never able to
// change the passcode a document was created with.
async function firestorePatch(env, code, payload) {
  const token = await getFirebaseAccessToken(env);
  const response = await fetch(`${firestoreDocUrl(env, code)}?updateMask.fieldPaths=payload`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { payload: { stringValue: payload } } })
  });
  if (!response.ok) throw new Error(await firestoreErrorMessage(response));
  const doc = await response.json();
  return { updateTime: doc.updateTime || '' };
}

// Wipes the shared document entirely - see src/sync.js's
// orbitSyncDeleteForEveryone. Unlike unlinking (a purely client-side, one
// device forgetting its own pairing code), this is the one operation that
// actually reaches into Firestore and removes the document every paired
// device reads from, so every device sharing this code loses its sync
// target at once. A 404 (already gone, e.g. a retry after a dropped
// response) is treated the same as success - deleting something that's
// already deleted isn't an error from the caller's point of view.
async function firestoreDelete(env, code) {
  const token = await getFirebaseAccessToken(env);
  const response = await fetch(firestoreDocUrl(env, code), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(await firestoreErrorMessage(response));
  }
}

async function handleSyncCreate(request, env, headers, ip) {
  const rateLimit = await isRateLimited(env, ip, 'sync:create', SYNC_CREATE_RATE_LIMIT);
  headers['X-RateLimit-Backend'] = rateLimit.backend;
  if (rateLimit.limited) {
    return json({ error: { message: '請求過於頻繁，請稍後再試。' } }, 429, headers);
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

  try {
    const code = generateSyncCode();
    const managerPasscode = generateSyncCode();
    const managerPasscodeHash = await sha256Hex(managerPasscode);
    const created = await firestoreCreate(env, code, managerPasscodeHash, payload);
    return json({ code, managerPasscode, updateTime: created.updateTime }, 200, headers);
  } catch (error) {
    return json({ error: { message: error.message || 'Upstream request failed' } }, 502, headers);
  }
}

async function handleSyncRequest(request, env, headers, ip) {
  if (
    request.method !== 'GET' &&
    request.method !== 'POST' &&
    request.method !== 'PATCH' &&
    request.method !== 'DELETE'
  ) {
    return json({ error: { message: 'GET, POST, PATCH or DELETE only' } }, 405, headers);
  }

  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
    return json({ error: { message: 'Worker 尚未設定 Firebase 服務帳戶。' } }, 500, headers);
  }

  // Creating a new pairing needs no code at all yet - it mints one - so it
  // branches off before the code-in-query-string handling every other
  // method needs.
  if (request.method === 'POST') return handleSyncCreate(request, env, headers, ip);

  const url = new URL(request.url);
  const code = (url.searchParams.get('code') || '').trim().toUpperCase();
  if (!SYNC_CODE_PATTERN.test(code)) {
    return json({ error: { message: 'Invalid pairing code' } }, 400, headers);
  }

  if (request.method === 'GET') {
    // A passcode riding along on GET resolves whether it's *this*
    // document's manager passcode (join-time role check, or an
    // already-joined viewer device unlocking manager mode) - see the
    // SYNC_VERIFY_RATE_LIMIT comment above for why that gets its own
    // bucket instead of sharing ordinary polling's.
    const suppliedPasscode = (url.searchParams.get('passcode') || '').trim();
    const kind = suppliedPasscode ? 'verify' : 'read';
    const limit = suppliedPasscode ? SYNC_VERIFY_RATE_LIMIT : SYNC_READ_RATE_LIMIT;
    const rateLimit = await isRateLimited(env, ip, `sync:${kind}`, limit);
    headers['X-RateLimit-Backend'] = rateLimit.backend;
    if (rateLimit.limited) {
      return json({ error: { message: '請求過於頻繁，請稍後再試。' } }, 429, headers);
    }
    try {
      const doc = await firestoreGet(env, code);
      if (!doc.exists) return json({ exists: false, updateTime: '', payload: '' }, 200, headers);
      const result = { exists: true, updateTime: doc.updateTime, payload: doc.payload };
      if (suppliedPasscode) {
        const suppliedHash = await sha256Hex(suppliedPasscode);
        if (suppliedHash === doc.managerPasscodeHash) result.role = 'manager';
      }
      return json(result, 200, headers);
    } catch (error) {
      return json({ error: { message: error.message || 'Upstream request failed' } }, 502, headers);
    }
  }

  if (request.method === 'PATCH') {
    const rateLimit = await isRateLimited(env, ip, 'sync:write', SYNC_WRITE_RATE_LIMIT);
    headers['X-RateLimit-Backend'] = rateLimit.backend;
    if (rateLimit.limited) {
      return json({ error: { message: '請求過於頻繁，請稍後再試。' } }, 429, headers);
    }
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: { message: 'Invalid JSON body' } }, 400, headers);
    }
    const payload = body?.payload;
    const passcode = typeof body?.passcode === 'string' ? body.passcode.trim() : '';
    if (typeof payload !== 'string' || !payload || payload.length > MAX_PAYLOAD_LENGTH) {
      return json({ error: { message: 'Missing or invalid payload' } }, 400, headers);
    }
    try {
      const doc = await firestoreGet(env, code);
      if (!doc.exists) return json({ error: { message: '找不到這組配對代碼。' } }, 404, headers);
      const passcodeHash = passcode ? await sha256Hex(passcode) : '';
      if (!passcode || passcodeHash !== doc.managerPasscodeHash) {
        return json({ error: { message: '需要正確的管理者密碼才能寫入課表。' } }, 403, headers);
      }
      const result = await firestorePatch(env, code, payload);
      return json(result, 200, headers);
    } catch (error) {
      return json({ error: { message: error.message || 'Upstream request failed' } }, 502, headers);
    }
  }

  // DELETE - same passcode requirement as PATCH above. Takes the passcode
  // from the query string rather than a body: this app never sends one with
  // its DELETE requests (see src/sync.js's deleteSyncDoc), matching how
  // `code` itself is already passed the same way.
  const rateLimit = await isRateLimited(env, ip, 'sync:delete', SYNC_DELETE_RATE_LIMIT);
  headers['X-RateLimit-Backend'] = rateLimit.backend;
  if (rateLimit.limited) {
    return json({ error: { message: '請求過於頻繁，請稍後再試。' } }, 429, headers);
  }
  const suppliedPasscode = (url.searchParams.get('passcode') || '').trim();
  try {
    const doc = await firestoreGet(env, code);
    // Nothing to check a passcode against - already gone (or never
    // existed), same as a 404 from the old design: not an error from the
    // caller's point of view.
    if (!doc.exists) return json({ deleted: true }, 200, headers);
    const passcodeHash = suppliedPasscode ? await sha256Hex(suppliedPasscode) : '';
    if (!suppliedPasscode || passcodeHash !== doc.managerPasscodeHash) {
      return json({ error: { message: '需要正確的管理者密碼才能刪除整個同步。' } }, 403, headers);
    }
    await firestoreDelete(env, code);
    return json({ deleted: true }, 200, headers);
  } catch (error) {
    return json({ error: { message: error.message || 'Upstream request failed' } }, 502, headers);
  }
}

// ==== Routing ================================================================

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const path = new URL(request.url).pathname.replace(/\/+$/, '');

    if (path === '/gemini') return handleGeminiRequest(request, env, headers, ip);
    if (path === '/sync') return handleSyncRequest(request, env, headers, ip);
    return json({ error: { message: 'Not found' } }, 404, headers);
  }
};
