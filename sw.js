// Agro-Omni Service Worker v2.0

const CACHE_NAME = 'agro-omni-v2';
const ASSETS_TO_CACHE = [
    './dashboard_simulation.html',
    './css/styles.css',
    './js/plant_data.js',
    './js/weather.js',
    './js/dashboard.js',
    './js/camera_ai.js',
    './js/websocket.js',
    './js/scheduler.js',
    './js/i18n.js',
    './manifest.json',
    './assets/images/tomato.png',
    './assets/images/cucumber.png',
    './assets/images/arugula.png',
    './assets/images/carrot.png',
    './assets/images/lettuce.png',
    './assets/images/pepper.png',
    './assets/images/spinach.png',
    './assets/images/beans.png',
    './assets/images/peas.png',
    './assets/images/cabbage.png',
    './assets/icons/icon-144.png',
    './assets/icons/icon-192.png',
    'https://fonts.googleapis.com/icon?family=Material+Icons+Round',
    'https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700;800&display=swap',
    'https://cdn.jsdelivr.net/npm/chart.js'
];

// تثبيت وتخزين الملفات
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
                    console.warn('[SW] بعض الملفات لم تُخزّن:', err);
                });
            })
    );
    self.skipWaiting();
});

// تفعيل وحذف الكاش القديم
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter(name => name !== CACHE_NAME)
                    .map(name => caches.delete(name))
            );
        })
    );
    self.clients.claim();
});

// استراتيجية: Network First ثم Cache
self.addEventListener('fetch', (event) => {
    // تجاهل طلبات الكاميرا والـ API والـ TensorFlow
    const url = event.request.url;
    if (url.includes('getUserMedia') ||
        url.includes('api.open-meteo.com') ||
        url.includes('tensorflow') ||
        url.includes('mobilenet')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                if (response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            })
            .catch(() => {
                return caches.match(event.request).then((cachedResponse) => {
                    if (cachedResponse) return cachedResponse;
                    if (event.request.mode === 'navigate') {
                        return caches.match('./dashboard_simulation.html');
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
