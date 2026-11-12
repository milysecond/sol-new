"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Fingerprint, KeyRound, Loader2, ShieldHalf } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { PageTransition } from "@/components/page-transition";
import {
  KeyProgressBar,
  RING_FIELD,
  RING_PRIMARY,
  RingBetaBanner,
  RingPrivacyCard,
  VisibilityNote,
} from "@/components/ring-ui";
import { useWallet } from "@/lib/wallet-context";
import { getPasskeyKeypair } from "@/lib/passkey-wallet";
import { txPath } from "@/lib/explorer";
import { analytics } from "@/lib/analytics";
import { formatRingAmount } from "@/lib/ring/amount";
import { RING_ASSETS } from "@/lib/ring/constants";
import { explainRingError } from "@/lib/ring/errors";
import { parsePastedRingLink, parseRingLink } from "@/lib/ring/link";
import type { ClaimStep, KeyProgressInfo, PayLinkContents, RingSession } from "@/lib/ring/session";

const ring = () => import("@/lib/ring/session");

type View =
  | { kind: "loading" }
  | { kind: "no-secret" }
  | { kind: "invalid" }
  | { kind: "unconfigured" }
  | { kind: "error"; message: string }
  | { kind: "ready"; contents: PayLinkContents };

const STEP_LABEL: Record<ClaimStep, string> = {
  register: "Joining the Default Ring…",
  transfer: "Moving it into your private balance (proving on this device)…",
  sweep: "Sending you the leftover fee SOL…",
  merging: "Finishing up…",
};

export default function RingClaimPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col pb-20 sm:pb-0">
      <Navbar />
      <PageTransition>
        <RingClaim />
      </PageTransition>
    </div>
  );
}

