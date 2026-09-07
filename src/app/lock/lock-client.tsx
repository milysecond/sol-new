"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
  createSyncNativeInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Lock } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { ConnectGate } from "@/components/connect-gate";
import { PageTransition } from "@/components/page-transition";
import { AnimatedIcon } from "@/components/animated-icon";
import { Spinner } from "@/components/spinner";
import { TokenMetaRow } from "@/components/token-meta";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import { getPasskeyKeypair } from "@/lib/passkey-wallet";
import { friendlyError } from "@/lib/friendly-errors";
import { addressPath } from "@/lib/explorer";
import {
  fetchWalletTokens,
  formatAmountInput,
  formatTokenUi,
  type WalletToken,
} from "@/lib/wallet-tokens";
import {
  buildClaimIx,
  buildCreateLockIxs,
  claimAtaIx,
  type ParsedLock,
} from "@/lib/jup-lock";

const DURATIONS = [
  { id: "day", label: "Day", ms: 24 * 60 * 60 * 1000 },
  { id: "week", label: "Week", ms: 7 * 24 * 60 * 60 * 1000 },
  { id: "month", label: "Month", ms: 30 * 24 * 60 * 60 * 1000 },
  { id: "year", label: "Year", ms: 365 * 24 * 60 * 60 * 1000 },
] as const;
type DurationId = (typeof DURATIONS)[number]["id"];

const SOL_FEE_RESERVE = 0.02;

function fmtAmt(raw: string, decimals: number): string {
  try {
    const n = BigInt(raw);
    const d = BigInt(10 ** decimals);
    const whole = n / d;
    const frac = (n % d).toString().padStart(decimals, "0").replace(/0+$/, "");
    return frac ? `${whole}.${frac}` : whole.toString();
  } catch {
    return raw;
  }
}

function toRaw(ui: string, decimals: number): bigint {
  const t = ui.trim();
  if (!t) return BigInt(0);
  const [w, f = ""] = t.split(".");
  const frac = (f + "0".repeat(decimals)).slice(0, decimals);
  const s = `${w || "0"}${frac}`.replace(/^0+(?=\d)/, "") || "0";
  return BigInt(s);
}

