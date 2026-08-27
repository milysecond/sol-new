"use client";

/**
 * Stripe fiat-to-crypto onramp.
 * Prefer Stripe-hosted checkout (crypto.link.com) — Apple Pay works there
 * without relying on sol.new embed domain quirks. Same-tab open by default
 * (Safari/iOS Apple Pay prefers top-level navigation).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/spinner";
import { friendlyError } from "@/lib/friendly-errors";
import { ExternalLink, Smartphone } from "lucide-react";

type StripeOnrampInstance = {
  createSession: (opts: {
    clientSecret: string;
    appearance?: { theme?: "light" | "dark" };
  }) => {
    mount: (el: string | HTMLElement) => unknown;
    addEventListener: (
      type: string,
      cb: (e: { payload?: { session?: { status?: string; id?: string } } }) => void,
    ) => unknown;
  };
};

declare global {
  interface Window {
    StripeOnramp?: ((publishableKey: string) => StripeOnrampInstance) & {
      Standalone?: (opts: Record<string, unknown>) => { getUrl: () => string };
    };
  }
}

let scriptsPromise: Promise<void> | null = null;

function loadStripeOnrampScripts(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.StripeOnramp) return Promise.resolve();
  if (scriptsPromise) return scriptsPromise;

  scriptsPromise = new Promise((resolve, reject) => {
    const ensure = (src: string) =>
      new Promise<void>((res, rej) => {
        const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
        if (existing) {
          if (existing.dataset.loaded === "1" || window.StripeOnramp) {
            res();
            return;
          }
          existing.addEventListener("load", () => res());
          existing.addEventListener("error", () => rej(new Error(`Failed to load ${src}`)));
          setTimeout(() => res(), 200);
          return;
        }
        const s = document.createElement("script");
        s.src = src;
        s.async = true;
        s.onload = () => {
          s.dataset.loaded = "1";
          res();
        };
        s.onerror = () => rej(new Error(`Failed to load ${src}`));
        document.head.appendChild(s);
      });

    Promise.all([
      ensure("https://js.stripe.com/dahlia/stripe.js"),
      ensure("https://crypto-js.stripe.com/crypto-onramp-outer.js"),
    ])
      .then(() => {
        let tries = 0;
        const tick = () => {
          if (window.StripeOnramp) resolve();
          else if (tries++ > 40) reject(new Error("StripeOnramp global missing"));
          else setTimeout(tick, 50);
        };
        tick();
      })
      .catch(reject);
  });

  return scriptsPromise;
}

function usePrefersDark(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      setDark(
        document.documentElement.classList.contains("dark") ||
          (!document.documentElement.classList.contains("light") && mq.matches),
      );
    };
    sync();
    mq.addEventListener("change", sync);
    const obs = new MutationObserver(sync);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => {
      mq.removeEventListener("change", sync);
      obs.disconnect();
    };
  }, []);
  return dark;
}

function isLikelyIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const webkit = /WebKit/.test(ua);
  const notChrome = !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return iOS && webkit && notChrome;
}

export type StripeOnrampPanelProps = {
  wallet: string;
  amountUsd?: number;
  asset?: "usdc" | "sol";
  onComplete?: (status: string) => void;
  /** Auto navigate to hosted checkout when ready (default true on iOS). */
  autoOpen?: boolean;
};

