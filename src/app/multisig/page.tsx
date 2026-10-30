"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageTransition } from "@/components/page-transition";
import { Navbar } from "@/components/navbar";
import { ConnectGate } from "@/components/connect-gate";
import { ShieldCheck, Rocket, Check, Copy, ExternalLink, Users, Trash2 } from "lucide-react";
import { AnimatedIcon } from "@/components/animated-icon";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import { getPasskeyKeypair } from "@/lib/passkey-wallet";
import { Connection, Keypair, PublicKey, TransactionMessage, VersionedTransaction, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";
import { PromoInput } from "@/components/promo-input";
import { friendlyError } from "@/lib/friendly-errors";

export default function MultisigPage() {
  const [name, setName] = useState("");
  const [threshold, setThreshold] = useState(2);
  const [members, setMembers] = useState<string[]>([""]);
  const [status, setStatus] = useState<"idle" | "auth" | "creating" | "confirming" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ multisigPda: string; vault: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState<string | null>(null);
  const { publicKey, refreshBalance } = useWallet();
  const { network, rpc } = useNetwork();
  const router = useRouter();

  const clusterParam = network === "devnet" ? "?cluster=devnet&hideSpam=true" : "?hideSpam=true";

  const validMembers = members.filter(m => {
    try { new PublicKey(m); return true; } catch { return false; }
  });

  // Auto-include connected wallet
  const allMembers = publicKey && !validMembers.includes(publicKey)
    ? [publicKey, ...validMembers]
    : validMembers;

  // Total member slots (for threshold UI) = connected wallet + member input fields
  const totalMemberSlots = (publicKey ? 1 : 0) + members.length;

  const canCreate = name && allMembers.length >= 2 && threshold >= 1 && threshold <= allMembers.length;

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleCreate = async () => {
    if (!canCreate) return;
    setError(null);

    try {
      setStatus("auth");
      const { address, keypair: userKeypair } = await getPasskeyKeypair();

      const connection = new Connection(rpc, "confirmed");

      // Fund user's wallet via treasury when a promo code is active
      if (promoCode) {
        const fundRes = await fetch("/api/promo/fund", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: promoCode, wallet: address, kind: "multisig" }),
        });
        if (!fundRes.ok) {
          const err = (await fundRes.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error ?? "Promo funding failed — please try again.");
        }
      }

      // Check balance (0.05 total + small tx fee buffer)
      if (!promoCode) {
        const balance = await connection.getBalance(new PublicKey(address));
        const MIN_BALANCE = 0.051 * 1e9;
        if (balance < MIN_BALANCE) {
          throw new Error(`You need at least 0.051 SOL. Your balance is ${(balance / 1e9).toFixed(4)} SOL.`);
        }
      }

      setStatus("creating");

      const createKey = Keypair.generate();
      const creator = new PublicKey(address);

      // Derive multisig PDA
      const [multisigPda] = multisig.getMultisigPda({ createKey: createKey.publicKey });

      // Build members with permissions
      const msMembers = allMembers.map((m, i) => ({
        key: new PublicKey(m),
        permissions: multisig.types.Permissions.all(),
      }));

      // Treasury must match the one in Squads program config (differs per network)
      const SQUADS_TREASURY = new PublicKey(
        network === "devnet"
          ? "HM5y4mz3Bt9JY9mr1hkyhnvqxSH4H2u2451j7Hc2dtvK"
          : "5DH2e3cJmFpyi6mk65EGFediunm4ui6BiKNUNrhWtD1b"
      );

      const createIx = multisig.instructions.multisigCreateV2({
        createKey: createKey.publicKey,
        creator,
        multisigPda,
        configAuthority: PublicKey.default,
        timeLock: 0,
        members: msMembers,
        threshold,
        rentCollector: creator,
        treasury: SQUADS_TREASURY,
        memo: name,
      });

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");

      // Dynamic platform fee calculation
      // Total price: 0.05 SOL
      // Estimated rent: ~0.04 SOL (multisig account)
      // Platform fee: ~0.01 SOL
      const TOTAL_PRICE = 0.05 * LAMPORTS_PER_SOL;
      const ESTIMATED_RENT = 0.04 * LAMPORTS_PER_SOL;
      const FEE_VAULT = new PublicKey("Deqi6CBfo2FR2XVZXxSwmcjELy1JdbAXWDNFPzDAbtxW");
      const platformFee = TOTAL_PRICE - ESTIMATED_RENT;
      
      // Add platform fee transfer instruction
      const feeIx = SystemProgram.transfer({
        fromPubkey: creator,
        toPubkey: FEE_VAULT,
        lamports: platformFee,
      });

      const message = new TransactionMessage({
        payerKey: creator,
        recentBlockhash: blockhash,
        instructions: promoCode ? [createIx] : [createIx, feeIx],
      }).compileToV0Message();

      const tx = new VersionedTransaction(message);
      tx.sign([createKey, userKeypair]);

      setStatus("confirming");
      const txId = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      });

      await connection.confirmTransaction({
        signature: txId,
        blockhash,
        lastValidBlockHeight,
      }, "confirmed");

      // Derive vault
      const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 });

      if (promoCode) {
        fetch("/api/promo/redeem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: promoCode, wallet: address, kind: "multisig" }),
        }).catch(() => {});
      }

      await refreshBalance();
      const resultData = {
        multisigPda: multisigPda.toBase58(),
        vault: vaultPda.toBase58(),
      };
      setResult(resultData);

      // Save to DB
      await fetch("/api/multisig", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: address,
          name,
          multisigPda: resultData.multisigPda,
          vault: resultData.vault,
          threshold,
          memberCount: allMembers.length,
          network,
        }),
      }).catch(() => {});

      setStatus("done");
    } catch (e: unknown) {
      setError(friendlyError(e, "We couldn't create your multisig. Please try again."));
      setStatus("error");
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col pb-20 sm:pb-0">
      <Navbar />
      <main className="flex-1 w-full min-w-0 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:pb-12">
        <ConnectGate action="create a Multisig">
          <PageTransition>
          <div className="app-shell py-5 sm:py-8 lg:py-10 space-y-6">
            <div className="text-center space-y-1">
              <AnimatedIcon icon={ShieldCheck} size={32} className="text-blue-400" />
              <h1 className="text-2xl font-bold tracking-tight">Multisig</h1>
              <p className="text-gray-500 dark:text-white/50 text-sm">Shared wallet with multiple signers.</p>
            </div>

            {status === "done" && result ? (
              <div className="space-y-4">
                <div className="bg-black/5 dark:bg-white/5 border border-green-500/30 rounded-xl p-4 space-y-4">
                  <div className="flex items-center gap-2 text-green-400 text-sm font-medium">
                    <Check className="w-4 h-4" />
                    Multisig created
                  </div>
                  <div className="text-center space-y-1">
                    <p className="font-bold text-lg">{name}</p>
                    <p className="text-gray-500 dark:text-white/40 text-sm">{threshold} of {allMembers.length} signers required</p>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-gray-400 dark:text-white/30 mb-1">Multisig address</p>
                      <div className="flex items-center gap-2">
                        <code className="text-xs font-mono text-blue-400 break-all flex-1">{result.multisigPda}</code>
                        <button onClick={() => copyText(result.multisigPda, "ms")} className="p-1.5 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 rounded-lg transition shrink-0">
                          {copied === "ms" ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-gray-500 dark:text-white/50" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 dark:text-white/30 mb-1">Vault address</p>
                      <div className="flex items-center gap-2">
                        <code className="text-xs font-mono text-blue-400 break-all flex-1">{result.vault}</code>
                        <button onClick={() => copyText(result.vault, "vault")} className="p-1.5 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 rounded-lg transition shrink-0">
                          {copied === "vault" ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-gray-500 dark:text-white/50" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <Link
                    href={`/multisig/${result.multisigPda}`}
                    className="w-full flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-400 text-white font-semibold rounded-xl px-4 py-3 transition"
                  >
                    <ShieldCheck className="w-4 h-4" /> View this multisig
                  </Link>
                </div>

                <button
                  onClick={() => { setStatus("idle"); setResult(null); setName(""); setMembers([""]); setThreshold(2); }}
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60 rounded-lg px-3.5 py-2.5 hover:text-gray-900 dark:hover:text-white transition cursor-pointer"
                >
                  Create another
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                <input
                  type="text"
                  placeholder="Multisig name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3.5 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-blue-400/50 focus:ring-1 focus:ring-blue-400/25 transition"
                />

                {/* Members */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <label className="text-sm text-gray-500 dark:text-white/40 flex items-center gap-2">
                      <Users className="w-4 h-4" /> Members
                    </label>
                    {publicKey && (
                      <span className="text-xs text-blue-400">Your wallet is auto-included</span>
                    )}
                  </div>
                  {members.map((m, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        type="text"
                        placeholder={`Wallet address ${i + 2}`}
                        value={m}
                        onChange={(e) => { const next = [...members]; next[i] = e.target.value; setMembers(next); }}
                        className="flex-1 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-blue-400/50 focus:ring-1 focus:ring-blue-400/25 transition font-mono text-sm"
                      />
                      {members.length > 1 && (
                        <button
                          onClick={() => setMembers(members.filter((_, j) => j !== i))}
                          className="p-3 text-gray-400 hover:text-red-400 transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={() => {
                      const next = [...members, ""];
                      setMembers(next);
                      // Auto-adjust threshold to ~60% of total slots
                      const total = (publicKey ? 1 : 0) + next.length;
                      if (total >= 3) setThreshold(Math.ceil(total * 0.6));
                    }}
                    className="mt-1 text-sm text-blue-400 hover:text-blue-300 transition cursor-pointer"
                  >
                    + Add member
                  </button>
                </div>

                {/* Threshold */}
                <div className="space-y-3">
                  <label className="text-sm text-gray-500 dark:text-white/40 flex items-center gap-2">
                    Approvals needed to sign
                  </label>
                  <div className="bg-black/[0.03] dark:bg-white/[0.03] border border-black/10 dark:border-white/10 rounded-xl p-3">
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.max(totalMemberSlots, 1) }, (_, i) => i + 1).map((n) => (
                        <button
                          key={n}
                          onClick={() => setThreshold(n)}
                          className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition cursor-pointer ${
                            n <= threshold
                              ? "bg-blue-500 text-white shadow-sm"
                              : "text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/50"
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    <div className="flex justify-between items-center mt-2 pt-2 border-t border-black/5 dark:border-white/5">
                      <span className="text-sm font-medium text-gray-700 dark:text-white/70">
                        {threshold} of {totalMemberSlots}
                      </span>
                      {totalMemberSlots >= 3 && threshold === Math.ceil(totalMemberSlots * 0.6) && (
                        <span className="text-xs text-blue-400">Recommended</span>
                      )}
                      {totalMemberSlots >= 3 && threshold !== Math.ceil(totalMemberSlots * 0.6) && (
                        <button
                          onClick={() => setThreshold(Math.ceil(totalMemberSlots * 0.6))}
                          className="text-xs text-blue-400 hover:text-blue-300 transition cursor-pointer"
                        >
                          Use recommended ({Math.ceil(totalMemberSlots * 0.6)} of {totalMemberSlots})
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <PromoInput
                  onValidCode={(c) => setPromoCode(c)}
                  onClear={() => setPromoCode(null)}
                />

                {error && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">{error}</div>
                )}

                {/* Progress rocket */}
                {(status === "auth" || status === "creating" || status === "confirming") ? (
                  <div className="w-full space-y-3">
                    <div className="relative h-12 overflow-hidden rounded-xl">
                      <div className="absolute top-1/2 -translate-y-1/2 flex items-center" style={{
                        left: status === "auth" ? "8%" : status === "creating" ? "45%" : "115%",
                        transition: status === "confirming"
                          ? "left 0.5s cubic-bezier(0.55, 0, 1, 0.45)"
                          : "left 0.9s cubic-bezier(0.25, 0, 0.7, 0.4)",
                      }}>
                        <div className="flex items-center gap-0.5 mr-1">
                          {[...Array(5)].map((_, i) => (
                            <div key={i} className="rounded-full animate-pulse" style={{
                              width: `${3 + i}px`, height: `${3 + i}px`,
                              background: i > 2 ? '#f59e0b' : i > 0 ? '#9333ea' : '#6b21a8',
                              opacity: 0.3 + i * 0.15, animationDelay: `${i * 0.08}s`,
                              boxShadow: i > 2 ? '0 0 6px #f59e0b' : '0 0 4px #9333ea',
                            }} />
                          ))}
                        </div>
                        <Rocket className="w-7 h-7 text-blue-500 dark:text-blue-400 rotate-45 drop-shadow-[0_0_8px_rgba(168,85,247,0.5)]" />
                      </div>
                    </div>
                    <p className="text-center text-sm text-gray-500 dark:text-white/50">
                      {status === "auth" && "Signing in..."}
                      {status === "creating" && "Creating multisig..."}
                      {status === "confirming" && "Almost there..."}
                    </p>
                  </div>
                ) : (
                  <button
                    onClick={handleCreate}
                    disabled={!canCreate}
                    className="w-full bg-blue-500 hover:bg-blue-400 disabled:bg-black/10 dark:disabled:bg-white/10 disabled:text-gray-400 dark:disabled:text-white/30 text-white font-semibold rounded-lg px-3.5 py-2.5 transition cursor-pointer disabled:cursor-not-allowed"
                  >
                    Create Multisig
                  </button>
                )}
                <p className="text-center text-xs text-gray-400 dark:text-white/30">
                  {promoCode ? <span className="text-green-400">Free with promo code</span> : "~0.05 SOL"}
                </p>
              </div>
            )}
          </div>
          </PageTransition>
        </ConnectGate>
      </main>
    </div>
  );
}
