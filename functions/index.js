// ---- functions/index.js ----
// Server-side proxy for the AI schedule-photo import (see src/gemini-ocr.js's
// GEMINI_PROXY_URL). This is the only piece of Orbit AI that runs on a real
// server: it exists purely to hold the real Gemini API key server-side (via
// Secret Manager) so end users never need one of their own. Everything else
// about the request - which models to try, the prompt, response parsing -
// still lives in the client; this function only forwards the call and
// attaches the key.
//
// Deployed separately from the static site with `firebase deploy --only
// functions` - see README's "AI 辨識課表照片" setup section for the
// one-time project setup this requires (Blaze plan, the GEMINI_API_KEY
// secret).
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');

// Best-effort per-instance rate limit: cheap insurance against a runaway
// bill from casual scraping of this endpoint, not a real security boundary
// - an instance can scale out, and a cold start resets this map. The actual
// safety net is a Firebase Blaze budget alert on this project (see README).
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

// Restricts which browser origins may call this function - not a real
// security boundary either (CORS only constrains browser JS, not a direct
// script/curl request), but it does stop a random other site's frontend
// from quietly embedding this endpoint. Add a deploy preview / custom
// domain here if the site is ever served from somewhere else too.
const ALLOWED_ORIGINS = ['https://jaypengx-collab.github.io', /^http:\/\/localhost:\d+$/];

exports.geminiProxy = onRequest(
  {
    secrets: [GEMINI_API_KEY],
    cors: ALLOWED_ORIGINS,
    region: 'asia-east1',
    maxInstances: 5,
    timeoutSeconds: 60
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: { message: 'POST only' } });
      return;
    }
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    if (isRateLimited(ip)) {
      res.status(429).json({ error: { message: '請求過於頻繁，請稍後再試。' } });
      return;
    }

    const { model, contents, generationConfig } = req.body || {};
    if (!model || !Array.isArray(contents)) {
      res.status(400).json({ error: { message: 'Missing model or contents' } });
      return;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${GEMINI_API_KEY.value()}`;
    try {
      const upstream = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents, generationConfig })
      });
      const data = await upstream.json();
      res.status(upstream.status).json(data);
    } catch (error) {
      res.status(502).json({ error: { message: error.message || 'Upstream request failed' } });
    }
  }
);
