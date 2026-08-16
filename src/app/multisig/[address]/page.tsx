"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import { Connection, PublicKey } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";
import { Navbar } from "@/components/navbar";
import { PageTransition } from "@/components/page-transition";
import { Spinner } from "@/components/spinner";
import { useNetwork, RPC, MAINNET_RPC_POOL } from "@/lib/network";
import { useWallet } from "@/lib/wallet-context";
import {
  ShieldCheck,
  ExternalLink,
  Copy,
  Check,
  ArrowLeft,
  Users,
  KeyRound,
  UserPlus,
  X,
  Settings,
  Wallet as WalletIcon,
  Play,
  ThumbsUp,
} from "lucide-react";
import { getPasskeyKeypair } from "@/lib/passkey-wallet";

type MemberView = {
  key: string;
  mask: number;
  permissions: string[];
};

type ProposalStatusKind =
  | "Draft"
  | "Active"
  | "Approved"
  | "Executing"
  | "Executed"
  | "Cancelled"
  | "Rejected";

type ProposalRow = {
  idx: number;
  status: ProposalStatusKind;
  approved: string[];
  rejected: string[];
  cancelled: string[];
  description: string;
};

type Proposals = { config: ProposalRow[]; balance: ProposalRow[] };

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
  foundOnNetwork: "mainnet" | "devnet";
};

/** Paid mainnet only — never free public Solana RPC. */
const FALLBACK_RPC: Record<"mainnet" | "devnet", string> = {
  mainnet: MAINNET_RPC_POOL[1] || MAINNET_RPC_POOL[0],
  devnet: RPC.devnet,
};

function describeConfigAction(action: { __kind?: string } & Record<string, unknown> | undefined): string {
  if (!action || !action.__kind) return "Config change";
  const a = action as { __kind: string } & Record<string, unknown>;
  switch (a.__kind) {
    case "AddMember": {
      const m = a.newMember as { key: PublicKey } | undefined;
      const k = m?.key?.toBase58?.();
      return k ? `Add member ${k.slice(0, 4)}…${k.slice(-4)}` : "Add member";
    }
    case "RemoveMember": {
      const k = (a.oldMember as PublicKey | undefined)?.toBase58?.();
      return k ? `Remove member ${k.slice(0, 4)}…${k.slice(-4)}` : "Remove member";
    }
    case "ChangeThreshold":
      return `Change threshold to ${a.newThreshold ?? "?"}`;
    case "SetTimeLock":
      return `Set time lock to ${a.newTimeLock ?? "?"}s`;
    case "SetRentCollector":
      return "Update rent collector";
    case "AddSpendingLimit":
      return "Add spending limit";
    case "RemoveSpendingLimit":
      return "Remove spending limit";
    default:
      return a.__kind;
  }
}

