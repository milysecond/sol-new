"use client";

import { useCallback, useEffect, useState } from "react";
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
  unpackMint,
} from "@solana/spl-token";
import { Lock } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { ConnectGate } from "@/components/connect-gate";
import { PageTransition } from "@/components/page-transition";
import { AnimatedIcon } from "@/components/animated-icon";
import { Spinner } from "@/components/spinner";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import { getPasskeyKeypair } from "@/lib/passkey-wallet";
import { friendlyError } from "@/lib/friendly-errors";
import { addressPath } from "@/lib/explorer";
import {
  buildClaimIx,
  buildCreateLockIxs,
  claimAtaIx,
  type ParsedLock,
} from "@/lib/jup-lock";

function defaultCliffLocal(): string {
  const d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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

export default function LockPage() {
  const { publicKey } = useWallet();
  const { rpc, network } = useNetwork();
  const [title, setTitle] = useState("Lock");
  const [mint, setMint] = useState("");
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [cliff, setCliff] = useState(defaultCliffLocal);
  const [busy, setBusy] = useState<"idle" | "lock" | "claim" | "list">("idle");
  const [error, setError] = useState<string | null>(null);
  const [sig, setSig] = useState<string | null>(null);
  const [locks, setLocks] = useState<ParsedLock[]>([]);
  const [decimalsByMint, setDecimalsByMint] = useState<Record<string, number>>({});

  useEffect(() => {
    if (publicKey && !recipient) setRecipient(publicKey);
  }, [publicKey, recipient]);

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
    if (!publicKey || !mint || !amount || !recipient) return;
    setError(null);
    setSig(null);
    setBusy("lock");
    try {
      const mintPk = new PublicKey(mint.trim());
      const recipientPk = new PublicKey(recipient.trim());
      const connection = new Connection(rpc, "confirmed");
      const mintInfo = await connection.getAccountInfo(mintPk);
      if (!mintInfo) throw new Error("Mint not found on this network");
      const token2022 = mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID);
      const unpacked = unpackMint(mintPk, mintInfo, mintInfo.owner);
      const decimals = unpacked.decimals;
      const ui = Number(amount);
      if (!Number.isFinite(ui) || ui <= 0) throw new Error("Amount must be greater than 0");
      const raw = BigInt(Math.round(ui * 10 ** decimals));
      const cliffUnix = Math.floor(new Date(cliff).getTime() / 1000);
      if (!Number.isFinite(cliffUnix) || cliffUnix < Math.floor(Date.now() / 1000) - 60) {
        throw new Error("Unlock time must be in the future");
      }

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

      if (mintPk.equals(NATIVE_MINT)) {
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
      await load();
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
                className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none"
              />
              <input
                value={mint}
                onChange={(e) => setMint(e.target.value.trim())}
                placeholder="Token mint"
                disabled={working}
                className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 font-mono text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none"
              />
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Amount"
                inputMode="decimal"
                disabled={working}
                className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none"
              />
              <input
                value={recipient}
                onChange={(e) => setRecipient(e.target.value.trim())}
                placeholder="Recipient"
                disabled={working}
                className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 font-mono text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none"
              />
              <label className="block text-xs text-gray-400 dark:text-white/40">
                Unlocks at
                <input
                  type="datetime-local"
                  value={cliff}
                  onChange={(e) => setCliff(e.target.value)}
                  disabled={working}
                  className="mt-1 w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-gray-900 dark:text-white focus:outline-none"
                />
              </label>

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
                disabled={working || !mint || !amount || !recipient}
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
                  onClick={() => void load()}
                  className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-white/70"
                >
                  Refresh
                </button>
              </div>
              {busy === "list" && locks.length === 0 ? (
                <p className="text-sm text-gray-400">Loading…</p>
              ) : locks.length === 0 ? (
                <p className="text-sm text-gray-400">None yet.</p>
              ) : (
                locks.map((lock) => {
                  const mine = publicKey === lock.recipient;
                  const claimable = BigInt(lock.claimableAmount) > BigInt(0) && mine && lock.cancelledAt === 0;
                  const dec = decimalsByMint[lock.mint] ?? 6;
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
                      <p className="text-xs text-gray-400 break-all">
                        {lock.creator === publicKey ? "You locked" : "Locked to you"} · {lock.mint.slice(0, 4)}…{lock.mint.slice(-4)}
                      </p>
                      {claimable && (
                        <button
                          onClick={() => void onClaim(lock)}
                          disabled={working}
                          className="mt-1 text-sm font-semibold text-amber-500 hover:underline"
                        >
                          {busy === "claim" ? "Claiming…" : `Claim ${fmtAmt(lock.claimableAmount, dec)}`}
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
