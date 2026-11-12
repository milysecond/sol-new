"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
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
import { formatRingAmount, parseRingAmount } from "@/lib/ring/amount";
import { RING_ASSETS, RING_LINK_FEE_LAMPORTS, RING_MAX_LOCAL_INPUTS, type RingAssetId } from "@/lib/ring/constants";
import { ringHistoryLabel, ringSendKind, ringSendLabel, type RingSendKind } from "@/lib/ring/copy";
import { explainRingError, RingNeedsWithdrawalError } from "@/lib/ring/errors";
import { ringLinkUrl } from "@/lib/ring/link";
import type { KeyProgressInfo, RingSession, RingSnapshot, StoredRingLink } from "@/lib/ring/session";

type Tab = "shield" | "send" | "link" | "unshield" | "merge" | "history";

const TABS: { id: Tab; label: string; icon: typeof Send }[] = [
  { id: "link", label: "Pay link", icon: Link2 },
  { id: "send", label: "Send", icon: Send },
  { id: "shield", label: "Shield", icon: ArrowDownToLine },
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

function fmt(id: RingAssetId, base: bigint, max = 6) {
  return `${formatRingAmount(base, RING_ASSETS[id].decimals, max)} ${RING_ASSETS[id].symbol}`;
}

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

function RingApp() {
  const { publicKey, connect, walletKind, loading: walletLoading } = useWallet();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [session, setSession] = useState<RingSession | null>(null);
  const [snap, setSnap] = useState<RingSnapshot | null>(null);
  const [tab, setTab] = useState<Tab>("link");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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

  return (
    <Shell>
      <BalanceCard snap={snap} busy={Boolean(busy)} onRefresh={() => void run("Syncing…", () => refresh())} onLock={lock} />

      {snap && !snap.registered && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2">
          <h2 className="font-semibold">Join the Default Ring</h2>
          <p className="text-sm text-gray-600 dark:text-white/55">
            Publishes your public Ring keys on-chain so people can pay you privately. Costs about 0.0012 SOL rent plus
            fees from your public balance.
          </p>
          <button
            type="button"
            className={RING_PRIMARY}
            disabled={Boolean(busy)}
            onClick={() =>
              void run("Registering on the Ring…", async () => {
                const m = await ring();
                const slot = await m.registerOnRing(session);
                await refresh(slot);
                return "You're on the Ring. People can now pay you privately.";
              })
            }
          >
            Set up private balance
          </button>
        </div>
      )}

      {snap?.registered && !snap.mergingEnabled && (
        <button
          type="button"
          className="w-full text-left rounded-xl border border-black/10 dark:border-white/10 px-3 py-2.5 text-sm"
          disabled={Boolean(busy)}
          onClick={() =>
            void run("Turning on merging…", async () => {
              const m = await ring();
              const slot = await m.enableMerging(session);
              await refresh(slot);
              return "Merging is on.";
            })
          }
        >
          <span className="font-medium">Turn on note merging</span>
          <span className="block text-xs text-gray-500 dark:text-white/40">
            Lets you combine small notes so you can always spend your whole balance.
          </span>
        </button>
      )}

      <div className="flex gap-1 overflow-x-auto no-scrollbar -mx-1 px-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setTab(id);
              setError(null);
              setNotice(null);
            }}
            className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition ${
              tab === id
                ? "bg-emerald-500 text-white"
                : "bg-black/5 dark:bg-white/5 text-gray-600 dark:text-white/60 hover:bg-black/10 dark:hover:bg-white/10"
            }`}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-black/10 dark:border-white/10 p-4 space-y-3">
        {tab === "shield" && <ShieldPanel session={session} snap={snap} busy={busy} run={run} refresh={refresh} />}
        {tab === "send" && <SendPanel session={session} snap={snap} busy={busy} run={run} refresh={refresh} />}
        {tab === "link" && <LinkPanel session={session} snap={snap} busy={busy} run={run} refresh={refresh} />}
        {tab === "unshield" && <UnshieldPanel session={session} snap={snap} busy={busy} run={run} refresh={refresh} />}
        {tab === "merge" && <MergePanel session={session} snap={snap} busy={busy} run={run} refresh={refresh} />}
        {tab === "history" && <HistoryPanel snap={snap} />}
        <KeyProgressBar progress={progress} />
        {busy && (
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

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-lg px-4 sm:px-6 py-6 sm:py-8 space-y-4">
      <div className="text-center space-y-1">
        <ShieldHalf className="w-8 h-8 text-emerald-500 mx-auto" />
        <h1 className="text-2xl font-bold tracking-tight">Ring</h1>
        <p className="text-gray-500 dark:text-white/50 text-sm">
          Private balances and pay links on Solana. Amounts stay hidden. Addresses stay public.
        </p>
      </div>
      <RingBetaBanner />
      <RingPrivacyCard />
      {children}
    </main>
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-500 text-sm">{children}</div>;
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
        <p className="text-[11px] text-gray-400 dark:text-white/35">
          Public: {fmt("SOL", snap.publicLamports, 4)} · {fmt("USDC", snap.publicUsdc, 2)}. Decrypted on this device only.
        </p>
      )}
    </div>
  );
}

type PanelProps = {
  session: RingSession;
  snap: RingSnapshot | null;
  busy: string | null;
  run: (label: string, fn: () => Promise<string | void>) => Promise<void>;
  refresh: (requireSlot?: bigint) => Promise<void>;
};

function AmountInput({
  asset,
  value,
  onChange,
  max,
  disabled,
}: {
  asset: RingAssetId;
  value: string;
  onChange: (v: string) => void;
  max: bigint | null;
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
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
        />
        {max !== null && max > BigInt(0) && (
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-emerald-600 dark:text-emerald-400"
            onClick={() => onChange(formatRingAmount(max, RING_ASSETS[asset].decimals).replace(/,/g, ""))}
          >
            Max
          </button>
        )}
      </div>
      {max !== null && (
        <p className="text-[11px] text-gray-400 dark:text-white/35">Available: {fmt(asset, max)}</p>
      )}
    </div>
  );
}

function useAmount(asset: RingAssetId, text: string) {
  return parseRingAmount(text, RING_ASSETS[asset].decimals);
}

function ShieldPanel({ session, snap, busy, run, refresh }: PanelProps) {
  const [asset, setAsset] = useState<RingAssetId>("SOL");
  const [text, setText] = useState("");
  const amount = useAmount(asset, text);
  const reserve = BigInt(5_000_000);
  const max = snap ? (asset === "SOL" ? (snap.publicLamports > reserve ? snap.publicLamports - reserve : BigInt(0)) : snap.publicUsdc) : null;
  return (
    <>
      <h2 className="font-semibold">Shield from your public balance</h2>
      <AssetToggle value={asset} onChange={setAsset} disabled={Boolean(busy)} />
      <AmountInput asset={asset} value={text} onChange={setText} max={max} disabled={Boolean(busy)} />
      <VisibilityNote kind="public">
        Shielding shows this amount on-chain, because it leaves your public balance. What you do with it afterwards stays
        private.
      </VisibilityNote>
      <button
        type="button"
        className={RING_PRIMARY}
        disabled={Boolean(busy) || !snap?.registered || !amount || amount <= BigInt(0)}
        onClick={() =>
          void run("Shielding…", async () => {
            const m = await ring();
            const r = await m.shield(session, asset, amount!);
            await refresh(r.slot);
            setText("");
            return `Shielded ${fmt(asset, amount!)}.`;
          })
        }
      >
        Shield {amount ? fmt(asset, amount) : ""}
      </button>
      {!snap?.registered && <p className="text-xs text-gray-500">Set up your private balance first.</p>}
    </>
  );
}

/** Registry lookup for a typed address: null (not an address), "checking", or the send kind. */
function useRecipientKind(value: string): RingSendKind | "checking" | null {
  const v = value.trim();
  const valid = isAddress(v);
  const [result, setResult] = useState<{ addr: string; kind: RingSendKind | null } | null>(null);
  useEffect(() => {
    if (!valid) return;
    let cancel = false;
    const t = setTimeout(() => {
      void ring()
        .then((m) => m.isRingRegistered(v))
        .then((reg) => {
          if (!cancel) setResult({ addr: v, kind: ringSendKind(reg) });
        })
        .catch(() => {
          if (!cancel) setResult({ addr: v, kind: null });
        });
    }, 350);
    return () => {
      cancel = true;
      clearTimeout(t);
    };
  }, [v, valid]);
  if (!valid) return null;
  if (!result || result.addr !== v) return "checking";
  return result.kind;
}

function RecipientNote({ state }: { state: RingSendKind | "checking" | null }) {
  if (state === null) return null;
  if (state === "checking") return <p className="text-xs text-gray-500">Checking the Ring registry…</p>;
  return state === "private-transfer" ? (
    <VisibilityNote kind="private">On the Ring. This is a private transfer: asset and amount hidden.</VisibilityNote>
  ) : (
    <VisibilityNote kind="public">
      Not on the Ring. Sending here is a <b>public withdrawal</b>: the destination, asset, and amount show on-chain. Send
      them a pay link instead to keep it private.
    </VisibilityNote>
  );
}

function SendPanel({ session, snap, busy, run, refresh }: PanelProps) {
  const [asset, setAsset] = useState<RingAssetId>("SOL");
  const [to, setTo] = useState("");
  const [text, setText] = useState("");
  const [forcedWithdrawal, setForcedWithdrawal] = useState<string | null>(null);
  const lookup = useRecipientKind(to);
  const kind: RingSendKind | null =
    forcedWithdrawal === to ? "public-withdrawal" : lookup === "checking" ? null : lookup;
  const amount = useAmount(asset, text);
  const max = snap ? snap.assets[asset].spendable : null;
  const ok = Boolean(amount && amount > BigInt(0) && kind);
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
      <RecipientNote state={forcedWithdrawal === to ? "public-withdrawal" : lookup} />
      <AmountInput asset={asset} value={text} onChange={setText} max={max} disabled={Boolean(busy)} />
      {kind === "public-withdrawal" ? (
        <button
          type="button"
          className={RING_WARN_BUTTON}
          disabled={Boolean(busy) || !ok}
          onClick={() =>
            void run("Confirm the public withdrawal with Face ID…", async () => {
              // Separate signature for anything that leaves the private balance.
              const seed = await passkeySeed(session.owner);
              seed.fill(0);
              const m = await ring();
              const r = await m.withdrawPublic(session, to, asset, amount!);
              await refresh(r.slot);
              setText("");
              return `${ringSendLabel("public-withdrawal")} of ${fmt(asset, amount!)} sent.`;
            })
          }
        >
          {ringSendLabel("public-withdrawal")} {amount ? fmt(asset, amount) : ""}
        </button>
      ) : (
        <button
          type="button"
          className={RING_PRIMARY}
          disabled={Boolean(busy) || !ok}
          onClick={() =>
            void run("Proving on this device…", async () => {
              const m = await ring();
              try {
                const r = await m.sendPrivate(session, to, asset, amount!);
                await refresh(r.slot);
              } catch (e) {
                if (e instanceof RingNeedsWithdrawalError) setForcedWithdrawal(to);
                throw e;
              }
              setText("");
              return `Sent ${fmt(asset, amount!)} privately.`;
            })
          }
        >
          {ringSendLabel("private-transfer")} {amount ? fmt(asset, amount) : ""}
        </button>
      )}
      <p className="text-[11px] text-gray-400 dark:text-white/35">
        Your address and theirs are visible on-chain. The asset and amount aren&apos;t.
      </p>
    </>
  );
}

function UnshieldPanel({ session, snap, busy, run, refresh }: PanelProps) {
  const [asset, setAsset] = useState<RingAssetId>("SOL");
  const [to, setTo] = useState(session.owner as string);
  const [text, setText] = useState("");
  const amount = useAmount(asset, text);
  const max = snap ? snap.assets[asset].spendable : null;
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
      <AmountInput asset={asset} value={text} onChange={setText} max={max} disabled={Boolean(busy)} />
      <VisibilityNote kind="public">
        This leaves your private balance. The destination, asset, and amount show on-chain. Your remaining private balance
        stays hidden.
      </VisibilityNote>
      <button
        type="button"
        className={RING_WARN_BUTTON}
        disabled={Boolean(busy) || !amount || amount <= BigInt(0) || !isAddress(to)}
        onClick={() =>
          void run("Confirm with Face ID…", async () => {
            const seed = await passkeySeed(session.owner);
            seed.fill(0);
            const m = await ring();
            const r = await m.withdrawPublic(session, to, asset, amount!);
            await refresh(r.slot);
            setText("");
            return `Unshielded ${fmt(asset, amount!)} to a public balance.`;
          })
        }
      >
        Unshield {amount ? fmt(asset, amount) : ""} publicly
      </button>
    </>
  );
}

function MergePanel({ session, snap, busy, run, refresh }: PanelProps) {
  return (
    <>
      <h2 className="font-semibold">Merge notes</h2>
      <p className="text-sm text-gray-600 dark:text-white/55">
        Each payment you receive is a separate note. One proof on this device spends up to {RING_MAX_LOCAL_INPUTS}. Merge
        small notes into one so your whole balance stays spendable. Amounts stay private.
      </p>
      {(["SOL", "USDC"] as const).map((id) => {
        const v = snap?.assets[id];
        return (
          <div key={id} className="flex items-center justify-between gap-3 rounded-xl border border-black/10 dark:border-white/10 px-3 py-2.5">
            <div className="text-sm">
              <div className="font-medium">{id}</div>
              <div className="text-xs text-gray-500 dark:text-white/40">{v ? `${v.notes} notes` : "—"}</div>
            </div>
            <button
              type="button"
              className="rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-white text-sm font-semibold px-3 py-2"
              disabled={Boolean(busy) || !snap?.mergingEnabled || !v || v.notes < 2}
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
      {!snap?.mergingEnabled && <p className="text-xs text-gray-500">Turn on note merging above first.</p>}
      <p className="text-[11px] text-gray-400 dark:text-white/35">
        The first merge downloads a large proving key to this device. It&apos;s cached after that.
      </p>
    </>
  );
}

function LinkPanel({ session, snap, busy, run, refresh }: PanelProps) {
  const [asset, setAsset] = useState<RingAssetId>("USDC");
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [made, setMade] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [links, setLinks] = useState<StoredRingLink[]>([]);
  const amount = useAmount(asset, text);
  const max = snap ? snap.assets[asset].spendable : null;

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
          <AmountInput asset={asset} value={text} onChange={setText} max={max} disabled={Boolean(busy)} />
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
          <button
            type="button"
            className={RING_PRIMARY}
            disabled={Boolean(busy) || !snap?.registered || !amount || amount <= BigInt(0)}
            onClick={() =>
              void run("Funding the link (proving on this device)…", async () => {
                const m = await ring();
                const r = await m.createPayLink(session, asset, amount!, note.trim() || undefined);
                await refresh(r.slot);
                setMade(r.url);
                setText("");
                setNote("");
              })
            }
          >
            <Link2 className="w-4 h-4" /> Create pay link {amount ? `for ${fmt(asset, amount)}` : ""}
          </button>
          {!snap?.registered && <p className="text-xs text-gray-500">Set up your private balance first.</p>}
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
