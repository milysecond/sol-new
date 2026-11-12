"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  CircleAlert,
  Circle,
  CircleCheck,
  CircleX,
  Copy,
  Fingerprint,
  History,
  KeyRound,
  Link2,
  Loader2,
  Lock,
  Merge,
  RefreshCw,
  Send,
  ShieldHalf,
} from "lucide-react";
import { PublicKey } from "@solana/web3.js";
import { Navbar } from "@/components/navbar";
import { PageTransition } from "@/components/page-transition";
import {
  AssetToggle,
  KeyProgressBar,
  RING_FIELD,
  RING_PRIMARY,
  RING_WARN_BUTTON,
  RingBetaBanner,
  RingPrivacyCard,
  VisibilityNote,
} from "@/components/ring-ui";
import { useWallet } from "@/lib/wallet-context";
import { getPasskeyKeypair } from "@/lib/passkey-wallet";
import { txPath } from "@/lib/explorer";
import { analytics } from "@/lib/analytics";
import { formatRingAmount } from "@/lib/ring/amount";
import { RING_ASSETS, RING_LINK_FEE_LAMPORTS, RING_MAX_LOCAL_INPUTS, type RingAssetId } from "@/lib/ring/constants";
import { ringHistoryLabel, ringSendKind, ringSendLabel } from "@/lib/ring/copy";
import {
  fmtRing,
  ringFlowMax,
  ringFlowPlan,
  ringJoinPlan,
  ringMergePlan,
  ringSuggestedAction,
  type RingFlowPlan,
  type RingRecipientState,
} from "@/lib/ring/flow";
import { explainRingError, RingNeedsWithdrawalError } from "@/lib/ring/errors";
import { ringLinkUrl } from "@/lib/ring/link";
import type { KeyProgressInfo, RingSession, RingSnapshot, StoredRingLink } from "@/lib/ring/session";

type Tab = "shield" | "send" | "link" | "unshield" | "merge" | "history";

/** In the order you'd actually use them: shield in, spend, take out, tidy up. */
const TABS: { id: Tab; label: string; icon: typeof Send }[] = [
  { id: "shield", label: "Shield", icon: ArrowDownToLine },
  { id: "send", label: "Send", icon: Send },
  { id: "link", label: "Pay link", icon: Link2 },
  { id: "unshield", label: "Unshield", icon: ArrowUpFromLine },
  { id: "merge", label: "Merge", icon: Merge },
  { id: "history", label: "History", icon: History },
];

const ring = () => import("@/lib/ring/session");

function isAddress(s: string): boolean {
  const v = s.trim();
  if (v.length < 32 || v.length > 44) return false;
  try {
    new PublicKey(v);
    return true;
  } catch {
    return false;
  }
}

const fmt = fmtRing;

/** Fresh Face ID for the passkey wallet → its 32-byte Ed25519 seed. */
async function passkeySeed(publicKey: string): Promise<Uint8Array> {
  const { keypair } = await getPasskeyKeypair(publicKey);
  return keypair.secretKey.slice(0, 32);
}

export default function RingPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col pb-20 sm:pb-0">
      <Navbar />
      <PageTransition>
        <RingApp />
      </PageTransition>
    </div>
  );
}

type StepState = "pending" | "active" | "done" | "failed";
type FlowStep = { label: string; fn: () => Promise<void>; doneNote?: string };
type StepView = { label: string; state: StepState };

type Ctx = {
  session: RingSession;
  snap: RingSnapshot | null;
  busy: string | null;
  run: (label: string, fn: () => Promise<string | void>) => Promise<void>;
  runSteps: (steps: FlowStep[], done: string) => Promise<void>;
  refresh: (requireSlot?: bigint) => Promise<void>;
  join: () => void;
  enableMerging: () => void;
  goTo: (t: Tab) => void;
};

