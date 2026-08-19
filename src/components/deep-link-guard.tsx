"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

const ENTRY_KEY = "solnew.deeplink.entry";
const GUARD_MS = 8_000;

/**
 * First-load deep-link guard.
 *
 * Cold open of /claim#…, /link/…, /token/…, etc. sometimes loses the route
 * (SW focus, onboard rewrite race, wallet shell). We snapshot the entry URL
 * (path + query + hash) and restore it if something steers to a "home shell"
 * within a few seconds.
 */
const DEEP_PREFIXES = [
  "/claim",
  "/link/",
  "/l/",
  "/gift",
  "/token/",
  "/address/",
  "/receipt/",
  "/explorer",
  "/pay",
  "/pos",
  "/swap",
  "/portfolio/",
  "/multisig/",
  "/nft",
  "/poap",
  "/draw",
  "/punt",
  "/sub",
  "/stake",
  "/earn",
  "/loan",
  "/lst",
  "/starter",
  "/welcome",
  "/dir",
  "/docs",
  "/get",
  "/wallet/",
];

function isDeepPath(path: string) {
  if (!path || path === "/") return false;
  return DEEP_PREFIXES.some(
    (p) => path === p || path.startsWith(p) || path === p.replace(/\/$/, ""),
  );
}

function isShellPath(path: string) {
  return (
    path === "/" ||
    path === "/onboard" ||
    path === "/home" ||
    path === "/wallet" ||
    path === "/wallet/get" ||
    path === "/splash"
  );
}

export function DeepLinkGuard() {
  const pathname = usePathname() || "/";
  const router = useRouter();

  useEffect(() => {
    // Snapshot first real entry (incl. hash — not in Next pathname)
    try {
      const full = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const pathOnly = window.location.pathname;
      if (isDeepPath(pathOnly)) {
        sessionStorage.setItem(ENTRY_KEY, full);
        sessionStorage.setItem(`${ENTRY_KEY}.t`, String(Date.now()));
      }
    } catch {
      /* private mode */
    }

    // SW / push may ask us to navigate
    const onMsg = (ev: MessageEvent) => {
      const data = ev.data as { type?: string; url?: string } | null;
      if (!data || data.type !== "solnew-deeplink" || !data.url) return;
      try {
        const u = new URL(data.url, window.location.origin);
        if (u.origin === window.location.origin) {
          router.push(`${u.pathname}${u.search}${u.hash}`);
        }
      } catch {
        /* ignore */
      }
    };
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", onMsg);
    }
    return () => {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", onMsg);
      }
    };
  }, [router]);

  useEffect(() => {
    try {
      const entry = sessionStorage.getItem(ENTRY_KEY);
      const t = Number(sessionStorage.getItem(`${ENTRY_KEY}.t`) || "0");
      if (!entry || !t) return;
      if (Date.now() - t > GUARD_MS) {
        sessionStorage.removeItem(ENTRY_KEY);
        sessionStorage.removeItem(`${ENTRY_KEY}.t`);
        return;
      }

      const entryPath = entry.split(/[?#]/)[0] || "";
      if (!isDeepPath(entryPath)) return;

      // Something bounced us to a shell — restore deep link once
      if (isShellPath(pathname) && pathname !== entryPath) {
        sessionStorage.removeItem(ENTRY_KEY);
        sessionStorage.removeItem(`${ENTRY_KEY}.t`);
        // full navigation preserves hash for claim secrets
        window.location.replace(entry);
      }
    } catch {
      /* ignore */
    }
  }, [pathname]);

  return null;
}
