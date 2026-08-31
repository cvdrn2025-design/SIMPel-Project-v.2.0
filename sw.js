const CACHE_NAME = 'simpel-v10.0.0'; // Ganti versi agar cache lama terhapus
const urlsToCache = [
    './',
    './index.html',
    './pembayaran.html',
    './admin.html',
    './addon-basic.html',
    './manifest.json',
    './icon-192.png',
    './icon-512.png',
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
    // Ini penting agar data real-time selalu fresh
    if (
        url.hostname.includes('supabase.co') ||
        url.hostname.includes('supabase.in') ||
        url.hostname.includes('firebaseio.com') ||
        url.hostname.includes('firebase.google.com') ||
        url.hostname.includes('gstatic.com') ||
        url.hostname.includes('googleapis.com') ||
        url.hostname.includes('firebasestorage.googleapis.com') ||
        url.hostname.includes('storage.googleapis.com') ||
        url.pathname.includes('/api/') ||
        url.pathname.includes('/auth/') ||
        url.pathname.includes('/storage/')
    ) {
        // Network-only untuk data real-time - JANGAN INTERVENSI
        // Tapi masih bisa cache gambar dari Supabase Storage untuk offline
        if (url.hostname.includes('supabase.co') && url.pathname.includes('/storage/')) {
            // Cache gambar dari Supabase Storage
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
                    // Clone response untuk cache
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, responseToCache);
                        // Juga cache index.html untuk fallback
                        cache.put('./index.html', responseToCache);
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
    if (
        url.origin === self.location.origin || 
        url.hostname.includes('gstatic.com') ||
        url.hostname.includes('jsdelivr.net') ||
        url.hostname.includes('cdnjs.cloudflare.com')
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
                    // Jika fetch gagal dan tidak ada cache, return 404
                    return new Response('', { status: 404, statusText: 'Not Found' });
                });
            })
        );
        return;
    }

    // ===== STRATEGI: STALE-WHILE-REVALIDATE UNTUK KONSULTASI DOKUMEN =====
    if (request.destination === 'document' || request.destination === 'script' || request.destination === 'style') {
        event.respondWith(
            caches.match(request).then((cachedResponse) => {
                const fetchPromise = fetch(request).then((response) => {
                    // Update cache dengan response baru
                    if (response.status === 200) {
                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(request, responseToCache);
                        });
                    }
                    return response;
                }).catch(() => {
                    // Jika fetch gagal, return cachedResponse atau fallback
                    return cachedResponse || new Response('', { status: 404, statusText: 'Not Found' });
                });

                // Return cache dulu (jika ada), lalu update di background
                return cachedResponse || fetchPromise;
            })
        );
        return;
    }

    // ===== STRATEGI: NETWORK-ONLY UNTUK SEMUA REQUEST LAINNYA =====
    // (Khususnya untuk request ke domain lain yang tidak terdaftar)
    return;
});

// ===== 4. PUSH NOTIFICATION (Opsional) =====
self.addEventListener('push', (event) => {
    let data = {};
    
    try {
        data = event.data.json();
    } catch (error) {
        // Jika bukan JSON, gunakan body sebagai teks
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
                    // Jika client sudah ada, fokus dan navigasi ke URL
                    client.navigate(urlToOpen);
                    return client.focus();
                }
            }
            // Jika tidak ada client, buka window baru
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});

// ===== 6. MESSAGE EVENT (Untuk Update dari Client) =====
self.addEventListener('message', (event) => {
    // Terima pesan dari client
    if (event.data && event.data.type === 'CACHE_URLS') {
        // Cache URL spesifik yang diminta client
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
    
    // Untuk update dari server (push dari admin)
    if (event.data && event.data.type === 'DATA_UPDATED') {
        // Clear cache untuk data terbaru
        event.waitUntil(
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        // Hapus semua cache kecuali yang valid
                        if (cacheName !== CACHE_NAME) {
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
        );
    }
});

// ===== 7. BACKGROUND SYNC (Opsional untuk offline) =====
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

// ===== 8. PERIODIC SYNC (Untuk update data otomatis) =====
self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'update-data') {
        event.waitUntil(updateData());
    }
});

// Fungsi sinkronisasi data saat offline
async function syncData() {
    try {
        // Ambil data yang perlu disinkronkan dari IndexedDB
        const db = await openDatabase();
        const pendingData = await getPendingData(db);
        
        // Kirim ke server saat online kembali
        for (const item of pendingData) {
            await sendToServer(item);
        }
        
        // Hapus data yang sudah disinkronkan
        await clearPendingData(db);
        
        console.log('Background Sync: Sinkronisasi data berhasil');
        return true;
    } catch (error) {
        console.error('Background Sync gagal:', error);
        return false;
    }
}

// Fungsi sinkronisasi progres
async function syncProgress() {
    try {
        console.log('Sinkronisasi progres...');
        // Kirim progress data yang pending
        return true;
    } catch (error) {
        console.error('Sync progress gagal:', error);
        return false;
    }
}

// Fungsi sinkronisasi material
async function syncMaterial() {
    try {
        console.log('Sinkronisasi material...');
        return true;
    } catch (error) {
        console.error('Sync material gagal:', error);
        return false;
    }
}

// Fungsi sinkronisasi timesheet
async function syncTimesheet() {
    try {
        console.log('Sinkronisasi timesheet...');
        return true;
    } catch (error) {
        console.error('Sync timesheet gagal:', error);
        return false;
    }
}

// Fungsi update data periodic
async function updateData() {
    try {
        // Notify semua client untuk update
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

// ===== 9. FUNGSI BANTU INDEXEDDB =====
async function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('simpel-offline-db', 1);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            // Buat object store untuk pending data
            if (!db.objectStoreNames.contains('pending-data')) {
                db.createObjectStore('pending-data', { keyPath: 'id', autoIncrement: true });
            }
            
            // Buat object store untuk progress
            if (!db.objectStoreNames.contains('progress-data')) {
                db.createObjectStore('progress-data', { keyPath: 'id', autoIncrement: true });
            }
            
            // Buat object store untuk material
            if (!db.objectStoreNames.contains('material-data')) {
                db.createObjectStore('material-data', { keyPath: 'id', autoIncrement: true });
            }
            
            // Buat object store untuk timesheet
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

// Fungsi mengambil data pending
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

// Fungsi kirim ke server
async function sendToServer(item) {
    try {
        // Kirim data ke Supabase
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

// Fungsi menghapus data pending
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

// ===== 10. HANDLE OFFLINE EVENTS =====
self.addEventListener('offline', (event) => {
    console.log('Service Worker: Aplikasi offline');
    
    // Notify semua client bahwa aplikasi offline
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
    
    // Notify semua client bahwa aplikasi online
    self.clients.matchAll().then(clients => {
        clients.forEach(client => {
            client.postMessage({
                type: 'ONLINE',
                timestamp: Date.now()
            });
        });
    });
    
    // Trigger sync data
    self.registration.sync.register('sync-data').catch(() => {
        console.log('Background sync tidak didukung');
    });
});

// ===== 11. HANDLE PERMISSION =====
self.addEventListener('permissionchange', (event) => {
    // Handle perubahan izin notifikasi
    console.log('Service Worker: Permission berubah');
});
