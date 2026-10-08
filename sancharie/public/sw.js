self.addEventListener('push', (event) => {
  let message = {};
  try { message = event.data ? event.data.json() : {}; } catch { message = { body: event.data?.text() || '' }; }
  const title = String(message.title || 'Sancharie update').slice(0, 100);
  const options = {
    body: String(message.body || '').slice(0, 240),
    icon: '/icons/app-icon-192.png',
    badge: '/icons/app-icon-192.png',
    tag: String(message.tag || 'sancharie-update').slice(0, 100),
    data: { url: String(message.url || '/') },
    renotify: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin);
  if (target.origin !== self.location.origin) target.href = self.location.origin;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) { existing.navigate(target.href); return existing.focus(); }
    return self.clients.openWindow(target.href);
  }));
});
