importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.4.1/workbox-sw.js');

const OFFLINE_URL = '/static/offline.html';

if (workbox) {
  console.log('[Service Worker] Workbox is loaded');

  // Pre-cache the offline page
  workbox.precaching.precacheAndRoute([
    { url: OFFLINE_URL, revision: '1' }
  ]);

  // Cache static assets (CSS, JS, images)
  workbox.routing.registerRoute(
    /\.(?:js|css|png|jpg|jpeg|svg|ico)$/,
    new workbox.strategies.StaleWhileRevalidate({
      cacheName: 'static-resources',
    })
  );

  // Cache the app shell (navigation requests)
  const navigationHandler = new workbox.strategies.NetworkFirst({
    cacheName: 'app-shell',
  });

  workbox.routing.registerRoute(
    ({request}) => request.mode === 'navigate',
    async (args) => {
      try {
        return await navigationHandler.handle(args);
      } catch (error) {
        return caches.match(OFFLINE_URL);
      }
    }
  );

} else {
  console.log('[Service Worker] Workbox failed to load');
}
