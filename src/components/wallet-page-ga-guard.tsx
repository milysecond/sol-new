"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isWalletPath } from "@/lib/csp";

/**
 * Audit H3: wallet pages must run without Google Analytics. If GA was loaded
 * on a marketing page and the user soft-navigates into a wallet page, do one
 * hard load so the page gets its strict CSP and no third-party scripts.
 */
export function WalletPageGaGuard() {
  const pathname = usePathname() || "/";
  useEffect(() => {
    const w = window as unknown as { __solnewGa?: number };
    if (w.__solnewGa && isWalletPath(pathname)) {
      window.location.replace(window.location.href);
    }
  }, [pathname]);
  return null;
}
