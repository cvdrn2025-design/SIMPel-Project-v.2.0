const CACHE_NAME = 'simpel-v10.1.0'; // Update versi untuk menghapus cache lama
const urlsToCache = [
    './',
    './index.html',
    './pembayaran.html',
    './admin.html',
    './addon-basic.html',
    './manifest.json',
    './icon-192.png',
    './icon-512.png',
    './pembayaran.png',
    './qris.png',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    'https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/9.22.0/firebase-database-compat.js'
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

// ===== 3. FETCH EVENT (Strategi Cache yang Diperbarui) =====
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // ===== JANGAN CACHE REQUEST KE SUPABASE / FIREBASE / API =====
    if (
        url.hostname.includes('supabase.co') ||
        url.hostname.includes('supabase.in') ||
        url.hostname.includes('firebaseio.com') ||
        url.hostname.includes('firebase.google.com') ||
        url.hostname.includes('firebaseapp.com') ||
        url.hostname.includes('gstatic.com') ||
        url.hostname.includes('googleapis.com') ||
        url.hostname.includes('firebasestorage.googleapis.com') ||
        url.hostname.includes('storage.googleapis.com') ||
        url.pathname.includes('/api/') ||
        url.pathname.includes('/auth/') ||
        url.pathname.includes('/storage/')
    ) {
        // Cache gambar dari Supabase Storage untuk offline
        if (url.hostname.includes('supabase.co') && url.pathname.includes('/storage/')) {
            event.respondWith(
                caches.match(request).then((cachedResponse) => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    return fetch(request).then((response) => {
                        if (response.status === 200 && response.headers.get('content-type')?.includes('image')) {
                            const responseToCache = response.clone();
                            caches.open(CACHE_NAME).then((cache) => {
                                cache.put(request, responseToCache);
                            });
                        }
                        return response;
                    }).catch(() => {
                        return new Response('', { status: 404, statusText: 'Not Found' });
                    });
                })
            );
            return;
        }
        return; // Network-only untuk request lainnya
    }

    // ===== STRATEGI: NETWORK-FIRST UNTUK HALAMAN UTAMA =====
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, responseToCache);
                        cache.put('./index.html', responseToCache);
                    });
                    return response;
                })
                .catch(() => {
                    return caches.match(request).then((cachedResponse) => {
                        if (cachedResponse) {
                            return cachedResponse;
                        }
                        return caches.match('./index.html');
                    });
                })
        );
        return;
    }

    // ===== STRATEGI: CACHE-FIRST UNTUK ASET STATIS =====
    if (
        url.origin === self.location.origin || 
        url.hostname.includes('gstatic.com') ||
        url.hostname.includes('jsdelivr.net') ||
        url.hostname.includes('cdnjs.cloudflare.com') ||
        url.hostname.includes('github.io') ||
        url.hostname.includes('githubusercontent.com')
    ) {
        event.respondWith(
            caches.match(request).then((cachedResponse) => {
                if (cachedResponse) {
                    return cachedResponse;
                }
                return fetch(request).then((response) => {
                    if (response.status === 200) {
                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(request, responseToCache);
                        });
                    }
                    return response;
                }).catch(() => {
                    return new Response('', { status: 404, statusText: 'Not Found' });
                });
            })
        );
        return;
    }

    // ===== STRATEGI: STALE-WHILE-REVALIDATE =====
    if (request.destination === 'document' || request.destination === 'script' || request.destination === 'style') {
        event.respondWith(
            caches.match(request).then((cachedResponse) => {
                const fetchPromise = fetch(request).then((response) => {
                    if (response.status === 200) {
                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(request, responseToCache);
                        });
                    }
                    return response;
                }).catch(() => {
                    return cachedResponse || new Response('', { status: 404, statusText: 'Not Found' });
                });

                return cachedResponse || fetchPromise;
            })
        );
        return;
    }

    // ===== STRATEGI: NETWORK-ONLY UNTUK SEMUA REQUEST LAINNYA =====
    return;
});

// ===== 4. PUSH NOTIFICATION =====
self.addEventListener('push', (event) => {
    let data = {};
    
    try {
        data = event.data.json();
    } catch (error) {
        data = {
            title: event.data.text(),
            body: ''
        };
    }
    
    const options = {
        body: data.body || 'Notifikasi baru',
        icon: './icon-192.png',
        badge: './icon-192.png',
        vibrate: [100, 50, 100, 50, 100],
        data: {
            dateOfArrival: Date.now(),
            primaryKey: '1',
            url: data.url || './index.html'
        }
    };

    event.waitUntil(
        self.registration.showNotification(data.title || 'SIMPeL', options)
    );
});

// ===== 5. NOTIFICATION CLICK =====
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    const urlToOpen = event.notification.data?.url || './index.html';
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if ('focus' in client) {
                    client.navigate(urlToOpen);
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});

