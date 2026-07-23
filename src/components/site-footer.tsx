"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Site-wide public footer. Keep links stable and crawlable.
 * Skipped on /home (marketing page has its own footer).
 */
export function SiteFooter() {
  const pathname = usePathname();
  if (pathname === "/home") return null;

  return (
    <footer className="border-t border-black/10 dark:border-white/10 mt-auto">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500 dark:text-white/40">
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="font-semibold text-gray-700 dark:text-white/70 hover:text-purple-400 transition"
          >
            sol<span className="text-purple-400">.new</span>
          </Link>
          <span className="text-black/20 dark:text-white/20">·</span>
          <span>Solana tools, passkey-first</span>
        </div>
        <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <Link href="/changelog" className="hover:text-purple-400 transition font-medium text-purple-400/90">
            Changelog
          </Link>
          <Link href="/features" className="hover:text-purple-400 transition">
            Features
          </Link>
          <Link href="/docs" className="hover:text-purple-400 transition">
            Docs
          </Link>
          <Link href="/whats-new" className="hover:text-purple-400 transition">
            What&apos;s new
          </Link>
          <Link href="/privacy" className="hover:text-purple-400 transition">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-purple-400 transition">
            Terms
          </Link>
          <a
            href="https://x.com/soldotnew"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-purple-400 transition"
          >
            X
          </a>
          <a
            href="https://t.me/soldotnew"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-purple-400 transition"
          >
            Telegram
          </a>
        </nav>
      </div>
    </footer>
  );
}
