const CACHE_NAME = 'margin-reader-v5'
const APP_BASE = new URL(self.registration.scope).pathname

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME)
    const pageResponse = await fetch(APP_BASE)
    const pageHtml = await pageResponse.clone().text()
    await cache.put(APP_BASE, pageResponse)
    const appAssets = [...pageHtml.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)]
      .map((match) => new URL(match[1], self.location.origin).href)
    await cache.addAll([
      `${APP_BASE}manifest.webmanifest`,
      `${APP_BASE}margin-mark.svg`,
      ...appAssets,
    ])
  })())
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
    )),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(async (response) => {
      await caches.open(CACHE_NAME).then((cache) => cache.put(APP_BASE, response.clone()))
      return response
    }).catch(async () => (await caches.match(request)) ?? (await caches.match(APP_BASE))))
    return
  }

  event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request).then(async (response) => {
    if (response.ok) {
      await caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()))
    }
    return response
  })))
})