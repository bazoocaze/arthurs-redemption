// Service worker: deixa o jogo instalável e jogável offline.
//
// Estratégia: **rede primeiro**, cache como rede de segurança offline.
//
// Já foi stale-while-revalidate (abertura instantânea) e no Android isso virou
// um problema: a primeira abertura servia o cache e a revalidação em segundo
// plano nunca terminava, porque o Chrome congela a aba quando o app sai da
// frente. O jogo ficava preso numa versão antiga por dias. Sacrifício aceito:
// quem está online espera a rede (nada de cache na frente), e o cache existe
// para jogar offline.
//
// Ao mudar arquivos do jogo, **bumpe a VERSION** para o shell ser reescrito.
const VERSION = 'ar-v16';
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

// **Rede primeiro, cache como rede de segurança.** A versão anterior era
// stale-while-revalidate em produção, e no Android isso deixava o jogo preso:
// a primeira abertura servia o cache e a atualização em segundo plano nunca
// terminava (o Chrome congela a aba assim que o app sai da frente). Com rede
// primeiro, quem está online sempre vê a última versão; offline o cache entra.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    (async () => {
      const cache = await caches.open(VERSION);
      try {
        const resp = await fetch(req);
        if (resp && resp.ok) cache.put(req, resp.clone());
        return resp;
      } catch {
        const emCache = await cache.match(req, { ignoreSearch: true });
        return emCache || new Response('offline', { status: 503 });
      }
    })(),
  );
});
