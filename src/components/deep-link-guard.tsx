"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

const ENTRY_KEY = "solnew.deeplink.entry";
const GUARD_MS = 12_000;

/**
 * First-load deep-link guard (web + TWA).
 *
 * Android App Links never deliver URL fragments. Gift secrets use ?g=.
 * Also restores path if onboard/wallet shell steals the first paint.
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
  "/rent",
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

function snapshotEntry() {
  try {
    const full = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const pathOnly = window.location.pathname;
    // Claim with ?g= is deep even if hash stripped
    const hasGiftQuery = /[?&]g=/.test(window.location.search);
    if (isDeepPath(pathOnly) || hasGiftQuery) {
      sessionStorage.setItem(ENTRY_KEY, full);
      sessionStorage.setItem(`${ENTRY_KEY}.t`, String(Date.now()));
    }
  } catch {
    /* private mode */
  }
}

export function DeepLinkGuard() {
  const pathname = usePathname() || "/";
  const router = useRouter();

  useEffect(() => {
    snapshotEntry();

    const onMsg = (ev: MessageEvent) => {
      const data = ev.data as { type?: string; url?: string } | null;
      if (!data || data.type !== "solnew-deeplink" || !data.url) return;
      try {
        const u = new URL(data.url, window.location.origin);
        if (u.origin === window.location.origin) {
          // Full navigation so query/hash always apply
          window.location.assign(`${u.pathname}${u.search}${u.hash}`);
        }
      } catch {
        /* ignore */
      }
    };
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", onMsg);
    }
    // pageshow from bfcache / TWA resume
    const onShow = () => snapshotEntry();
    window.addEventListener("pageshow", onShow);
    return () => {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", onMsg);
      }
      window.removeEventListener("pageshow", onShow);
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
      const entryIsDeep =
        isDeepPath(entryPath) || /[?&]g=/.test(entry);
      if (!entryIsDeep) return;

      // Something bounced us to a shell — restore deep link once
      if (isShellPath(pathname) && pathname !== entryPath) {
        sessionStorage.removeItem(ENTRY_KEY);
        sessionStorage.removeItem(`${ENTRY_KEY}.t`);
        window.location.replace(entry);
      }
    } catch {
      /* ignore */
    }
  }, [pathname]);

  return null;
}