function RingApp() {
  const { publicKey, connect, walletKind, loading: walletLoading } = useWallet();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [session, setSession] = useState<RingSession | null>(null);
  const [snap, setSnap] = useState<RingSnapshot | null>(null);
  const [tab, setTab] = useState<Tab | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [steps, setSteps] = useState<StepView[] | null>(null);
  const [progress, setProgress] = useState<KeyProgressInfo | null>(null);
  const sessionRef = useRef<RingSession | null>(null);

  useEffect(() => {
    void ring().then((m) => m.ringStatus().then((s) => setConfigured(s.configured)));
  }, []);

  useEffect(() => {
    let clear: ReturnType<typeof setTimeout> | undefined;
    void ring().then((m) =>
      m.onRingKeyProgress((p) => {
        setProgress(p);
        if (clear) clearTimeout(clear);
        if (p.stage === "decode") clear = setTimeout(() => setProgress(null), 4000);
      }),
    );
    return () => {
      void ring().then((m) => m.onRingKeyProgress(null));
    };
  }, []);

  const lock = useCallback(() => {
    void ring().then((m) => m.destroyRingSession(sessionRef.current));
    sessionRef.current = null;
    setSession(null);
    setSnap(null);
    setTab(null);
  }, []);

  // Wallet switched → lock.
  useEffect(() => {
    if (sessionRef.current && sessionRef.current.owner !== publicKey) lock();
  }, [publicKey, lock]);
  useEffect(() => () => lock(), [lock]);

  const refresh = useCallback(async (requireSlot?: bigint) => {
    const s = sessionRef.current;
    if (!s) return;
    const m = await ring();
    setSnap(await m.ringSnapshot(s, { sync: true, ...(requireSlot !== undefined ? { requireSlot } : {}) }));
  }, []);

  const run = useCallback(
    async (label: string, fn: () => Promise<string | void>) => {
      setBusy(label);
      setError(null);
      setNotice(null);
      setSteps(null);
      try {
        const msg = await fn();
        if (msg) setNotice(msg);
      } catch (e) {
        setError(explainRingError(e));
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  /** Runs dependent steps in order with visible progress. A later failure says what already finished. */
  const runSteps = useCallback(async (list: FlowStep[], done: string) => {
    setError(null);
    setNotice(null);
    const view: StepView[] = list.map((s) => ({ label: s.label, state: "pending" }));
    const show = () => setSteps(view.map((v) => ({ ...v })));
    const finished: string[] = [];
    let i = 0;
    try {
      for (; i < list.length; i++) {
        view[i]!.state = "active";
        show();
        setBusy(`Step ${i + 1} of ${list.length}: ${list[i]!.label}…`);
        await list[i]!.fn();
        view[i]!.state = "done";
        show();
        if (list[i]!.doneNote) finished.push(list[i]!.doneNote!);
      }
      setSteps(null);
      setNotice(done);
    } catch (e) {
      if (view[i]) view[i]!.state = "failed";
      show();
      const why = explainRingError(e);
      setError(finished.length ? `${finished.join(" ")} Step ${i + 1} didn't go through: ${why}` : why);
    } finally {
      setBusy(null);
    }
  }, []);

  // Open on the step that fits where the user is: Shield until there's a private balance.
  const suggested = ringSuggestedAction(snap);
  const activeTab: Tab = tab ?? suggested;

  const unlock = () =>
    run("Approve Face ID…", async () => {
      if (!publicKey) return;
      const seed = await passkeySeed(publicKey);
      const m = await ring();
      setBusy("Opening your private balance…");
      try {
        const s = await m.openRingSession(seed, { persist: true });
        if (s.owner !== publicKey) throw new Error("That passkey doesn't match the connected wallet.");
        sessionRef.current = s;
        setSession(s);
      } finally {
        seed.fill(0);
      }
      setBusy("Decrypting on this device…");
      await refresh();
    });

  if (configured === false) {
    return (
      <Shell>
        <p className="text-sm rounded-xl border border-black/10 dark:border-white/10 px-3 py-3">
          Ring isn&apos;t switched on for this deployment yet. Check back soon.
        </p>
      </Shell>
    );
  }

  if (!publicKey) {
    return (
      <Shell>
        <button type="button" className={RING_PRIMARY} disabled={walletLoading} onClick={() => void connect()}>
          <KeyRound className="w-4 h-4" /> {walletLoading ? "Opening Face ID…" : "Connect Face ID wallet"}
        </button>
        <p className="text-center text-[11px] text-gray-400 dark:text-white/30">
          New here? A gift link is the easiest start. <Link href="/gift" className="underline">Send a gift</Link>.
        </p>
      </Shell>
    );
  }

  if (walletKind !== "passkey") {
    return (
      <Shell>
        <p className="text-sm rounded-xl border border-black/10 dark:border-white/10 px-3 py-3">
          Ring works with your sol.new Face ID wallet, because your private keys come from the same passkey. Switch to a
          Face ID wallet to continue.
        </p>
      </Shell>
    );
  }

  if (!session) {
    return (
      <Shell>
        <button type="button" className={RING_PRIMARY} disabled={Boolean(busy)} onClick={() => void unlock()}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Fingerprint className="w-4 h-4" />}
          {busy ?? "Unlock private balance"}
        </button>
        <KeyProgressBar progress={progress} />
        {error && <ErrorBox>{error}</ErrorBox>}
        <p className="text-center text-[11px] text-gray-400 dark:text-white/30">
          Face ID derives your private keys. Nothing new to back up.
        </p>
      </Shell>
    );
  }

  const goTo = (t: Tab) => {
    setTab(t);
    setError(null);
    setNotice(null);
    setSteps(null);
  };

  const join = () =>
    void run("Joining the Default Ring…", async () => {
      const m = await ring();
      const slot = await m.registerOnRing(session);
      await refresh(slot);
      return "You're on the Ring. Next, shield some SOL or USDC from your public balance.";
    });

  const enableMerging = () =>
    void run("Turning on merging…", async () => {
      const m = await ring();
      const slot = await m.enableMerging(session);
      await refresh(slot);
      return "Merging is on.";
    });

  const ctx: Ctx = { session, snap, busy, run, runSteps, refresh, join, enableMerging, goTo };
  const joinPlan = ringJoinPlan(snap);

  return (
    <Shell
      aside={
        <>
          <BalanceCard snap={snap} busy={Boolean(busy)} onRefresh={() => void run("Syncing…", () => refresh())} onLock={lock} />
          {snap && !snap.registered && (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2">
              <h2 className="font-semibold">Step 1 · Join the Default Ring</h2>
              <p className="text-sm text-gray-600 dark:text-white/55">
                Publishes your public Ring keys on-chain so you can hold a private balance and people can pay you
                privately. Costs about 0.0012 SOL rent plus fees from your public balance.
              </p>
              {joinPlan.status === "blocked" && <Reason tone="warn">{joinPlan.reason}</Reason>}
              <button type="button" className={RING_PRIMARY} disabled={Boolean(busy) || joinPlan.status !== "ready"} onClick={join}>
                Set up private balance
              </button>
            </div>
          )}
        </>
      }
    >
      <div role="tablist" aria-label="Ring actions" className="grid grid-cols-3 sm:grid-cols-6 gap-1 rounded-2xl bg-black/5 dark:bg-white/[0.04] p-1">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          const hint = !active && id === suggested && snap !== null;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => goTo(id)}
              className={`relative inline-flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-xs font-medium transition ${
                active
                  ? "bg-emerald-500 text-white shadow-sm"
                  : "text-gray-600 dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/10"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="whitespace-nowrap">{label}</span>
              {hint && <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400" aria-label="Suggested next step" />}
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.01] dark:bg-white/[0.02] p-4 sm:p-5 space-y-3">
        {activeTab === "shield" && <ShieldPanel ctx={ctx} />}
        {activeTab === "send" && <SendPanel ctx={ctx} />}
        {activeTab === "link" && <LinkPanel ctx={ctx} />}
        {activeTab === "unshield" && <UnshieldPanel ctx={ctx} />}
        {activeTab === "merge" && <MergePanel ctx={ctx} />}
        {activeTab === "history" && <HistoryPanel snap={snap} />}
        {steps && <StepList steps={steps} />}
        <KeyProgressBar progress={progress} />
        {busy && !steps && (
          <div className="flex items-center justify-center gap-2 py-1 text-sm text-gray-500 dark:text-white/50">
            <Loader2 className="w-4 h-4 animate-spin" /> {busy}
          </div>
        )}
        {error && <ErrorBox>{error}</ErrorBox>}
        {notice && (
          <p className="text-sm text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 rounded-xl px-3 py-2">{notice}</p>
        )}
      </div>
    </Shell>
  );
}

function Intro({ wide }: { wide: boolean }) {
  return (
    <div className={`text-center space-y-1 ${wide ? "lg:text-left" : ""}`}>
      <ShieldHalf className={`w-8 h-8 text-emerald-500 mx-auto ${wide ? "lg:mx-0" : ""}`} />
      <h1 className="text-2xl font-bold tracking-tight">Ring</h1>
      <p className="text-gray-500 dark:text-white/50 text-sm">
        Private balances and pay links on Solana. Amounts stay hidden. Addresses stay public.
      </p>
    </div>
  );
}

/** Narrow column while locked; two columns on desktop once the balance is open. */
function Shell({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  if (!aside) {
    return (
      <main className="mx-auto w-full max-w-lg px-4 sm:px-6 py-6 sm:py-8 space-y-4">
        <Intro wide={false} />
        <RingBetaBanner />
        <RingPrivacyCard />
        {children}
      </main>
    );
  }
  return (
    <main className="mx-auto w-full max-w-lg lg:max-w-5xl px-4 sm:px-6 py-6 sm:py-10">
      <div className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-8 lg:items-start">
        <div className="space-y-4 lg:sticky lg:top-24">
          <Intro wide />
          <RingBetaBanner />
          {aside}
          <RingPrivacyCard />
        </div>
        <div className="space-y-4">{children}</div>
      </div>
    </main>
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-500 text-sm">{children}</div>;
}

function Reason({ tone, children }: { tone: "warn" | "info"; children: React.ReactNode }) {
  return (
    <p
      role="status"
      className={`flex items-start gap-2 text-sm leading-snug rounded-xl px-3 py-2.5 ${
        tone === "warn"
          ? "text-amber-800 dark:text-amber-200 bg-amber-500/10 border border-amber-500/20"
          : "text-emerald-800 dark:text-emerald-200 bg-emerald-500/10 border border-emerald-500/20"
      }`}
    >
      <CircleAlert className="w-4 h-4 mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function StepList({ steps }: { steps: StepView[] }) {
  return (
    <ol className="space-y-1.5 rounded-xl border border-black/10 dark:border-white/10 px-3 py-2.5">
      {steps.map((s, i) => (
        <li key={s.label} className="flex items-center gap-2 text-sm">
          {s.state === "done" ? (
            <CircleCheck className="w-4 h-4 text-emerald-500" />
          ) : s.state === "active" ? (
            <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
          ) : s.state === "failed" ? (
            <CircleX className="w-4 h-4 text-red-500" />
          ) : (
            <Circle className="w-4 h-4 text-gray-300 dark:text-white/20" />
          )}
          <span className={s.state === "pending" ? "text-gray-400 dark:text-white/35" : ""}>
            Step {i + 1}: {s.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

function BalanceCard({
  snap,
  busy,
  onRefresh,
  onLock,
}: {
  snap: RingSnapshot | null;
  busy: boolean;
  onRefresh: () => void;
  onLock: () => void;
}) {
  return (
    <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-gradient-to-br from-emerald-500/10 to-transparent p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-white/40">Private balance</span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={onRefresh} disabled={busy} className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10" aria-label="Sync">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button type="button" onClick={onLock} className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10" aria-label="Lock">
            <Lock className="w-4 h-4" />
          </button>
        </div>
      </div>
      {snap ? (
        <div className="grid grid-cols-2 gap-3">
          {(["SOL", "USDC"] as const).map((id) => (
            <div key={id}>
              <div className="text-xl font-bold tabular-nums">{formatRingAmount(snap.assets[id].amount, RING_ASSETS[id].decimals, 4)}</div>
              <div className="text-xs text-gray-500 dark:text-white/40">
                {id} · {snap.assets[id].notes} {snap.assets[id].notes === 1 ? "note" : "notes"}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-gray-500">Decrypting…</div>
      )}
      {snap && (
        <div className="border-t border-black/5 dark:border-white/10 pt-2.5 space-y-1">
          <div className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-white/35">Public balance</div>
          <div className="grid grid-cols-2 gap-3 text-sm tabular-nums text-gray-700 dark:text-white/70">
            <span>{fmt("SOL", snap.publicLamports, 4)}</span>
            <span>{fmt("USDC", snap.publicUsdc, 2)}</span>
          </div>
          <p className="text-[11px] text-gray-400 dark:text-white/35">Decrypted on this device only.</p>
        </div>
      )}
    </div>
  );
}

function AmountInput({
  asset,
  value,
  onChange,
  max,
  hint,
  disabled,
}: {
  asset: RingAssetId;
  value: string;
  onChange: (v: string) => void;
  max: bigint | null;
  hint?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="relative">
        <input
          className={`${RING_FIELD} pr-16 font-mono`}
          inputMode="decimal"
          placeholder={`Amount in ${RING_ASSETS[asset].symbol}`}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.,]/g, ""))}
        />
        {max !== null && max > BigInt(0) && (
          <button
            type="button"
            disabled={disabled}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-emerald-600 dark:text-emerald-400"
            onClick={() => onChange(formatRingAmount(max, RING_ASSETS[asset].decimals).replace(/,/g, ""))}
          >
            Max
          </button>
        )}
      </div>
      {hint && <p className="text-[11px] text-gray-400 dark:text-white/35">{hint}</p>}
    </div>
  );
}

const amountText = (asset: RingAssetId, v: bigint) => formatRingAmount(v, RING_ASSETS[asset].decimals).replace(/,/g, "");

/**
 * The one primary button for a panel. It never greys out without saying why:
 * the reason sits right above it, and where there's a fix (join, merge, retry,
 * a smaller amount, shield first) the button or a link below does it.
 */
function PlanButton({
  ctx,
  plan,
  asset,
  label,
  shieldFirstLabel,
  onReady,
  onShieldFirst,
  onUseAmount,
  onRetry,
  warn,
  icon,
}: {
  ctx: Ctx;
  plan: RingFlowPlan;
  asset: RingAssetId;
  label: string;
  shieldFirstLabel?: (shield: bigint, amount: bigint) => string;
  onReady: (amount: bigint) => void;
  onShieldFirst?: (shield: bigint, amount: bigint) => void;
  onUseAmount?: (amount: bigint) => void;
  onRetry?: () => void;
  warn?: boolean;
  icon?: React.ReactNode;
}) {
  const cls = warn ? RING_WARN_BUTTON : RING_PRIMARY;
  const busy = Boolean(ctx.busy);
  let button: React.ReactNode;

  if (plan.status === "loading") {
    button = (
      <button type="button" className={cls} disabled>
        <Loader2 className="w-4 h-4 animate-spin" /> {plan.reason}
      </button>
    );
  } else if (plan.status === "ready") {
    button = (
      <button type="button" className={cls} disabled={busy} onClick={() => onReady(plan.amount)}>
        {icon} {label} {fmt(asset, plan.amount)}
      </button>
    );
  } else if (plan.status === "shield-first") {
    button = (
      <button type="button" className={RING_PRIMARY} disabled={busy || !onShieldFirst} onClick={() => onShieldFirst?.(plan.shieldAmount, plan.amount)}>
        <ArrowDownToLine className="w-4 h-4" />
        {shieldFirstLabel ? shieldFirstLabel(plan.shieldAmount, plan.amount) : `Shield ${fmt(asset, plan.shieldAmount)} first`}
      </button>
    );
  } else if (plan.fix === "join") {
    const jp = ringJoinPlan(ctx.snap);
    button = (
      <>
        {jp.status === "blocked" && <Reason tone="warn">{jp.reason}</Reason>}
        <button type="button" className={RING_PRIMARY} disabled={busy || jp.status !== "ready"} onClick={ctx.join}>
          <Fingerprint className="w-4 h-4" /> Join the Default Ring
        </button>
      </>
    );
  } else if (plan.fix === "enable-merging") {
    button = (
      <button type="button" className={RING_PRIMARY} disabled={busy} onClick={ctx.enableMerging}>
        <Merge className="w-4 h-4" /> Turn on note merging
      </button>
    );
  } else if (plan.fix === "merge") {
    button = (
      <button type="button" className={RING_PRIMARY} onClick={() => ctx.goTo("merge")}>
        <Merge className="w-4 h-4" /> Go to Merge
      </button>
    );
  } else if (plan.fix === "retry-lookup") {
    button = (
      <button type="button" className={RING_PRIMARY} disabled={busy} onClick={onRetry}>
        <RefreshCw className="w-4 h-4" /> Check again
      </button>
    );
  } else {
    button = (
      <button type="button" className={cls} disabled>
        {icon} {label}
      </button>
    );
  }

  return (
    <div className="space-y-2">
      {plan.status === "blocked" && <Reason tone="warn">{plan.reason}</Reason>}
      {plan.status === "shield-first" && (
        <>
          <Reason tone="info">{plan.reason}</Reason>
          <ol className="text-xs text-gray-500 dark:text-white/45 list-decimal pl-5 space-y-0.5">
            <li>Shield {fmt(asset, plan.shieldAmount)} from public (this amount shows on-chain).</li>
            <li>
              {label} {fmt(asset, plan.amount)} from your private balance.
            </li>
          </ol>
        </>
      )}
      {button}
      {plan.status === "blocked" && plan.suggestAmount !== undefined && onUseAmount && (
        <button
          type="button"
          className="w-full text-sm font-medium text-emerald-600 dark:text-emerald-400 py-1"
          disabled={busy}
          onClick={() => onUseAmount(plan.suggestAmount!)}
        >
          Use {fmt(asset, plan.suggestAmount)} instead
        </button>
      )}
    </div>
  );
}

function ShieldPanel({ ctx }: { ctx: Ctx }) {
  const { session, snap, busy, run, refresh } = ctx;
  const [asset, setAsset] = useState<RingAssetId>("SOL");
  const [text, setText] = useState("");
  const plan = ringFlowPlan({ action: "shield", asset, amountText: text, balances: snap });
  const max = ringFlowMax({ action: "shield", asset, balances: snap });
  const zero = snap && snap.assets.SOL.amount === BigInt(0) && snap.assets.USDC.amount === BigInt(0);
  return (
    <>
      <h2 className="font-semibold">Shield from your public balance</h2>
      {zero && snap?.registered && (
        <p className="text-sm text-gray-600 dark:text-white/55">
          Your private balance is empty. Shield some SOL or USDC first, then you can send it privately or make a pay link.
        </p>
      )}
      <AssetToggle value={asset} onChange={setAsset} disabled={Boolean(busy)} />
      <AmountInput
        asset={asset}
        value={text}
        onChange={setText}
        max={max}
        disabled={Boolean(busy)}
        hint={
          snap &&
          (asset === "SOL"
            ? `You can shield up to ${fmt("SOL", max ?? BigInt(0))}. 0.005 SOL stays public for fees.`
            : `Public: ${fmt("USDC", snap.publicUsdc)}.`)
        }
      />
      <VisibilityNote kind="public">
        Shielding shows this amount on-chain, because it leaves your public balance. What you do with it afterwards stays
        private.
      </VisibilityNote>
      <PlanButton
        ctx={ctx}
        plan={plan}
        asset={asset}
        label="Shield"
        onUseAmount={(v) => setText(amountText(asset, v))}
        onReady={(amount) =>
          void run("Shielding…", async () => {
            const m = await ring();
            const r = await m.shield(session, asset, amount);
            await refresh(r.slot);
            setText("");
            return `Shielded ${fmt(asset, amount)}. You can send it privately or make a pay link now.`;
          })
        }
      />
    </>
  );
}

/** Address → recipient state for the flow, with a retry for a failed registry lookup. */
function useRecipientState(value: string, forcedWithdrawal: string | null): { state: RingRecipientState; retry: () => void } {
  const v = value.trim();
  const valid = isAddress(v);
  const [nonce, setNonce] = useState(0);
  const [result, setResult] = useState<{ addr: string; nonce: number; kind: RingRecipientState } | null>(null);
  useEffect(() => {
    if (!valid) return;
    let cancel = false;
    const t = setTimeout(() => {
      void ring()
        .then((m) => m.isRingRegistered(v))
        .then((reg) => {
          if (!cancel) setResult({ addr: v, nonce, kind: ringSendKind(reg) });
        })
        .catch(() => {
          if (!cancel) setResult({ addr: v, nonce, kind: "lookup-failed" });
        });
    }, 350);
    return () => {
      cancel = true;
      clearTimeout(t);
    };
  }, [v, valid, nonce]);
  const retry = () => setNonce((n) => n + 1);
  if (!v) return { state: "empty", retry };
  if (!valid) return { state: "invalid", retry };
  if (forcedWithdrawal === v) return { state: "public-withdrawal", retry };
  if (!result || result.addr !== v || result.nonce !== nonce) return { state: "checking", retry };
  return { state: result.kind, retry };
}

function RecipientNote({ state }: { state: RingRecipientState }) {
  if (state === "private-transfer") {
    return <VisibilityNote kind="private">On the Ring. This is a private transfer: asset and amount hidden.</VisibilityNote>;
  }
  if (state === "public-withdrawal") {
    return (
      <VisibilityNote kind="public">
        Not on the Ring. Sending here is a <b>public withdrawal</b>: the destination, asset, and amount show on-chain. Send
        them a pay link instead to keep it private.
      </VisibilityNote>
    );
  }
  return null;
}

function privateHint(snap: RingSnapshot | null, asset: RingAssetId, max: bigint | null) {
  if (!snap) return null;
  const p = snap.assets[asset];
  const base = `Private: ${fmt(asset, p.amount)}`;
  if (max !== null && max > p.amount) return `${base} · up to ${fmt(asset, max)} if you shield more from public`;
  if (p.spendable < p.amount) return `${base} · ${fmt(asset, p.spendable)} spendable in one go`;
  return base;
}

function SendPanel({ ctx }: { ctx: Ctx }) {
  const { session, snap, busy, run, runSteps, refresh } = ctx;
  const [asset, setAsset] = useState<RingAssetId>("SOL");
  const [to, setTo] = useState("");
  const [text, setText] = useState("");
  const [forcedWithdrawal, setForcedWithdrawal] = useState<string | null>(null);
  const { state: recipient, retry } = useRecipientState(to, forcedWithdrawal);
  const plan = ringFlowPlan({ action: "send", asset, amountText: text, recipient, balances: snap });
  const max = ringFlowMax({ action: "send", asset, recipient, balances: snap });
  const withdrawal = recipient === "public-withdrawal";

  const sendPrivately = async (amount: bigint) => {
    const m = await ring();
    try {
      const r = await m.sendPrivate(session, to, asset, amount);
      await refresh(r.slot);
    } catch (e) {
      if (e instanceof RingNeedsWithdrawalError) setForcedWithdrawal(to);
      throw e;
    }
  };

  return (
    <>
      <h2 className="font-semibold">Send privately</h2>
      <AssetToggle value={asset} onChange={setAsset} disabled={Boolean(busy)} />
      <input
        className={`${RING_FIELD} font-mono text-sm`}
        placeholder="Recipient Solana address"
        value={to}
        disabled={Boolean(busy)}
        onChange={(e) => setTo(e.target.value.trim())}
      />
      <RecipientNote state={recipient} />
      <AmountInput asset={asset} value={text} onChange={setText} max={max} disabled={Boolean(busy)} hint={privateHint(snap, asset, max)} />
      <PlanButton
        ctx={ctx}
        plan={plan}
        asset={asset}
        warn={withdrawal}
        label={ringSendLabel(withdrawal ? "public-withdrawal" : "private-transfer")}
        shieldFirstLabel={(s, a) => `Shield ${fmt(asset, s)} and send ${fmt(asset, a)}`}
        onRetry={retry}
        onUseAmount={(v) => setText(amountText(asset, v))}
        onShieldFirst={(shieldAmount, amount) =>
          void runSteps(
            [
              {
                label: `Shield ${fmt(asset, shieldAmount)} from public`,
                doneNote: `Shielded ${fmt(asset, shieldAmount)}. It's in your private balance now.`,
                fn: async () => {
                  const m = await ring();
                  const r = await m.shield(session, asset, shieldAmount);
                  await refresh(r.slot);
                },
              },
              {
                label: `Send ${fmt(asset, amount)} privately (proving on this device)`,
                fn: async () => {
                  await sendPrivately(amount);
                  setText("");
                },
              },
            ],
            `Shielded ${fmt(asset, shieldAmount)} and sent ${fmt(asset, amount)} privately.`,
          )
        }
        onReady={(amount) =>
          withdrawal
            ? void run("Confirm the public withdrawal with Face ID…", async () => {
                // Separate signature for anything that leaves the private balance.
                const seed = await passkeySeed(session.owner);
                seed.fill(0);
                const m = await ring();
                const r = await m.withdrawPublic(session, to, asset, amount);
                await refresh(r.slot);
                setText("");
                return `${ringSendLabel("public-withdrawal")} of ${fmt(asset, amount)} sent.`;
              })
            : void run("Proving on this device…", async () => {
                await sendPrivately(amount);
                setText("");
                return `Sent ${fmt(asset, amount)} privately.`;
              })
        }
      />
      <p className="text-[11px] text-gray-400 dark:text-white/35">
        Your address and theirs are visible on-chain. The asset and amount aren&apos;t.
      </p>
    </>
  );
}

