/* Sourcing Shenzhen — service worker.
   Strategie : cache-first sur tous les assets. L'app doit fonctionner
   a 100 % en mode avion : le reseau n'est jamais sur le chemin critique.
   Bump CACHE a chaque deploiement (pas de build step, donc pas de hash). */

const CACHE = 'sourcing-v1';
const SHARE_INBOX = 'sourcing-share-inbox';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE && k !== SHARE_INBOX).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

/* Share Target Android : Chrome POSTe le partage sur ./share-target.
   On range les fichiers dans un cache dedie puis on redirige vers l'app,
   qui les recupere et vide la boite. iOS ne declenche jamais ce chemin. */
async function handleShare(request) {
  try {
    const form = await request.formData();
    const files = form.getAll('photos').filter((f) => f && f.size);
    const inbox = await caches.open(SHARE_INBOX);
    const keys = await inbox.keys();
    await Promise.all(keys.map((k) => inbox.delete(k)));
    let i = 0;
    for (const file of files) {
      await inbox.put(
        new Request('./_shared/' + (i++) + '?t=' + Date.now()),
        new Response(file, {
          headers: {
            'Content-Type': file.type || 'image/jpeg',
            'X-Last-Modified': String(file.lastModified || Date.now())
          }
        })
      );
    }
  } catch (e) {
    /* un partage rate ne doit jamais bloquer l'ouverture de l'app */
  }
  return Response.redirect('./?share=1', 303);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method === 'POST' && url.pathname.endsWith('/share-target')) {
    event.respondWith(handleShare(request));
    return;
  }

  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // Navigations : toujours la coquille en cache (offline-first).
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html', { ignoreSearch: true })
        .then((hit) => hit || fetch(request).catch(() => caches.match('./')))
    );
    return;
  }

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      }).catch(() => hit);
    })
  );
});
