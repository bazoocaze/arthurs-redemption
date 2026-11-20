// Service worker: deixa o jogo instalável e jogável offline.
//
// Estratégia **stale-while-revalidate** para o app shell: serve do cache na hora
// (abertura instantânea, funciona offline) e busca em segundo plano para
// atualizar a cópia. A escolha entre cache-first e network-first aqui foi por
// causa do desenvolvimento: cache-first puro deixaria o jogo preso numa versão
// antiga até o jogador limpar o cache, o que é péssimo enquanto o jogo muda.
//
// Ao mudar arquivos do jogo, **bumpe a VERSION** para o shell ser reescrito:
// o navegador só rebaixa o que mudou porque cada request é revalidada.
const VERSION = 'ar-v7';
const SHELL = [
  '.',
  'index.html',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'src/main.js',
  'src/config.js',
  'src/rng.js',
  'src/iso.js',
  'src/camera.js',
  'src/grid.js',
  'src/generator.js',
  'src/grove.js',
  'src/input.js',
  'src/ui.js',
  'src/audio.js',
  'src/save.js',
  'src/sim/paint.js',
  'src/sim/fire.js',
  'src/sim/bombs.js',
  'src/render/terrain.js',
  'src/render/trees.js',
  'src/render/sprites.js',
  'src/render/overlay.js',
  'src/render/fire.js',
  'src/render/bombs.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(VERSION)
      // `cache.addAll` falha inteiro se um arquivo faltar; cada um no seu
      // add() deixa o shell subir mesmo com um 404 isolado.
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((chaves) => Promise.all(chaves.filter((c) => c !== VERSION).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

// Em localhost a ordem se inverte: **rede primeiro**, cache só como rede de
// segurança. O jogo é desenvolvido aqui e stale-while-revalidate faria o
// navegador mostrar o código do carregamento anterior depois de cada edição.
const DEV = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(self.location.hostname);

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const emCache = await cache.match(req, { ignoreSearch: true });

      if (DEV) {
        try {
          const resp = await fetch(req);
          if (resp && resp.ok) cache.put(req, resp.clone());
          return resp;
        } catch {
          return emCache || new Response('offline', { status: 503 });
        }
      }

      // Produção: serve o cache na hora e atualiza por trás.
      const rede = fetch(req)
        .then((resp) => {
          if (resp && resp.ok) cache.put(req, resp.clone());
          return resp;
        })
        .catch(() => null);
      return emCache || (await rede) || new Response('offline', { status: 503 });
    }),
  );
});
