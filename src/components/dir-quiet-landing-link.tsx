"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useWallet } from "@/lib/wallet-context";

/**
 * Quiet “marketing site” entry — only when no wallet / not onboarded.
 * Logged-in users already live in the app; we never push marketing at them.
 */
export function DirQuietLandingLink() {
  const { publicKey } = useWallet();
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      const onboarded =
        localStorage.getItem("sol.new.onboard.done") === "1" ||
        Boolean(localStorage.getItem("sol.new.wallet"));
      setShow(!publicKey && !onboarded);
    } catch {
      setShow(!publicKey);
    }
  }, [publicKey]);

  if (!show) return null;

  return (
    <p className="text-xs text-gray-500 dark:text-white/40 pt-1">
      New here?{" "}
      <Link
        href="/welcome"
        className="text-violet-600 dark:text-violet-400 font-medium hover:underline"
      >
        Marketing landing →
      </Link>
    </p>
  );
}
