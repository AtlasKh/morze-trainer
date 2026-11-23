// Network-first for the page itself, cache-first for static assets.
// The old cache-first-for-everything worker could serve a stale index.html forever.
const CACHE = 'morse-v4';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => { if (e.data === 'skip-waiting') self.skipWaiting(); });

function freshUrl(url) {
  return url + (url.indexOf('?') >= 0 ? '&' : '?') + '_sw=' + Date.now();
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const isDoc = req.mode === 'navigate' || req.destination === 'document';

  if (isDoc) {
    // always try the network (bypassing the HTTP cache), fall back to the copy on disk
    e.respondWith(
      fetch(freshUrl(req.url), { credentials: 'same-origin' })
        .then(res => {
          if (!res || res.status !== 200) throw new Error('bad status');
          const copy = res.clone();
          caches.open(CACHE).then(c => {
            c.put('./index.html', copy.clone()).catch(() => {});
            c.put('./', copy).catch(() => {});
          }).catch(() => {});
          return res;
        })
        .catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  // assets: serve from cache at once, refresh it in the background
  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(res => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