// ===== 6. MESSAGE EVENT =====
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'CACHE_URLS') {
        const urlsToCache = event.data.urls || [];
        event.waitUntil(
            caches.open(CACHE_NAME).then((cache) => {
                return cache.addAll(urlsToCache);
            })
        );
    }
    
    if (event.data === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'DATA_UPDATED') {
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
    }
});

// ===== 7. BACKGROUND SYNC =====
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-data') {
        event.waitUntil(syncData());
    }
    
    if (event.tag === 'sync-progress') {
        event.waitUntil(syncProgress());
    }
    
    if (event.tag === 'sync-material') {
        event.waitUntil(syncMaterial());
    }
    
    if (event.tag === 'sync-timesheet') {
        event.waitUntil(syncTimesheet());
    }
});

// ===== 8. PERIODIC SYNC =====
self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'update-data') {
        event.waitUntil(updateData());
    }
});

// ===== 9. FUNGSI SINKRONISASI =====
async function syncData() {
    try {
        const db = await openDatabase();
        const pendingData = await getPendingData(db);
        
        for (const item of pendingData) {
            await sendToServer(item);
        }
        
        await clearPendingData(db);
        console.log('Background Sync: Sinkronisasi data berhasil');
        return true;
    } catch (error) {
        console.error('Background Sync gagal:', error);
        return false;
    }
}

async function syncProgress() {
    try {
        console.log('Sinkronisasi progres...');
        return true;
    } catch (error) {
        console.error('Sync progress gagal:', error);
        return false;
    }
}

async function syncMaterial() {
    try {
        console.log('Sinkronisasi material...');
        return true;
    } catch (error) {
        console.error('Sync material gagal:', error);
        return false;
    }
}

async function syncTimesheet() {
    try {
        console.log('Sinkronisasi timesheet...');
        return true;
    } catch (error) {
        console.error('Sync timesheet gagal:', error);
        return false;
    }
}

async function updateData() {
    try {
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
            client.postMessage({
                type: 'DATA_UPDATED',
                timestamp: Date.now()
            });
        });
        return true;
    } catch (error) {
        console.error('Periodic sync gagal:', error);
        return false;
    }
}

// ===== 10. FUNGSI BANTU INDEXEDDB =====
async function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('simpel-offline-db', 1);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            if (!db.objectStoreNames.contains('pending-data')) {
                db.createObjectStore('pending-data', { keyPath: 'id', autoIncrement: true });
            }
            
            if (!db.objectStoreNames.contains('progress-data')) {
                db.createObjectStore('progress-data', { keyPath: 'id', autoIncrement: true });
            }
            
            if (!db.objectStoreNames.contains('material-data')) {
                db.createObjectStore('material-data', { keyPath: 'id', autoIncrement: true });
            }
            
            if (!db.objectStoreNames.contains('timesheet-data')) {
                db.createObjectStore('timesheet-data', { keyPath: 'id', autoIncrement: true });
            }
        };
        
        request.onsuccess = (event) => {
            resolve(event.target.result);
        };
        
        request.onerror = (event) => {
            reject(event.target.error);
        };
    });
}

async function getPendingData(db) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['pending-data'], 'readonly');
        const store = transaction.objectStore('pending-data');
        const request = store.getAll();
        
        request.onsuccess = () => {
            resolve(request.result);
        };
        
        request.onerror = () => {
            reject(request.error);
        };
    });
}

async function sendToServer(item) {
    try {
        const response = await fetch(item.url, {
            method: item.method || 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': item.apikey || '',
                'Authorization': 'Bearer ' + (item.token || '')
            },
            body: JSON.stringify(item.data)
        });
        
        if (!response.ok) {
            throw new Error('Gagal mengirim data ke server');
        }
        
        return response.json();
    } catch (error) {
        console.error('Send to server gagal:', error);
        throw error;
    }
}

async function clearPendingData(db) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['pending-data'], 'readwrite');
        const store = transaction.objectStore('pending-data');
        const request = store.clear();
        
        request.onsuccess = () => {
            resolve();
        };
        
        request.onerror = () => {
            reject(request.error);
        };
    });
}

// ===== 11. HANDLE OFFLINE EVENTS =====
self.addEventListener('offline', (event) => {
    console.log('Service Worker: Aplikasi offline');
    
    self.clients.matchAll().then(clients => {
        clients.forEach(client => {
            client.postMessage({
                type: 'OFFLINE',
                timestamp: Date.now()
            });
        });
    });
});

self.addEventListener('online', (event) => {
    console.log('Service Worker: Aplikasi online kembali');
    
    self.clients.matchAll().then(clients => {
        clients.forEach(client => {
            client.postMessage({
                type: 'ONLINE',
                timestamp: Date.now()
            });
        });
    });
    
    self.registration.sync.register('sync-data').catch(() => {
        console.log('Background sync tidak didukung');
    });
});

// ===== 12. HANDLE PERMISSION =====
self.addEventListener('permissionchange', (event) => {
    console.log('Service Worker: Permission berubah');
});
