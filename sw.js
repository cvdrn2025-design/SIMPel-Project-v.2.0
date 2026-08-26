/* ============================================
   SIMPeL - Service Worker (Offline & Cache)
   ============================================ */

const CACHE_NAME = 'simpel-v1.0.0';
const APP_SHELL = [
    './',
    './index.html',
    './admin.html',
    './pembayaran.html',
    './pembayaran.png',
    './qris.png',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    'https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/9.22.0/firebase-database-compat.js'
];

/* ===== INSTALL: Simpan cache awal ===== */
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(APP_SHELL);
        })
    );
    self.skipWaiting();
});

/* ===== ACTIVATE: Hapus cache lama ===== */
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

/* ===== FETCH: Strategi Cache First (Offline First) ===== */
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    // Abaikan request ke Firebase & Supabase agar data tetap real-time
    if (event.request.url.includes('firebaseio.com') || 
        event.request.url.includes('supabase.co')) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }

            return fetch(event.request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            }).catch(() => {
                return caches.match('./index.html');
            });
        })
    );
});
