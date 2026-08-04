"use client";

import { useEffect } from "react";
import { useWallet } from "@/lib/wallet-context";
import { usePathname } from "next/navigation";

const SITE = "sol.new";

function short(pk: string) {
  return `${pk.slice(0, 4)}…${pk.slice(-4)}`;
}

/**
 * Puts the active wallet label in the browser tab title.
 * e.g. "Main · sol.new" or "AbC1…xYz9 · Send · sol.new"
 */
export function WalletBrowserTitle() {
  const { publicKey } = useWallet();
  const pathname = usePathname() || "/";

  useEffect(() => {
    const pathBit = pathTitle(pathname);
    const walletBit = publicKey ? short(publicKey) : null;

    const parts = [walletBit, pathBit, SITE].filter(Boolean);
    // Dedupe if path is home
    const title = [...new Set(parts)].join(" · ");
    document.title = title;

    // PWA / iOS home screen name stays site-level; only tab title changes
  }, [publicKey, pathname]);

  return null;
}

function pathTitle(pathname: string): string | null {
  if (pathname === "/" || pathname === "/home") return null;
  const map: Record<string, string> = {
    "/wallet/send": "Send",
    "/wallet/get": "Wallet",
    "/wallet/find": "Find wallet",
    "/swap": "Swap",
    "/loan": "Loan",
    "/gift": "Gift",
    "/poap": "POAP",
    "/pay": "Pay",
    "/earn": "Earn",
    "/stake": "Stake",
    "/lst": "LST",
    "/scan": "Scan",
    "/address": "Address",
    "/portfolio": "Portfolio",
    "/link": "Link",
    "/token": "Token",
    "/nft": "NFT",
  };
  if (map[pathname]) return map[pathname];
  if (pathname.startsWith("/address/")) return "Address";
  if (pathname.startsWith("/portfolio/")) return "Portfolio";
  if (pathname.startsWith("/token/")) return "Token";
  if (pathname.startsWith("/link/")) return "Link";
  if (pathname.startsWith("/u/")) return "Profile";
  // first segment capitalized
  const seg = pathname.split("/").filter(Boolean)[0];
  if (!seg) return null;
  return seg.charAt(0).toUpperCase() + seg.slice(1);
}
