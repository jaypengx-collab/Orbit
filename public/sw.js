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
// "__APP_VERSION__" is a literal token, not a variable - vite.config.js's
// injectAppVersion() plugin replaces it (and the matching token in
// index.html's own ?v= query strings) with the checked-out commit's short
// hash once the build has copied this file into dist/. That's what keeps
// this, the version tag, and a forced update via the test panel's 更新
// button all in sync automatically, with nothing to remember to bump by
// hand on a new deploy.
const APP_VERSION = '__APP_VERSION__';
const CACHE_NAME = 'orbit-cache-' + APP_VERSION;

// How long to wait on the network before falling back to the cached shell.
// Right after a deploy, the edge/CDN can leave a request hanging (neither
// resolving nor erroring) instead of failing outright while it propagates -
// a plain `fetch()` with no timeout would then wait forever, which is what
// leaves a standalone home-screen install stuck on its boot spinner (a
// Safari tab has its own loading UI and OS-level retry/kill behavior that
// eventually unsticks it; the app's own boot code has neither). Racing the
// fetch against this timeout caps the wait so the app always renders,
// worst case from yesterday's cached copy - the network fetch below keeps
// running in the background and updates the cache whenever it does land,
// so the very next load already has the fresh copy.
const NETWORK_TIMEOUT_MS = 4000;

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
// offline fallback below); fall back to whatever's cached both when the
// network request fails outright and when it's simply taking too long (see
// NETWORK_TIMEOUT_MS above). The network fetch itself is never abandoned -
// it keeps running so a slow-but-eventually-successful response still gets
// cached for next time, even after a timeout fallback already answered
// this particular load.
async function networkFirst(request) {
  const fetchPromise = fetch(request);
  // Update the cache whenever the network eventually responds, even if a
  // timeout fallback below already answered this particular load - and
  // swallow a failure here, since that's handled below instead.
  fetchPromise
    .then(response => {
      if (response && response.ok) {
        caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
      }
    })
    .catch(() => {});

  try {
    return await Promise.race([
      fetchPromise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('sw: network timeout')), NETWORK_TIMEOUT_MS)
      )
    ]);
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Nothing cached to fall back to (e.g. the very first visit) - there's
    // nothing else to show, so just keep waiting on the real network.
    try {
      return await fetchPromise;
    } catch {
      return Response.error();
    }
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
