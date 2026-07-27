"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, X } from "lucide-react";
import { getPushPermission, subscribePush, unsubscribePush, touchPushSubscription, type PushPermission } from "@/lib/push-client";

const DISMISS_KEY = "sol.new.push-dismissed";

export function PushPrompt({ wallet }: { wallet?: string }) {
  const [permission, setPermission] = useState<PushPermission>("default");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const p = getPushPermission();
    setPermission(p);
    if (p === "granted") {
      // Heartbeat — tells the re-engagement cron we were active today
      touchPushSubscription();
      return;
    }
    if (p === "unsupported" || p === "denied") return;
    if (localStorage.getItem(DISMISS_KEY)) return;
    // Show after a short delay so it doesn't compete with page load
    const t = setTimeout(() => setShow(true), 3000);
    return () => clearTimeout(t);
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setShow(false);
  };

  const enable = async () => {
    setLoading(true);
    const ok = await subscribePush(wallet);
    setLoading(false);
    setPermission(getPushPermission());
    if (ok) setShow(false);
  };

  const disable = async () => {
    setLoading(true);
    await unsubscribePush();
    setLoading(false);
    setPermission("default");
  };

  // Inline settings toggle (used in settings/wallet page)
  if (!show && permission !== "unsupported") {
    return (
      <button
        type="button"
        onClick={permission === "granted" ? disable : enable}
        disabled={loading || permission === "denied"}
        className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition disabled:opacity-40 cursor-pointer"
        title={permission === "denied" ? "Blocked in browser settings" : undefined}
      >
        {permission === "granted" ? (
          <><BellOff className="w-4 h-4" /> Notifications on</>
        ) : (
          <><Bell className="w-4 h-4" /> Enable notifications</>
        )}
      </button>
    );
  }

  if (!show) return null;

  return (
    <div className="fixed left-3 right-3 bottom-24 sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-sm z-[80]">
      <div className="rounded-2xl bg-white dark:bg-black border border-purple-400/30 shadow-xl px-4 py-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center shrink-0">
          <Bell className="w-5 h-5 text-purple-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gray-900 dark:text-white">Stay in the loop</div>
          <div className="text-[11px] text-gray-500 dark:text-white/50 mt-0.5 leading-snug">
            Get notified when your transactions confirm and new launches go live.
          </div>
        </div>
        <button
          type="button"
          onClick={enable}
          disabled={loading}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-purple-500 hover:bg-purple-400 text-white text-xs font-semibold transition cursor-pointer shrink-0 disabled:opacity-60"
        >
          {loading ? "…" : "Enable"}
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