export default function LockPage() {
  const { publicKey, balance } = useWallet();
  const { rpc, network } = useNetwork();
  const [title, setTitle] = useState("Lock");
  const [holdings, setHoldings] = useState<WalletToken[]>([]);
  const [selected, setSelected] = useState<WalletToken | null>(null);
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [duration, setDuration] = useState<DurationId>("month");
  const [busy, setBusy] = useState<"idle" | "lock" | "claim" | "list">("idle");
  const [error, setError] = useState<string | null>(null);
  const [sig, setSig] = useState<string | null>(null);
  const [locks, setLocks] = useState<ParsedLock[]>([]);

  const listed = useMemo(
    () => holdings.filter((t) => t.uiAmount > 0),
    [holdings],
  );
  const maxUi = useMemo(() => {
    if (!selected) return 0;
    if (selected.isNativeSol) return Math.max(0, selected.uiAmount - SOL_FEE_RESERVE);
    return selected.uiAmount;
  }, [selected]);
  const unlockAt = useMemo(() => {
    const ms = DURATIONS.find((d) => d.id === duration)?.ms ?? DURATIONS[2].ms;
    return new Date(Date.now() + ms);
  }, [duration]);

  useEffect(() => {
    if (publicKey && !recipient) setRecipient(publicKey);
  }, [publicKey, recipient]);

  const loadHoldings = useCallback(async () => {
    if (!publicKey) {
      setHoldings([]);
      setSelected(null);
      return;
    }
    try {
      const conn = new Connection(rpc, "confirmed");
      const list = await fetchWalletTokens(conn, publicKey, { solBalance: balance });
      const solBal = typeof balance === "number" ? balance : null;
      const merged = list.map((t) => {
        if (t.isNativeSol && solBal != null && Number.isFinite(solBal)) {
          return { ...t, uiAmount: solBal, amount: String(Math.round(solBal * 1e9)) };
        }
        return t;
      });
      setHoldings(merged.filter((t) => t.uiAmount > 0));
    } catch {
      setHoldings([]);
    }
  }, [publicKey, rpc, balance]);

  const load = useCallback(async () => {
    if (!publicKey) return;
    setBusy("list");
    try {
      const r = await fetch(
        `/api/lock?wallet=${encodeURIComponent(publicKey)}&network=${network}`,
        { cache: "no-store" },
      );
      const j = (await r.json()) as { ok?: boolean; error?: string; locks?: ParsedLock[] };
      if (!r.ok || !j.ok) throw new Error(j.error || "Could not load locks");
      setLocks(j.locks || []);
    } catch (e) {
      setError(friendlyError(e, "Could not load locks."));
    } finally {
      setBusy("idle");
    }
  }, [publicKey, network]);

  useEffect(() => {
    void loadHoldings();
  }, [loadHoldings]);
  useEffect(() => {
    void load();
  }, [load]);

  const send = async (tx: Transaction, extra: Keypair[], keypair: Keypair) => {
    const connection = new Connection(rpc, "confirmed");
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    tx.feePayer = keypair.publicKey;
    tx.recentBlockhash = blockhash;
    if (extra.length) tx.partialSign(...extra);
    tx.partialSign(keypair);
    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });
    await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
    return signature;
  };

  const onCreate = async () => {
    if (!publicKey || !selected || !amount || !recipient) return;
    setError(null);
    setSig(null);
    setBusy("lock");
    try {
      const mintPk = new PublicKey(selected.mint);
      const recipientPk = new PublicKey(recipient.trim());
      const raw = toRaw(amount, selected.decimals);
      if (raw <= BigInt(0)) throw new Error("Amount must be greater than 0");
      const maxRaw = toRaw(formatAmountInput(maxUi, selected.decimals) || "0", selected.decimals);
      if (raw > maxRaw) throw new Error("Amount is more than you hold");
      const cliffUnix = Math.floor(unlockAt.getTime() / 1000);
      const token2022 = selected.programId === TOKEN_2022_PROGRAM_ID.toBase58();

      const { keypair } = await getPasskeyKeypair(publicKey);
      const base = Keypair.generate();
      const ixs = buildCreateLockIxs({
        payer: keypair.publicKey,
        base,
        mint: mintPk,
        token2022,
        recipient: recipientPk,
        amount: raw,
        cliffUnix,
        title,
      });

      if (mintPk.equals(NATIVE_MINT) || selected.isNativeSol) {
        const ata = getAssociatedTokenAddressSync(NATIVE_MINT, keypair.publicKey);
        ixs.splice(
          1,
          0,
          SystemProgram.transfer({
            fromPubkey: keypair.publicKey,
            toPubkey: ata,
            lamports: Number(raw),
          }),
          createSyncNativeInstruction(ata),
        );
      }

      const tx = new Transaction().add(...ixs);
      const signature = await send(tx, [base], keypair);
      setSig(signature);
      setAmount("");
      await load();
      await loadHoldings();
    } catch (e) {
      setError(friendlyError(e, "Lock failed."));
    } finally {
      setBusy("idle");
    }
  };

  const onClaim = async (lock: ParsedLock) => {
    if (!publicKey) return;
    setError(null);
    setSig(null);
    setBusy("claim");
    try {
      const { keypair } = await getPasskeyKeypair(publicKey);
      const max = BigInt(lock.claimableAmount);
      if (max <= BigInt(0)) throw new Error("Nothing to claim yet");
      const tx = new Transaction().add(
        claimAtaIx(keypair.publicKey, new PublicKey(lock.mint), lock.token2022),
        buildClaimIx({
          escrow: new PublicKey(lock.address),
          mint: new PublicKey(lock.mint),
          recipient: keypair.publicKey,
          token2022: lock.token2022,
          maxAmount: max,
        }),
      );
      const signature = await send(tx, [], keypair);
      setSig(signature);
      await load();
    } catch (e) {
      setError(friendlyError(e, "Claim failed."));
    } finally {
      setBusy("idle");
    }
  };

  const working = busy !== "idle";
  const field =
    "w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none";

  return (
    <>
      <Navbar />
      <ConnectGate action="lock tokens">
        <PageTransition>
          <div className="app-shell py-5 sm:py-8 space-y-5">
            <div className="text-center space-y-1">
              <AnimatedIcon icon={Lock} size={32} className="text-amber-400 mx-auto" />
              <h1 className="text-2xl font-bold tracking-tight">Lock</h1>
              <p className="text-sm text-gray-500 dark:text-white/50">
                Cliff unlock on Jupiter Lock. No protocol fee. Face ID signs.
                {network === "devnet" ? " Devnet." : ""}
              </p>
            </div>

            <div className="space-y-3">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title"
                disabled={working}
                className={field}
              />

              <div>
                <p className="text-xs text-gray-400 dark:text-white/40 mb-1.5">Token in this wallet</p>
                <div className="max-h-52 overflow-y-auto rounded-xl border border-black/10 dark:border-white/10 divide-y divide-black/5 dark:divide-white/10">
                  {listed.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-6">No tokens in this wallet</p>
                  ) : (
                    listed.map((t) => (
                      <button
                        key={t.mint}
                        type="button"
                        disabled={working}
                        onClick={() => {
                          setSelected(t);
                          setAmount("");
                        }}
                        className={`w-full px-3 py-2.5 text-left touch-manipulation ${
                          selected?.mint === t.mint ? "bg-amber-500/15" : "hover:bg-black/5 dark:hover:bg-white/5"
                        }`}
                      >
                        <TokenMetaRow
                          token={t}
                          dense
                          right={
                            <span className="font-mono text-xs tabular-nums">
                              {formatTokenUi(t.uiAmount, t.decimals)}
                            </span>
                          }
                        />
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs text-gray-400 dark:text-white/40">Amount</p>
                  {selected && (
                    <p className="text-xs text-gray-400 dark:text-white/40 font-mono">
                      {formatTokenUi(maxUi, selected.decimals)} {selected.symbol} max
                    </p>
                  )}
                </div>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={maxUi || undefined}
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={selected ? `0 ${selected.symbol}` : "Pick a token"}
                  disabled={working || !selected}
                  className={field}
                />
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    disabled={working || !selected || maxUi <= 0}
                    onClick={() => setAmount(formatAmountInput(maxUi, selected?.decimals ?? 6))}
                    className="flex-1 min-h-12 rounded-xl border border-black/10 dark:border-white/10 text-sm font-semibold touch-manipulation active:scale-[0.98] disabled:opacity-40"
                  >
                    Max
                  </button>
                  <button
                    type="button"
                    disabled={working || !amount}
                    onClick={() => setAmount("")}
                    className="flex-1 min-h-12 rounded-xl border border-black/10 dark:border-white/10 text-sm font-semibold touch-manipulation active:scale-[0.98] disabled:opacity-40"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div>
                <p className="text-xs text-gray-400 dark:text-white/40 mb-1.5">Unlock after</p>
                <div className="grid grid-cols-4 gap-2">
                  {DURATIONS.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      disabled={working}
                      onClick={() => setDuration(d.id)}
                      className={`min-h-12 rounded-xl text-sm font-semibold touch-manipulation active:scale-[0.98] ${
                        duration === d.id
                          ? "bg-amber-500 text-black"
                          : "border border-black/10 dark:border-white/10"
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-gray-400 dark:text-white/40">
                  Unlocks {unlockAt.toLocaleString()}
                </p>
              </div>

              <input
                value={recipient}
                onChange={(e) => setRecipient(e.target.value.trim())}
                placeholder="Recipient"
                disabled={working}
                className={`${field} font-mono text-sm`}
              />

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">
                  {error}
                </div>
              )}
              {sig && (
                <a href={`/receipt/${sig}`} className="block text-sm text-amber-400 hover:underline">
                  Locked. Open receipt
                </a>
              )}

              <button
                onClick={() => void onCreate()}
                disabled={working || !selected || !amount || !recipient}
                className="w-full bg-amber-500 hover:bg-amber-400 disabled:bg-black/10 dark:disabled:bg-white/10 disabled:text-gray-400 text-black font-semibold rounded-lg px-3.5 py-2.5 transition cursor-pointer disabled:cursor-not-allowed min-h-12"
              >
                {busy === "lock" ? <Spinner size={18} /> : "Lock tokens"}
              </button>
              <p className="text-center text-xs text-gray-400 dark:text-white/30">
                Full amount at the unlock time. Cancel: you only. Recipient cannot change.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-white/70">Your locks</h2>
                <button
                  onClick={() => {
                    void load();
                    void loadHoldings();
                  }}
                  className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-white/70"
                >
                  Refresh
                </button>
              </div>
              {busy === "list" && locks.length === 0 ? (
                <p className="text-sm text-gray-400">Loading...</p>
              ) : locks.length === 0 ? (
                <p className="text-sm text-gray-400">None yet.</p>
              ) : (
                locks.map((lock) => {
                  const mine = publicKey === lock.recipient;
                  const claimable = BigInt(lock.claimableAmount) > BigInt(0) && mine && lock.cancelledAt === 0;
                  const held = holdings.find((t) => t.mint === lock.mint);
                  const dec = held?.decimals ?? 6;
                  return (
                    <div
                      key={lock.address}
                      className="rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-4 py-3 space-y-1"
                    >
                      <a href={addressPath(lock.address)} className="font-mono text-xs text-amber-400 hover:underline break-all">
                        {lock.address}
                      </a>
                      <p className="text-xs text-gray-500 dark:text-white/50">
                        Unlock {new Date(lock.cliffTime * 1000).toLocaleString()} · claimed {fmtAmt(lock.totalClaimedAmount, dec)} / {fmtAmt((BigInt(lock.cliffUnlockAmount) + BigInt(lock.amountPerPeriod) * BigInt(lock.numberOfPeriod)).toString(), dec)}
                      </p>
                      <p className="text-xs text-gray-400">
                        {lock.creator === publicKey ? "You locked" : "Locked to you"} · {held?.symbol || `${lock.mint.slice(0, 4)}...${lock.mint.slice(-4)}`}
                      </p>
                      {claimable && (
                        <button
                          onClick={() => void onClaim(lock)}
                          disabled={working}
                          className="mt-1 text-sm font-semibold text-amber-500 hover:underline"
                        >
                          {busy === "claim" ? "Claiming..." : `Claim ${fmtAmt(lock.claimableAmount, dec)}`}
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </PageTransition>
      </ConnectGate>
    </>
  );
}
