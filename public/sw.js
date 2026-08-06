const CACHE_NAME = "sol-new-v1";
const PRECACHE = ["/", "/token", "/nft", "/wallet"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ─── Push notifications ────────────────────────────────────────────────────

self.addEventListener("push", (e) => {
  let data = {};
  try { data = e.data?.json() ?? {}; } catch { data = { title: "sol.new", body: e.data?.text() }; }

  e.waitUntil(
    (async () => {
      // Best-effort: play chime in open clients (SW can't play reliably in bg)
      try {
        const list = await clients.matchAll({ type: "window", includeUncontrolled: true });
        for (const c of list) {
          c.postMessage({ type: "solnew-sfx", kind: "notify" });
        }
      } catch { /* ignore */ }

      return self.registration.showNotification(data.title ?? "sol.new", {
        body: data.body ?? "",
        icon: data.icon ?? "/icon-192.png",
        badge: "/icon-32.png",
        tag: data.tag ?? "solnew",
        renotify: true,
        silent: false,
        // Prefer OS default notification sound
        data: { url: data.url ?? "/" },
      });
    })()
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = e.notification.data?.url ?? "/";
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const existing = list.find((c) => c.url.includes("sol.new") && "focus" in c);
      if (existing) return existing.focus();
      return clients.openWindow(url);
    })
  );
});

// ─── Fetch (cache-first for app shell) ────────────────────────────────────

self.addEventListener("fetch", (e) => {
  const { request } = e;
  // Skip non-GET, API calls, and chrome-extension requests
  if (request.method !== "GET") return;
  if (request.url.includes("/api/")) return;
  if (!request.url.startsWith("http")) return;

  e.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful responses
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
