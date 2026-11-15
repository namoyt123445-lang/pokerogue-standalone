// No background caching or request interception. Account/save responses must
// always reach the same-origin server and must never be cached.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
