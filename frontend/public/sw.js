/* Service worker do EasyAgenda+ (fase 5).
 * Guarda só a casca (ícones e a página sem conexão): dados nunca ficam no aparelho.
 * Recebe o Web Push e abre o link da notificação ao tocar. */

const CACHE = 'easyagenda-casca-v3';
const CASCA = ['/icons/icon-192.png', '/icons/icon-512.png', '/offline.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(CASCA)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(chaves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Navegação: sempre a rede; sem conexão, a página de aviso. API e o resto não passam por aqui.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/offline.html')));
    return;
  }
  if (url.pathname.startsWith('/icons/')) {
    event.respondWith(caches.match(req).then((r) => r || fetch(req)));
  }
});

self.addEventListener('push', (event) => {
  let dados = {};
  try {
    dados = event.data ? event.data.json() : {};
  } catch (_) {
    dados = { titulo: event.data ? event.data.text() : 'EasyAgenda+' };
  }
  const titulo = dados.titulo || 'EasyAgenda+';
  event.waitUntil(self.registration.showNotification(titulo, {
    body: dados.corpo || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/maskable-192.png',
    tag: dados.tag || undefined,
    data: { link: dados.link || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destino = new URL((event.notification.data && event.notification.data.link) || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((janelas) => {
      for (const j of janelas) {
        if (j.url.startsWith(self.location.origin) && 'focus' in j) {
          j.navigate(destino);
          return j.focus();
        }
      }
      return self.clients.openWindow(destino);
    }),
  );
});
