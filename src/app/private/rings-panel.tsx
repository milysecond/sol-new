"use client";

import { useEffect, useMemo, useState } from "react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { FlaskConical, Shield } from "lucide-react";
import { Spinner } from "@/components/spinner";
import { useNetwork } from "@/lib/network";
import { useWallet } from "@/lib/wallet-context";
import { getPasskeyKeypair } from "@/lib/passkey-wallet";
import { friendlyError } from "@/lib/friendly-errors";
import { formatAmountInput } from "@/lib/wallet-tokens";
import { depositSolToRing, listRingPrograms } from "@/lib/helius-rings";

const SOL_FEE_RESERVE = 0.02;

export function RingsPanel() {
  const { network, rpc, toggle } = useNetwork();
  const { publicKey, balance } = useWallet();
  const [busy, setBusy] = useState<"idle" | "list" | "deposit">("idle");
  const [error, setError] = useState<string | null>(null);
  const [sig, setSig] = useState<string | null>(null);
  const [rings, setRings] = useState<{ programId: string; paused: boolean }[] | null>(null);
  const [amount, setAmount] = useState("");

  const maxUi = useMemo(() => {
    const sol = typeof balance === "number" ? balance : 0;
    return Math.max(0, sol - SOL_FEE_RESERVE);
  }, [balance]);

  const load = async () => {
    setBusy("list");
    setError(null);
    try {
      const list = await listRingPrograms(rpc);
      setRings(list);
    } catch (e) {
      setError(friendlyError(e, "Could not list rings."));
      setRings([]);
    } finally {
      setBusy("idle");
    }
  };

  useEffect(() => {
    if (network === "devnet") void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network, rpc]);

  const onDeposit = async () => {
    if (!publicKey || !amount) return;
    setBusy("deposit");
    setError(null);
    setSig(null);
    try {
      const ui = Number(amount);
      if (!Number.isFinite(ui) || ui <= 0) throw new Error("Amount must be greater than 0");
      if (ui > maxUi) throw new Error("Amount is more than you can spend (keep 0.02 SOL for fees)");
      const { keypair } = await getPasskeyKeypair(publicKey);
      const lamports = BigInt(Math.round(ui * LAMPORTS_PER_SOL));
      const signature = await depositSolToRing({ rpc, keypair, amountLamports: lamports });
      setSig(signature);
      setAmount("");
    } catch (e) {
      setError(friendlyError(e, "Ring deposit failed."));
    } finally {
      setBusy("idle");
    }
  };

  const working = busy !== "idle";

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <Shield className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-sm">Helius Rings</p>
          <p className="text-xs text-gray-500 dark:text-white/45 leading-relaxed">
            Confidential SOL deposit on devnet. Amount encrypted. Sender stays public. Passkey signs.
          </p>
        </div>
      </div>

      {network !== "devnet" && (
        <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 space-y-2 text-sm">
          <p className="font-semibold flex items-center gap-2 text-amber-900 dark:text-amber-100">
            <FlaskConical className="w-4 h-4" /> Rings are devnet
          </p>
          <button
            type="button"
            onClick={() => toggle()}
            className="inline-flex min-h-12 items-center justify-center rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-sm font-semibold px-3.5 py-2"
          >
            Switch to test
          </button>
        </div>
      )}

      {network === "devnet" && (
        <>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs text-gray-400">Amount (SOL)</p>
              <p className="text-xs text-gray-400 font-mono">{maxUi.toFixed(4)} max</p>
            </div>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={maxUi || undefined}
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.1"
              disabled={working}
              className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3"
            />
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                disabled={working || maxUi <= 0}
                onClick={() => setAmount(formatAmountInput(maxUi, 9))}
                className="flex-1 min-h-12 rounded-xl border border-black/10 dark:border-white/10 text-sm font-semibold disabled:opacity-40"
              >
                Max
              </button>
              <button
                type="button"
                disabled={working || !amount}
                onClick={() => setAmount("")}
                className="flex-1 min-h-12 rounded-xl border border-black/10 dark:border-white/10 text-sm font-semibold disabled:opacity-40"
              >
                Clear
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void onDeposit()}
            disabled={working || !amount || !publicKey}
            className="w-full min-h-12 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-black font-semibold"
          >
            {busy === "deposit" ? (
              <span className="inline-flex items-center gap-2 justify-center">
                <Spinner size={16} /> Depositing
              </span>
            ) : (
              "Deposit to ring"
            )}
          </button>

          {sig && (
            <a href={`/receipt/${sig}`} className="block text-sm text-cyan-500 hover:underline">
              Deposited. Open receipt
            </a>
          )}

          <button
            type="button"
            onClick={() => void load()}
            disabled={working}
            className="w-full min-h-12 rounded-xl border border-black/10 dark:border-white/10 text-sm font-semibold disabled:opacity-40"
          >
            {busy === "list" ? "Loading rings..." : "Refresh rings"}
          </button>
          {rings && rings.length === 0 && !error && (
            <p className="text-xs text-gray-400">No rings registered on this pool yet.</p>
          )}
          {rings && rings.length > 0 && (
            <ul className="space-y-2">
              {rings.map((r) => (
                <li
                  key={r.programId}
                  className="rounded-xl border border-black/10 dark:border-white/10 px-3 py-2 text-xs font-mono break-all"
                >
                  {r.programId}
                  {r.paused ? " (paused)" : ""}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {error && <p className="text-xs text-red-400 break-words">{error}</p>}

      <p className="text-[11px] text-gray-400 leading-relaxed">
        Devnet only. Audits in progress. Mainnet ZK send is Privacy Cash on this page.
      </p>
    </div>
  );
}
