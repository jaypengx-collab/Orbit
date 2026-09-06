// ---- public/sw.js ----
// Whole-app cache: a return visit after some idle time can load almost
// entirely from Cache Storage instead of the network, which is the actual
// speed-up this exists for - while still guaranteeing a stale copy never
// sticks around. Two things make that safe:
//   1. HTML navigations are always network-first, never served from cache
//      unless the network genuinely fails (offline) - so a real deploy is
//      never hidden behind a cached page.
//   2. The cache name is tied to APP_VERSION below. Bumping it on a new
//      deploy makes activate() below throw away every old cache entry
//      instead of letting them accumulate or linger.
//
// Bump APP_VERSION here alongside index.html's own ?v= query strings and
// testsim-runtime.js's APP_VERSION_DATE - keeping all three in sync is what
// makes the version tag (and a forced update via the test panel's 更新
// button) actually mean something.
const APP_VERSION = '20260906b';
const CACHE_NAME = 'orbit-cache-' + APP_VERSION;

self.addEventListener('install', () => {
  // Finish installing and take over immediately rather than waiting for
  // every open tab to close first - an update shouldn't need the user to
  // quit and relaunch the app before it takes effect.
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Never intercept cross-origin requests (the Gemini OCR API call, etc.) -
  // this cache is for this app's own shell and assets only.
  if (url.origin !== self.location.origin) return;

  const isNavigation = request.mode === 'navigate' || request.destination === 'document';
  event.respondWith(isNavigation ? networkFirst(request) : cacheFirst(request));
});

// HTML shell: always prefer a fresh network copy (and cache it for the
// offline fallback below); only fall back to whatever's cached when the
// network request itself fails outright.
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || Response.error();
  }
}

// Everything else (JS/CSS bundles, icons, the manifest): these are all
// content-hashed or explicitly ?v= versioned, so a cached copy is never
// stale under its own URL - safe, and much faster, to serve without ever
// touching the network once it's been fetched once.
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return Response.error();
  }
}
