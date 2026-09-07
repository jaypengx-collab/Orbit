// ---- cloudflare-worker/gemini-proxy-worker.js ----
// Server-side proxy for the AI schedule-photo import (see the main repo's
// src/gemini-ocr.js, GEMINI_PROXY_URL). This is the only piece of Orbit AI
// that runs on a real server: it exists purely to hold the real Gemini API
// key server-side so end users never need one of their own.
//
// Unlike an earlier version of this file, the client does NOT get to choose
// what's sent to Gemini beyond which model and which image - the prompt text
// and generation config are fixed here, not accepted from the request body.
// The Worker's URL is public (it's sitting in the client's JS bundle, not a
// secret), so anything the client is allowed to control here is something
// anyone who finds that URL can control too, via a raw HTTP request with no
// browser involved. Accepting an arbitrary prompt would turn this into a
// free, unauthenticated proxy to Gemini for anything, not just timetable
// photos - burning this project's daily request quota (and the API key's
// quota) on completely unrelated use. Pinning the prompt and only ever
// running it against a submitted image narrows what this endpoint can be
// used for to "run timetable extraction on some image," which isn't a
// generically useful thing to steal.
//
// Deliberately Cloudflare Workers, not a paid-plan cloud function: the
// Workers Free plan has a hard daily request cap (no billing account
// required to use it at all) - once the daily limit is hit, requests just
// fail until the next day instead of generating a bill. See README's "AI
// 辨識課表照片" section for the one-time setup this needs (paste this file
// into a new Worker in the Cloudflare dashboard, set the GEMINI_API_KEY
// secret, copy the worker's *.workers.dev URL into
// VITE_ORBIT_GEMINI_PROXY_URL).

// Exact copy of the prompt that used to live in src/gemini-ocr.js's
// AIVisionProcessor.buildPrompt() - kept here now instead, since the whole
// point of moving it server-side is that the client no longer sends it.
const PROMPT = `Extract the class timetable from this photo and return it as a single JSON object. Focus on the timetable only — ignore background, margins, decorations, and unrelated content; it may only occupy part of the frame.

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
- Do not invent information. When uncertain, prefer an empty value or null.
- Keep all fields internally consistent.
- Return ONLY the raw JSON object — no markdown fences, no comments, no extra text.`;

// Must match src/gemini-ocr.js's AIVisionProcessor.geminiModels exactly -
// this is the actual enforcement point that stops the model name from being
// an arbitrary passthrough to Gemini's API.
const ALLOWED_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.7-flash',
  'gemini-2.5-flash',
  'gemini-3.5-flash-lite'
];

// Same reasoning as AIVisionProcessor.buildGenerationConfig() (which this
// replaces client-side) - plain structured extraction gets no benefit from
// the models' default "thinking" pass, and different model families expose
// that knob differently.
function buildGenerationConfig(model) {
  return {
    response_mime_type: 'application/json',
    temperature: 0.1,
    maxOutputTokens: 8192,
    thinkingConfig: /^gemini-2\./.test(model) ? { thinkingBudget: 0 } : { thinkingLevel: 'low' }
  };
}

// A downscaled 1600px-max JPEG at quality 0.9 (see src/gemini-ocr.js's
// capCanvasDimension) is realistically well under 1MB base64-encoded; this
// caps well above that so a legitimate photo is never rejected, while still
// bounding how much upstream bandwidth/tokens a single request can burn.
const MAX_IMAGE_BASE64_LENGTH = 10_000_000;

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
    const { model, image } = body || {};
    if (!ALLOWED_MODELS.includes(model)) {
      return json({ error: { message: 'Unsupported model' } }, 400, headers);
    }
    if (
      !image ||
      typeof image.mime_type !== 'string' ||
      !image.mime_type.startsWith('image/') ||
      typeof image.data !== 'string' ||
      !image.data ||
      image.data.length > MAX_IMAGE_BASE64_LENGTH
    ) {
      return json({ error: { message: 'Missing or invalid image' } }, 400, headers);
    }
    if (!env.GEMINI_API_KEY) {
      return json({ error: { message: 'Worker 尚未設定 GEMINI_API_KEY。' } }, 500, headers);
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${env.GEMINI_API_KEY}`;
    const contents = [
      {
        parts: [{ text: PROMPT }, { inline_data: { mime_type: image.mime_type, data: image.data } }]
      }
    ];
    try {
      const upstream = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents, generationConfig: buildGenerationConfig(model) })
      });
      const data = await upstream.json();
      return json(data, upstream.status, headers);
    } catch (error) {
      return json({ error: { message: error.message || 'Upstream request failed' } }, 502, headers);
    }
  }
};
