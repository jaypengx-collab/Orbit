// ---- cloudflare-worker/gemini-proxy-worker.js ----
// Server-side proxy for the AI schedule-photo import (see the main repo's
// src/gemini-ocr.js, GEMINI_PROXY_URL). This is the only piece of Orbit AI
// that runs on a real server: it exists purely to hold the real Gemini API
// key server-side so end users never need one of their own. Everything else
// about the request - which models to try, the prompt, response parsing -
// still lives in the client; this worker only forwards the call and
// attaches the key.
//
// Deliberately Cloudflare Workers, not a paid-plan cloud function: the
// Workers Free plan has a hard daily request cap (no billing account
// required to use it at all) - once the daily limit is hit, requests just
// fail until the next day instead of generating a bill. See README's "AI
// 辨識課表照片" section for the one-time setup this needs (paste this file
// into a new Worker in the Cloudflare dashboard, set the GEMINI_API_KEY
// secret, copy the worker's *.workers.dev URL into
// VITE_ORBIT_GEMINI_PROXY_URL).

// Restricts which browser origins may call this worker - not a real
// security boundary (CORS only constrains browser JS, not a direct
// script/curl request), but it does stop a random other site's frontend
// from quietly embedding this endpoint. Add a custom domain here if the
// site is ever served from somewhere else too.
const ALLOWED_ORIGINS = ['https://jaypengx-collab.github.io'];

function isAllowedOrigin(origin) {
  return ALLOWED_ORIGINS.includes(origin) || /^http:\/\/localhost:\d+$/.test(origin || '');
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

// Best-effort per-isolate rate limit: cheap insurance against a burst of
// casual scraping, not a real security boundary - Workers can and do run
// many isolates in parallel across the edge, so this map is not a global
// counter. The real, hard limit is Cloudflare's own free-plan daily request
// cap, which needs no configuration here at all.
const requestLog = new Map();
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60 * 60 * 1000;

function isRateLimited(ip) {
  const now = Date.now();
  const timestamps = (requestLog.get(ip) || []).filter(time => now - time < RATE_WINDOW_MS);
  const limited = timestamps.length >= RATE_LIMIT;
  timestamps.push(now);
  requestLog.set(ip, timestamps);
  return limited;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return json({ error: { message: 'POST only' } }, 405, headers);

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (isRateLimited(ip)) {
      return json({ error: { message: '請求過於頻繁，請稍後再試。' } }, 429, headers);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: { message: 'Invalid JSON body' } }, 400, headers);
    }
    const { model, contents, generationConfig } = body || {};
    if (!model || !Array.isArray(contents)) {
      return json({ error: { message: 'Missing model or contents' } }, 400, headers);
    }
    if (!env.GEMINI_API_KEY) {
      return json({ error: { message: 'Worker 尚未設定 GEMINI_API_KEY。' } }, 500, headers);
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${env.GEMINI_API_KEY}`;
    try {
      const upstream = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents, generationConfig })
      });
      const data = await upstream.json();
      return json(data, upstream.status, headers);
    } catch (error) {
      return json({ error: { message: error.message || 'Upstream request failed' } }, 502, headers);
    }
  }
};
