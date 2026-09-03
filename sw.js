/* Sourcing Shenzhen — service worker.
   Strategie : cache-first sur tous les assets. L'app doit fonctionner
   a 100 % en mode avion : le reseau n'est jamais sur le chemin critique.
   Bump CACHE a chaque deploiement (pas de build step, donc pas de hash). */

const CACHE = 'sourcing-v2';
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
  event.waitUntil((async () => {
    const keys = await caches.keys();
    const stale = keys.filter((k) => k !== CACHE && k !== SHARE_INBOX);
    await Promise.all(stale.map((k) => caches.delete(k)));
    await self.clients.claim();
    // stale.length > 0 : il y avait une version precedente, donc c'est une mise a
    // jour et pas une premiere installation — inutile d'alerter a l'installation.
    if (stale.length) await notifyClients({ type: 'UPDATE_READY' });
  })());
});

/* Revalidation en cours, s'il y en a une : la page peut l'attendre avant de
   demander s'il y a du neuf, ce qui evite toute course au chargement. */
let pendingRevalidate = null;
const FLAG = './__update-ready';

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') { self.skipWaiting(); return; }
  if (data.type === 'IS_UPDATE_READY') {
    event.waitUntil((async () => {
      try { await pendingRevalidate; } catch (e) { /* hors ligne */ }
      const cache = await caches.open(CACHE);
      const flag = await cache.match(FLAG);
      if (flag && event.source) event.source.postMessage({ type: 'UPDATE_READY' });
    })());
  }
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
    // Partage d'une page produit (LoveGoBuy, 1688, Taobao...) : Android envoie
    // l'URL dans text ou url. On la range a cote des photos.
    const lien = [form.get('url'), form.get('text'), form.get('title')]
      .map((v) => String(v || ''))
      .map((v) => (v.match(/https?:\/\/\S+/) || [])[0])
      .filter(Boolean)[0];
    if (lien) await inbox.put(new Request('./_shared-link?t=' + Date.now()), new Response(lien));
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

async function notifyClients(msg) {
  const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  list.forEach((c) => c.postMessage(msg));
}

async function revalidatingShell(event) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match('./index.html', { ignoreSearch: true });
  // Copie prise MAINTENANT : `cached` part vers la page, qui consomme son corps.
  // Le cloner plus tard, depuis la revalidation, echoue avec « body already used »
  // et la mise a jour passe alors totalement inapercue.
  const cachedCopy = cached ? cached.clone() : null;

  const revalidate = (async () => {
    try {
      const res = await fetch('./index.html', { cache: 'no-store' });
      if (!res || !res.ok) return;
      const fresh = await res.clone().text();
      const old = cachedCopy ? await cachedCopy.text() : null;
      if (old === fresh) {
        // la page tourne deja sur la derniere version : plus rien en attente
        await cache.delete(FLAG);
        return;
      }
      await cache.put('./index.html', res.clone());
      await cache.put('./', res.clone());
      await cache.put(FLAG, new Response('1'));
      // la page en cours n'a peut-etre pas encore attache son ecouteur : le
      // drapeau ci-dessus est la source de verite, ce message n'est qu'un bonus
      await notifyClients({ type: 'UPDATE_READY' });
    } catch (e) {
      /* hors ligne : on garde la version en cache, c'est tout l'interet */
    }
  })();
  pendingRevalidate = revalidate;
  event.waitUntil(revalidate);

  if (cached) return cached;
  try { return await fetch(event.request); }
  catch (e) { return (await cache.match('./')) || new Response('Hors ligne', { status: 503 }); }
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

  // Navigations : la coquille en cache repond tout de suite (offline-first et
  // instantane sur un reseau de marche), puis on verifie en arriere-plan si une
  // nouvelle version est en ligne. Sans ca, une correction qui ne touche que
  // index.html n'atteint jamais l'appareil : le navigateur ne declenche une mise
  // a jour que si sw.js change, ce qui obligerait a bumper une version a la main.
  if (request.mode === 'navigate') {
    event.respondWith(revalidatingShell(event));
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