function RingClaim() {
  const { publicKey, connect, walletKind, loading: walletLoading } = useWallet();
  const [view, setView] = useState<View>({ kind: "loading" });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ signatures: string[] } | null>(null);
  const [progress, setProgress] = useState<KeyProgressInfo | null>(null);
  const [paste, setPaste] = useState("");
  const linkRef = useRef<RingSession | null>(null);

  const load = useCallback(async () => {
    const parsed = parseRingLink({ pathname: window.location.pathname, hash: window.location.hash });
    if (!parsed.ok) {
      setView({ kind: parsed.reason === "no-secret" ? "no-secret" : "invalid" });
      return;
    }
    const m = await ring();
    if (!(await m.ringStatus()).configured) {
      setView({ kind: "unconfigured" });
      return;
    }
    try {
      m.destroyRingSession(linkRef.current);
      const s = await m.openRingSession(parsed.seed, { persist: false });
      parsed.seed.fill(0);
      linkRef.current = s;
      setView({ kind: "ready", contents: await m.inspectPayLink(s) });
    } catch (e) {
      setView({ kind: "error", message: explainRingError(e) });
    }
  }, []);

  useEffect(() => {
    void load();
    const onHash = () => void load();
    window.addEventListener("hashchange", onHash);
    void ring().then((m) => m.onRingKeyProgress(setProgress));
    return () => {
      window.removeEventListener("hashchange", onHash);
      void ring().then((m) => {
        m.onRingKeyProgress(null);
        m.destroyRingSession(linkRef.current);
      });
    };
  }, [load]);

  const claim = async () => {
    if (!publicKey || !linkRef.current) return;
    setError(null);
    setBusy("Approve Face ID…");
    let me: RingSession | null = null;
    try {
      const { keypair } = await getPasskeyKeypair(publicKey);
      const seed = keypair.secretKey.slice(0, 32);
      const m = await ring();
      me = await m.openRingSession(seed, { persist: true });
      seed.fill(0);
      const out = await m.claimPayLink(linkRef.current, me, (s) => setBusy(STEP_LABEL[s]));
      setDone({ signatures: out.signatures });
      analytics.shareClicked("ring-claim", "/ring/c");
      // Refresh the link view so a second open shows it as claimed.
      setView({ kind: "ready", contents: await m.inspectPayLink(linkRef.current) });
    } catch (e) {
      setError(explainRingError(e));
    } finally {
      void ring().then((m) => m.destroyRingSession(me));
      setBusy(null);
    }
  };

  return (
    <main className="mx-auto w-full max-w-lg px-4 sm:px-6 py-6 sm:py-8 space-y-4">
      <div className="text-center space-y-1">
        <ShieldHalf className="w-8 h-8 text-emerald-500 mx-auto" />
        <h1 className="text-2xl font-bold tracking-tight">{done ? "It's in your private balance" : "A private payment for you"}</h1>
        <p className="text-sm text-gray-500 dark:text-white/50">
          {done
            ? "The amount stayed hidden on-chain. Only you can see it, on your device."
            : "Claim it with Face ID. It goes straight into your own private balance."}
        </p>
      </div>

      {view.kind === "loading" && (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Decrypting the link on this device…
        </div>
      )}

      {view.kind === "no-secret" && (
        <div className="space-y-3">
          <p className="text-sm rounded-xl border border-black/10 dark:border-white/10 px-3 py-3">
            This link is missing its secret (the part after #). Some apps drop it. Paste the whole link here.
          </p>
          <input className={`${RING_FIELD} font-mono text-sm`} placeholder="https://sol.new/ring/c/…#…" value={paste} onChange={(e) => setPaste(e.target.value)} />
          <button
            type="button"
            className={RING_PRIMARY}
            onClick={() => {
              const p = parsePastedRingLink(paste);
              if (p.ok) {
                window.location.hash = new URL(paste.trim()).hash;
                if (window.location.pathname !== `/ring/c/${p.address}`) window.location.href = paste.trim();
              } else setError("That isn't a complete sol.new pay link.");
            }}
          >
            Open link
          </button>
        </div>
      )}

      {view.kind === "invalid" && (
        <p className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-3">
          This pay link doesn&apos;t look right. Ask the sender to copy it again.
        </p>
      )}
      {view.kind === "unconfigured" && (
        <p className="text-sm rounded-xl border border-black/10 dark:border-white/10 px-3 py-3">
          Ring isn&apos;t switched on for this deployment yet. The payment is safe; try again later.
        </p>
      )}
      {view.kind === "error" && (
        <p className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-3">{view.message}</p>
      )}

      {view.kind === "ready" && !done && (
        <>
          {view.contents.empty ? (
            <p className="text-sm rounded-xl border border-black/10 dark:border-white/10 px-3 py-3">
              This link has already been claimed, or it hasn&apos;t been funded yet.
            </p>
          ) : (
            <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-transparent p-5 text-center space-y-1">
              {(["SOL", "USDC"] as const)
                .filter((id) => view.contents.assets[id].amount > BigInt(0))
                .map((id) => (
                  <div key={id} className="text-3xl font-bold tabular-nums">
                    {formatRingAmount(view.contents.assets[id].amount, RING_ASSETS[id].decimals, 6)} {id}
                  </div>
                ))}
              <p className="text-xs text-gray-500 dark:text-white/40">Decrypted on this device. Not visible on-chain.</p>
            </div>
          )}

          {!view.contents.empty && (
            <>
              <ol className="text-xs text-gray-600 dark:text-white/55 space-y-1 list-decimal pl-5">
                <li>Face ID opens your sol.new wallet (or makes one).</li>
                <li>Your wallet joins the Default Ring. The link pays the setup fee.</li>
                <li>The payment moves into your private balance. The amount stays hidden.</li>
              </ol>
              <VisibilityNote kind="private">
                Your address and the link&apos;s address show on-chain. The asset and amount don&apos;t. A little leftover
                fee SOL arrives in your public balance.
              </VisibilityNote>

              {!publicKey ? (
                <button type="button" className={RING_PRIMARY} disabled={walletLoading} onClick={() => void connect()}>
                  <KeyRound className="w-4 h-4" /> {walletLoading ? "Opening Face ID…" : "Continue with Face ID"}
                </button>
              ) : walletKind !== "passkey" ? (
                <p className="text-sm rounded-xl border border-black/10 dark:border-white/10 px-3 py-3">
                  Switch to a sol.new Face ID wallet to claim. Private balances come from your passkey.
                </p>
              ) : (
                <button type="button" className={RING_PRIMARY} disabled={Boolean(busy)} onClick={() => void claim()}>
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Fingerprint className="w-4 h-4" />}
                  {busy ?? "Claim privately with Face ID"}
                </button>
              )}
              <KeyProgressBar progress={progress} />
            </>
          )}
        </>
      )}

      {done && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 flex items-center gap-3">
            <Check className="w-6 h-6 text-emerald-500 shrink-0" />
            <p className="text-sm">Claimed into your private balance.</p>
          </div>
          <Link href="/ring" className={RING_PRIMARY}>
            Open your private balance
          </Link>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
            {done.signatures.map((s, i) => (
              <Link key={s} href={txPath(s)} className="text-emerald-600 dark:text-emerald-400 hover:underline">
                Receipt {i + 1}
              </Link>
            ))}
          </div>
        </div>
      )}

      {error && <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-500 text-sm">{error}</div>}

      <RingBetaBanner />
      <RingPrivacyCard />
    </main>
  );
}
