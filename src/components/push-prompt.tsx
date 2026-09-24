"use client";

import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import {
  getPushPermission,
  subscribePush,
  touchPushSubscription,
  type PushPermission,
} from "@/lib/push-client";

const DISMISS_KEY = "sol.new.push-dismissed";

/**
 * Toast under the header only.
 * Enable/disable control lives in the Navbar (header) — not the footer.
 */
export function PushPrompt({ wallet }: { wallet?: string }) {
  const [permission, setPermission] = useState<PushPermission>("default");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const p = getPushPermission();
    setPermission(p);
    if (p === "granted") {
      touchPushSubscription();
      return;
    }
    if (p === "unsupported" || p === "denied") return;
    try {
      if (localStorage.getItem(DISMISS_KEY)) return;
    } catch {
      /* ignore */
    }
    const t = setTimeout(() => setShow(true), 2500);
    return () => clearTimeout(t);
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setShow(false);
  };

  const enable = async () => {
    setLoading(true);
    const ok = await subscribePush(wallet);
    setLoading(false);
    setPermission(getPushPermission());
    if (ok) setShow(false);
  };

  if (!show || permission === "granted" || permission === "unsupported" || permission === "denied") {
    return null;
  }

  return (
    <div className="fixed left-3 right-3 top-[calc(3.75rem+env(safe-area-inset-top))] sm:left-auto sm:right-6 sm:top-[4.75rem] sm:max-w-sm z-[70]">
      <div className="rounded-2xl bg-white dark:bg-zinc-950 border border-purple-400/30 shadow-xl px-4 py-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center shrink-0">
          <Bell className="w-5 h-5 text-purple-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gray-900 dark:text-white">Stay in the loop</div>
          <div className="text-[11px] text-gray-500 dark:text-white/50 mt-0.5 leading-snug">
            Get notified when transactions confirm and launches go live.
          </div>
        </div>
        <button
          type="button"
          onClick={enable}
          disabled={loading}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-purple-500 hover:bg-purple-400 text-white text-xs font-semibold transition cursor-pointer shrink-0 disabled:opacity-60"
        >
          {loading ? "Enabling…" : "Enable"}
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="p-1 rounded-md text-gray-400 dark:text-white/40 hover:bg-black/5 dark:hover:bg-white/10 transition cursor-pointer shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
