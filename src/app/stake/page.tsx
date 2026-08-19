"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Connection,
  PublicKey,
  StakeProgram,
  LAMPORTS_PER_SOL,
  Transaction,
} from "@solana/web3.js";
import { Landmark } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { ConnectGate } from "@/components/connect-gate";
import { PageTransition } from "@/components/page-transition";
import { Spinner } from "@/components/spinner";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import {
  getPasskeyKeypair,
  signVersionedAndSend,
  ensureDocumentFocusForPasskey,
} from "@/lib/passkey-wallet";
import {
  DEFAULT_VOTE,
  MIN_STAKE_SOL,
  STAKE_FEE_BUFFER_LAMPORTS,
  STAKE_RENT_LAMPORTS,
  STAKE_VALIDATORS,
} from "@/lib/stake-validators";

type StakeRow = {
  pubkey: string;
  lamports: number;
  state: string;
  voter: string | null;
  activationEpoch: string | null;
  deactivationEpoch: string | null;
};

function errText(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return "Unknown error";
  }
}

export default function StakePage() {
  const { publicKey, balance, refreshBalance } = useWallet();
  const { rpc, network } = useNetwork();
  const [amount, setAmount] = useState("1");
  const [vote, setVote] = useState(DEFAULT_VOTE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sig, setSig] = useState<string | null>(null);
  const [stakes, setStakes] = useState<StakeRow[]>([]);
  const [loadingStakes, setLoadingStakes] = useState(false);
  const [rentLamports, setRentLamports] = useState(STAKE_RENT_LAMPORTS);
  const [sponsored, setSponsored] = useState(false);
  const [liveBal, setLiveBal] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/stake/build", { cache: "no-store" })
      .then((r) => r.json() as Promise<{ sponsored?: boolean }>)
      .then((d) => setSponsored(!!d.sponsored))
      .catch(() => setSponsored(false));
  }, []);

  useEffect(() => {
    const connection = new Connection(rpc, "confirmed");
    connection
      .getMinimumBalanceForRentExemption(StakeProgram.space)
      .then((r) => setRentLamports(r))
      .catch(() => setRentLamports(STAKE_RENT_LAMPORTS));
  }, [rpc]);

  useEffect(() => {
    if (!publicKey) {
      setLiveBal(null);
      return;
    }
    const connection = new Connection(rpc, "confirmed");
    connection
      .getBalance(new PublicKey(publicKey), "confirmed")
      .then((l) => setLiveBal(l / LAMPORTS_PER_SOL))
      .catch(() => setLiveBal(balance));
  }, [publicKey, rpc, balance]);

  const loadStakes = useCallback(async () => {
    if (!publicKey) {
      setStakes([]);
      return;
    }
    setLoadingStakes(true);
    try {
      const connection = new Connection(rpc, "confirmed");
      const owner = new PublicKey(publicKey);
      const accounts = await connection.getParsedProgramAccounts(StakeProgram.programId, {
        commitment: "confirmed",
        filters: [
          { dataSize: 200 },
          { memcmp: { offset: 12, bytes: owner.toBase58() } },
        ],
      });
      const rows: StakeRow[] = accounts.map((a) => {
        const info = a.account.data;
        const parsed =
          typeof info === "object" && info !== null && "parsed" in info
            ? (info as { parsed?: { type?: string; info?: Record<string, unknown> } }).parsed
            : null;
        const stakeInfo = (parsed?.info || {}) as {
          stake?: {
            delegation?: {
              voter?: string;
              activationEpoch?: string;
              deactivationEpoch?: string;
            };
          };
        };
        const del = stakeInfo.stake?.delegation;
        return {
          pubkey: a.pubkey.toBase58(),
          lamports: a.account.lamports,
          state: parsed?.type || "unknown",
          voter: del?.voter ?? null,
          activationEpoch: del?.activationEpoch ?? null,
          deactivationEpoch: del?.deactivationEpoch ?? null,
        };
      });
      setStakes(rows);
    } catch (e) {
      console.error("[stake] load", e);
      setStakes([]);
    } finally {
      setLoadingStakes(false);
    }
  }, [publicKey, rpc]);

  useEffect(() => {
    void loadStakes();
  }, [loadStakes]);

  const handleStake = async () => {
    if (!publicKey) return;
    if (network !== "mainnet") {
      setError("Switch to mainnet (live) to stake.");
      return;
    }
    setBusy(true);
    setError(null);
    setSig(null);
    try {
      const sol = parseFloat(amount);
      if (!Number.isFinite(sol) || sol < MIN_STAKE_SOL) {
        throw new Error(`Minimum stake is ${MIN_STAKE_SOL} SOL`);
      }

      const need = sol + rentLamports / LAMPORTS_PER_SOL + 0.002;
      if ((balance ?? 0) + 1e-9 < need) {
        throw new Error(
          `Not enough SOL. Need about ${need.toFixed(3)} SOL (stake + rent + fees). You have ${(balance ?? 0).toFixed(4)}. Open Get funds first.`,
        );
      }

      // Unique seed for createWithSeed (alnum, ≤32)
      const seed = `sn${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.slice(
        0,
        32,
      );

      const bRes = await fetch("/api/stake/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: publicKey,
          amountSol: sol,
          vote,
          seed,
        }),
      });
      const bData = (await bRes.json()) as {
        ok?: boolean;
        error?: string;
        tx?: string;
        sponsored?: boolean;
        rentLamports?: number;
      };
      if (!bRes.ok || !bData.tx) {
        throw new Error(bData.error || "Could not build stake transaction");
      }
      if (bData.rentLamports) setRentLamports(bData.rentLamports);

      // Single Face ID at send time — keep page focused (desktop Safari)
      ensureDocumentFocusForPasskey();
      let signature: string;
      if (bData.sponsored) {
        signature = await signVersionedAndSend(bData.tx, rpc, publicKey);
      } else {
        const { keypair } = await getPasskeyKeypair(publicKey);
        const tx = Transaction.from(Buffer.from(bData.tx, "base64"));
        const connection = new Connection(rpc, "confirmed");
        const { blockhash, lastValidBlockHeight } =
          await connection.getLatestBlockhash("confirmed");
        tx.recentBlockhash = blockhash;
        tx.feePayer = keypair.publicKey;
        tx.sign(keypair);
        signature = await connection.sendRawTransaction(tx.serialize(), {
          skipPreflight: false,
          maxRetries: 3,
        });
        await connection.confirmTransaction(
          { signature, blockhash, lastValidBlockHeight },
          "confirmed",
        );
      }

      setSig(signature);
      await refreshBalance();
      await loadStakes();
    } catch (e) {
      console.error("[stake]", e);
      const { friendlyError } = await import("@/lib/friendly-errors");
      setError(friendlyError(e, "Staking failed — check balance and try again."));
    } finally {
      setBusy(false);
    }
  };

  const sendAuthTx = async (build: () => Transaction) => {
    if (!publicKey) throw new Error("Connect wallet first");
    const { keypair } = await getPasskeyKeypair(publicKey);
    if (keypair.publicKey.toBase58() !== publicKey) {
      throw new Error("Passkey does not match connected wallet.");
    }
    const connection = new Connection(rpc, "confirmed");
    const tx = build();
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.feePayer = keypair.publicKey;
    tx.sign(keypair);
    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });
    await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      "confirmed"
    );
    return signature;
  };

  const handleDeactivate = async (stakeAddress: string) => {
    if (!publicKey) return;
    setBusy(true);
    setError(null);
    setSig(null);
    try {
      const from = new PublicKey(publicKey);
      const stakePubkey = new PublicKey(stakeAddress);
      const signature = await sendAuthTx(() => {
        const deact = StakeProgram.deactivate({
          stakePubkey,
          authorizedPubkey: from,
        });
        return new Transaction().add(...deact.instructions);
      });
      setSig(signature);
      await loadStakes();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const handleWithdraw = async (stakeAddress: string, lamports: number) => {
    if (!publicKey) return;
    setBusy(true);
    setError(null);
    setSig(null);
    try {
      const from = new PublicKey(publicKey);
      const stakePubkey = new PublicKey(stakeAddress);
      const signature = await sendAuthTx(() => {
        const wd = StakeProgram.withdraw({
          stakePubkey,
          authorizedPubkey: from,
          toPubkey: from,
          lamports,
        });
        return new Transaction().add(...wd.instructions);
      });
      setSig(signature);
      await refreshBalance();
      await loadStakes();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const balShown = liveBal ?? balance ?? 0;
  const maxStake = () => {
    const bal = Math.round(balShown * LAMPORTS_PER_SOL);
    // When sponsored, still need stake+rent from user
    const sendable = Math.max(0, bal - rentLamports - STAKE_FEE_BUFFER_LAMPORTS);
    if (sendable < MIN_STAKE_SOL * LAMPORTS_PER_SOL) {
      setError("Not enough SOL to stake after rent and fees.");
      return;
    }
    setError(null);
    setAmount((sendable / LAMPORTS_PER_SOL).toFixed(4).replace(/\.?0+$/, "") || "0");
  };

  const neverDeactivated = (s: StakeRow) =>
    !s.deactivationEpoch || s.deactivationEpoch === "18446744073709551615";
  const canWithdraw = (s: StakeRow) =>
    s.state === "inactive" || s.state === "initialized";
  const canDeactivate = (s: StakeRow) =>
    (s.state === "active" || s.state === "activating" || s.state === "delegated") &&
    neverDeactivated(s);

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      <Navbar />
      <main className="flex-1 w-full min-w-0 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:pb-12">
        <ConnectGate action="stake SOL">
          <PageTransition>
            <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 py-5 sm:py-8 space-y-6">
              <div className="text-center space-y-2">
                <Landmark className="mx-auto text-purple-400" size={36} />
                <h1 className="text-3xl font-bold tracking-tight">Stake SOL</h1>
                <p className="text-gray-500 dark:text-white/50 text-sm">
                  Native Solana staking. Delegate to a validator, earn inflation rewards.
                  Unstaking takes ~2 epochs.
                </p>
                <p className="text-[11px] text-gray-400">
                  USDC yield →{" "}
                  <a href="/earn" className="text-emerald-400 hover:underline">
                    /earn
                  </a>
                  {" · "}
                  Liquid stake →{" "}
                  <a href="/lst" className="text-cyan-400 hover:underline">
                    /lst
                  </a>
                </p>
                {sponsored ? (
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                    Network fee paid by sol.new
                  </p>
                ) : (
                  <p className="text-[11px] text-gray-400">
                    Network fee from your wallet (~0.00001 SOL)
                  </p>
                )}
              </div>

              <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl p-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-white/60 mb-1.5">
                    Amount (SOL)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min={MIN_STAKE_SOL}
                      step="any"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      disabled={busy}
                      className="w-full px-3 py-2.5 pr-16 rounded-xl bg-white dark:bg-black border border-black/10 dark:border-white/10 text-sm"
                    />
                    <button
                      type="button"
                      onClick={maxStake}
                      disabled={busy}
                      className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-purple-500 hover:bg-purple-400 text-white text-xs font-medium rounded transition disabled:opacity-50 cursor-pointer"
                    >
                      Max
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">
                    Balance: {balShown.toFixed(4)} SOL · min {MIN_STAKE_SOL} SOL
                    (network) · +{(rentLamports / LAMPORTS_PER_SOL).toFixed(4)} rent
                  </p>
                  {balShown < MIN_STAKE_SOL + rentLamports / LAMPORTS_PER_SOL && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                      Need at least ~{(MIN_STAKE_SOL + rentLamports / LAMPORTS_PER_SOL).toFixed(2)} SOL
                      to stake (Solana requires ≥{MIN_STAKE_SOL} SOL delegated).
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-white/60 mb-1.5">
                    Validator
                  </label>
                  <div className="space-y-1.5">
                    {STAKE_VALIDATORS.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setVote(v.vote)}
                        disabled={busy}
                        className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition cursor-pointer ${
                          vote === v.vote
                            ? "bg-purple-500/15 border-purple-400/50 text-purple-900 dark:text-purple-100"
                            : "bg-white dark:bg-black border-black/10 dark:border-white/10 text-gray-700 dark:text-white/70"
                        }`}
                      >
                        <span className="font-medium">{v.name}</span>
                        <span className="text-xs text-gray-400 ml-2">
                          {v.commission}% fee
                          {v.note ? ` · ${v.note}` : ""}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={busy || !amount}
                  onClick={() => void handleStake()}
                  className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-semibold rounded-xl px-4 py-3 transition cursor-pointer flex items-center justify-center gap-2"
                >
                  {busy ? <Spinner size={16} /> : null}
                  Stake SOL
                </button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Your stakes</h2>
                  <button
                    type="button"
                    onClick={() => void loadStakes()}
                    disabled={loadingStakes}
                    className="text-xs text-purple-400 hover:underline cursor-pointer"
                  >
                    {loadingStakes ? "Loading…" : "Refresh"}
                  </button>
                </div>
                {stakes.length === 0 && !loadingStakes && (
                  <p className="text-xs text-gray-400">No stake accounts yet.</p>
                )}
                {stakes.map((s) => (
                  <div
                    key={s.pubkey}
                    className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl p-3 space-y-2"
                  >
                    <div className="flex justify-between text-xs gap-2">
                      <span className="font-mono truncate">
                        {s.pubkey.slice(0, 4)}…{s.pubkey.slice(-4)}
                      </span>
                      <span className="font-medium shrink-0">
                        {(s.lamports / LAMPORTS_PER_SOL).toFixed(4)} SOL
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400 capitalize">
                      {s.state}
                      {s.voter
                        ? ` · ${STAKE_VALIDATORS.find((v) => v.vote === s.voter)?.name || s.voter.slice(0, 8) + "…"}`
                        : ""}
                    </p>
                    <div className="flex gap-2">
                      {canDeactivate(s) && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleDeactivate(s.pubkey)}
                          className="flex-1 text-xs py-2 rounded-lg border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer disabled:opacity-40"
                        >
                          Deactivate
                        </button>
                      )}
                      {(canWithdraw(s) || s.state === "inactive") && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleWithdraw(s.pubkey, s.lamports)}
                          className="flex-1 text-xs py-2 rounded-lg bg-purple-600/80 text-white cursor-pointer disabled:opacity-40"
                        >
                          Withdraw
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {sig && (
                <a
                  href={`/receipt/${sig}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-xs text-purple-400 font-mono truncate hover:underline"
                >
                  {sig}
                </a>
              )}

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 text-red-400 text-xs whitespace-pre-wrap break-words space-y-2">
                  <p>{error}</p>
                  {/not enough sol|get funds|insufficient/i.test(error) && (
                    <a
                      href="/get"
                      className="inline-flex text-purple-300 font-semibold underline"
                    >
                      Open Get funds →
                    </a>
                  )}
                </div>
              )}

              <p className="text-[11px] text-gray-400 text-center">
                sol.new never takes custody. Your passkey is the stake authority.
              </p>
            </div>
          </PageTransition>
        </ConnectGate>
      </main>
    </div>
  );
}
