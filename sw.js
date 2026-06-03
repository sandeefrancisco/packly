/* packly service worker — v1.4.0
 * IMPORTANT: bump the CACHE constant below on every production deploy so
 * browsers detect the changed file, install the new SW, and purge old caches.
 */
const CACHE = 'packly-1.4.0';

// Local assets to pre-cache at install time for offline use.
// External CDN URLs (Supabase JS, Google Fonts) are intentionally excluded —
// they are served from different origins and are not intercepted by this SW.
const PRECACHE = [
  './',
  './index.html',
  './Logo-colored.png',
  './Logo1.png',
  './version.json',
];

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE))
      .catch(err => console.warn('[SW] Precache partial failure:', err))
  );
  // Do NOT call self.skipWaiting() here.
  // The new SW waits until the app sends SKIP_WAITING (user-initiated update)
  // or until all old tabs are naturally closed.
});

// ── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE)
          .map(k => { console.log('[SW] Removing old cache:', k); return caches.delete(k); })
      ))
      .then(() => self.clients.claim()) // Take control of all open tabs immediately
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET') return; // Never intercept non-GET requests

  const url = new URL(request.url);
  // Only handle same-origin requests — Supabase, Google Fonts CDN etc. pass through unmodified
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // Navigation (HTML page load) — network first so users always get the latest index.html.
    // Falls back to cached copy when offline.
    e.respondWith(
      fetch(request)
        .then(resp => {
          if (resp && resp.ok) {
            caches.open(CACHE).then(c => c.put(request, resp.clone()));
          }
          return resp;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // All other same-origin assets (images, version.json, etc.) — cache first, network fallback.
  e.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(resp => {
        if (resp && resp.ok) {
          caches.open(CACHE).then(c => c.put(request, resp.clone()));
        }
        return resp;
      });
    })
  );
});

// ── Message handler ───────────────────────────────────────────────────────────
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') {
    console.log('[SW] Activating new version on request…');
    self.skipWaiting();
  }
});
