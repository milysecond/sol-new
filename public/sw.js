/**
 * sol.new service worker
 * v3 — deep-link safe:
 *  - Never cache HTML navigations (claim/gift/token first-open must hit network)
 *  - Notification click navigates to target URL (not just focus home)
 *  - Static assets only in cache
 */
const CACHE_NAME = "sol-new-v3";
const PRECACHE = ["/icon-192.png", "/icon-512.png", "/manifest.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

// ─── Push ───────────────────────────────────────────────────────────────────

self.addEventListener("push", (e) => {
  let data = {};
  try {
    data = e.data?.json() ?? {};
  } catch {
    data = { title: "sol.new", body: e.data?.text() };
  }

  e.waitUntil(
    (async () => {
      try {
        const list = await clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });
        for (const c of list) {
          c.postMessage({ type: "solnew-sfx", kind: "notify" });
        }
      } catch {
        /* ignore */
      }

      return self.registration.showNotification(data.title ?? "sol.new", {
        body: data.body ?? "",
        icon: data.icon ?? "/icon-192.png",
        badge: "/icon-32.png",
        tag: data.tag ?? "solnew",
        renotify: true,
        silent: false,
        data: { url: data.url ?? "/" },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  let url = e.notification.data?.url ?? "/";
  try {
    // Absolute-ize relative paths
    url = new URL(url, self.registration.scope).href;
  } catch {
    url = self.registration.scope;
  }

  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (list) => {
      for (const c of list) {
        if (!("focus" in c)) continue;
        try {
          await c.focus();
          // Critical: navigate existing client to deep link (focus alone stays on old route)
          if ("navigate" in c && typeof c.navigate === "function") {
            await c.navigate(url);
            return;
          }
          // Fallback: postMessage so the page can router.push
          c.postMessage({ type: "solnew-deeplink", url });
          return;
        } catch {
          /* try next */
        }
      }
      return clients.openWindow(url);
    }),
  );
});

// ─── Fetch ──────────────────────────────────────────────────────────────────

function isNavigation(request) {
  if (request.mode === "navigate") return true;
  if (request.destination === "document") return true;
  const accept = request.headers.get("accept") || "";
  if (accept.includes("text/html")) return true;
  return false;
}

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;
  if (!request.url.startsWith("http")) return;

  const url = new URL(request.url);

  // Never intercept API / RSC / Next data — break streaming / deep links if cached
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_next/") ||
    url.searchParams.has("_rsc")
  ) {
    return;
  }

  // Deep-link critical: always network for page navigations. No HTML cache.
  if (isNavigation(request)) {
    e.respondWith(
      fetch(request).catch(async () => {
        // Offline fallback only — never a wrong route from precache
        const offline = await caches.match("/manifest.json");
        return (
          offline ||
          new Response("Offline", {
            status: 503,
            headers: { "Content-Type": "text/plain" },
          })
        );
      }),
    );
    return;
  }

  // Static assets: stale-while-revalidate
  e.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok && response.type === "basic") {
            cache.put(request, response.clone()).catch(() => {});
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
