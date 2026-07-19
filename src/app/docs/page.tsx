"use client";

import { useEffect, useState } from "react";
import { Navbar } from "@/components/navbar";
import { ExternalLink } from "lucide-react";

type Action = { id: string; label: string; sol: number; usd: number | null; note: string };
type Costs = { solUsd: number | null; priceSource: string | null; updatedAt: string; actions: Action[] };

export default function DocsPage() {
  const [costs, setCosts] = useState<Costs | null>(null);

  useEffect(() => {
    fetch("/api/costs", { cache: "no-store" })
      .then((r) => r.json() as Promise<Costs>)
      .then(setCosts)
      .catch(() => {});
  }, []);

  const fmtSol = (n: number) =>
    n === 0 ? "0" : n < 0.0001 ? n.toExponential(0).replace("e-", "e−") : n.toFixed(n < 0.01 ? 5 : 4);
  const fmtUsd = (n: number | null) =>
    n == null ? "—" : n === 0 ? "$0" : n < 0.01 ? `<$0.01` : `$${n.toFixed(2)}`;

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-3xl mx-auto px-6 py-10 space-y-10 text-sm text-gray-700 dark:text-white/70">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">sol.new — docs</h1>
          <p className="text-gray-500 dark:text-white/40">
            What it costs to use, what we store, and where things live.
          </p>
        </header>

        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Costs (mainnet)</h2>
            <span className="text-xs text-gray-400 dark:text-white/30">
              {costs?.solUsd != null
                ? `1 SOL = $${costs.solUsd.toFixed(2)} · ${costs.priceSource}`
                : "loading..."}
            </span>
          </div>
          <div className="overflow-x-auto rounded-xl border border-black/10 dark:border-white/10">
            <table className="w-full text-left">
              <thead className="bg-black/5 dark:bg-white/5 text-xs uppercase tracking-wide text-gray-500 dark:text-white/40">
                <tr>
                  <th className="px-4 py-2">Action</th>
                  <th className="px-4 py-2 text-right">SOL</th>
                  <th className="px-4 py-2 text-right">USD</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 dark:divide-white/5">
                {(costs?.actions ?? []).map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 dark:text-white">{a.label}</div>
                      <div className="text-xs text-gray-400 dark:text-white/30">{a.note}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs">{fmtSol(a.sol)}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs">{fmtUsd(a.usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400 dark:text-white/30">
            Live SOL price refreshed every 30s. Devnet actions are free aside from base tx fees.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Storage URLs</h2>
          <ul className="space-y-2">
            <li>
              <code className="text-xs">https://sol.new/metadata/&lt;id&gt;.json</code>
              <div className="text-xs text-gray-400 dark:text-white/30">Token / NFT metadata JSON. Stored in Turso, served direct, immutable cache 1y.</div>
            </li>
            <li>
              <code className="text-xs">https://sol.new/images/&lt;id&gt;.&lt;ext&gt;</code>
              <div className="text-xs text-gray-400 dark:text-white/30">Image bytes. Stored on Vercel Blob, streamed through this domain, immutable cache 1y.</div>
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">What we store</h2>
          <ul className="space-y-2 list-disc pl-5">
            <li><b>Wallet</b> — public key + (optional) WebAuthn credential id.</li>
            <li><b>Tokens / NFTs / Multisigs</b> — name, symbol, mint/pda, creator wallet.</li>
            <li><b>Metadata</b> — the raw JSON you uploaded.</li>
            <li><b>Images</b> — file ref + content-type + size on Vercel Blob.</li>
            <li><b>Ground keys</b> — vanity keypairs ("NEW…"); secret key returned on claim.</li>
          </ul>
          <p className="text-xs text-gray-400 dark:text-white/30">
            We never see or store your wallet's private key for passkey-derived wallets.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Compressed vs Standard NFT</h2>
          <ul className="space-y-2 list-disc pl-5">
            <li><b>Standard</b> — full Metaplex Token Metadata. ~0.02 SOL. Best for flagship pieces.</li>
            <li><b>Compressed</b> — Bubblegum cNFT minted via Helius. 0.001 SOL platform fee. Best for collections / drops.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Networks</h2>
          <ul className="space-y-2 list-disc pl-5">
            <li><b>Mainnet</b> — real SOL costs as in the table above.</li>
            <li><b>Devnet</b> — claim 0.1 SOL from the Get page; the footer shows the faucet wallet.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Endpoints</h2>
          <ul className="space-y-1 text-xs">
            <li><code>GET /api/costs</code> — live action costs (this page consumes it).</li>
            <li><code>GET /api/stats</code> — wallets, tokens, nfts counts.</li>
          </ul>
          <p className="text-xs text-gray-400 dark:text-white/30 flex items-center gap-1">
            All endpoints are public.
            <a href="/api/costs" target="_blank" className="hover:underline">Open /api/costs <ExternalLink className="w-3 h-3 inline" /></a>
          </p>
        </section>
      </main>
    </div>
  );
}