function UnshieldPanel({ ctx }: { ctx: Ctx }) {
  const { session, snap, busy, run, refresh } = ctx;
  const [asset, setAsset] = useState<RingAssetId>("SOL");
  const [to, setTo] = useState(session.owner as string);
  const [text, setText] = useState("");
  const recipient: RingRecipientState = !to.trim() ? "empty" : isAddress(to) ? "public-withdrawal" : "invalid";
  const plan = ringFlowPlan({ action: "unshield", asset, amountText: text, recipient, balances: snap });
  const max = ringFlowMax({ action: "unshield", asset, recipient, balances: snap });
  return (
    <>
      <h2 className="font-semibold">Unshield to a public balance</h2>
      <AssetToggle value={asset} onChange={setAsset} disabled={Boolean(busy)} />
      <input
        className={`${RING_FIELD} font-mono text-sm`}
        placeholder="Destination address"
        value={to}
        disabled={Boolean(busy)}
        onChange={(e) => setTo(e.target.value.trim())}
      />
      <AmountInput asset={asset} value={text} onChange={setText} max={max} disabled={Boolean(busy)} hint={privateHint(snap, asset, max)} />
      <VisibilityNote kind="public">
        This leaves your private balance. The destination, asset, and amount show on-chain. Your remaining private balance
        stays hidden.
      </VisibilityNote>
      <PlanButton
        ctx={ctx}
        plan={plan}
        asset={asset}
        warn
        label="Unshield publicly"
        onUseAmount={(v) => setText(amountText(asset, v))}
        onReady={(amount) =>
          void run("Confirm with Face ID…", async () => {
            const seed = await passkeySeed(session.owner);
            seed.fill(0);
            const m = await ring();
            const r = await m.withdrawPublic(session, to, asset, amount);
            await refresh(r.slot);
            setText("");
            return `Unshielded ${fmt(asset, amount)} to a public balance.`;
          })
        }
      />
    </>
  );
}

