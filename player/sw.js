/* ================================================================
   Estação de Escuta — Service Worker
   ----------------------------------------------------------------
   Objetivo: deixar a CASCA do app (a página) disponível offline.
   Os CSV e os áudios continuam vindo dos inputs de arquivo (pasta
   sincronizada via Syncthing) — eles NÃO passam por aqui, pois são
   lidos como blob: em memória, fora do alcance do service worker.

   Estratégias:
   - Navegação (o HTML): network-first → sempre pega a versão nova
     quando há internet; cai no cache quando está offline.
   - Estáticos same-origin (ícones/manifest): cache-first.
   - Fontes do Google (cross-origin): cache-first em runtime, para
     que fiquem disponíveis offline depois da primeira visita online.

   Para publicar uma versão nova do app: basta subir o index.html
   atualizado e trocar o número em CACHE_VERSION abaixo. O SW limpa
   os caches antigos automaticamente ao ativar.
   ================================================================ */

const CACHE_VERSION = 'estacao-v8';
const RUNTIME_CACHE = 'estacao-runtime-v8';

// Caminhos RELATIVOS ao escopo (funciona em user.github.io/repo/).
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_VERSION && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Permite forçar a ativação de uma versão nova sem fechar o app.
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

function isFontRequest(url) {
  return (
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com'
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Só lidamos com GET http/https. Ignora blob:, data:, POST etc.
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // 1) Navegação (carregar a página): network-first, fallback offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_VERSION);
          return (
            (await cache.match('./index.html')) ||
            (await cache.match('./')) ||
            Response.error()
          );
        })
    );
    return;
  }

  // 2) Fontes do Google (cross-origin): cache-first em runtime.
  if (isFontRequest(url)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req)
          .then((res) => {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
            return res;
          })
          .catch(() => cached);
      })
    );
    return;
  }

  // 3) Estáticos same-origin: cache-first, com atualização em runtime.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req)
          .then((res) => {
            if (res && res.status === 200 && res.type === 'basic') {
              const copy = res.clone();
              caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => cached);
      })
    );
  }
});
