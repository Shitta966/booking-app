/* FUTICK service worker: shows push notifications and opens the linked page when one is tapped. */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { title: 'FUTICK', body: event.data ? event.data.text() : '' } }
  event.waitUntil(self.registration.showNotification(data.title || 'FUTICK', {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    tag: data.tag,
    data: { href: data.href || '/' },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const href = new URL(event.notification.data?.href || '/', self.location.origin).href
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
        await client.navigate(href)
        return client.focus()
      }
    }
    return self.clients.openWindow(href)
  })())
})