export function StripeOnrampPanel({
  wallet,
  amountUsd = 50,
  asset = "usdc",
  onComplete,
  autoOpen,
}: StripeOnrampPanelProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [mode, setMode] = useState<"idle" | "redirect" | "embed">("idle");
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);
  const dark = usePrefersDark();
  const sessionKey = `${wallet}:${asset}:${amountUsd}`;
  const lastKey = useRef<string>("");
  const didAutoOpen = useRef(false);

  const shouldAuto =
    autoOpen ?? (typeof window !== "undefined" ? isLikelyIosSafari() : false);

  const openCheckout = useCallback((url: string, sameTab: boolean) => {
    if (sameTab) {
      window.location.assign(url);
      return;
    }
    const w = window.open(url, "_blank", "noopener,noreferrer");
    if (!w) {
      // Popup blocked — fall back to same tab
      window.location.assign(url);
    }
  }, []);

  const start = useCallback(async () => {
    if (!wallet) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    setRedirectUrl(null);
    setMode("idle");
    try {
      const res = await fetch("/api/stripe/onramp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet,
          amountUsd,
          asset,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        clientSecret?: string;
        redirectUrl?: string | null;
        publishableKey?: string | null;
        sessionId?: string;
        unsupportable?: boolean;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Could not start Apple Pay / card checkout");
      }

      // Prefer hosted redirect — Apple Pay is fully supported on crypto.link.com
      if (data.redirectUrl) {
        setRedirectUrl(data.redirectUrl);
        setMode("redirect");
        lastKey.current = sessionKey;
        if (shouldAuto && !didAutoOpen.current) {
          didAutoOpen.current = true;
          // Same-tab on iOS Safari (required for reliable Apple Pay sheet)
          openCheckout(data.redirectUrl, true);
        }
        return;
      }

      if (!data.clientSecret || !data.publishableKey) {
        throw new Error("No checkout URL returned from Stripe");
      }

      await loadStripeOnrampScripts();
      if (!window.StripeOnramp) throw new Error("Stripe onramp SDK failed to load");

      const onramp = window.StripeOnramp(data.publishableKey);
      const el = mountRef.current;
      if (!el) throw new Error("Onramp mount missing");
      el.innerHTML = "";

      const session = onramp.createSession({
        clientSecret: data.clientSecret,
        appearance: { theme: dark ? "dark" : "light" },
      });

      session.addEventListener("onramp_session_updated", (e) => {
        const st = e.payload?.session?.status;
        if (st) {
          setStatus(st);
          if (st === "fulfillment_complete" || st === "rejected") {
            onComplete?.(st);
          }
        }
      });

      session.mount(el);
      setMode("embed");
      lastKey.current = sessionKey;
    } catch (e) {
      setError(friendlyError(e, "Could not open Stripe checkout."));
    } finally {
      setBusy(false);
    }
  }, [wallet, amountUsd, asset, dark, onComplete, sessionKey, shouldAuto, openCheckout]);

  useEffect(() => {
    if (!wallet) return;
    if (lastKey.current === sessionKey && mode !== "idle") return;
    didAutoOpen.current = false;
    void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey, wallet]);

  return (
    <div className="space-y-3">
      {busy && mode === "idle" && (
        <p className="text-xs text-gray-500 dark:text-white/40 flex items-center gap-2">
          <Spinner size={14} /> Opening secure checkout…
        </p>
      )}
      {error && (
        <div className="bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2 text-amber-800 dark:text-amber-200 text-xs space-y-2">
          <p>{error}</p>
          <p className="text-amber-700/80 dark:text-amber-200/70">
            Stripe Crypto Onramp is US/EU only (not Hawaii). In Australia use Transak above (Apple
            Pay via Transak). Or try from a supported region.
          </p>
          <button
            type="button"
            onClick={() => {
              didAutoOpen.current = false;
              void start();
            }}
            className="underline text-amber-700 dark:text-amber-300 hover:opacity-80 cursor-pointer"
          >
            Try again
          </button>
        </div>
      )}

      {mode === "redirect" && redirectUrl && (
        <div className="space-y-3">
          <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-white/40">
            <Smartphone className="w-4 h-4 shrink-0 mt-0.5 text-indigo-500" aria-hidden />
            <p>
              Stripe checkout ready. On iPhone, use <strong className="font-semibold">Continue in
              this tab</strong> so Apple Pay can open. Crypto lands in your locked Solana wallet.
            </p>
          </div>
          <button
            type="button"
            onClick={() => openCheckout(redirectUrl, true)}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg px-3.5 py-2.5 transition cursor-pointer"
          >
            Continue — Apple Pay / card
          </button>
          <button
            type="button"
            onClick={() => openCheckout(redirectUrl, false)}
            className="w-full flex items-center justify-center gap-2 text-xs text-gray-500 dark:text-white/45 hover:text-indigo-500 transition cursor-pointer py-2"
          >
            Open in new tab <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {status === "fulfillment_complete" && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">
          Payment complete. Crypto is on its way to your wallet (usually within minutes).
        </p>
      )}
      {status === "fulfillment_processing" && (
        <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80">
          Payment received. Delivering to your Solana wallet…
        </p>
      )}
      {status === "rejected" && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Verification was not approved. Try again later or use bank deposit / Transak below.
        </p>
      )}
      <div
        ref={mountRef}
        id="stripe-onramp-element"
        className={
          mode === "embed"
            ? "min-h-[320px] rounded-xl overflow-hidden bg-black/5 dark:bg-white/5"
            : "hidden"
        }
      />
      <p className="text-[11px] text-gray-400 dark:text-white/30">
        Powered by Stripe Link. Apple Pay, card, Google Pay, or bank. KYC by Stripe. US and EU
        (not Hawaii). Destination locked to your sol.new wallet.
      </p>
    </div>
  );
}
