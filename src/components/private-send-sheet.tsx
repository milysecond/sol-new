"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EyeOff, ArrowRight, ShieldCheck, ShieldOff, Check, ExternalLink } from "lucide-react";
import { Spinner } from "@/components/spinner";
import { BottomSheet } from "@/components/bottom-sheet";
import { useNetwork } from "@/lib/network";
import { getPasskeyKeypair } from "@/lib/passkey-wallet";
import { friendlyError } from "@/lib/friendly-errors";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, VersionedTransaction } from "@solana/web3.js";
import type { EncryptionService } from "privacycash/utils";
import { Buffer } from "buffer";
import nodeProcess from "process";

// The ZK stack (snarkjs, hasher wasm) expects Node globals in the browser.
// Next 16 builds with Turbopack, which ignores webpack ProvidePlugin config,
// so shim at runtime before the dynamic privacycash import resolves.
if (typeof window !== "undefined") {
  const w = window as unknown as Record<string, unknown>;
  if (!w.Buffer) w.Buffer = Buffer;
  if (!w.process) w.process = nodeProcess;
  if (!w.global) w.global = window;
}

// Groth16 proving keys served from public/ (snarkjs appends .wasm / .zkey).
const KEY_BASE_PATH = "/circuit2/transaction2";
const SIGN_MESSAGE = "Privacy Money account sign in";
// Skip scanning the pool's full note history on first fetch (demo-app default).
const FIRST_FETCH_NOTES = 60_000;

type Mode = "send" | "shield" | "unshield";
type Session = {
  keypair: Keypair;
  encryptionService: EncryptionService;
  // WasmFactory instance type isn't exported cleanly; the SDK takes it opaquely.
  hasher: unknown;
};

async function getUtxoOffset(): Promise<number> {
  try {
    const res = await fetch("https://api3.privacycash.org/merkle/root?token=sol");
    const j = (await res.json()) as { nextIndex?: number };
    if (typeof j.nextIndex === "number" && j.nextIndex > FIRST_FETCH_NOTES) {
      return j.nextIndex - FIRST_FETCH_NOTES;
    }
  } catch {}
  return 0;
}

