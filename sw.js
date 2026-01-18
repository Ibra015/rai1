// Agro-Omni Service Worker v1.0
// يسمح للتطبيق بالعمل بدون إنترنت

const CACHE_NAME = 'agro-omni-v1';
const ASSETS_TO_CACHE = [
    '/rai1/dashboard_simulation.html',
    '/rai1/js/camera_ai.js',
    '/rai1/manifest.json',
    '/rai1/assets/images/tomato.png',
    '/rai1/assets/images/cucumber.png',
    '/rai1/assets/images/arugula.png',
    '/rai1/assets/images/carrot.png',
    '/rai1/assets/images/lettuce.png',
    '/rai1/assets/images/pepper.png',
    '/rai1/assets/images/spinach.png',
    '/rai1/assets/images/beans.png',
    '/rai1/assets/images/peas.png',
    '/rai1/assets/images/cabbage.png',
    // External CDNs (will be fetched on first load)
    'https://fonts.googleapis.com/icon?family=Material+Icons+Round',
    'https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700;800&display=swap',
    'https://cdn.jsdelivr.net/npm/chart.js'
];

// تثبيت Service Worker وتخزين الملفات
self.addEventListener('install', (event) => {
    console.log('[SW] Installing Service Worker...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching app shell...');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .catch((err) => {
                console.warn('[SW] Cache failed (some assets may require network):', err);
            })
    );
    self.skipWaiting();
});

// تفعيل وحذف الكاش القديم
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating Service Worker...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// استراتيجية: Network First, ثم Cache
self.addEventListener('fetch', (event) => {
    // تجاهل طلبات الكاميرا والـ API
    if (event.request.url.includes('getUserMedia') ||
        event.request.url.includes('api.open-meteo.com') ||
        event.request.url.includes('tensorflow')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // تخزين النسخة الجديدة
                if (response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            })
            .catch(() => {
                // إذا فشل الإنترنت، استخدم الكاش
                return caches.match(event.request).then((cachedResponse) => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    // صفحة افتراضية للأوفلاين
                    if (event.request.mode === 'navigate') {
                        return caches.match('/rai1/dashboard_simulation.html');
                    }
                });
            })
    );
});

// استقبال رسائل من الصفحة
self.addEventListener('message', (event) => {
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }
});

console.log('[SW] Service Worker Loaded Successfully ✅');
