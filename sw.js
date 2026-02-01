const CACHE_NAME = 'v1-711-tracker';
const ASSETS = [
  'index.html',
  'index.tsx',
  'types.ts',
  'constants.ts',
  'utils/calculations.ts',
  'services/storageService.ts'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then(res => res || fetch(e.request)));
});
