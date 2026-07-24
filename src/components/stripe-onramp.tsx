"use client";

/**
 * Stripe fiat-to-crypto onramp.
 * Default: Stripe-hosted checkout at crypto.link.com (Apple Pay / card / bank).
 * Optional embed if STRIPE_PUBLISHABLE_KEY is set.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/spinner";
import { friendlyError } from "@/lib/friendly-errors";
import { ExternalLink } from "lucide-react";

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

export type StripeOnrampPanelProps = {
  wallet: string;
  amountUsd?: number;
  asset?: "usdc" | "sol";
  onComplete?: (status: string) => void;
};

export function StripeOnrampPanel({
  wallet,
  amountUsd = 50,
  asset = "usdc",
  onComplete,
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
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Could not start Apple Pay / card checkout");
      }

      // Prefer hosted redirect (reliable, Apple Pay works on Stripe domain)
      if (data.redirectUrl) {
        setRedirectUrl(data.redirectUrl);
        setMode("redirect");
        lastKey.current = sessionKey;
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
  }, [wallet, amountUsd, asset, dark, onComplete, sessionKey]);

  useEffect(() => {
    if (!wallet) return;
    if (lastKey.current === sessionKey && mode !== "idle") return;
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
            Stripe Crypto Onramp is geo-limited. Bank deposit (Bridge) works from more places.
          </p>
          <button
            type="button"
            onClick={() => void start()}
            className="underline text-amber-700 dark:text-amber-300 hover:opacity-80 cursor-pointer"
          >
            Try again
          </button>
        </div>
      )}

      {mode === "redirect" && redirectUrl && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500 dark:text-white/40">
            Secure Stripe checkout is ready. Pay with Apple Pay, card, Google Pay, or bank. Crypto
            goes to your wallet on Solana.
          </p>
          <a
            href={redirectUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-xl px-4 py-3 transition"
          >
            Open Apple Pay / card checkout <ExternalLink className="w-4 h-4" />
          </a>
          <button
            type="button"
            onClick={() => {
              window.location.href = redirectUrl;
            }}
            className="w-full text-xs text-gray-400 hover:text-purple-500 transition cursor-pointer"
          >
            Or continue in this tab
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
          Verification was not approved. Try again later or use bank deposit below.
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
        Powered by Stripe. Apple Pay, card, or bank. KYC handled by Stripe/Link. US and EU only
        (not Hawaii). Destination is locked to your sol.new wallet.
      </p>
    </div>
  );
}
