"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { Spinner } from "@/components/spinner";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import { ArrowLeft, Clock, Coins, Users, Zap } from "lucide-react";
import Link from "next/link";

interface GenesisState {
  ok: boolean;
  genesisAccount: string;
  launchPoolBucket?: string;
  unlockedBucket?: string;
  phase: string;
  finalized: boolean;
  totalSupply: string;
  quoteTokenDepositTotal?: string;
  tokenAllocation?: string;
  depositStartTs?: number;
  depositEndTs?: number;
  claimStartTs?: number;
  claimEndTs?: number;
  error?: string;
}

function useCountdown(targetTs: number | undefined) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!targetTs) return;
    const tick = () => setSecs(Math.max(0, targetTs - Math.floor(Date.now() / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetTs]);
  return secs;
}

function fmtCountdown(secs: number) {
  if (secs <= 0) return "0s";
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function fmtSol(lamports: string) {
  return (Number(lamports) / 1e9).toFixed(4);
}

function fmtTokens(raw: string) {
  return (Number(raw) / 1e9).toLocaleString();
}

function estimatedPrice(depositTotal: string, tokenAllocation: string): string {
  const sol = Number(depositTotal) / 1e9;
  const tokens = Number(tokenAllocation) / 1e9;
  if (tokens === 0) return "—";
  const price = sol / tokens;
  if (price === 0) return "0 SOL";
  if (price < 0.000001) return price.toExponential(2) + " SOL";
  return price.toFixed(8) + " SOL";
}

export default function GenesisDetailPage() {
  const { mint } = useParams<{ mint: string }>();
  const { publicKey } = useWallet();
  const { rpc } = useNetwork();
  const [state, setState] = useState<GenesisState | null>(null);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositing, setDepositing] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [txMsg, setTxMsg] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  const depositSecsLeft = useCountdown(state?.depositEndTs);
  const claimSecsLeft = useCountdown(state?.claimEndTs);

  const fetchState = useCallback(async () => {
    const res = await fetch(`/api/genesis/state/${mint}`);
    const data = await res.json() as GenesisState;
    setState(data);
  }, [mint]);

  useEffect(() => {
    fetchState();
    const id = setInterval(fetchState, 15000);
    return () => clearInterval(id);
  }, [fetchState]);

  const doDeposit = async () => {
    if (!publicKey || !state?.launchPoolBucket || !depositAmount) return;
    setTxError(null); setTxMsg(null); setDepositing(true);
    try {
      const { getPasskeyKeypair } = await import("@/lib/passkey-wallet");
      const { keypair } = await getPasskeyKeypair();
      const { createUmiWithKeypair } = await import("@/lib/umi-passkey");
      const { depositLaunchPoolV2 } = await import("@metaplex-foundation/genesis");
      const { publicKey: umiPk } = await import("@metaplex-foundation/umi");

      const umi = await createUmiWithKeypair(rpc, keypair);
      const lamports = BigInt(Math.round(parseFloat(depositAmount) * 1e9));

      await depositLaunchPoolV2(umi, {
        genesisAccount: umiPk(state.genesisAccount),
        bucket: umiPk(state.launchPoolBucket),
        baseMint: umiPk(mint),
        amountQuoteToken: lamports,
      }).sendAndConfirm(umi);

      setTxMsg("Deposit confirmed!");
      setDepositAmount("");
      await fetchState();
    } catch (e: unknown) {
      setTxError(e instanceof Error ? e.message : String(e));
    } finally {
      setDepositing(false);
    }
  };

  const doClaim = async () => {
    if (!publicKey || !state?.launchPoolBucket) return;
    setTxError(null); setTxMsg(null); setClaiming(true);
    try {
      const { getPasskeyKeypair } = await import("@/lib/passkey-wallet");
      const { keypair } = await getPasskeyKeypair();
      const { createUmiWithKeypair } = await import("@/lib/umi-passkey");
      const { claimLaunchPoolV2 } = await import("@metaplex-foundation/genesis");
      const { publicKey: umiPk } = await import("@metaplex-foundation/umi");

      const umi = await createUmiWithKeypair(rpc, keypair);

      await claimLaunchPoolV2(umi, {
        genesisAccount: umiPk(state.genesisAccount),
        bucket: umiPk(state.launchPoolBucket),
        baseMint: umiPk(mint),
        recipient: umi.identity.publicKey,
      }).sendAndConfirm(umi);

      setTxMsg("Tokens claimed!");
      await fetchState();
    } catch (e: unknown) {
      setTxError(e instanceof Error ? e.message : String(e));
    } finally {
      setClaiming(false);
    }
  };

  const doTrigger = async () => {
    if (!publicKey || !state?.launchPoolBucket || !state?.unlockedBucket) return;
    setTxError(null); setTxMsg(null); setTriggering(true);
    try {
      const { getPasskeyKeypair } = await import("@/lib/passkey-wallet");
      const { keypair } = await getPasskeyKeypair();
      const { createUmiWithKeypair } = await import("@/lib/umi-passkey");
      const { triggerBehaviorsV2 } = await import("@metaplex-foundation/genesis");
      const { publicKey: umiPk } = await import("@metaplex-foundation/umi");

      const umi = await createUmiWithKeypair(rpc, keypair);

      await triggerBehaviorsV2(umi, {
        genesisAccount: umiPk(state.genesisAccount),
        primaryBucket: umiPk(state.launchPoolBucket),
        baseMint: umiPk(mint),
      }).addRemainingAccounts([
        { pubkey: umiPk(state.unlockedBucket), isSigner: false, isWritable: true },
      ]).sendAndConfirm(umi);

      setTxMsg("Behaviors triggered — SOL routed to treasury.");
      await fetchState();
    } catch (e: unknown) {
      setTxError(e instanceof Error ? e.message : String(e));
    } finally {
      setTriggering(false);
    }
  };

  if (!state) {
    return (
      <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <Spinner size={32} className="text-orange-400" />
        </main>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
        <Navbar />
        <main className="flex-1 flex items-center justify-center px-4">
          <div className="text-center space-y-3">
            <p className="text-red-400">{state.error}</p>
            <Link href="/token" className="text-sm text-gray-400 dark:text-white/40 hover:text-gray-600 dark:hover:text-white/60">← Back to Token</Link>
          </div>
        </main>
      </div>
    );
  }

  const phase = state.phase;
  const depositing_ = phase === "depositing";
  const transitioning = phase === "transitioning";
  const claiming_ = phase === "claiming";

  const totalDepositedSol = state.quoteTokenDepositTotal ? fmtSol(state.quoteTokenDepositTotal) : "0";
  const tokensAvailable = state.tokenAllocation ? fmtTokens(state.tokenAllocation) : "—";
  const price = state.quoteTokenDepositTotal && state.tokenAllocation
    ? estimatedPrice(state.quoteTokenDepositTotal, state.tokenAllocation)
    : "—";

  const PHASE_COLORS: Record<string, string> = {
    upcoming: "text-gray-400",
    depositing: "text-green-400",
    transitioning: "text-yellow-400",
    claiming: "text-orange-400",
    ended: "text-gray-400",
    unknown: "text-gray-400",
  };
  const PHASE_LABELS: Record<string, string> = {
    upcoming: "Upcoming",
    depositing: "Deposit open",
    transitioning: "Transitioning",
    claiming: "Claim open",
    ended: "Ended",
    unknown: "Loading",
  };

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col pb-20 sm:pb-0">
      <Navbar />
      <main className="flex-1 px-4 py-6 sm:px-6 max-w-2xl mx-auto w-full space-y-6">
        {/* Back */}
        <Link href="/token" className="inline-flex items-center gap-1 text-sm text-gray-400 dark:text-white/40 hover:text-gray-600 dark:hover:text-white/60 transition">
          <ArrowLeft size={14} /> Token
        </Link>

        {/* Header */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Coins size={20} className="text-orange-400" />
            <h1 className="text-xl font-bold truncate font-mono">{mint.slice(0, 8)}…{mint.slice(-8)}</h1>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/5 ${PHASE_COLORS[phase]}`}>
              {PHASE_LABELS[phase]}
            </span>
          </div>
          <p className="text-xs text-gray-400 dark:text-white/30 font-mono break-all">{mint}</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-black/5 dark:bg-white/5 rounded-2xl p-4 space-y-1">
            <p className="text-xs text-gray-500 dark:text-white/40 flex items-center gap-1"><Coins size={11} /> Total deposited</p>
            <p className="text-lg font-bold text-orange-400">{totalDepositedSol} SOL</p>
          </div>
          <div className="bg-black/5 dark:bg-white/5 rounded-2xl p-4 space-y-1">
            <p className="text-xs text-gray-500 dark:text-white/40 flex items-center gap-1"><Users size={11} /> Tokens</p>
            <p className="text-lg font-bold">{tokensAvailable}</p>
          </div>
          <div className="bg-black/5 dark:bg-white/5 rounded-2xl p-4 space-y-1">
            <p className="text-xs text-gray-500 dark:text-white/40 flex items-center gap-1"><Zap size={11} /> Est. price</p>
            <p className="text-sm font-bold font-mono">{price}</p>
          </div>
        </div>

        {/* Countdown */}
        {depositing_ && state.depositEndTs && (
          <div className="flex items-center gap-2 text-green-400">
            <Clock size={16} />
            <span className="text-sm">Deposit closes in <span className="font-mono font-bold">{fmtCountdown(depositSecsLeft)}</span></span>
          </div>
        )}
        {claiming_ && state.claimEndTs && (
          <div className="flex items-center gap-2 text-orange-400">
            <Clock size={16} />
            <span className="text-sm">Claim closes in <span className="font-mono font-bold">{fmtCountdown(claimSecsLeft)}</span></span>
          </div>
        )}

        {/* Deposit widget */}
        {depositing_ && (
          <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-5 space-y-3">
            <h2 className="font-semibold text-sm">Deposit SOL</h2>
            <div className="flex gap-2">
              <input
                type="number"
                min="0.001"
                step="0.001"
                placeholder="Amount (SOL)"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                className="flex-1 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-3 py-2.5 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-orange-400/50 transition text-sm font-mono"
              />
              <button
                onClick={doDeposit}
                disabled={depositing || !depositAmount || !publicKey}
                className="bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white font-semibold rounded-xl px-4 py-2.5 transition cursor-pointer disabled:cursor-not-allowed text-sm flex items-center gap-1.5"
              >
                {depositing ? <Spinner size={14} /> : null}
                Deposit
              </button>
            </div>
            {!publicKey && <p className="text-xs text-gray-400 dark:text-white/30">Connect a wallet to deposit.</p>}
          </div>
        )}

        {/* Trigger behaviors (transitioning — any user can call this) */}
        {transitioning && (
          <div className="bg-yellow-500/5 border border-yellow-400/20 rounded-2xl p-5 space-y-3">
            <h2 className="font-semibold text-sm text-yellow-400">Route raised SOL</h2>
            <p className="text-xs text-gray-500 dark:text-white/40">The deposit window has ended. Trigger on-chain behaviors to send raised SOL to the treasury before claiming opens.</p>
            <button
              onClick={doTrigger}
              disabled={triggering || !publicKey}
              className="bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black font-semibold rounded-xl px-4 py-2.5 transition cursor-pointer disabled:cursor-not-allowed text-sm flex items-center gap-1.5"
            >
              {triggering ? <Spinner size={14} /> : null}
              Trigger behaviors
            </button>
          </div>
        )}

        {/* Claim widget */}
        {claiming_ && (
          <div className="bg-orange-500/5 border border-orange-400/20 rounded-2xl p-5 space-y-3">
            <h2 className="font-semibold text-sm">Claim your tokens</h2>
            <p className="text-xs text-gray-500 dark:text-white/40">Your share of the launch pool is proportional to your deposit.</p>
            <button
              onClick={doClaim}
              disabled={claiming || !publicKey}
              className="bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white font-semibold rounded-xl px-4 py-2.5 transition cursor-pointer disabled:cursor-not-allowed text-sm flex items-center gap-1.5"
            >
              {claiming ? <Spinner size={14} /> : null}
              Claim tokens
            </button>
            {!publicKey && <p className="text-xs text-gray-400 dark:text-white/30">Connect a wallet to claim.</p>}
          </div>
        )}

        {/* Tx feedback */}
        {txMsg && <p className="text-green-400 text-sm">{txMsg}</p>}
        {txError && <p className="text-red-400 text-sm break-all">{txError}</p>}

        {/* MetaDAO governance */}
        <a
          href="https://metadao.fi"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full bg-green-500/5 hover:bg-green-500/10 border border-green-400/20 hover:border-green-400/40 text-green-500 dark:text-green-400 rounded-xl px-4 py-2.5 transition text-sm font-medium"
        >
          <Zap size={14} /> Govern on MetaDAO
        </a>

        {/* Tech details */}
        <div className="text-xs text-gray-400 dark:text-white/30 space-y-1 border-t border-black/5 dark:border-white/5 pt-4">
          <p>Genesis account: <span className="font-mono break-all">{state.genesisAccount}</span></p>
          {state.launchPoolBucket && <p>Launch pool: <span className="font-mono break-all">{state.launchPoolBucket}</span></p>}
          <p>Program: <span className="font-mono">GNS1S5J5AspKXgpjz6SvKL66kPaKWAhaGRhCqPRxii2B</span></p>
        </div>
      </main>
    </div>
  );
}
