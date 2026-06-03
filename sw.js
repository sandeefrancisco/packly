/* packly service worker — v1.4.0
 * IMPORTANT: bump the CACHE constant below on every production deploy so
 * browsers detect the changed file, install the new SW, and purge old caches.
 */
const CACHE = 'packly-1.4.0';

// Static assets to pre-cache at install time (offline support).
// version.json is intentionally excluded — it must ALWAYS come from the
// network so the version-checker can detect new deployments.
// External CDN URLs (Supabase JS, Google Fonts) are excluded — different origins.
const PRECACHE = [
  './',
  './index.html',
  './Logo-colored.png',
  './Logo1.png',
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
  // or until all old tabs close naturally.
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
      .then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const { request } = e;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Only intercept same-origin requests — Supabase, Google Fonts, etc. pass through.
  if (url.origin !== self.location.origin) return;

  // version.json — always network, never cache.
  // The in-app version checker must see the live file so it can detect new deploys.
  if (url.pathname.endsWith('/version.json')) {
    e.respondWith(
      fetch(request, { cache: 'no-store' })
        .catch(() => new Response('{}', { headers: { 'Content-Type': 'application/json' } }))
    );
    return;
  }

  // HTML navigations — network first so users always get the latest index.html.
  // Falls back to cached copy only when offline.
  if (request.mode === 'navigate') {
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

  // All other same-origin assets (images, etc.) — cache first, network fallback.
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
