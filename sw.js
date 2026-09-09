/*
 * Service worker del TPV: deja la app disponible sin conexión y permite instalarla.
 * Estrategia: precarga de todos los archivos + "stale-while-revalidate" (sirve la copia
 * local al instante y la refresca en segundo plano cuando hay red).
 * Al publicar una nueva versión, cambia VERSION para forzar la limpieza de la caché antigua.
 */
const VERSION = 'v1.1.0';
const CACHE = `tpv-descanso-${VERSION}`;
const ASSETS = [
  './', './index.html', './manifest.webmanifest',
  './css/styles.css',
  './js/defaults.js', './js/utils.js', './js/storage.js', './js/ui.js', './js/report.js', './js/sync.js', './js/admin.js', './js/app.js',
  './icons/logo.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });
    const network = fetch(req).then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    if (cached) { e.waitUntil(network); return cached; }
    const res = await network;
    if (res) return res;
    if (req.mode === 'navigate') return cache.match('./index.html');
    return new Response('Sin conexión', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  })());
});
