"use client";

import { useEffect, useState } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { FlaskConical, Shield } from "lucide-react";
import { Spinner } from "@/components/spinner";
import { useNetwork } from "@/lib/network";

/** Shielded pool that registers Helius Rings (from @heliuslabs/zolana). */
const SHIELDED_POOL = "sppXZU59VoYodv9Accs4hHNTjYiuYmDFyFVjUjPxFsG";

type RingRow = { address: string };

export function RingsPanel() {
  const { network, rpc, toggle } = useNetwork();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rings, setRings] = useState<RingRow[] | null>(null);

  const load = async () => {
    setBusy(true);
    setError(null);
    try {
      const conn = new Connection(rpc, "confirmed");
      const pid = new PublicKey(SHIELDED_POOL);
      const accs = await conn.getProgramAccounts(pid, {
        dataSlice: { offset: 0, length: 0 },
      });
      setRings(accs.slice(0, 24).map((a) => ({ address: a.pubkey.toBase58() })));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setRings([]);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (network === "devnet") void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network, rpc]);

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <Shield className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-sm">Helius Rings</p>
          <p className="text-xs text-gray-500 dark:text-white/45 leading-relaxed">
            Confidential transfers on Solana. Amount and asset encrypted. Sender and recipient stay
            public. Devnet while audits finish. Pool {SHIELDED_POOL.slice(0, 8)}... SDK
            @heliuslabs/zolana (Node, not in this Worker).
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
          <button
            type="button"
            onClick={() => void load()}
            disabled={busy}
            className="w-full min-h-12 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-black font-semibold"
          >
            {busy ? (
              <span className="inline-flex items-center gap-2 justify-center">
                <Spinner size={16} /> Loading pool
              </span>
            ) : (
              "Refresh ring pool"
            )}
          </button>
          {error && <p className="text-xs text-red-400 break-words">{error.slice(0, 240)}</p>}
          {rings && rings.length === 0 && !error && (
            <p className="text-xs text-gray-400">No accounts on the shielded pool yet.</p>
          )}
          {rings && rings.length > 0 && (
            <ul className="space-y-2">
              {rings.map((r) => (
                <li
                  key={r.address}
                  className="rounded-xl border border-black/10 dark:border-white/10 px-3 py-2 text-xs font-mono break-all"
                >
                  <a href={`/address/${r.address}`} className="text-cyan-500 hover:underline">
                    {r.address}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <p className="text-[11px] text-gray-400 leading-relaxed">
        For live mainnet ZK (unlinkable send), use Privacy Cash on this page. Docs:{" "}
        <a
          href="https://www.helius.dev/docs/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          helius.dev/docs/privacy
        </a>
        .
      </p>
    </div>
  );
}
