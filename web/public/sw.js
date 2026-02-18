// Minimal service worker — enables PWA install + basic app shell caching.
// Strategy: network-first with cache fallback for navigation requests.

const CACHE = 'switchboard-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (e) => {
  const { request } = e
  // Only cache same-origin navigation and static assets
  if (request.method !== 'GET') return
  if (!request.url.startsWith(self.location.origin)) return

  e.respondWith(
    fetch(request)
      .then((res) => {
        // Cache successful responses for same-origin
        if (res.ok) {
          const clone = res.clone()
          caches.open(CACHE).then((cache) => cache.put(request, clone))
        }
        return res
      })
      .catch(() => caches.match(request))
  )
})
