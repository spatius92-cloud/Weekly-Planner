// Service worker for the Frame & Frqnc Weekly Planner.
// Its only job is to receive push events from the server and show them as
// native notifications, and to focus/open the planner when one is clicked.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = { title: 'Weekly Planner', body: 'You have an update.' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (_) {
    // ignore malformed payloads, fall back to the default text above
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      icon: data.icon,
      badge: data.badge,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    })
  );
});
