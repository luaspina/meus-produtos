// Service worker: funciona offline e busca a versão nova quando há internet.
const CACHE = 'produtos-v36';
const ARQUIVOS = ['./', './index.html', './style.css', './app.js', './seed.js', './config.js', './sync.js', './manifest.json',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
  ...['p20','p22','p30','p35','p46','p52','p53','p54','p57','p88','p9','p13','p14','p17','p32','p21','p25','p34','p41','p43','p45','p56','p58','p59','p60','p61','p62','p63','p64','p65','p66','p67','p132','p47','p50','p51','p55','p10','p6','p7','p8','p11','p12','p15','p23','p24','p33','p27','p29','p31','p36','p37','p40','p44','p38','p1','p2','p3','p4','p16','p18','p39','p26','p19','p5','p28','p48','p49','p81','p80','p71','p74','p75','p76','p77','p78','p79','p82','p83','p84','p68','p69','p70','p72','p73','p116','p95','p97','p98','p114','p115','p121','p122','p123','p99','p85','p113','p86','p87','p112','p96','p126','p127','p125','p100','p102','p103','p94','p104','p105','p101','p120'].map(f => './fotos/' + f + '.jpg'), './fotos/p42s.jpg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Rede primeiro (pega atualizações), cache se estiver offline.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then(r => {
      const copia = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copia));
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
  );
});
