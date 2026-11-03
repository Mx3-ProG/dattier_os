const CACHE = "dattier-shell-v2";
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      const response = await fetch("/offline", { cache: "reload" });
      if (!response.ok) throw new Error("Offline shell unavailable");
      const html = await response.clone().text();
      await cache.put("/offline", response);
      const assets = [
        ...html.matchAll(/(?:src|href)="(\/_next\/static\/[^"<>]+)"/g),
      ].map((m) => m[1].replaceAll("&amp;", "&"));
      await cache.addAll(["/icon.svg", ...new Set(assets)]);
    }),
  );
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      ),
  );
  self.clients.claim();
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin || event.request.method !== "GET") return;
  if (
    ["/offline", "/platform", "/dashboard"].includes(url.pathname) &&
    event.request.mode === "navigate"
  ) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/offline")),
    );
    return;
  }
  if (url.pathname.startsWith("/_next/static/"))
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const old = await cache.match(event.request);
        if (old) return old;
        const response = await fetch(event.request);
        if (response.ok) await cache.put(event.request, response.clone());
        return response;
      }),
    );
});
