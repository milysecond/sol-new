"use client";

import { useEffect, useState } from "react";
import { FlaskConical, Shield } from "lucide-react";
import { Spinner } from "@/components/spinner";
import { useNetwork } from "@/lib/network";

type RingRow = {
  programId: string;
  paused: boolean;
};

export function RingsPanel() {
  const { network, rpc, toggle } = useNetwork();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rings, setRings] = useState<RingRow[] | null>(null);

  const load = async () => {
    setBusy(true);
    setError(null);
    try {
      const zolana = await import("@heliuslabs/zolana");
      const client = await zolana.createZolanaClient({ solanaRpcUrl: rpc });
      const list = await zolana.listRegisteredRings(client);
      setRings(
        list.map((r) => ({
          programId: String(r.programId),
          paused: Boolean(r.paused),
        })),
      );
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
            public. Live on <strong>devnet</strong> while audits finish. SDK @heliuslabs/zolana.
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
                <Spinner size={16} /> Loading rings
              </span>
            ) : (
              "Refresh registered rings"
            )}
          </button>
          {error && (
            <p className="text-xs text-red-400 break-words">
              Rings SDK could not talk to this RPC yet. {error.slice(0, 240)}
            </p>
          )}
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
