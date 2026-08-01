"use client";

import { useEffect, useState } from "react";
import { Navbar } from "@/components/navbar";
import { ExternalLink } from "lucide-react";
import Link from "next/link";

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
            Costs, storage, gifts, short links, loan, and public APIs.
          </p>
          <p className="text-sm flex flex-wrap gap-x-3 gap-y-1">
            <Link href="/features" className="text-violet-500 hover:underline">
              Features →
            </Link>
            <Link href="/dir" className="text-violet-500 hover:underline">
              Directory →
            </Link>
            <a href="/llms.txt" className="text-violet-500 hover:underline">
              llms.txt →
            </a>
            <a href="/llms-full.txt" className="text-violet-500 hover:underline">
              llms-full.txt →
            </a>
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
            Live SOL price refreshed every 30s. Devnet is free aside from base tx fees. Custom short links are
            0.01 SOL. Loan rates are protocol APYs, not platform fees.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Gifts</h2>
          <p>
            Create at <Link href="/gift" className="text-violet-500 hover:underline">/gift</Link>. Claim at{" "}
            <code className="text-xs">/claim#&lt;secret&gt;</code>. The secret lives only in the URL fragment —
            we never store it.
          </p>
          <ol className="list-decimal pl-5 space-y-1 text-xs sm:text-sm">
            <li>
              <code>POST /api/gift/create</code> → unsigned funding tx + <code>claimUrl</code>
            </li>
            <li>Sign and send the transaction with your passkey wallet</li>
            <li>
              <code>POST /api/gift</code> to register status (public gift key only)
            </li>
            <li>Share the claim link privately (bearer secret)</li>
          </ol>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Short links</h2>
          <p>
            Creator: <Link href="/link" className="text-violet-500 hover:underline">/link</Link>. Canonical
            URL: <code className="text-xs">https://sol.new/link/&lt;code&gt;</code>. Legacy{" "}
            <code className="text-xs">/l/…</code> redirects with 308. Random codes free; custom codes 0.01 SOL
            (passkey or Solana Pay QR).
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Lend & borrow</h2>
          <p>
            <Link href="/loan" className="text-violet-500 hover:underline">/loan</Link> — supply for yield or
            borrow against collateral on mainnet. SOL is auto-wrapped to WSOL. Check balances before
            submitting. Protocol liquidation risk applies — not financial advice.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Usernames</h2>
          <p>
            Claim at{" "}
            <Link href="/creator/edit" className="text-violet-500 hover:underline">
              /creator/edit
            </Link>
            . Public profile: <code className="text-xs">/u/&lt;name&gt;</code>. One unique handle per wallet.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Storage URLs</h2>
          <ul className="space-y-2">
            <li>
              <code className="text-xs">https://sol.new/metadata/&lt;id&gt;.json</code>
              <div className="text-xs text-gray-400 dark:text-white/30">
                Token / NFT metadata JSON. Immutable cache.
              </div>
            </li>
            <li>
              <code className="text-xs">https://sol.new/images/&lt;id&gt;.&lt;ext&gt;</code>
              <div className="text-xs text-gray-400 dark:text-white/30">
                Image bytes (R2 / blob), immutable cache.
              </div>
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">What we store</h2>
          <ul className="space-y-2 list-disc pl-5">
            <li>
              <b>Wallet</b> — public key + (optional) WebAuthn credential id.
            </li>
            <li>
              <b>Tokens / NFTs / Multisigs</b> — name, symbol, mint/pda, creator wallet.
            </li>
            <li>
              <b>Gifts</b> — gift public key, sender, amount, status (never the claim secret).
            </li>
            <li>
              <b>Short links</b> — code, target URL, clicks, payment sig for custom codes.
            </li>
            <li>
              <b>Profiles</b> — bio, socials, optional unique username.
            </li>
            <li>
              <b>Metadata / images</b> — uploaded JSON and file refs.
            </li>
          </ul>
          <p className="text-xs text-gray-400 dark:text-white/30">
            We never see or store the private key for passkey-derived wallets.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Compressed vs Standard NFT</h2>
          <ul className="space-y-2 list-disc pl-5">
            <li>
              <b>Standard</b> — full Metaplex Token Metadata. ~0.02 SOL. Flagship pieces.
            </li>
            <li>
              <b>Compressed</b> — Bubblegum cNFT. ~0.001 SOL platform fee. Collections / drops.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Networks</h2>
          <ul className="space-y-2 list-disc pl-5">
            <li>
              <b>Mainnet (live)</b> — real SOL; costs as above. Loan markets require live.
            </li>
            <li>
              <b>Devnet</b> — faucet via Get; most create flows work with test SOL.
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Endpoints</h2>
          <ul className="space-y-1.5 text-xs font-mono">
            <li>GET /api/costs — live action costs</li>
            <li>GET /api/stats — aggregate counts</li>
            <li>POST /api/gift/create — build gift funding tx + claim secret</li>
            <li>POST /api/gift — register gift · GET ?pk= · PATCH claim</li>
            <li>GET|POST /api/loan — lend / borrow</li>
            <li>GET|POST /api/link — short links</li>
            <li>GET|POST /api/creator/profile — profile + username</li>
            <li>POST /api/draw · GET /api/draw/[id] — fair draw</li>
            <li>GET /api/receipt?signature= — receipt parse</li>
          </ul>
          <p className="text-xs text-gray-400 dark:text-white/30 flex flex-wrap items-center gap-2 pt-1">
            <a href="/api/costs" target="_blank" rel="noreferrer" className="hover:underline">
              /api/costs <ExternalLink className="w-3 h-3 inline" />
            </a>
            <a
              href="/api/gift/create"
              target="_blank"
              rel="noreferrer"
              className="hover:underline"
            >
              /api/gift/create <ExternalLink className="w-3 h-3 inline" />
            </a>
            <a href="/llms-full.txt" className="hover:underline">
              llms-full.txt <ExternalLink className="w-3 h-3 inline" />
            </a>
          </p>
        </section>
      </main>
    </div>
  );
}
