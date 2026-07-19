"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type Status = { kind: "ok" | "err" | "info"; text: string } | null;

function UnsubscribeForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [product, setProduct] = useState(true);
  const [launches, setLaunches] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [alreadyUnsub, setAlreadyUnsub] = useState(false);

  useEffect(() => {
    const q = params.get("email") || params.get("e") || "";
    if (q) setEmail(q.trim().toLowerCase());
  }, [params]);

  useEffect(() => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/unsubscribe?email=${encodeURIComponent(email)}`
        );
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          unsubscribed?: boolean;
          product?: boolean;
          launches?: boolean;
        };
        if (typeof data.product === "boolean") setProduct(data.product);
        if (typeof data.launches === "boolean") setLaunches(data.launches);
        if (data.unsubscribed) {
          setAlreadyUnsub(true);
          setProduct(false);
          setLaunches(false);
          setStatus({
            kind: "info",
            text: "This address is already unsubscribed from sol.new mail.",
          });
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [email]);

  const submit = useCallback(
    async (mode: "preferences" | "all" | "resubscribe") => {
      const trimmed = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        setStatus({ kind: "err", text: "Enter a valid email address." });
        return;
      }
      setBusy(true);
      setStatus(null);
      try {
        const unsubscribed =
          mode === "all" ||
          (mode === "preferences" && !product && !launches);
        const wantSub = mode === "resubscribe" || !unsubscribed;

        const res = await fetch("/api/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: trimmed,
            unsubscribed: !wantSub,
            product: mode === "all" ? false : mode === "resubscribe" ? true : product,
            launches:
              mode === "all" ? false : mode === "resubscribe" ? true : launches,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
        };
        if (!res.ok || data.error) {
          throw new Error(data.error || "Request failed");
        }
        if (wantSub) {
          setAlreadyUnsub(false);
          if (mode === "resubscribe") {
            setProduct(true);
            setLaunches(true);
          }
          setStatus({
            kind: "ok",
            text:
              mode === "resubscribe"
                ? "You’re subscribed again. Welcome back."
                : "Preferences saved.",
          });
        } else if (mode === "all" || (!product && !launches)) {
          setAlreadyUnsub(true);
          setStatus({
            kind: "ok",
            text: "You’ve been unsubscribed from all sol.new emails.",
          });
        } else {
          setStatus({
            kind: "ok",
            text: "Preferences saved.",
          });
        }
      } catch (e) {
        setStatus({
          kind: "err",
          text: e instanceof Error ? e.message : "Something went wrong.",
        });
      } finally {
        setBusy(false);
      }
    },
    [email, product, launches]
  );

  return (
    <div className="w-full max-w-md rounded-2xl border border-purple-500/30 bg-black/90 dark:bg-black shadow-2xl shadow-purple-500/10 px-6 py-8 sm:px-8">
      <div className="flex flex-col items-center gap-3 mb-6">
        <Image
          src="/icon-192.png"
          alt="sol.new"
          width={56}
          height={56}
          className="rounded-2xl"
          priority
        />
        <div className="text-lg font-bold tracking-tight text-white">
          sol<span className="text-purple-400">.new</span>
        </div>
      </div>

      {alreadyUnsub ? (
        <span className="inline-block mb-3 rounded-full bg-purple-500/20 text-purple-300 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1">
          Unsubscribed
        </span>
      ) : null}

      <h1 className="text-xl font-bold text-white text-center mb-2 tracking-tight">
        Email preferences
      </h1>
      <p className="text-sm text-zinc-400 text-center mb-6 leading-relaxed">
        Choose what you hear about from sol.new — launches, product news, and
        builder updates.
      </p>

      {status ? (
        <p
          role="status"
          className={
            status.kind === "ok"
              ? "mb-4 rounded-xl bg-gradient-to-r from-purple-500 to-orange-400 text-white text-sm font-semibold text-center px-3 py-2.5"
              : status.kind === "err"
                ? "mb-4 rounded-xl border border-red-500/40 bg-red-950/50 text-red-200 text-sm text-center px-3 py-2.5"
                : "mb-4 rounded-xl border border-purple-500/25 bg-purple-500/10 text-purple-100 text-sm text-center px-3 py-2.5"
          }
        >
          {status.text}
        </p>
      ) : null}

      <label className="block text-[11px] font-semibold uppercase tracking-wider text-purple-400 mb-1.5">
        Email
      </label>
      <input
        type="email"
        autoComplete="email"
        placeholder="you@studio.dev"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          setAlreadyUnsub(false);
          setStatus(null);
        }}
        className="w-full mb-5 rounded-xl border border-white/10 bg-zinc-950 text-white text-[16px] sm:text-sm px-3.5 py-3 outline-none focus:border-purple-400/60 focus:ring-2 focus:ring-purple-500/20 placeholder:text-zinc-600"
      />

      <div className="mb-6 space-y-3 rounded-xl border border-white/10 bg-zinc-950/80 p-3.5">
        <label className="flex gap-3 items-start cursor-pointer">
          <input
            type="checkbox"
            checked={product}
            disabled={alreadyUnsub}
            onChange={(e) => setProduct(e.target.checked)}
            className="mt-1 accent-purple-500 w-4 h-4 shrink-0"
          />
          <span className="text-sm text-zinc-200">
            Product updates
            <span className="block text-xs text-zinc-500 mt-0.5">
              New tools, wallet features, platform news
            </span>
          </span>
        </label>
        <label className="flex gap-3 items-start cursor-pointer">
          <input
            type="checkbox"
            checked={launches}
            disabled={alreadyUnsub}
            onChange={(e) => setLaunches(e.target.checked)}
            className="mt-1 accent-orange-400 w-4 h-4 shrink-0"
          />
          <span className="text-sm text-zinc-200">
            Launch highlights
            <span className="block text-xs text-zinc-500 mt-0.5">
              Tokens, NFTs, and community drops
            </span>
          </span>
        </label>
      </div>

      <div className="flex flex-col gap-2.5">
        {alreadyUnsub ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => submit("resubscribe")}
            className="w-full rounded-full bg-gradient-to-r from-purple-500 to-purple-600 text-white text-sm font-semibold py-3 disabled:opacity-50 hover:brightness-110 transition"
          >
            {busy ? "Working…" : "Resubscribe"}
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => submit("preferences")}
              className="w-full rounded-full bg-gradient-to-r from-purple-500 to-purple-600 text-white text-sm font-semibold py-3 disabled:opacity-50 hover:brightness-110 transition"
            >
              {busy ? "Saving…" : "Save preferences"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => submit("all")}
              className="w-full rounded-full border border-red-400/30 text-red-300 text-sm font-medium py-2.5 disabled:opacity-50 hover:bg-red-500/10 transition"
            >
              Unsubscribe from all
            </button>
          </>
        )}
      </div>

      <p className="mt-6 text-center text-xs text-zinc-500">
        <Link href="/" className="text-purple-400 hover:underline">
          Back to sol.new
        </Link>
        {" · "}
        <Link href="/privacy" className="hover:underline">
          Privacy
        </Link>
      </p>
    </div>
  );
}

export default function UnsubscribePage() {
  return (
    <main className="min-h-[calc(100dvh-4rem)] flex items-center justify-center px-4 py-12 bg-white dark:bg-black">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,_rgba(168,85,247,0.12),_transparent_55%)]" />
      <div className="relative z-10 w-full flex justify-center">
        <Suspense
          fallback={
            <div className="text-sm text-zinc-500 py-20">Loading…</div>
          }
        >
          <UnsubscribeForm />
        </Suspense>
      </div>
    </main>
  );
}
