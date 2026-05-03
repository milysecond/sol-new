"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Connection, PublicKey } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";
import { Navbar } from "@/components/navbar";
import { PageTransition } from "@/components/page-transition";
import { Spinner } from "@/components/spinner";
import { useNetwork } from "@/lib/network";
import { useWallet } from "@/lib/wallet-context";
import {
  ShieldCheck,
  ExternalLink,
  Copy,
  Check,
  ArrowLeft,
  Users,
  KeyRound,
} from "lucide-react";

type MemberView = {
  key: string;
  mask: number;
  permissions: string[];
};

type MultisigView = {
  address: string;
  vault: string;
  threshold: number;
  members: MemberView[];
  transactionIndex: number;
  staleTransactionIndex: number;
  configAuthority: string;
  timeLock: number;
  rentCollector: string | null;
};

const PERM_FLAGS: { mask: number; label: string }[] = [
  { mask: 1, label: "Initiate" },
  { mask: 2, label: "Vote" },
  { mask: 4, label: "Execute" },
];

function decodePermissions(mask: number): string[] {
  if (mask === 7) return ["All"];
  return PERM_FLAGS.filter((p) => (mask & p.mask) === p.mask).map((p) => p.label);
}

const short = (s: string) => `${s.slice(0, 4)}…${s.slice(-4)}`;

