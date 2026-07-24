"use client";

import { useRouter, usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/**
 * Back control for non-home pages. Prefers history when available, else home.
 */
export function PageBack({ className = "" }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();

  if (!pathname || pathname === "/") return null;

  const go = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  };

  return (
    <button
      type="button"
      onClick={go}
      aria-label="Go back"
      className={`inline-flex items-center gap-1.5 min-h-[40px] min-w-[40px] px-2 rounded-xl text-sm text-gray-600 dark:text-white/70 hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition cursor-pointer ${className}`}
    >
      <ArrowLeft size={18} strokeWidth={2.25} />
      <span className="hidden sm:inline font-medium">Back</span>
    </button>
  );
}
