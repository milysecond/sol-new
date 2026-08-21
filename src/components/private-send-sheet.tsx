"use client";

import { useCallback, useEffect, useState } from "react";
import { EyeOff, ArrowRight, ShieldCheck, ShieldOff, Check, ExternalLink } from "lucide-react";
import { Spinner } from "@/components/spinner";
import { BottomSheet } from "@/components/bottom-sheet";
import { useNetwork } from "@/lib/network";
import { friendlyError } from "@/lib/friendly-errors";
import { PublicKey } from "@solana/web3.js";
import {
  getPrivateSolBalance,
  openPrivacyCashSession,
  privateSendSol,
  shieldSol,
  solToLamports,
  type PrivacyCashSession,
} from "@/lib/privacy-cash";
import { resolveRecipient } from "@/lib/resolve-name";

type Mode = "send" | "shield" | "unshield";

type Props = {
  /** Controlled open (optional) */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Hide the launcher row (use when embedding on /private) */
  hideLauncher?: boolean;
  initialMode?: Mode;
  initialRecipient?: string;
  initialAmount?: string;
};

export function PrivateSendSheet({
  open: openProp,
  onOpenChange,
  hideLauncher = false,
  initialMode = "send",
  initialRecipient = "",
  initialAmount = "",
}: Props = {}) {
  const { network, rpc, toggle } = useNetwork();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = (v: boolean) => {
    onOpenChange?.(v);
    if (openProp === undefined) setInternalOpen(v);
  };

  const [connecting, setConnecting] = useState(false);
  const [session, setSession] = useState<PrivacyCashSession | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [amount, setAmount] = useState(initialAmount);
  const [recipient, setRecipient] = useState(initialRecipient);
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doneTx, setDoneTx] = useState<string | null>(null);

  const available = network === "mainnet";

  const refreshBalance = useCallback(async (s: PrivacyCashSession) => {
    setBalance(await getPrivateSolBalance(s));
  }, []);

  const ensureSession = useCallback(async () => {
    if (session) return session;
    const s = await openPrivacyCashSession(rpc);
    setSession(s);
    return s;
  }, [session, rpc]);

  const openSheet = async () => {
    if (!available || connecting) return;
    setConnecting(true);
    setError(null);
    try {
      const s = await ensureSession();
      setOpen(true);
      setStatusMsg("Checking private balance…");
      await refreshBalance(s);
      setStatusMsg(null);
    } catch (e) {
      setError(friendlyError(e, "Couldn't open private wallet. Try again."));
      setStatusMsg(null);
    } finally {
      setConnecting(false);
    }
  };

  useEffect(() => {
    setSession(null);
    setBalance(null);
    if (openProp === undefined) setInternalOpen(false);
  }, [network]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-connect when opened controlled from parent
  useEffect(() => {
    if (open && available && !session && !connecting) {
      void openSheet();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, available]);

  useEffect(() => {
    if (initialMode) setMode(initialMode);
  }, [initialMode]);
  useEffect(() => {
    if (initialRecipient) setRecipient(initialRecipient);
  }, [initialRecipient]);

  const lamports = solToLamports(parseFloat(amount || "0"));
  const validAmount = Number.isFinite(lamports) && lamports > 0;
  let validRecipient = mode !== "send";
  if (mode === "send" && recipient.trim().length >= 3) {
    validRecipient = true; // resolve at send time (.sol / .sns ok)
  }

  const run = async () => {
    if (busy || !validAmount || !validRecipient) return;
    setBusy(true);
    setError(null);
    setDoneTx(null);
    try {
      const s = await ensureSession();
      const onStatus = (m: string) => setStatusMsg(m);
      let tx: string;
      if (mode === "shield") {
        tx = await shieldSol(s, lamports, onStatus);
      } else {
        let toPk = s.keypair.publicKey;
        if (mode === "send") {
          const r = await resolveRecipient(recipient.trim());
          if (!r.ok) throw new Error(r.error || "Could not resolve recipient");
          toPk = new PublicKey(r.owner);
        }
        tx = await privateSendSol(s, lamports, toPk, onStatus);
      }
      setDoneTx(tx);
      setAmount("");
      if (mode === "send") setRecipient("");
      const { toast } = await import("@/lib/toast");
      toast.success(
        mode === "shield" ? "Shielded!" : mode === "send" ? "Sent privately (ZK)!" : "Unshielded!",
      );
      try {
        new Audio("/chaching.mp3").play();
      } catch {
        /* ignore */
      }
      await refreshBalance(s);
    } catch (e) {
      setError(friendlyError(e, "Something went wrong. Try again."));
    } finally {
      setBusy(false);
      setStatusMsg(null);
    }
  };

  const inputCls =
    "w-full px-3 py-2.5 bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400/50 disabled:opacity-50";

  const sheet = (
    <BottomSheet open={open} onClose={() => setOpen(false)} className="p-6 flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <EyeOff size={18} className="text-purple-500" /> ZK private wallet
        </h2>
        <p className="text-xs text-gray-500 dark:text-white/40 mt-0.5">
          Private balance:{" "}
          <span className="font-semibold text-gray-900 dark:text-white tabular-nums">
            {balance === null ? (
              <Spinner size={12} className="inline" />
            ) : (
              `${balance.toFixed(4)} SOL`
            )}
          </span>
        </p>
      </div>

      <div className="flex gap-1.5">
        {(
          [
            ["send", "Send", ArrowRight],
            ["shield", "Shield", ShieldCheck],
            ["unshield", "Unshield", ShieldOff],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setMode(id);
              setError(null);
              setDoneTx(null);
            }}
            disabled={busy}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition cursor-pointer active:scale-95 disabled:opacity-50 ${
              mode === id
                ? "bg-fuchsia-500/20 text-fuchsia-600 dark:text-fuchsia-300 border border-fuchsia-400/50"
                : "bg-black/5 dark:bg-white/5 text-gray-500 dark:text-white/50 border border-black/10 dark:border-white/10"
            }`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      <p className="text-[11px] text-gray-500 dark:text-white/40 leading-snug">
        {mode === "send" &&
          "ZK send from your shielded balance. No on-chain link between your public wallet and the recipient."}
        {mode === "shield" && "Deposit SOL into the Privacy Cash pool (Groth16)."}
        {mode === "unshield" && "Withdraw SOL from the pool back to your public passkey wallet."}
      </p>

      {mode === "send" && (
        <input
          type="text"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder="Recipient · address or name.sol / .sns"
          disabled={busy}
          className={inputCls}
        />
      )}

      <div className="relative">
        <input
          type="number"
          step="0.001"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount (SOL)"
          disabled={busy}
          className={inputCls}
        />
        {mode !== "shield" && balance !== null && balance > 0 && (
          <button
            type="button"
            onClick={() => setAmount(String(balance))}
            disabled={busy}
            className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-purple-500 hover:bg-purple-400 text-white text-xs font-medium rounded transition disabled:opacity-50 cursor-pointer"
          >
            Max
          </button>
        )}
      </div>

      {error && open && (
        <div className="px-3 py-2.5 bg-red-500/10 border border-red-500/30 rounded-lg">
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {doneTx && (
        <div className="px-3 py-2.5 bg-green-500/10 border border-green-500/30 rounded-lg space-y-1">
          <div className="flex items-center gap-1.5">
            <Check size={14} className="text-green-500" />
            <p className="text-xs font-medium text-green-600 dark:text-green-400">Done!</p>
          </div>
          <a
            href={`/receipt/${doneTx}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-green-600 dark:text-green-400 hover:underline flex items-center gap-1"
          >
            View receipt <ExternalLink size={10} />
          </a>
        </div>
      )}

      <button
        type="button"
        onClick={() => void run()}
        disabled={busy || !validAmount || !validRecipient}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-500 hover:bg-purple-400 text-white font-semibold rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
      >
        {busy ? (
          <>
            <Spinner size={16} />
            {statusMsg || "Proving…"}
          </>
        ) : (
          <>
            <ArrowRight size={16} />
            {mode === "send"
              ? "Send privately (ZK)"
              : mode === "shield"
                ? "Shield SOL"
                : "Unshield SOL"}
          </>
        )}
      </button>

      <p className="text-[10px] text-gray-400 dark:text-white/30 text-center leading-snug">
        Privacy Cash · Groth16 proofs · Light Protocol hasher · mainnet. Relayer fee on send/unshield.
      </p>
    </BottomSheet>
  );

  if (hideLauncher) {
    return sheet;
  }

  return (
    <>
      {available ? (
        <button
          type="button"
          onClick={() => void openSheet()}
          disabled={connecting}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-black text-left transition hover:border-fuchsia-400/50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <div className="flex items-center gap-2">
            {connecting ? <Spinner size={14} /> : <EyeOff size={14} className="text-purple-500" />}
            <div>
              <p className="text-xs font-medium text-gray-900 dark:text-white">ZK private send</p>
              <p className="text-[11px] text-gray-500 dark:text-white/40">
                Shielded transfers — no public link to recipient
              </p>
            </div>
          </div>
          <span className="text-[11px] text-purple-500 font-medium">Open</span>
        </button>
      ) : (
        <div className="w-full rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2.5 space-y-2">
          <div className="flex items-center gap-2">
            <EyeOff size={14} className="text-amber-600 shrink-0" />
            <div>
              <p className="text-xs font-medium text-gray-900 dark:text-white">
                Hosted ZK pool is mainnet-only
              </p>
              <p className="text-[11px] text-gray-600 dark:text-white/50 leading-snug">
                Privacy Cash program can run on devnet if you self-host a relayer. Public API is
                mainnet.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => toggle()}
            className="w-full rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold py-2 transition"
          >
            Switch to mainnet
          </button>
        </div>
      )}
      {error && !open && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{error}</p>}
      {sheet}
    </>
  );
}
