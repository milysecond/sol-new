"use client";

import { useCallback, useState } from "react";
import { Mail, Check, Loader2, Fingerprint } from "lucide-react";
import { useWallet } from "@/lib/wallet-context";

type Props = {
  /** Compact card for homepage sidebar; full for standalone */
  variant?: "card" | "inline";
  source?: string;
  className?: string;
};

export function MailingListSignup({
  variant = "card",
  source = "home",
  className = "",
}: Props) {
  const { publicKey } = useWallet();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [magicSent, setMagicSent] = useState(false);
  // Honeypot
  const [website, setWebsite] = useState("");

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        setError("Enter a valid email address.");
        return;
      }
      setBusy(true);
      setError(null);
      setMessage(null);
      try {
        let credentialId: string | undefined;
        try {
          credentialId =
            localStorage.getItem("sol.new.credentialId") || undefined;
        } catch {
          /* ignore */
        }

        const res = await fetch("/api/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: trimmed,
            source,
            website: website || undefined,
            wallet: publicKey || undefined,
            credentialId,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          message?: string;
          alreadySubscribed?: boolean;
          magicLinkSent?: boolean;
        };
        if (!res.ok || data.error) {
          throw new Error(data.error || "Request failed");
        }
        setDone(true);
        setMagicSent(Boolean(data.magicLinkSent));
        setMessage(
          data.message ||
            (data.alreadySubscribed
              ? "You’re already on the list."
              : "You’re in. Check your inbox.")
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        setBusy(false);
      }
    },
    [email, source, website, publicKey]
  );

  if (variant === "inline") {
    return (
      <form
        onSubmit={submit}
        className={`flex flex-col sm:flex-row gap-2 w-full max-w-md ${className}`}
      >
        <label className="sr-only" htmlFor="mailing-email-inline">
          Email
        </label>
        <input
          id="mailing-email-inline"
          type="email"
          autoComplete="email"
          required
          placeholder="you@studio.dev"
          value={email}
          disabled={busy || done}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
          }}
          className="flex-1 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.04] text-gray-900 dark:text-white text-sm px-3.5 py-2.5 outline-none focus:border-purple-400/60 focus:ring-2 focus:ring-purple-500/20 placeholder:text-gray-400 dark:placeholder:text-white/30 disabled:opacity-60"
        />
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          className="absolute opacity-0 pointer-events-none h-0 w-0"
          aria-hidden
        />
        <button
          type="submit"
          disabled={busy || done}
          className="rounded-full bg-gradient-to-r from-purple-500 to-purple-600 text-white text-sm font-semibold px-5 py-2.5 disabled:opacity-50 hover:brightness-110 transition shrink-0"
        >
          {busy ? (
            <Loader2 className="w-4 h-4 animate-spin mx-auto" />
          ) : done ? (
            "Joined"
          ) : (
            "Subscribe"
          )}
        </button>
        {error ? (
          <p className="text-xs text-red-400 sm:col-span-2 w-full">{error}</p>
        ) : null}
        {message ? (
          <p className="text-xs text-purple-400 sm:col-span-2 w-full">{message}</p>
        ) : null}
      </form>
    );
  }

  return (
    <div
      className={`rounded-2xl border border-black/10 dark:border-white/10 overflow-hidden ${className}`}
    >
      <div className="flex items-center gap-2 px-4 py-2.5 bg-purple-500/5 border-b border-black/[0.06] dark:border-white/[0.06]">
        <Mail className="w-4 h-4 text-purple-400 shrink-0" />
        <span className="text-sm font-semibold flex-1 text-gray-900 dark:text-white">
          Mailing list
        </span>
      </div>

      <div className="px-4 py-4">
        {done ? (
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/15 flex items-center justify-center shrink-0">
              {magicSent ? (
                <Fingerprint className="w-4 h-4 text-purple-400" />
              ) : (
                <Check className="w-4 h-4 text-purple-400" />
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                {magicSent ? "Magic link sent" : "You’re on the list"}
              </p>
              <p className="text-xs text-gray-500 dark:text-white/45 mt-1 leading-relaxed">
                {message || "Product news and launch highlights, no spam."}
              </p>
            </div>
          </div>
        ) : (
          <>
            <p className="text-xs text-gray-500 dark:text-white/45 mb-3 leading-relaxed">
              {publicKey
                ? "Join the list and get a magic link that opens this passkey wallet."
                : "Product news and launch highlights. Unsubscribe anytime."}
            </p>
            {publicKey ? (
              <p className="mb-3 text-[11px] font-mono text-purple-400/90 truncate">
                {publicKey.slice(0, 4)}…{publicKey.slice(-4)}
              </p>
            ) : null}
            <form onSubmit={submit} className="space-y-2.5">
              <label className="sr-only" htmlFor="mailing-email">
                Email
              </label>
              <input
                id="mailing-email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@studio.dev"
                value={email}
                disabled={busy}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.04] text-gray-900 dark:text-white text-[16px] sm:text-sm px-3.5 py-2.5 outline-none focus:border-purple-400/60 focus:ring-2 focus:ring-purple-500/20 placeholder:text-gray-400 dark:placeholder:text-white/30"
              />
              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="absolute opacity-0 pointer-events-none h-0 w-0"
                aria-hidden
              />
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-full bg-gradient-to-r from-purple-500 to-purple-600 text-white text-sm font-semibold py-2.5 disabled:opacity-50 hover:brightness-110 transition flex items-center justify-center gap-2"
              >
                {busy ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Joining…
                  </>
                ) : publicKey ? (
                  <>
                    <Fingerprint className="w-4 h-4" />
                    Join + magic link
                  </>
                ) : (
                  "Join the list"
                )}
              </button>
              {error ? (
                <p role="alert" className="text-xs text-red-400 text-center">
                  {error}
                </p>
              ) : null}
            </form>
          </>
        )}
      </div>
    </div>
  );
}
