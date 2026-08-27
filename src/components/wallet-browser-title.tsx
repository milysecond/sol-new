"use client";

import { useEffect } from "react";
import { useWallet } from "@/lib/wallet-context";
import { usePathname } from "next/navigation";

const SITE = "sol.new";

/** Mid-length id for tab / PWA status — readable on Seeker chrome. */
function statusId(pk: string) {
  if (pk.length <= 16) return pk;
  return `${pk.slice(0, 6)}…${pk.slice(-6)}`;
}

/**
 * Puts the active wallet id in the browser / TWA title bar.
 * e.g. "891jQv…WjjdfV · Get · sol.new"
 */
export function WalletBrowserTitle() {
  const { publicKey } = useWallet();
  const pathname = usePathname() || "/";

  useEffect(() => {
    const pathBit = pathTitle(pathname);
    const walletBit = publicKey ? statusId(publicKey) : null;

    // Wallet id first so Seeker / TWA status bar shows identity
    const parts = [walletBit, pathBit, SITE].filter(Boolean) as string[];
    const seen = new Set<string>();
    const unique = parts.filter((p) => {
      if (seen.has(p)) return false;
      seen.add(p);
      return true;
    });
    document.title = unique.join(" · ");

    // Best-effort: some WebViews pick up the first heading / apple title less often
    try {
      let meta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
      if (!meta) {
        meta = document.createElement("meta");
        meta.setAttribute("name", "apple-mobile-web-app-title");
        document.head.appendChild(meta);
      }
      meta.setAttribute("content", walletBit ? `${walletBit} · ${SITE}` : SITE);
    } catch {
      /* ignore */
    }
  }, [publicKey, pathname]);

  return null;
}

function pathTitle(pathname: string): string | null {
  if (pathname === "/" || pathname === "/home") return null;
  const map: Record<string, string> = {
    "/wallet/send": "Send",
    "/wallet/get": "Get",
    "/wallet/pay": "Pay",
    "/wallet/find": "Find",
    "/wallet/settings": "Settings",
    "/wallet/token": "Tokens",
    "/wallet/nft": "NFTs",
    "/wallet/multisig": "Multi",
    "/swap": "Swap",
    "/loan": "Loan",
    "/gift": "Gift",
    "/poap": "POAP",
    "/pay": "Pay",
    "/earn": "Earn",
    "/stake": "Stake",
    "/lst": "LST",
    "/address": "Address",
    "/scan": "Address",
    "/portfolio": "Portfolio",
    "/link": "Link",
    "/token": "Token",
    "/nft": "NFT",
    "/get": "Get funds",
  };
  if (map[pathname]) return map[pathname];
  if (pathname.startsWith("/wallet/")) return "Wallet";
  if (pathname.startsWith("/address/")) return "Address";
  if (pathname.startsWith("/portfolio/")) return "Portfolio";
  if (pathname.startsWith("/token/")) return "Token";
  if (pathname.startsWith("/link/")) return "Link";
  if (pathname.startsWith("/u/")) return "Profile";
  const seg = pathname.split("/").filter(Boolean)[0];
  if (!seg) return null;
  return seg.charAt(0).toUpperCase() + seg.slice(1);
}
