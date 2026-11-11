/* Turni Cinema - service worker: permette di aprire l'app anche senza internet */
const CACHE = 'turni-v2';
const SHARE = 'turni-share';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './pdf.mjs', './pdf.worker.mjs'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== SHARE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* "Condividi" da Android: arriva un POST con il PDF. Lo salvo e riapro l'app, che lo importa. */
async function handleShare(req) {
  try {
    const fd = await req.formData();
    const file = fd.get('pdf');
    if (file && typeof file !== 'string') {
      const c = await caches.open(SHARE);
      await c.put('shared-pdf', new Response(file, {
        headers: { 'Content-Type': 'application/pdf', 'X-File-Name': encodeURIComponent(file.name || 'turni.pdf') }
      }));
    }
  } catch (err) { /* se fallisce, l'app mostrera' un avviso */ }
  return Response.redirect(new URL('./?shared=1', self.registration.scope).href, 303);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method === 'POST' && url.origin === location.origin && url.pathname.endsWith('/share-target')) {
    e.respondWith(handleShare(req));
    return;
  }
  if (req.method !== 'GET') return;
  if (url.origin !== location.origin) return;           // il sito dei cinema e il ponte non passano di qui
  const heavy = /\/pdf(\.worker)?\.mjs$/.test(url.pathname);
  if (heavy) {                                           // librerie pesanti: prima la copia salvata
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
      const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return r;
    })));
    return;
  }
  e.respondWith(                                         // il resto: prima la rete (cosi' gli aggiornamenti arrivano), poi la copia
    fetch(req).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return r;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('./index.html')))
  );
});
