"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Keyboard, X } from "lucide-react";

type Shortcut = {
  keys: string;
  label: string;
  href?: string;
  action?: "help" | "back" | "home";
};

/** `g` then key — GitHub-style navigation */
const GO_MAP: Record<string, string> = {
  h: "/home",
  w: "/wallet",
  t: "/token",
  n: "/nft",
  m: "/memes",
  g: "/gift",
  p: "/portfolio",
  e: "/explorer",
  a: "/scan",
  i: "/id",
  r: "/rent",
  s: "/swap",
  o: "/poap",
  u: "/sub",
  d: "/pos",
  k: "/starter",
  c: "/claim",
  f: "/pay",
};

const HELP_ROWS: { group: string; items: Shortcut[] }[] = [
  {
    group: "Navigation (press g, then…)",
    items: [
      { keys: "g h", label: "Home", href: "/home" },
      { keys: "g w", label: "Wallet", href: "/wallet" },
      { keys: "g t", label: "Token", href: "/token" },
      { keys: "g n", label: "NFT", href: "/nft" },
      { keys: "g m", label: "Memes", href: "/memes" },
      { keys: "g g", label: "Gift", href: "/gift" },
      { keys: "g p", label: "Portfolio", href: "/portfolio" },
      { keys: "g e", label: "Explorer", href: "/explorer" },
      { keys: "g a", label: "Address lookup", href: "/scan" },
      { keys: "g i", label: "Names (.sol · .sns…)", href: "/id" },
      { keys: "g r", label: "Rent", href: "/rent" },
      { keys: "g s", label: "Swap", href: "/swap" },
      { keys: "g o", label: "POAP", href: "/poap" },
      { keys: "g u", label: "Subs", href: "/sub" },
      { keys: "g d", label: "POS", href: "/pos" },
      { keys: "g k", label: "Starter", href: "/starter" },
      { keys: "g f", label: "Pay", href: "/pay" },
    ],
  },
  {
    group: "General",
    items: [
      { keys: "?", label: "Show shortcuts" },
      { keys: "Esc", label: "Close / cancel" },
      { keys: "/", label: "Focus search (when present)" },
      { keys: "b", label: "Back" },
    ],
  },
];

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return Boolean(el.closest("[contenteditable='true']"));
}

/**
 * Global keyboard shortcuts for desktop power users.
 * - `g` then letter → navigate
 * - `?` → help
 * - `/` → focus first search-like input
 * - `b` / Esc → back / close help
 */
export function KeyboardShortcuts() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [goArmed, setGoArmed] = useState(false);

  const focusSearch = useCallback(() => {
    const candidates = [
      'input[type="search"]',
      'input[placeholder*="Search" i]',
      'input[placeholder*="address" i]',
      'input[placeholder*="name" i]',
      'input[placeholder*="Wallet" i]',
      "input:not([type=hidden]):not([disabled])",
    ];
    for (const sel of candidates) {
      const el = document.querySelector<HTMLInputElement>(sel);
      if (el && el.offsetParent !== null) {
        el.focus();
        el.select?.();
        return;
      }
    }
  }, []);

  useEffect(() => {
    let goTimer: ReturnType<typeof setTimeout> | null = null;

    const clearGo = () => {
      setGoArmed(false);
      if (goTimer) clearTimeout(goTimer);
      goTimer = null;
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Help
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        if (isTypingTarget(e.target)) return;
        e.preventDefault();
        setOpen((v) => !v);
        clearGo();
        return;
      }

      if (e.key === "Escape") {
        if (open) {
          e.preventDefault();
          setOpen(false);
          return;
        }
        clearGo();
        return;
      }

      if (isTypingTarget(e.target)) return;

      // Go-mode chord
      if (goArmed) {
        e.preventDefault();
        const href = GO_MAP[e.key.toLowerCase()];
        clearGo();
        if (href) router.push(href);
        return;
      }

      if (e.key === "g" || e.key === "G") {
        e.preventDefault();
        setGoArmed(true);
        goTimer = setTimeout(() => setGoArmed(false), 1500);
        return;
      }

      if (e.key === "/") {
        e.preventDefault();
        focusSearch();
        return;
      }

      if (e.key === "b" || e.key === "B") {
        e.preventDefault();
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
        } else {
          router.push("/home");
        }
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (goTimer) clearTimeout(goTimer);
    };
  }, [router, open, goArmed, focusSearch]);

  return (
    <>
      {/* Subtle go-mode indicator */}
      {goArmed && !open && (
        <div
          className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-[90] pointer-events-none rounded-full border border-violet-400/40 bg-violet-600/90 text-white text-xs font-medium px-3 py-1.5 shadow-lg"
          role="status"
        >
          Go… (h home · t token · m memes · ?)
        </div>
      )}

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Keyboard shortcuts"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg max-h-[min(80vh,640px)] overflow-y-auto rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-950 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-center justify-between gap-3 px-5 py-4 border-b border-black/5 dark:border-white/10 bg-white/95 dark:bg-zinc-950/95 backdrop-blur">
              <div className="flex items-center gap-2 font-semibold">
                <Keyboard className="w-4 h-4 text-violet-500" />
                Keyboard shortcuts
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-2 rounded-lg text-gray-500 hover:bg-black/5 dark:hover:bg-white/10"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-5">
              {HELP_ROWS.map((g) => (
                <div key={g.group}>
                  <p className="text-[11px] uppercase tracking-wider text-gray-400 mb-2">
                    {g.group}
                  </p>
                  <ul className="space-y-1.5">
                    {g.items.map((item) => (
                      <li
                        key={item.keys + item.label}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <span className="text-gray-700 dark:text-white/80">{item.label}</span>
                        <kbd className="shrink-0 rounded-md border border-black/10 dark:border-white/15 bg-black/[0.04] dark:bg-white/[0.06] px-2 py-0.5 font-mono text-[11px] text-gray-600 dark:text-white/60">
                          {item.keys}
                        </kbd>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <p className="text-[11px] text-gray-400 pt-1">
                Shortcuts are disabled while typing in inputs. Press{" "}
                <kbd className="font-mono">?</kbd> anytime on desktop.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