function MergePanel({ ctx }: { ctx: Ctx }) {
  const { session, snap, busy, run, refresh } = ctx;
  const needsJoin = snap && !snap.registered;
  const needsEnable = snap?.registered && !snap.mergingEnabled;
  return (
    <>
      <h2 className="font-semibold">Merge notes</h2>
      <p className="text-sm text-gray-600 dark:text-white/55">
        Each payment you receive is a separate note. One proof on this device spends up to {RING_MAX_LOCAL_INPUTS}. Merge
        small notes into one so your whole balance stays spendable. Amounts stay private.
      </p>
      {needsJoin && (
        <PlanButton ctx={ctx} plan={ringMergePlan(snap, "SOL")} asset="SOL" label="Merge" onReady={() => {}} />
      )}
      {needsEnable && (
        <div className="space-y-2">
          <Reason tone="info">Turn on note merging first. It&apos;s a one-time setup.</Reason>
          <button type="button" className={RING_PRIMARY} disabled={Boolean(busy)} onClick={ctx.enableMerging}>
            <Merge className="w-4 h-4" /> Turn on note merging
          </button>
        </div>
      )}
      {(["SOL", "USDC"] as const).map((id) => {
        const v = snap?.assets[id];
        const plan = ringMergePlan(snap, id);
        const why = plan.status === "blocked" && !plan.fix ? plan.reason : plan.status === "loading" ? plan.reason : null;
        return (
          <div key={id} className="flex items-center justify-between gap-3 rounded-xl border border-black/10 dark:border-white/10 px-3 py-2.5">
            <div className="text-sm min-w-0">
              <div className="font-medium">{id}</div>
              <div className="text-xs text-gray-500 dark:text-white/40">
                {v ? `${v.notes} ${v.notes === 1 ? "note" : "notes"}` : "—"}
                {why ? ` · ${why}` : ""}
              </div>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:bg-black/10 dark:disabled:bg-white/10 disabled:text-gray-400 dark:disabled:text-white/30 text-white text-sm font-semibold px-3 py-2"
              disabled={Boolean(busy) || plan.status !== "ready"}
              onClick={() =>
                void run("Merging on this device…", async () => {
                  const m = await ring();
                  const r = await m.mergeNotes(session, id);
                  await refresh(r.slot);
                  return `Merged ${id} notes.`;
                })
              }
            >
              Merge
            </button>
          </div>
        );
      })}
      <p className="text-[11px] text-gray-400 dark:text-white/35">
        The first merge downloads a large proving key to this device. It&apos;s cached after that.
      </p>
    </>
  );
}

