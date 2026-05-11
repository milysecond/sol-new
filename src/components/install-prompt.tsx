"use client";

import { useEffect, useState } from "react";
import { Download, Share, Plus, X } from "lucide-react";

const DISMISS_KEY = "sol.new.install-dismissed";
const DISMISS_DAYS = 7;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isIos(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  // iPad on iOS 13+ reports MacIntel — narrow with maxTouchPoints
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  // Safari iOS exposes navigator.standalone
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

export function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone()) return;
    if ((window as unknown as Record<string, unknown>).__SOLNEW_NATIVE__ || localStorage.getItem("solnew_native")) return;

    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (dismissedAt && Date.now() - dismissedAt < DISMISS_DAYS * 86400000) return;

    if (isIos()) {
      setIos(true);
      setShow(true);
      return;
    }

    const onBefore = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onBefore);

    const onInstalled = () => {
      setShow(false);
      setDeferred(null);
    };
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBefore);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setShow(false);
  };

  const handleInstall = async () => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === "accepted") {
        setShow(false);
      } else {
        dismiss();
      }
    } catch {
      dismiss();
    } finally {
      setDeferred(null);
    }
  };

  if (!show) return null;

  return (
    <div className="fixed left-3 right-3 bottom-24 sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-sm z-[80]">
      <div className="rounded-2xl bg-white dark:bg-black border border-purple-400/30 shadow-xl px-4 py-3 flex items-center gap-3">
        <img src="/icon-192.png" alt="" className="w-10 h-10 rounded-lg shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gray-900 dark:text-white">
            Install sol.new
          </div>
          {ios ? (
            <div className="text-[11px] text-gray-500 dark:text-white/50 mt-0.5 leading-snug">
              Tap{" "}
              <Share className="inline w-3 h-3 -translate-y-px" /> Share, then{" "}
              <Plus className="inline w-3 h-3 -translate-y-px" /> Add to Home Screen
            </div>
          ) : (
            <div className="text-[11px] text-gray-500 dark:text-white/50 mt-0.5">
              Quick access right from your home screen.
            </div>
          )}
        </div>
        {!ios && (
          <button
            type="button"
            onClick={handleInstall}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-purple-500 hover:bg-purple-400 text-white text-xs font-semibold transition cursor-pointer shrink-0"
          >
            <Download className="w-3.5 h-3.5" /> Install
          </button>
        )}
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
