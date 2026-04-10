/**
 * sw.js — Service Worker for Deal Pipeline offline caching
 * Cache-first for static assets, network-first for API calls.
 */

const CACHE_NAME = 'deal-pipeline-v1';
const APP_SHELL = [
    '/',
    '/index.html',
    '/app.css',
    '/globals.js',
    '/config.js',
    '/api-client.js',
    '/app-comparables.js',
    '/app-timeline.js',
    '/app-overview.js',
    '/app-upcoming-map.js',
    '/app-bank-contacts.js',
    '/app-timeline-units.js',
    '/app-deal-detail.js',
    '/app-charts.js',
    '/app-kanban.js',
    '/app-view-controller.js',
    '/app-deal-modal.js',
    '/app-pipeline-table.js',
    '/app-admin.js',
    '/app-export.js',
    '/main.js',
    '/Logos/STOA20-Logo-Mark-Green.jpg'
];

// Install: pre-cache the app shell
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(APP_SHELL).catch(err => {
                // If a single asset fails (e.g. logo), continue anyway
                console.warn('[SW] Pre-cache partial failure:', err);
                return Promise.resolve();
            });
        })
    );
    self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

// Fetch: strategy depends on request type
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Skip non-GET requests
    if (event.request.method !== 'GET') return;

    // Skip cross-origin requests that are not CDN assets
    if (url.origin !== self.location.origin) {
        // Allow caching of CDN assets (Chart.js, ExcelJS, etc.)
        if (url.hostname.includes('cdnjs.cloudflare.com') || url.hostname.includes('unpkg.com')) {
            event.respondWith(_cacheFirst(event.request));
        }
        return;
    }

    // API calls: network-first with cache fallback
    if (url.pathname.startsWith('/api/') || url.search.includes('api=')) {
        event.respondWith(_networkFirst(event.request));
        return;
    }

    // Static assets: cache-first
    event.respondWith(_cacheFirst(event.request));
});

async function _cacheFirst(request) {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }
        return response;
    } catch (err) {
        // Offline and not cached — return a basic fallback
        return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
    }
}

async function _networkFirst(request) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }
        return response;
    } catch (err) {
        const cached = await caches.match(request);
        if (cached) return cached;
        return new Response(JSON.stringify({ error: 'Offline', offline: true }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