export function PrivateSendSheet() {
  const { network, rpc } = useNetwork();
  const [open, setOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>("send");
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doneTx, setDoneTx] = useState<string | null>(null);
  const connection = useRef<Connection | null>(null);

  // Privacy Cash's pool, indexer, and relayer are mainnet-only.
  const available = network === "mainnet";

  const refreshBalance = useCallback(async (s: Session) => {
    const { getUtxos, getBalanceFromUtxos } = await import("privacycash/utils");
    const offset = await getUtxoOffset();
    const utxos = await getUtxos({
      connection: connection.current!,
      publicKey: s.keypair.publicKey,
      storage: localStorage,
      encryptionService: s.encryptionService,
      offset,
    });
    setBalance(getBalanceFromUtxos(utxos).lamports / LAMPORTS_PER_SOL);
  }, []);

  const openSheet = async () => {
    if (!available || connecting) return;
    setConnecting(true);
    setError(null);
    try {
      let s = session;
      if (!s) {
        const { keypair } = await getPasskeyKeypair();
        const [{ EncryptionService, setLogger }, { WasmFactory }, nacl] = await Promise.all([
          import("privacycash/utils"),
          import("@lightprotocol/hasher.rs"),
          import("tweetnacl"),
        ]);
        setLogger((level: string, message: string) => {
          if (level === "info") setStatusMsg(message);
        });
        // Same key-derivation message the Privacy Cash app uses, signed
        // locally with the passkey-derived key instead of a wallet popup.
        const signature = nacl.default.sign.detached(
          new TextEncoder().encode(SIGN_MESSAGE),
          keypair.secretKey
        );
        const encryptionService = new EncryptionService();
        encryptionService.deriveEncryptionKeyFromSignature(signature);
        const hasher = await WasmFactory.getInstance();
        connection.current = new Connection(rpc, "confirmed");
        s = { keypair, encryptionService, hasher };
        setSession(s);
      }
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
    // Session, cache, and balance are network-scoped; drop them on switch.
    setSession(null);
    setBalance(null);
    setOpen(false);
  }, [network]);

  const lamports = Math.round(parseFloat(amount || "0") * LAMPORTS_PER_SOL);
  const validAmount = Number.isFinite(lamports) && lamports > 0;
  let validRecipient = mode !== "send";
  if (mode === "send" && recipient.trim().length >= 32) {
    try { new PublicKey(recipient.trim()); validRecipient = true; } catch {}
  }

  const run = async () => {
    if (!session || busy || !validAmount || !validRecipient) return;
    setBusy(true);
    setError(null);
    setDoneTx(null);
    try {
      const utils = await import("privacycash/utils");
      const common = {
        lightWasm: session.hasher as Parameters<typeof utils.deposit>[0]["lightWasm"],
        connection: connection.current!,
        publicKey: session.keypair.publicKey,
        storage: localStorage,
        encryptionService: session.encryptionService,
        keyBasePath: KEY_BASE_PATH,
      };
      let tx: string;
      if (mode === "shield") {
        const res = await utils.deposit({
          ...common,
          amount_in_lamports: lamports,
          transactionSigner: async (t: VersionedTransaction) => {
            t.sign([session.keypair]);
            return t;
          },
        });
        tx = res.tx;
      } else {
        const to = mode === "send" ? new PublicKey(recipient.trim()) : session.keypair.publicKey;
        const res = await utils.withdraw({
          ...common,
          amount_in_lamports: lamports,
          recipient: to,
        });
        tx = res.tx;
      }
      setDoneTx(tx);
      setAmount("");
      if (mode === "send") setRecipient("");
      const { toast } = await import("@/lib/toast");
      toast.success(mode === "shield" ? "Shielded!" : mode === "send" ? "Sent privately!" : "Unshielded!");
      try { new Audio("/chaching.mp3").play(); } catch {}
      await refreshBalance(session);
    } catch (e) {
      setError(friendlyError(e, "Something went wrong. Try again."));
    } finally {
      setBusy(false);
      setStatusMsg(null);
    }
  };

  const inputCls =
    "w-full px-3 py-2.5 bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400/50 disabled:opacity-50";

  return (
    <>
      <button
        onClick={openSheet}
        disabled={!available || connecting}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-black text-left transition hover:border-fuchsia-400/50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
      >
        <div className="flex items-center gap-2">
          {connecting ? <Spinner size={14} /> : <EyeOff size={14} className="text-purple-500" />}
          <div>
            <p className="text-xs font-medium text-gray-900 dark:text-white">Send privately</p>
            <p className="text-[11px] text-gray-500 dark:text-white/40">
              {available
                ? "Shielded transfers no one can trace, powered by Privacy Cash"
                : "Available on mainnet only"}
            </p>
          </div>
        </div>
        <span className="text-[11px] text-purple-500 font-medium">Open</span>
      </button>
      {error && !open && (
        <p className="text-xs text-red-600 dark:text-red-400 mt-1">{error}</p>
      )}

      <BottomSheet open={open} onClose={() => setOpen(false)} className="p-6 flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <EyeOff size={18} className="text-purple-500" /> Private wallet
          </h2>
          <p className="text-xs text-gray-500 dark:text-white/40 mt-0.5">
            Private balance:{" "}
            <span className="font-semibold text-gray-900 dark:text-white tabular-nums">
              {balance === null ? "…" : `${balance.toFixed(4)} SOL`}
            </span>
          </p>
        </div>

        <div className="flex gap-1.5">
          {([["send", "Send", ArrowRight], ["shield", "Shield", ShieldCheck], ["unshield", "Unshield", ShieldOff]] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => { setMode(id); setError(null); setDoneTx(null); }}
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
          {mode === "send" && "Send from your private balance. The link between you and the recipient stays hidden."}
          {mode === "shield" && "Move SOL from your public wallet into your private balance."}
          {mode === "unshield" && "Move SOL from your private balance back to your public wallet."}
        </p>

        {mode === "send" && (
          <input
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="Recipient Solana address"
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
              href={`https://solscan.io/tx/${doneTx}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-green-600 dark:text-green-400 hover:underline flex items-center gap-1"
            >
              View transaction <ExternalLink size={10} />
            </a>
          </div>
        )}

        <button
          onClick={run}
          disabled={busy || !validAmount || !validRecipient}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-500 hover:bg-purple-400 text-white font-semibold rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {busy ? (
            <>
              <Spinner size={16} />
              {statusMsg || "Working…"}
            </>
          ) : (
            <>
              <ArrowRight size={16} />
              {mode === "send" ? "Send privately" : mode === "shield" ? "Shield SOL" : "Unshield SOL"}
            </>
          )}
        </button>

        <p className="text-[10px] text-gray-400 dark:text-white/30 text-center leading-snug">
          Powered by Privacy Cash. Sending and unshielding pay a small relayer fee.
        </p>
      </BottomSheet>
    </>
  );
}
