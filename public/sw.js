const CACHE_NAME = "app-portaria360-v1";
const ASSETS = ["/", "/app", "/styles.css", "/shared.js", "/admin.js", "/resident.js", "/manifest.webmanifest", "/assets/portaria360logo.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(event.request).then((response) => response ?? caches.match("/"))
    )
  );
});
