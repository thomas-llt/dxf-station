// Nettoyeur DXF Station : fonctionnement hors ligne + mises à jour automatiques.
// Stratégie « réseau d'abord » : en ligne, on récupère toujours la dernière version publiée ;
// hors ligne (chantier), on sert la dernière version gardée en cache.
const CACHE = 'dxf-station';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './favicon.ico', './dxf-file-256.png', './dxf-file-64.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const put = (key, res) => { if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(key, copy)); } return res; };
  if (url.origin === self.location.origin) {
    const fresh = req.mode === 'navigate' ? new Request(url.href.split('#')[0], { cache: 'no-cache' }) : req;
    e.respondWith(fetch(fresh).then(res => put(req.mode === 'navigate' ? './index.html' : req, res))
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('./index.html'))));
  } else if (/(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => put(req, res))));
  }
});
