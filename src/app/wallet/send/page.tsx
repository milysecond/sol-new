"use client";

import { useState } from "react";
import { Navbar } from "@/components/navbar";
import { ConnectGate } from "@/components/connect-gate";
import { PageTransition } from "@/components/page-transition";
import { Send, Coins, Image as ImageIcon, ArrowRight, ExternalLink } from "lucide-react";
import { AnimatedIcon } from "@/components/animated-icon";
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

  const { publicKey, balance } = useWallet();
  const { network, rpc } = useNetwork();

  const handleSendSOL = async () => {
    if (!publicKey) return;
    setError(null);
    setStatus("auth");

    try {
      // Validate recipient
      let recipientPubkey: PublicKey;
      try {
        recipientPubkey = new PublicKey(recipient);
      } catch {
        throw new Error("Invalid recipient address");
      }

      // Validate amount
      const amountLamports = parseFloat(amount) * LAMPORTS_PER_SOL;
      if (isNaN(amountLamports) || amountLamports <= 0) {
        throw new Error("Invalid amount");
      }

      // Check balance
      if (balance && amountLamports > balance) {
        throw new Error(`Insufficient balance. You have ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
      }

      // Warn if sending to self
      if (recipientPubkey.toBase58() === publicKey) {
        if (!confirm("You are sending to yourself. Continue?")) {
          setStatus("idle");
          return;
        }
      }

      setStatus("sending");

      const { keypair: userKeypair } = await getPasskeyKeypair();
      const connection = new Connection(rpc, "confirmed");

      // Create transfer instruction
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: new PublicKey(publicKey),
          toPubkey: recipientPubkey,
          lamports: amountLamports,
        })
      );

      // Get recent blockhash
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = new PublicKey(publicKey);

      // Sign and send
      tx.sign(userKeypair);
      const signature = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      });

      setStatus("confirming");
      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      }, "confirmed");

      setTxId(signature);
      setStatus("done");
      setRecipient("");
      setAmount("");
    } catch (err: any) {
      setError(err.message || String(err));
      setStatus("error");
    }
  };

  const solBalance = balance ? (balance / LAMPORTS_PER_SOL).toFixed(4) : "0";

  return (
    <PageTransition>
      <Navbar />
      <ConnectGate action="send SOL">
        <div className="min-h-screen bg-gradient-to-br from-white to-gray-50 dark:from-black dark:to-gray-950 px-6 py-12">
          <div className="max-w-2xl mx-auto">
            {/* Header */}
            <div className="text-center mb-8">
              <AnimatedIcon icon={Send} size={48} className="mx-auto mb-4 text-purple-400" />
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                Send Assets
              </h1>
              <p className="text-gray-600 dark:text-white/60">
                Transfer SOL, tokens, or NFTs to another wallet
              </p>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-6 bg-black/5 dark:bg-white/5 p-1 rounded-xl">
              <button
                onClick={() => setTab("sol")}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition ${
                  tab === "sol"
                    ? "bg-white dark:bg-black shadow-sm text-purple-400"
                    : "text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                <Coins size={18} />
                SOL
              </button>
              <button
                onClick={() => setTab("token")}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition ${
                  tab === "token"
                    ? "bg-white dark:bg-black shadow-sm text-purple-400"
                    : "text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                <Coins size={18} />
                Token
              </button>
              <button
                onClick={() => setTab("nft")}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition ${
                  tab === "nft"
                    ? "bg-white dark:bg-black shadow-sm text-purple-400"
                    : "text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                <ImageIcon size={18} />
                NFT
              </button>
            </div>

            {/* SOL Send */}
            {tab === "sol" && (
              <div className="bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-2xl p-6">
                <div className="mb-6">
                  <div className="text-sm text-gray-600 dark:text-white/60 mb-1">Your Balance</div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">
                    {solBalance} SOL
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Recipient */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-white/70 mb-2">
                      Recipient Address
                    </label>
                    <input
                      type="text"
                      value={recipient}
                      onChange={(e) => setRecipient(e.target.value)}
                      placeholder="Solana address"
                      disabled={status !== "idle" && status !== "error" && status !== "done"}
                      className="w-full px-4 py-3 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400 disabled:opacity-50"
                    />
                  </div>

                  {/* Amount */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-white/70 mb-2">
                      Amount (SOL)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.001"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="0.00"
                        disabled={status !== "idle" && status !== "error" && status !== "done"}
                        className="w-full px-4 py-3 pr-20 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400 disabled:opacity-50"
                      />
                      <button
                        onClick={() => setAmount(solBalance)}
                        disabled={status !== "idle" && status !== "error" && status !== "done"}
                        className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-purple-500 hover:bg-purple-400 text-white text-sm font-medium rounded-lg transition disabled:opacity-50"
                      >
                        Max
                      </button>
                    </div>
                  </div>

                  {/* Error */}
                  {error && (
                    <div className="px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                      <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                    </div>
                  )}

                  {/* Success */}
                  {status === "done" && txId && (
                    <div className="px-4 py-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl">
                      <p className="text-sm text-green-600 dark:text-green-400 mb-2">
                        ✓ Transfer successful!
                      </p>
                      <a
                        href={`https://explorer.solana.com/tx/${txId}${network === "devnet" ? "?cluster=devnet" : ""}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-green-600 dark:text-green-400 hover:underline flex items-center gap-1"
                      >
                        View transaction <ExternalLink size={12} />
                      </a>
                    </div>
                  )}

                  {/* Send Button */}
                  <button
                    onClick={handleSendSOL}
                    disabled={!recipient || !amount || status === "auth" || status === "sending" || status === "confirming"}
                    className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-purple-500 hover:bg-purple-400 text-white font-medium rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {status === "auth" || status === "sending" || status === "confirming" ? (
                      <>
                        <Spinner size={20} />
                        {status === "auth" && "Authenticating..."}
                        {status === "sending" && "Sending..."}
                        {status === "confirming" && "Confirming..."}
                      </>
                    ) : (
                      <>
                        <Send size={20} />
                        Send SOL
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Token Send (Coming Soon) */}
            {tab === "token" && (
              <div className="bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-2xl p-12 text-center">
                <Coins size={48} className="mx-auto mb-4 text-gray-400" />
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                  Token Transfers
                </h3>
                <p className="text-gray-600 dark:text-white/60">
                  Coming soon
                </p>
              </div>
            )}

            {/* NFT Send (Coming Soon) */}
            {tab === "nft" && (
              <div className="bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-2xl p-12 text-center">
                <ImageIcon size={48} className="mx-auto mb-4 text-gray-400" />
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                  NFT Transfers
                </h3>
                <p className="text-gray-600 dark:text-white/60">
                  Coming soon
                </p>
              </div>
            )}
          </div>
        </div>
      </ConnectGate>
    </PageTransition>
  );
}
