"use client";

import { useState } from "react";
import { WalletShell } from "@/components/wallet-shell";
import { PageTransition } from "@/components/page-transition";
import { Send, Coins, Image as ImageIcon, ArrowRight, Check, ExternalLink } from "lucide-react";
import { Spinner } from "@/components/spinner";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import { getPasskeyKeypair } from "@/lib/passkey-wallet";
import { Connection, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";

type Tab = "sol" | "token" | "nft";

export default function SendPage() {
  const [tab, setTab] = useState<Tab>("sol");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<"idle" | "auth" | "sending" | "confirming" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [txId, setTxId] = useState<string | null>(null);
  const [addressValid, setAddressValid] = useState<boolean | null>(null);

  const { publicKey, balance } = useWallet();
  const { network, rpc } = useNetwork();

  const handleRecipientChange = (value: string) => {
    const sanitized = value.trim();
    setRecipient(sanitized);
    if (sanitized.length > 0) {
      try { new PublicKey(sanitized); setAddressValid(true); } catch { setAddressValid(false); }
    } else {
      setAddressValid(null);
    }
  };

  const handleSendSOL = async () => {
    if (!publicKey) return;
    setError(null);
    setStatus("auth");

    try {
      const sanitized = recipient.trim();
      let recipientPubkey: PublicKey;
      try { recipientPubkey = new PublicKey(sanitized); } catch { throw new Error("Invalid recipient address"); }

      const amountLamports = parseFloat(amount) * LAMPORTS_PER_SOL;
      if (isNaN(amountLamports) || amountLamports <= 0) throw new Error("Invalid amount");

      const balanceLamports = balance ? balance * LAMPORTS_PER_SOL : 0;
      if (amountLamports > balanceLamports) throw new Error(`Insufficient balance. You have ${balance?.toFixed(4)} SOL`);

      if (recipientPubkey.toBase58() === publicKey) {
        if (!confirm("You are sending to yourself. Continue?")) { setStatus("idle"); return; }
      }

      setStatus("sending");
      const { keypair: userKeypair } = await getPasskeyKeypair();
      const connection = new Connection(rpc, "confirmed");

      const tx = new Transaction().add(
        SystemProgram.transfer({ fromPubkey: new PublicKey(publicKey), toPubkey: recipientPubkey, lamports: amountLamports })
      );

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = new PublicKey(publicKey);
      tx.sign(userKeypair);

      const signature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
      setStatus("confirming");
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");

      setTxId(signature);
      setStatus("done");
      setRecipient("");
      setAmount("");
      setAddressValid(null);
    } catch (err: any) {
      setError(err.message || String(err));
      setStatus("error");
    }
  };

  const solBalance = balance ? balance.toFixed(4) : "0";

  return (
    <WalletShell>
      <PageTransition>
        {/* Sub-tabs */}
        <div className="flex gap-1.5 mb-3">
          {([["sol", "SOL", Coins], ["token", "Token", Coins], ["nft", "NFT", ImageIcon]] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setTab(id as Tab)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition cursor-pointer active:scale-95 ${
                tab === id
                  ? "bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-400/50"
                  : "bg-black/5 dark:bg-white/5 text-gray-500 dark:text-white/50 border border-black/10 dark:border-white/10"
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {/* SOL Send */}
        {tab === "sol" && (
          <div className="space-y-3">
            <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl p-4">
              <p className="text-xs text-gray-500 dark:text-white/40 mb-1">Available Balance</p>
              <p className="text-lg font-bold text-gray-900 dark:text-white">{solBalance} SOL</p>
            </div>

            <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl p-4 space-y-3">
              {/* Recipient */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-white/60 mb-1.5">Recipient Address</label>
                <div className="relative">
                  <input
                    type="text"
                    value={recipient}
                    onChange={(e) => handleRecipientChange(e.target.value)}
                    onPaste={(e) => { e.preventDefault(); handleRecipientChange(e.clipboardData.getData('text')); }}
                    placeholder="Solana address"
                    disabled={status !== "idle" && status !== "error" && status !== "done"}
                    className={`w-full px-3 py-2.5 pr-10 bg-white dark:bg-black border rounded-lg text-sm focus:outline-none focus:ring-2 disabled:opacity-50 ${
                      addressValid === true ? "border-green-500/50 focus:ring-green-400/50"
                        : addressValid === false ? "border-red-500/50 focus:ring-red-400/50"
                        : "border-black/10 dark:border-white/10 focus:ring-purple-400/50"
                    }`}
                  />
                  {addressValid === true && <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500" />}
                  {addressValid === false && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-red-500 text-xs">✕</span>}
                </div>
                {addressValid === false && <p className="text-xs text-red-600 dark:text-red-400 mt-1">Invalid Solana address</p>}
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-white/60 mb-1.5">Amount (SOL)</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.001"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    disabled={status !== "idle" && status !== "error" && status !== "done"}
                    className="w-full px-3 py-2.5 pr-16 bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400/50 disabled:opacity-50"
                  />
                  <button
                    onClick={() => setAmount(solBalance)}
                    disabled={status !== "idle" && status !== "error" && status !== "done"}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-purple-500 hover:bg-purple-400 text-white text-xs font-medium rounded transition disabled:opacity-50 cursor-pointer"
                  >
                    Max
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="px-3 py-2.5 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
                </div>
              )}

              {/* Success */}
              {status === "done" && txId && (
                <div className="px-3 py-2.5 bg-green-500/10 border border-green-500/30 rounded-lg space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Check size={14} className="text-green-500" />
                    <p className="text-xs font-medium text-green-600 dark:text-green-400">Transfer successful!</p>
                  </div>
                  <a
                    href={`https://explorer.solana.com/tx/${txId}${network === "devnet" ? "?cluster=devnet" : ""}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-green-600 dark:text-green-400 hover:underline flex items-center gap-1"
                  >
                    View transaction <ExternalLink size={10} />
                  </a>
                </div>
              )}

              {/* Send Button */}
              <button
                onClick={handleSendSOL}
                disabled={!recipient || !amount || addressValid !== true || status === "auth" || status === "sending" || status === "confirming"}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-500 hover:bg-purple-400 text-white font-semibold rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {status === "auth" || status === "sending" || status === "confirming" ? (
                  <>
                    <Spinner size={16} />
                    {status === "auth" && "Authenticating..."}
                    {status === "sending" && "Sending..."}
                    {status === "confirming" && "Confirming..."}
                  </>
                ) : (
                  <>
                    <ArrowRight size={16} />
                    Send SOL
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Token Send */}
        {tab === "token" && (
          <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl p-8 text-center">
            <Coins size={32} className="mx-auto mb-3 text-gray-400 dark:text-white/40" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Token Transfers</h3>
            <p className="text-xs text-gray-500 dark:text-white/40">Coming soon</p>
          </div>
        )}

        {/* NFT Send */}
        {tab === "nft" && (
          <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl p-8 text-center">
            <ImageIcon size={32} className="mx-auto mb-3 text-gray-400 dark:text-white/40" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">NFT Transfers</h3>
            <p className="text-xs text-gray-500 dark:text-white/40">Coming soon</p>
          </div>
        )}
      </PageTransition>
    </WalletShell>
  );
}