function CopyButton({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(value);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className="text-gray-400 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/80 transition cursor-pointer"
      title="Copy"
    >
      {done ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

export default function MultisigDetailPage() {
  const params = useParams<{ address: string }>();
  const { rpc, network } = useNetwork();
  const { publicKey } = useWallet();
  const [view, setView] = useState<MultisigView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setView(null);

    (async () => {
      try {
        const addr = params.address;
        let multisigPda: PublicKey;
        try {
          multisigPda = new PublicKey(addr);
        } catch {
          throw new Error("Invalid Solana address");
        }

        const connection = new Connection(rpc, "confirmed");
        const ms = await multisig.accounts.Multisig.fromAccountAddress(connection, multisigPda);
        const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 });

        if (cancelled) return;

        setView({
          address: multisigPda.toBase58(),
          vault: vaultPda.toBase58(),
          threshold: ms.threshold,
          members: ms.members.map((m) => {
            const mask = (m.permissions as { mask: number }).mask ?? 0;
            return { key: m.key.toBase58(), mask, permissions: decodePermissions(mask) };
          }),
          transactionIndex: Number(ms.transactionIndex.toString()),
          staleTransactionIndex: Number(ms.staleTransactionIndex.toString()),
          configAuthority: ms.configAuthority.toBase58(),
          timeLock: ms.timeLock,
          rentCollector: ms.rentCollector ? ms.rentCollector.toBase58() : null,
        });
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load multisig");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [params.address, rpc]);

  const cluster = network === "devnet" ? "?cluster=devnet" : "";
  const explorer = (a: string) => `https://solscan.io/account/${a}${cluster}`;
  const isMember = view?.members.some((m) => publicKey && m.key === publicKey);

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      <Navbar />
      <main className="flex-1 px-4 sm:px-6 py-6">
        <PageTransition>
          <div className="max-w-3xl mx-auto space-y-5">
            <Link
              href="/multisig"
              className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to multisig
            </Link>

            {loading && (
              <div className="flex items-center justify-center py-20">
                <Spinner size={24} className="text-fuchsia-400" />
              </div>
            )}

            {!loading && error && (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/5 px-5 py-8 text-center space-y-3">
                <p className="text-red-400 font-medium">Couldn't load this multisig</p>
                <p className="text-xs text-gray-500 dark:text-white/40 break-all font-mono">{params.address}</p>
                <p className="text-xs text-gray-500 dark:text-white/40">{error}</p>
                <p className="text-xs text-gray-400 dark:text-white/30">
                  This address might not be a Squads v4 multisig on {network}.
                </p>
              </div>
            )}

            {!loading && view && (
              <>
                <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] px-5 py-5 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-fuchsia-500/15 flex items-center justify-center shrink-0">
                      <ShieldCheck className="w-6 h-6 text-fuchsia-400" />
                    </div>
                    <div className="min-w-0">
                      <h1 className="text-xl font-bold tracking-tight">Multisig</h1>
                      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-white/40 font-mono">
                        <span className="truncate">{view.address}</span>
                        <CopyButton value={view.address} />
                      </div>
                    </div>
                    {isMember && (
                      <span className="ml-auto px-2 py-0.5 text-[10px] uppercase tracking-wider bg-fuchsia-500/15 text-fuchsia-400 rounded-md">
                        you're a member
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-3 pt-2">
                    <Stat
                      icon={<Users className="w-3.5 h-3.5" />}
                      label="Threshold"
                      value={`${view.threshold} of ${view.members.length}`}
                    />
                    <Stat
                      icon={<KeyRound className="w-3.5 h-3.5" />}
                      label="Members"
                      value={view.members.length.toString()}
                    />
                    <Stat
                      icon={<ShieldCheck className="w-3.5 h-3.5" />}
                      label="Tx index"
                      value={view.transactionIndex.toString()}
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-black/10 dark:border-white/10 overflow-hidden">
                  <div className="px-5 py-3 bg-black/[0.03] dark:bg-white/[0.03] text-xs uppercase tracking-wider text-gray-500 dark:text-white/40 font-medium">
                    Vault & meta
                  </div>
                  <Field label="Vault (default)" value={view.vault} explorer={explorer(view.vault)} />
                  <Field label="Config authority" value={view.configAuthority} explorer={explorer(view.configAuthority)} />
                  {view.rentCollector && (
                    <Field label="Rent collector" value={view.rentCollector} explorer={explorer(view.rentCollector)} />
                  )}
                  <Field label="Time lock (s)" value={view.timeLock.toString()} />
                  <Field label="Stale tx index" value={view.staleTransactionIndex.toString()} />
                </div>

                <div className="rounded-2xl border border-black/10 dark:border-white/10 overflow-hidden">
                  <div className="px-5 py-3 bg-black/[0.03] dark:bg-white/[0.03] flex items-center justify-between">
                    <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-white/40 font-medium">
                      Members
                    </span>
                    <span className="text-xs text-gray-500 dark:text-white/40">
                      {view.members.length} · need {view.threshold} to approve
                    </span>
                  </div>
                  <div className="divide-y divide-black/5 dark:divide-white/5">
                    {view.members.map((m) => (
                      <div key={m.key} className="flex items-center gap-3 px-5 py-3">
                        <div className="w-8 h-8 rounded-full bg-fuchsia-500/10 flex items-center justify-center shrink-0">
                          <KeyRound className="w-4 h-4 text-fuchsia-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm truncate">{m.key}</span>
                            <CopyButton value={m.key} />
                            {publicKey === m.key && (
                              <span className="text-[10px] uppercase tracking-wider bg-fuchsia-500/15 text-fuchsia-400 rounded px-1.5 py-0.5 shrink-0">
                                you
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-400 dark:text-white/40 mt-0.5">
                            {m.permissions.length === 0 ? "No permissions" : m.permissions.join(" · ")}
                          </div>
                        </div>
                        <a
                          href={explorer(m.key)}
                          target="_blank"
                          className="text-gray-400 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/80 transition shrink-0"
                          title="View on Solscan"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <a
                    href={`https://app.squads.so/squads/${view.address}/home`}
                    target="_blank"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-fuchsia-500 hover:bg-fuchsia-400 text-white text-sm font-semibold transition"
                  >
                    Open in Squads <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <a
                    href={explorer(view.address)}
                    target="_blank"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-gray-700 dark:text-white/70 hover:text-gray-900 dark:hover:text-white text-sm transition"
                  >
                    View on Solscan <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </>
            )}
          </div>
        </PageTransition>
      </main>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-black/[0.03] dark:bg-white/[0.03] px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-gray-400 dark:text-white/30">
        {icon} {label}
      </div>
      <div className="text-lg font-semibold mt-0.5 tabular-nums">{value}</div>
    </div>
  );
}

function Field({ label, value, explorer }: { label: string; value: string; explorer?: string }) {
  return (
    <div className="flex items-center gap-3 px-5 py-3 border-t border-black/5 dark:border-white/5 first:border-t-0">
      <div className="text-xs text-gray-500 dark:text-white/40 w-32 shrink-0">{label}</div>
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className="font-mono text-xs sm:text-sm truncate">{value}</span>
        <CopyButton value={value} />
      </div>
      {explorer && (
        <a
          href={explorer}
          target="_blank"
          className="text-gray-400 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/80 transition shrink-0"
          title="View on Solscan"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
    </div>
  );
}