function StatusBadge({ status }: { status: ProposalStatusKind }) {
  const map: Record<ProposalStatusKind, string> = {
    Draft: "bg-gray-500/15 text-gray-500",
    Active: "bg-blue-500/15 text-blue-500",
    Approved: "bg-green-500/15 text-green-500",
    Executing: "bg-yellow-500/15 text-yellow-500",
    Executed: "bg-emerald-500/15 text-emerald-500",
    Cancelled: "bg-gray-500/15 text-gray-500",
    Rejected: "bg-red-500/15 text-red-500",
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider ${map[status] || "bg-gray-500/15 text-gray-500"}`}>
      {status}
    </span>
  );
}

async function tryLoadMultisig(
  rpcUrl: string,
  networkName: "mainnet" | "devnet",
  multisigPda: PublicKey
) {
  const conn = new Connection(rpcUrl, "confirmed");
  const info = await conn.getAccountInfo(multisigPda);
  if (!info) return { ok: false as const, reason: "missing" as const, networkName };
  if (!info.owner.equals(multisig.PROGRAM_ID)) {
    return {
      ok: false as const,
      reason: "wrong-owner" as const,
      owner: info.owner.toBase58(),
      networkName,
    };
  }
  const ms = await multisig.accounts.Multisig.fromAccountAddress(conn, multisigPda);
  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 });
  return { ok: true as const, ms, vaultPda, networkName };
}

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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { rpc, network } = useNetwork();
  const { publicKey } = useWallet();
  const [view, setView] = useState<MultisigView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);

  // Modal state — shared by Add Member and Change Threshold proposal flows
  const [modal, setModal] = useState<null | "add-member" | "change-threshold">(null);
  const [newMemberAddr, setNewMemberAddr] = useState("");
  const [newThreshold, setNewThreshold] = useState<number>(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  // Transactions tabs — tab state is mirrored to ?tab=ledger so the URL is
  // shareable / refresh-stable
  const [proposals, setProposals] = useState<Proposals>({ config: [], balance: [] });
  const [proposalsLoading, setProposalsLoading] = useState(false);
  const tabParam = searchParams.get("tab");
  const activeTab: "config" | "balance" = tabParam === "ledger" ? "balance" : "config";
  const setActiveTab = (next: "config" | "balance") => {
    const qp = new URLSearchParams(searchParams);
    if (next === "config") qp.delete("tab");
    else qp.set("tab", "ledger");
    const qs = qp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const [txAction, setTxAction] = useState<{ idx: number; kind: "approve" | "execute" } | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

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

        // Try the active network first; if not there, fall back to the other
        // network. Multisigs created on devnet won't appear under mainnet RPC
        // and vice-versa, and the user shouldn't have to guess.
        const otherNetwork = network === "mainnet" ? "devnet" : "mainnet";
        const primary = await tryLoadMultisig(rpc, network, multisigPda);
        let result = primary;
        if (!primary.ok && primary.reason === "missing") {
          const fallback = await tryLoadMultisig(FALLBACK_RPC[otherNetwork], otherNetwork, multisigPda);
          if (fallback.ok) result = fallback;
        }

        if (cancelled) return;

        if (!result.ok) {
          if (result.reason === "missing") {
            throw new Error(
              `No account at this address on mainnet or devnet. Check the address.`
            );
          }
          // wrong-owner — older Squads variants store data under different
          // programs (often SystemProgram for the legacy 'Smart Account'
          // family). Either way, this viewer only renders the current
          // Squads multisig format. Send the user over to the Squads app.
          throw new Error(
            "This multisig isn't supported here yet. Open it in the Squads app to view its members and transactions."
          );
        }

        const { ms, vaultPda, networkName } = result;
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
          foundOnNetwork: networkName,
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
  }, [params.address, rpc, network, refreshTick]);

  // Load proposals + actions for this multisig
  useEffect(() => {
    if (!view) return;
    let cancelled = false;
    setProposalsLoading(true);
    (async () => {
      const targetNet = view.foundOnNetwork;
      const targetRpc = targetNet === network ? rpc : FALLBACK_RPC[targetNet];
      const conn = new Connection(targetRpc, "confirmed");
      const multisigPda = new PublicKey(view.address);

      const start = Math.max(1, view.staleTransactionIndex + 1);
      const end = view.transactionIndex;
      const indexes: number[] = [];
      for (let i = end; i >= start && i > end - 50; i--) indexes.push(i);

      const config: ProposalRow[] = [];
      const balance: ProposalRow[] = [];

      await Promise.all(
        indexes.map(async (idx) => {
          const txIdx = BigInt(idx);
          try {
            const [proposalPda] = multisig.getProposalPda({ multisigPda, transactionIndex: txIdx });
            const proposal = await multisig.accounts.Proposal.fromAccountAddress(conn, proposalPda).catch(() => null);
            if (!proposal) return;

            const [txPda] = multisig.getTransactionPda({ multisigPda, index: txIdx });

            const status = (proposal.status as { __kind: ProposalStatusKind }).__kind;
            const approved = proposal.approved.map((p) => p.toBase58());
            const rejected = proposal.rejected.map((p) => p.toBase58());
            const cancelled = proposal.cancelled.map((p) => p.toBase58());

            // Try config transaction first
            const cfg = await multisig.accounts.ConfigTransaction.fromAccountAddress(conn, txPda).catch(() => null);
            if (cfg) {
              const action = cfg.actions[0] as { __kind?: string } | undefined;
              const description = describeConfigAction(action);
              config.push({ idx, status, approved, rejected, cancelled, description });
              return;
            }

            // Otherwise try vault transaction
            const vault = await multisig.accounts.VaultTransaction.fromAccountAddress(conn, txPda).catch(() => null);
            if (vault) {
              balance.push({
                idx,
                status,
                approved,
                rejected,
                cancelled,
                description: `Vault transaction · ${vault.message.instructions.length} instruction${vault.message.instructions.length === 1 ? "" : "s"}`,
              });
              return;
            }

            // Unknown type (e.g. Batch) — surface in Ledger so it's not silently
            // hidden. Better to show 'Other transaction' than to lose it.
            const info = await conn.getAccountInfo(txPda).catch(() => null);
            if (info) {
              balance.push({
                idx,
                status,
                approved,
                rejected,
                cancelled,
                description: `Other transaction (${info.data.length} bytes)`,
              });
            }
          } catch {
            // ignore — row likely missing or unreadable
          }
        })
      );

      if (cancelled) return;
      config.sort((a, b) => b.idx - a.idx);
      balance.sort((a, b) => b.idx - a.idx);
      setProposals({ config, balance });
      setProposalsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [view, refreshTick, rpc, network]);

  const approveProposal = async (idx: number) => {
    if (!view) return;
    setTxError(null);
    setTxAction({ idx, kind: "approve" });
    try {
      const targetNet = view.foundOnNetwork;
      const targetRpc = targetNet === network ? rpc : FALLBACK_RPC[targetNet];
      const conn = new Connection(targetRpc, "confirmed");
      const { keypair } = await getPasskeyKeypair();
      await multisig.rpc.proposalApprove({
        connection: conn,
        feePayer: keypair,
        member: keypair,
        multisigPda: new PublicKey(view.address),
        transactionIndex: BigInt(idx),
      });
      setRefreshTick((n) => n + 1);
    } catch (e: unknown) {
      setTxError(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setTxAction(null);
    }
  };

  const executeProposal = async (idx: number, kind: "config" | "balance") => {
    if (!view) return;
    setTxError(null);
    setTxAction({ idx, kind: "execute" });
    try {
      const targetNet = view.foundOnNetwork;
      const targetRpc = targetNet === network ? rpc : FALLBACK_RPC[targetNet];
      const conn = new Connection(targetRpc, "confirmed");
      const { keypair } = await getPasskeyKeypair();
      const multisigPda = new PublicKey(view.address);
      const transactionIndex = BigInt(idx);
      if (kind === "config") {
        await multisig.rpc.configTransactionExecute({
          connection: conn,
          feePayer: keypair,
          multisigPda,
          transactionIndex,
          member: keypair,
          rentPayer: keypair,
        });
      } else {
        await multisig.rpc.vaultTransactionExecute({
          connection: conn,
          feePayer: keypair,
          multisigPda,
          transactionIndex,
          member: keypair.publicKey,
          signers: [keypair],
        });
      }
      setRefreshTick((n) => n + 1);
    } catch (e: unknown) {
      setTxError(e instanceof Error ? e.message : "Execute failed");
    } finally {
      setTxAction(null);
    }
  };

  const submitProposal = async (
    actions: Array<{ __kind: string } & Record<string, unknown>>
  ) => {
    if (!view) return;
    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);
    try {
      const targetNet = view.foundOnNetwork;
      const targetRpc = targetNet === network ? rpc : FALLBACK_RPC[targetNet];
      const conn = new Connection(targetRpc, "confirmed");
      const { keypair } = await getPasskeyKeypair();
      const multisigPda = new PublicKey(view.address);
      const txIndex = BigInt(view.transactionIndex) + BigInt(1);

      // 1. config transaction with the proposed action
      await multisig.rpc.configTransactionCreate({
        connection: conn,
        feePayer: keypair,
        creator: keypair.publicKey,
        multisigPda,
        transactionIndex: txIndex,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        actions: actions as any,
      });
      // 2. real proposal so members can vote
      await multisig.rpc.proposalCreate({
        connection: conn,
        feePayer: keypair,
        creator: keypair,
        multisigPda,
        transactionIndex: txIndex,
      });
      // 3. creator's auto-approval
      await multisig.rpc.proposalApprove({
        connection: conn,
        feePayer: keypair,
        member: keypair,
        multisigPda,
        transactionIndex: txIndex,
      });

      const remaining = Math.max(0, view.threshold - 1);
      setSubmitSuccess(
        remaining === 0
          ? "Proposal submitted and threshold reached. Anyone can now execute."
          : `Proposal submitted with your approval. ${remaining} more approval${remaining === 1 ? "" : "s"} needed.`
      );
      setRefreshTick((n) => n + 1);
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddMember = async () => {
    if (!view) return;
    let newMemberPk: PublicKey;
    try {
      newMemberPk = new PublicKey(newMemberAddr.trim());
    } catch {
      setSubmitError("Invalid Solana address");
      return;
    }
    if (view.members.some((m) => m.key === newMemberPk.toBase58())) {
      setSubmitError("This wallet is already a member");
      return;
    }
    await submitProposal([
      {
        __kind: "AddMember",
        newMember: { key: newMemberPk, permissions: { mask: 7 } },
      },
    ]);
    setNewMemberAddr("");
  };

  const handleChangeThreshold = async () => {
    if (!view) return;
    if (newThreshold < 1 || newThreshold > view.members.length) {
      setSubmitError(`Threshold must be between 1 and ${view.members.length}`);
      return;
    }
    if (newThreshold === view.threshold) {
      setSubmitError("That's already the current threshold");
      return;
    }
    await submitProposal([
      { __kind: "ChangeThreshold", newThreshold },
    ]);
  };

  const networkOfRecord = view?.foundOnNetwork ?? network;
  const cluster = networkOfRecord === "devnet" ? "?cluster=devnet" : "";
  const explorer = (a: string) => `/address/${a}`;
  const isMember = view?.members.some((m) => publicKey && m.key === publicKey);
  const networkMismatch = view && view.foundOnNetwork !== network;

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
              <div className="rounded-2xl border border-red-500/20 bg-red-500/5 px-5 py-8 text-center space-y-4">
                <p className="text-red-400 font-medium">Couldn't load this multisig</p>
                <p className="text-xs text-gray-500 dark:text-white/40 break-all font-mono">{params.address}</p>
                <p className="text-xs text-gray-500 dark:text-white/40 max-w-md mx-auto">{error}</p>
                <a
                  href={`https://app.squads.so/squads/${params.address}/home`}
                  target="_blank"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-fuchsia-500 hover:bg-fuchsia-400 text-white text-sm font-semibold transition"
                >
                  Open in Squads app <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}

            {!loading && view && (
              <>
                {networkMismatch && (
                  <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 px-4 py-3 text-sm text-yellow-600 dark:text-yellow-400">
                    This multisig lives on <b>{view.foundOnNetwork}</b>. You're currently on <b>{network}</b>. Toggle the network pill in the navbar to interact with it.
                  </div>
                )}
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
                    <button
                      type="button"
                      onClick={() => {
                        if (!isMember) return;
                        setNewThreshold(view.threshold);
                        setSubmitError(null);
                        setSubmitSuccess(null);
                        setModal("change-threshold");
                      }}
                      disabled={!isMember}
                      className={`text-left rounded-xl bg-black/[0.03] dark:bg-white/[0.03] px-3 py-2 transition ${
                        isMember
                          ? "hover:bg-fuchsia-500/10 cursor-pointer"
                          : "cursor-default"
                      }`}
                      title={isMember ? "Change threshold" : "Only members can propose changes"}
                    >
                      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-gray-400 dark:text-white/30">
                        <Users className="w-3.5 h-3.5" /> Threshold
                      </div>
                      <div className="text-lg font-semibold mt-0.5 tabular-nums">
                        {view.threshold} of {view.members.length}
                      </div>
                    </button>
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
                  <Field label="Time lock (s)" value={view.timeLock.toString()} copyable={false} />
                  <Field label="Stale tx index" value={view.staleTransactionIndex.toString()} copyable={false} />
                </div>

                <div className="rounded-2xl border border-black/10 dark:border-white/10 overflow-hidden">
                  <div className="px-5 py-3 bg-black/[0.03] dark:bg-white/[0.03] flex items-center justify-between">
                    <span className="text-xs uppercase tracking-wider text-gray-500 dark:text-white/40 font-medium">
                      Members
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-500 dark:text-white/40">
                        {view.members.length} · need {view.threshold} to approve
                      </span>
                      {isMember && (
                        <button
                          onClick={() => {
                            setModal("add-member");
                            setSubmitError(null);
                            setSubmitSuccess(null);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-fuchsia-500 hover:bg-fuchsia-400 text-white text-xs font-semibold transition cursor-pointer"
                        >
                          <UserPlus className="w-3.5 h-3.5" /> Add
                        </button>
                      )}
                    </div>
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

                {/* Transactions tabs */}
                <div className="rounded-2xl border border-black/10 dark:border-white/10 overflow-hidden">
                  <div className="flex bg-black/[0.03] dark:bg-white/[0.03] border-b border-black/10 dark:border-white/10">
                    {(["config", "balance"] as const).map((tab) => {
                      const count = proposals[tab].length;
                      const Icon = tab === "config" ? Settings : WalletIcon;
                      const label = tab === "config" ? "Config" : "Ledger";
                      const active = activeTab === tab;
                      return (
                        <button
                          key={tab}
                          onClick={() => setActiveTab(tab)}
                          className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition cursor-pointer ${
                            active
                              ? "bg-fuchsia-500/10 text-fuchsia-500 dark:text-fuchsia-400"
                              : "text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/70"
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                          {label}
                          {count > 0 && (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] tabular-nums ${
                                active
                                  ? "bg-fuchsia-500/20 text-fuchsia-500 dark:text-fuchsia-400"
                                  : "bg-black/5 dark:bg-white/10"
                              }`}
                            >
                              {count}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {txError && (
                    <div className="px-5 py-2 text-xs text-red-400 bg-red-500/5 border-b border-red-500/10">{txError}</div>
                  )}

                  <div className="divide-y divide-black/5 dark:divide-white/5">
                    {proposalsLoading ? (
                      <div className="px-5 py-8 text-center"><Spinner size={18} className="text-fuchsia-400" /></div>
                    ) : proposals[activeTab].length === 0 ? (
                      <div className="px-5 py-8 text-center text-sm text-gray-400 dark:text-white/30">
                        {activeTab === "config" ? "No config transactions yet" : "No ledger entries yet"}
                      </div>
                    ) : (
                      proposals[activeTab].map((p) => {
                        const myKey = publicKey;
                        const youApproved = !!myKey && p.approved.includes(myKey);
                        const isActive = p.status === "Active" || p.status === "Draft";
                        const isApproved = p.status === "Approved";
                        const canApprove = isActive && isMember && !youApproved;
                        const canExecute = isApproved && isMember;
                        const busyApprove = txAction?.idx === p.idx && txAction.kind === "approve";
                        const busyExecute = txAction?.idx === p.idx && txAction.kind === "execute";
                        return (
                          <div key={p.idx} className="px-5 py-3 flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-mono text-gray-400 dark:text-white/30">#{p.idx}</span>
                                <span className="text-sm font-medium truncate">{p.description}</span>
                                <StatusBadge status={p.status} />
                              </div>
                              <div className="text-xs text-gray-400 dark:text-white/30 mt-0.5">
                                Approved {p.approved.length}/{view.threshold}
                                {p.rejected.length > 0 && ` · Rejected ${p.rejected.length}`}
                                {youApproved && " · you voted"}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {canApprove && (
                                <button
                                  onClick={() => approveProposal(p.idx)}
                                  disabled={!!txAction}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
                                >
                                  {busyApprove ? <Spinner size={12} className="text-white" /> : <ThumbsUp className="w-3.5 h-3.5" />}
                                  Approve
                                </button>
                              )}
                              {canExecute && (
                                <button
                                  onClick={() => executeProposal(p.idx, activeTab)}
                                  disabled={!!txAction}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-green-500 hover:bg-green-400 disabled:opacity-50 text-white text-xs font-semibold transition cursor-pointer"
                                >
                                  {busyExecute ? <Spinner size={12} className="text-white" /> : <Play className="w-3.5 h-3.5" />}
                                  Execute
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
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

      {modal && view && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
          onClick={() => !submitting && setModal(null)}
        >
          <div
            className="w-full sm:max-w-md bg-white dark:bg-black rounded-t-2xl sm:rounded-2xl border border-black/10 dark:border-white/10 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-black/10 dark:border-white/10">
              <h2 className="text-lg font-bold flex items-center gap-2">
                {modal === "add-member" ? (
                  <><UserPlus className="w-5 h-5 text-fuchsia-400" /> Add a member</>
                ) : (
                  <><Users className="w-5 h-5 text-fuchsia-400" /> Change threshold</>
                )}
              </h2>
              <button
                type="button"
                onClick={() => !submitting && setModal(null)}
                aria-label="Close"
                className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-5 py-5 space-y-4 text-sm text-gray-700 dark:text-white/70">
              {modal === "add-member" ? (
                <>
                  <p>
                    This proposes adding a new wallet to the multisig. <b>{view.threshold} of {view.members.length}</b> members
                    must approve before it executes — your approval is registered automatically.
                  </p>
                  <input
                    type="text"
                    placeholder="New member wallet address"
                    value={newMemberAddr}
                    onChange={(e) => setNewMemberAddr(e.target.value)}
                    disabled={submitting}
                    className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 font-mono text-xs focus:outline-none focus:border-fuchsia-400/50 focus:ring-1 focus:ring-fuchsia-400/25 transition"
                  />
                </>
              ) : (
                <>
                  <p>
                    Change how many members must approve a proposal. Currently <b>{view.threshold} of {view.members.length}</b>.
                    The change itself needs <b>{view.threshold}</b> approval{view.threshold === 1 ? "" : "s"} to execute.
                  </p>
                  <div className="flex items-center gap-1 bg-black/[0.03] dark:bg-white/[0.03] border border-black/10 dark:border-white/10 rounded-xl p-2">
                    {Array.from({ length: view.members.length }, (_, i) => i + 1).map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setNewThreshold(n)}
                        disabled={submitting}
                        className={`flex-1 py-2 rounded-lg text-sm font-semibold transition cursor-pointer ${
                          n <= newThreshold
                            ? "bg-fuchsia-500 text-white"
                            : "text-gray-500 dark:text-white/40 hover:bg-black/5 dark:hover:bg-white/5"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-white/40 text-center">
                    {newThreshold} of {view.members.length}
                  </p>
                </>
              )}
              {submitError && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
                  {submitError}
                </div>
              )}
              {submitSuccess && (
                <div className="rounded-lg bg-green-500/10 border border-green-500/20 px-3 py-2 text-xs text-green-500">
                  {submitSuccess}
                </div>
              )}
              <button
                type="button"
                onClick={modal === "add-member" ? handleAddMember : handleChangeThreshold}
                disabled={
                  submitting ||
                  (modal === "add-member" && !newMemberAddr.trim()) ||
                  (modal === "change-threshold" && newThreshold === view.threshold)
                }
                className="w-full bg-fuchsia-500 hover:bg-fuchsia-400 disabled:bg-black/10 dark:disabled:bg-white/10 disabled:text-gray-400 dark:disabled:text-white/30 text-white font-semibold rounded-xl px-4 py-3 transition cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <><Spinner size={16} className="text-white" /> Submitting…</>
                ) : (
                  <>Submit proposal</>
                )}
              </button>
              <p className="text-[11px] text-gray-400 dark:text-white/30 text-center">
                Three small txs: create the proposal, register it, and record your vote.
                Costs ~0.005 SOL in account rent + tx fees.
              </p>
            </div>
          </div>
        </div>
      )}
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

function Field({
  label,
  value,
  explorer,
  copyable = true,
}: {
  label: string;
  value: string;
  explorer?: string;
  copyable?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-5 py-3 border-t border-black/5 dark:border-white/5 first:border-t-0">
      <div className="text-xs text-gray-500 dark:text-white/40 w-32 shrink-0">{label}</div>
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className="font-mono text-xs sm:text-sm truncate">{value}</span>
        {copyable && <CopyButton value={value} />}
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
