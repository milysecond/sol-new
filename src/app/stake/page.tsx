"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Connection,
  PublicKey,
  Keypair,
  StakeProgram,
  Authorized,
  Lockup,
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
import { getPasskeyKeypair } from "@/lib/passkey-wallet";
import { friendlyError } from "@/lib/friendly-errors";
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

function simErrorMessage(err: unknown, logs?: string[] | null): string {
  const tail = logs?.filter(Boolean).slice(-6).join(" · ") || "";
  const e =
    typeof err === "string"
      ? err
      : err && typeof err === "object"
        ? JSON.stringify(err)
        : String(err);
  if (/insufficient|0x1\b/i.test(e + tail)) {
    return "Not enough SOL for stake + rent + fees. Try a smaller amount or Max.";
  }
  if (/blockhash/i.test(e + tail)) {
    return "Network was slow — try again.";
  }
  if (tail) return `Stake failed: ${tail.slice(0, 220)}`;
  return `Stake failed: ${e.slice(0, 180)}`;
}

export default function StakePage() {
  const { publicKey, balance, refreshBalance } = useWallet();
  const { rpc, network } = useNetwork();
  const [amount, setAmount] = useState("0.01");
  const [vote, setVote] = useState(DEFAULT_VOTE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sig, setSig] = useState<string | null>(null);
  const [stakes, setStakes] = useState<StakeRow[]>([]);
  const [loadingStakes, setLoadingStakes] = useState(false);
  const [rentLamports, setRentLamports] = useState(STAKE_RENT_LAMPORTS);

  useEffect(() => {
    const connection = new Connection(rpc, "confirmed");
    connection
      .getMinimumBalanceForRentExemption(StakeProgram.space)
      .then((r) => setRentLamports(r))
      .catch(() => setRentLamports(STAKE_RENT_LAMPORTS));
  }, [rpc]);

  const loadStakes = useCallback(async () => {
    if (!publicKey) {
      setStakes([]);
      return;
    }
    setLoadingStakes(true);
    try {
      const connection = new Connection(rpc, "confirmed");
      const owner = new PublicKey(publicKey);
      // Staker authority offset 12 in StakeStateV2 meta.authorized.staker
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

  const sendTx = async (tx: Transaction, extraSigners: Keypair[] = []) => {
    if (!publicKey) throw new Error("Connect wallet first");
    const { keypair } = await getPasskeyKeypair(publicKey);
    if (keypair.publicKey.toBase58() !== publicKey) {
      throw new Error(
        "Passkey does not match connected wallet. Open Find wallet and pick the right one."
      );
    }
    const connection = new Connection(rpc, "confirmed");
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.feePayer = keypair.publicKey;
    // Fresh Transaction — sign fee payer + any stake account keys
    tx.sign(keypair, ...extraSigners);

    const sim = await connection.simulateTransaction(tx);
    if (sim.value.err) {
      console.error("[stake] sim", sim.value.err, sim.value.logs);
      throw new Error(simErrorMessage(sim.value.err, sim.value.logs));
    }

    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: true, // already simulated
      maxRetries: 3,
    });
    await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      "confirmed"
    );
    return signature;
  };

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
      const stakeLamports = Math.round(sol * LAMPORTS_PER_SOL);
      const connection = new Connection(rpc, "confirmed");
      let rent = rentLamports;
      try {
        rent = await connection.getMinimumBalanceForRentExemption(StakeProgram.space);
        setRentLamports(rent);
      } catch {
        /* use cached */
      }

      const totalNeeded = stakeLamports + rent + STAKE_FEE_BUFFER_LAMPORTS;
      const balLamports = Math.round((balance ?? 0) * LAMPORTS_PER_SOL);
      if (totalNeeded > balLamports) {
        throw new Error(
          `Not enough SOL. Need ~${(totalNeeded / LAMPORTS_PER_SOL).toFixed(4)} SOL (stake + rent ${((rent) / LAMPORTS_PER_SOL).toFixed(4)} + fees).`
        );
      }

      const from = new PublicKey(publicKey);
      const votePubkey = new PublicKey(vote);

      // New stake account keypair (standard path — avoids createWithSeed base/seed quirks)
      const stakeAccount = Keypair.generate();
      const createIx = StakeProgram.createAccount({
        fromPubkey: from,
        stakePubkey: stakeAccount.publicKey,
        authorized: new Authorized(from, from),
        lockup: new Lockup(0, 0, PublicKey.default),
        lamports: stakeLamports + rent,
      });
      const delegateIx = StakeProgram.delegate({
        stakePubkey: stakeAccount.publicKey,
        authorizedPubkey: from,
        votePubkey,
      });

      const tx = new Transaction().add(...createIx.instructions, ...delegateIx.instructions);
      const signature = await sendTx(tx, [stakeAccount]);
      setSig(signature);
      await refreshBalance();
      await loadStakes();
    } catch (e) {
      console.error("[stake]", e);
      setError(friendlyError(e, "Couldn't stake. Try again."));
    } finally {
      setBusy(false);
    }
  };

  const handleDeactivate = async (stakeAddress: string) => {
    if (!publicKey) return;
    setBusy(true);
    setError(null);
    setSig(null);
    try {
      const from = new PublicKey(publicKey);
      const stakePubkey = new PublicKey(stakeAddress);
      const deact = StakeProgram.deactivate({
        stakePubkey,
        authorizedPubkey: from,
      });
      const tx = new Transaction().add(...deact.instructions);
      const signature = await sendTx(tx);
      setSig(signature);
      await loadStakes();
    } catch (e) {
      setError(friendlyError(e, "Couldn't deactivate stake."));
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
      const wd = StakeProgram.withdraw({
        stakePubkey,
        authorizedPubkey: from,
        toPubkey: from,
        lamports,
      });
      const tx = new Transaction().add(...wd.instructions);
      const signature = await sendTx(tx);
      setSig(signature);
      await refreshBalance();
      await loadStakes();
    } catch (e) {
      setError(friendlyError(e, "Couldn't withdraw stake."));
    } finally {
      setBusy(false);
    }
  };

  const maxStake = () => {
    const bal = Math.round((balance ?? 0) * LAMPORTS_PER_SOL);
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
      <main className="flex-1 flex flex-col px-4 py-4 sm:px-6 sm:py-8 sm:items-center">
        <ConnectGate action="stake SOL">
          <PageTransition>
            <div className="w-full sm:max-w-lg space-y-6">
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
                    Balance: {(balance ?? 0).toFixed(4)} SOL · min {MIN_STAKE_SOL} SOL · +
                    {(rentLamports / LAMPORTS_PER_SOL).toFixed(4)} rent
                  </p>
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
                  href={`https://solscan.io/tx/${sig}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-xs text-purple-400 font-mono truncate hover:underline"
                >
                  {sig}
                </a>
              )}

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 text-red-400 text-xs">
                  {error}
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
