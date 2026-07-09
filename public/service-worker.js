const urlParams = new URL(self.location).searchParams;
const version = urlParams.get('v') || '1';
const CACHE_NAME = 'raisetool-cache-v' + version;
const OFFLINE_URL = '/offline.html';

const STATIC_ASSETS = [
  '/',
  '/categories',
  '/about',
  '/contact',
  OFFLINE_URL,
  '/css/app.css',
  '/vendor/bootstrap.min.css',
  '/vendor/bootstrap.bundle.min.js',
  '/js/tool.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;500;600;700;800&display=swap'
];

// Install Event: Pre-cache static shell & offline fallback
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching static assets');
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event: Clean up legacy caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: Offline-first caching strategy
self.addEventListener('fetch', (event) => {
  // Ignore non-GET requests (e.g. POST uploads)
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isDynamicRoute = url.pathname.startsWith('/workspace') || 
                         url.pathname.startsWith('/admin');

  // Check if it is a navigation request (HTML pages)
  if (event.request.mode === 'navigate') {
    if (isDynamicRoute) {
      // Always fetch dynamic pages from network, fall back to offline page if offline
      event.respondWith(
        fetch(event.request).catch(() => caches.match(OFFLINE_URL))
      );
      return;
    }

    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache dynamic successful page visits
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // If offline, try matching from cache
          return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;
            // Fallback to the dedicated offline page
            return caches.match(OFFLINE_URL);
          });
        })
    );
    return;
  }

  // Bypass cache completely for dynamic workspace/admin API/fetch requests and vendor libraries
  if (isDynamicRoute || url.pathname.startsWith('/vendor/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Cache-first falling back to network strategy for static assets
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch in background to update cache (Stale-While-Revalidate)
        fetch(event.request).then((networkResponse) => {
          if (networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, networkResponse);
            });
          }
        }).catch(() => {/* Ignore background fetch failures */});
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      }).catch(() => {
        // If offline and requesting an image, we can return a placeholder if desired
      });
    })
  );
});

// Skip waiting message listener
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Background Sync Listener
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-analytics') {
    event.waitUntil(syncAnalyticsData());
  } else if (event.tag === 'sync-conversions') {
    event.waitUntil(syncPendingConversions());
  }
});

async function syncAnalyticsData() {
  console.log('[SW Background Sync] Synchronizing queued visitor analytics.');
  // In a real PWA, sync local metrics to server endpoint
  return Promise.resolve();
}

async function syncPendingConversions() {
  console.log('[SW Background Sync] Retrying failed client-server uploads.');
  return Promise.resolve();
}