function LinkPanel({ ctx }: { ctx: Ctx }) {
  const { session, snap, busy, run, runSteps, refresh } = ctx;
  const [asset, setAsset] = useState<RingAssetId>("USDC");
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [made, setMade] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [links, setLinks] = useState<StoredRingLink[]>([]);
  const plan = ringFlowPlan({ action: "link", asset, amountText: text, balances: snap });
  const max = ringFlowMax({ action: "link", asset, balances: snap });

  useEffect(() => {
    void ring().then((m) => setLinks(m.loadRingLinks()));
  }, [made]);

  const copy = (url: string) =>
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});

  const fund = async (amount: bigint) => {
    const m = await ring();
    const r = await m.createPayLink(session, asset, amount, note.trim() || undefined);
    await refresh(r.slot);
    setMade(r.url);
    setText("");
    setNote("");
  };

  return (
    <>
      <h2 className="font-semibold">Private pay link</h2>
      <p className="text-sm text-gray-600 dark:text-white/55">
        Fund a link from your private balance. Whoever opens it claims with Face ID straight into their own private
        balance. The amount never shows on-chain.
      </p>
      {made ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2">
            <div className="text-xs uppercase tracking-wide text-gray-500">Your link</div>
            <code className="block text-xs break-all font-mono">{made}</code>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={RING_PRIMARY} onClick={() => void copy(made)}>
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} {copied ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              className="rounded-xl border border-black/10 dark:border-white/10 py-3 font-medium"
              onClick={() => {
                const share = { title: "A private payment for you", text: "Claim it with Face ID on sol.new", url: made };
                if (navigator.share) navigator.share(share).catch(() => void copy(made));
                else void copy(made);
                analytics.shareClicked("ring-link", "/ring/c");
              }}
            >
              Share
            </button>
          </div>
          <p className="text-[11px] text-gray-500 dark:text-white/40">
            Anyone with this link can claim it. The secret part after # never reaches our servers. Send it somewhere
            private.
          </p>
          <button type="button" className="w-full text-sm text-gray-500" onClick={() => setMade(null)}>
            Make another
          </button>
        </div>
      ) : (
        <>
          <AssetToggle value={asset} onChange={setAsset} disabled={Boolean(busy)} />
          <AmountInput asset={asset} value={text} onChange={setText} max={max} disabled={Boolean(busy)} hint={privateHint(snap, asset, max)} />
          <input
            className={RING_FIELD}
            placeholder="Note for yourself (stays on this device)"
            value={note}
            maxLength={60}
            disabled={Boolean(busy)}
            onChange={(e) => setNote(e.target.value)}
          />
          <VisibilityNote kind="private">
            Private transfer into the link: asset and amount hidden. The link also carries{" "}
            {formatRingAmount(RING_LINK_FEE_LAMPORTS, 9)} public SOL so the claimer pays no fees. That part is visible.
          </VisibilityNote>
          <PlanButton
            ctx={ctx}
            plan={plan}
            asset={asset}
            label="Create pay link for"
            icon={<Link2 className="w-4 h-4" />}
            shieldFirstLabel={(s, a) => `Shield ${fmt(asset, s)} and create a ${fmt(asset, a)} link`}
            onUseAmount={(v) => setText(amountText(asset, v))}
            onShieldFirst={(shieldAmount, amount) =>
              void runSteps(
                [
                  {
                    label: `Shield ${fmt(asset, shieldAmount)} from public`,
                    doneNote: `Shielded ${fmt(asset, shieldAmount)}. It's in your private balance now.`,
                    fn: async () => {
                      const m = await ring();
                      const r = await m.shield(session, asset, shieldAmount);
                      await refresh(r.slot);
                    },
                  },
                  { label: `Fund the ${fmt(asset, amount)} link (proving on this device)`, fn: () => fund(amount) },
                ],
                "Your pay link is ready.",
              )
            }
            onReady={(amount) => void run("Funding the link (proving on this device)…", () => fund(amount))}
          />
        </>
      )}

      {links.length > 0 && (
        <div className="space-y-2 pt-2">
          <div className="text-xs uppercase tracking-wide text-gray-400 dark:text-white/35">Links on this device</div>
          <ul className="space-y-1.5">
            {links.slice(0, 10).map((l) => {
              const url = ringLinkUrl(l.address, l.secret, typeof window !== "undefined" ? window.location.origin : undefined);
              return (
                <li key={l.address} className="flex items-center justify-between gap-2 rounded-xl border border-black/10 dark:border-white/10 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium">{fmt(l.asset, BigInt(l.amount))}</div>
                    <div className="text-xs text-gray-500 dark:text-white/40 truncate">
                      {l.note ? `${l.note} · ` : ""}
                      {new Date(l.createdAt).toLocaleDateString()} · {l.status === "funding" ? "not fully funded" : "open the link to check"}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10" onClick={() => void copy(url)} aria-label="Copy link">
                      <Copy className="w-4 h-4" />
                    </button>
                    <a href={url} className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 px-2">
                      Open / reclaim
                    </a>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}

function HistoryPanel({ snap }: { snap: RingSnapshot | null }) {
  if (!snap) return <p className="text-sm text-gray-500">Decrypting…</p>;
  if (snap.history.length === 0) return <p className="text-sm text-gray-500">No private activity yet.</p>;
  return (
    <ul className="divide-y divide-black/5 dark:divide-white/5">
      {snap.history.slice(0, 50).map((h) => {
        const label = ringHistoryLabel(h.kind, h.direction);
        const sign = h.direction === "inbound" ? "+" : h.direction === "outbound" ? "−" : "";
        return (
          <li key={h.key} className="py-2.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">{label.title}</div>
              <div className="text-[11px] text-gray-400 dark:text-white/35">
                {label.visibility === "amount public" ? "Amount public on-chain" : "Amount private"} ·{" "}
                <Link href={txPath(h.signature)} className="underline">
                  receipt
                </Link>
              </div>
            </div>
            <div className="text-sm font-mono tabular-nums shrink-0">
              {h.asset === "OTHER" ? "—" : `${sign}${fmt(h.asset, h.amount, 4)}`}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
