const CACHE_NAME = 'simpel-v3.0.0'; // Ganti versi agar cache lama terhapus
const urlsToCache = [
    './',
    './index.html',
    './pembayaran.html',
    './admin.html',
    './manifest.json',
    './icon-192.png',
    './icon-512.png',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

// ===== 1. INSTALL SERVICE WORKER =====
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Service Worker: Meng-cache file statis');
                return cache.addAll(urlsToCache);
            })
            .then(() => self.skipWaiting())
    );
});

// ===== 2. AKTIFKAN SERVICE WORKER =====
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Service Worker: Menghapus cache lama', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// ===== 3. FETCH EVENT (Strategi Cache) =====
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // ===== JANGAN CACHE REQUEST KE SUPABASE / FIREBASE / API =====
    if (
        url.hostname.includes('supabase.co') ||
        url.hostname.includes('firebaseio.com') ||
        url.hostname.includes('firebase.google.com') ||
        url.hostname.includes('gstatic.com') ||
        url.pathname.includes('/api/') ||
        url.pathname.includes('/auth/')
    ) {
        return; // Network-only untuk data real-time
    }

    // ===== STRATEGI: NETWORK-FIRST UNTUK HALAMAN UTAMA =====
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, responseToCache);
                    });
                    return response;
                })
                .catch(() => {
                    // Jika offline, fallback ke cache
                    return caches.match(request).then((cachedResponse) => {
                        if (cachedResponse) {
                            return cachedResponse;
                        }
                        // Fallback ke index.html
                        return caches.match('./index.html');
                    });
                })
        );
        return;
    }

    // ===== STRATEGI: CACHE-FIRST UNTUK ASET STATIS =====
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }
            return fetch(request).then((response) => {
                if (response.status === 200 && url.origin === self.location.origin) {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, responseToCache);
                    });
                }
                return response;
            });
        })
    );
});

// ===== 4. PUSH NOTIFICATION (Opsional) =====
self.addEventListener('push', (event) => {
    const data = event.data.json();
    
    const options = {
        body: data.body,
        icon: './icon-192.png',
        badge: './icon-192.png',
        vibrate: [100, 50, 100],
        data: {
            dateOfArrival: Date.now(),
            primaryKey: '1'
        }
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// ===== 5. NOTIFICATION CLICK =====
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (client.url.includes('/index.html') && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow('./index.html');
            }
        })
    );
});
