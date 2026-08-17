"use client";

import { useRouter, usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/** Primary shell routes — no header back (bottom tabs / home cover these). */
const NO_BACK = new Set([
  "/",
  "/home",
  "/wallet",
  "/wallet/get",
  "/wallet/pay",
  "/wallet/send",
  "/wallet/token",
  "/wallet/nft",
  "/wallet/multisig",
  "/wallet/settings",
  "/token",
  "/gift",
  "/punt",
  "/portfolio",
  "/onboard",
]);

/**
 * Back control for nested pages only.
 * Sits after the logo (logo stays leftmost for menu activation).
 */
export function PageBack({ className = "" }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname() || "/";

  if (NO_BACK.has(pathname)) return null;
  // Hide on bare section roots; show on nested /token/x, /address/x, etc.
  if (pathname === "/claim" || pathname === "/scan" || pathname === "/address") {
    /* allow back on these entry forms */
  }

  const go = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/home");
    }
  };

  return (
    <button
      type="button"
      onClick={go}
      aria-label="Go back"
      className={`inline-flex items-center justify-center shrink-0 h-9 w-9 sm:h-10 sm:w-auto sm:min-w-[40px] sm:px-2.5 rounded-full sm:rounded-xl text-sm text-gray-600 dark:text-white/70 hover:bg-black/5 dark:hover:bg-white/10 active:scale-95 transition cursor-pointer border border-transparent hover:border-black/10 dark:hover:border-white/10 ${className}`}
    >
      <ArrowLeft size={18} strokeWidth={2.25} />
      <span className="hidden sm:inline font-medium ml-1">Back</span>
    </button>
  );
}
