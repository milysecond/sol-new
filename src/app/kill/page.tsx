"use client";

import { useState, useCallback } from "react";
import { PageTransition } from "@/components/page-transition";
import { Navbar } from "@/components/navbar";
import { Skull, Rocket, Check, Copy, ExternalLink, AlertTriangle, LogOut } from "lucide-react";
import { AnimatedIcon } from "@/components/animated-icon";
import { useNetwork } from "@/lib/network";
import { ConnectorProvider, useConnector, useTransactionSigner } from "@solana/connector/react";
import { useWalletAdapterCompat } from "@solana/connector/compat";
import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  TransactionInstruction,
} from "@solana/web3.js";

// 352-byte abort program binary (base64)
// Source: https://github.com/deanmlittle/sbpf-asm-abort
const ABORT_SO_BASE64 =
  "f0VMRgIBAQAAAAAAAAAAAAMABwEBAAAAeAAAAAAAAABAAAAAAAAAAKAAAAAAAAAAAAAAAEAAOAABAEAAAwACAAEAAAAFAAAAeAAAAAAAAAB4AAAAAAAAAHgAAAAAAAAAGAAAAAAAAAAYAAAAAAAAAAgAAAAAAAAAGAAAAAEAAAAAAAAAAAAAAJUAAAAAAAAAAC50ZXh0AC5zAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAQAAAAYAAAAAAAAAeAAAAAAAAAB4AAAAAAAAABgAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABwAAAAMAAAAAAAAAAAAAAAAAAAAAAAAAkAAAAAAAAAAKAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAA==";

const UPGRADEABLE_LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
const SYSVAR_RENT = new PublicKey("SysvarRent111111111111111111111111111111111");
const SYSVAR_CLOCK = new PublicKey("SysvarC1ock11111111111111111111111111111111");

function KillPageInner() {
  const [programId, setProgramId] = useState("");
  const [status, setStatus] = useState<"idle" | "deploying" | "confirming" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { network, rpc } = useNetwork();

  const {
    isConnected,
    isConnecting,
    account,
    connector,
    connectors,
    connectWallet,
    disconnectWallet,
  } = useConnector();

  const { signer } = useTransactionSigner();
  const walletAdapter = useWalletAdapterCompat(signer, disconnectWallet);

  const clusterParam = network === "devnet" ? "?cluster=devnet" : "";

  let validProgram = false;
  try {
    if (programId.trim()) {
      new PublicKey(programId.trim());
      validProgram = true;
    }
  } catch {
    validProgram = false;
  }

  const canKill = validProgram && isConnected && !!account;

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleKill = useCallback(async () => {
    if (!canKill || !walletAdapter.publicKey) return;
    setError(null);

    try {
      setStatus("deploying");

      const connection = new Connection(rpc, "confirmed");
      const creatorKey = new PublicKey(account!);
      const targetProgram = new PublicKey(programId.trim());

      // Validate program
      const accountInfo = await connection.getAccountInfo(targetProgram);
      if (!accountInfo) throw new Error("Program account not found. Check the address and network.");
      if (!accountInfo.executable) throw new Error("This address is not an executable program.");
      if (!accountInfo.owner.equals(UPGRADEABLE_LOADER)) {
        throw new Error("This program is not upgradeable (not owned by BPF Upgradeable Loader).");
      }

      const programdataAddress = new PublicKey(accountInfo.data.slice(4, 36));
      const programdataInfo = await connection.getAccountInfo(programdataAddress);
      if (!programdataInfo) throw new Error("Program data account not found.");

      const hasAuthority = programdataInfo.data[12] === 1;
      if (!hasAuthority) {
        throw new Error("This program has no upgrade authority — it's immutable and cannot be killed.");
      }

      const authority = new PublicKey(programdataInfo.data.slice(13, 45));
      if (!authority.equals(creatorKey)) {
        throw new Error(`You are not the upgrade authority.\nAuthority: ${authority.toBase58()}\nYour wallet: ${creatorKey.toBase58()}`);
      }

      // Decode abort binary
      const abortBytes = Uint8Array.from(atob(ABORT_SO_BASE64), (c) => c.charCodeAt(0));

      // Buffer setup
      const { Keypair } = await import("@solana/web3.js");
      const bufferKeypair = Keypair.generate();
      const bufferSize = abortBytes.length + 48;
      const bufferRent = await connection.getMinimumBalanceForRentExemption(bufferSize);

      const balance = await connection.getBalance(creatorKey);
      if (balance < bufferRent + 10000) {
        throw new Error(`Need ~${((bufferRent + 10000) / LAMPORTS_PER_SOL).toFixed(4)} SOL. You have ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL.`);
      }

      // Build transaction with legacy Transaction (wallet adapter compat)
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");

      const tx = new Transaction({
        feePayer: creatorKey,
        blockhash,
        lastValidBlockHeight,
      });

      // 1. Create buffer account
      tx.add(SystemProgram.createAccount({
        fromPubkey: creatorKey,
        newAccountPubkey: bufferKeypair.publicKey,
        lamports: bufferRent,
        space: bufferSize,
        programId: UPGRADEABLE_LOADER,
      }));

      // 2. Initialize buffer
      tx.add(new TransactionInstruction({
        keys: [
          { pubkey: bufferKeypair.publicKey, isSigner: false, isWritable: true },
          { pubkey: creatorKey, isSigner: true, isWritable: false },
        ],
        programId: UPGRADEABLE_LOADER,
        data: Buffer.from([0, 0, 0, 0]),
      }));

      // 3. Write abort.so to buffer
      // BPF Loader uses bincode: u32 variant + u32 offset + u64 vec_len + bytes
      const writeData = Buffer.alloc(16 + abortBytes.length);
      writeData.writeUInt32LE(1, 0);  // Write variant
      writeData.writeUInt32LE(0, 4);  // offset
      writeData.writeUInt32LE(abortBytes.length, 8);  // vec length (low 32)
      writeData.writeUInt32LE(0, 12); // vec length (high 32)
      writeData.set(abortBytes, 16);

      tx.add(new TransactionInstruction({
        keys: [
          { pubkey: bufferKeypair.publicKey, isSigner: false, isWritable: true },
          { pubkey: creatorKey, isSigner: true, isWritable: false },
        ],
        programId: UPGRADEABLE_LOADER,
        data: writeData,
      }));

      // 4. Upgrade program
      const upgradeData = Buffer.alloc(4);
      upgradeData.writeUInt32LE(3, 0);

      tx.add(new TransactionInstruction({
        keys: [
          { pubkey: programdataAddress, isSigner: false, isWritable: true },
          { pubkey: targetProgram, isSigner: false, isWritable: true },
          { pubkey: bufferKeypair.publicKey, isSigner: false, isWritable: true },
          { pubkey: creatorKey, isSigner: false, isWritable: true },
          { pubkey: SYSVAR_RENT, isSigner: false, isWritable: false },
          { pubkey: SYSVAR_CLOCK, isSigner: false, isWritable: false },
          { pubkey: creatorKey, isSigner: true, isWritable: false },
        ],
        programId: UPGRADEABLE_LOADER,
        data: upgradeData,
      }));

      // Buffer keypair must partial-sign
      tx.partialSign(bufferKeypair);

      // Send via wallet adapter (handles wallet signing)
      setStatus("confirming");
      const sig = await walletAdapter.sendTransaction(tx, connection);

      await connection.confirmTransaction(
        { signature: sig, blockhash, lastValidBlockHeight },
        "confirmed"
      );

      setTxSig(sig);
      setStatus("done");
    } catch (e: unknown) {
      let msg = "Something went wrong. Please try again.";
      if (e instanceof Error) {
        const m = e.message;
        if (m.includes("User rejected") || m.includes("user rejected")) {
          msg = "Transaction was rejected.";
        } else if (m.length > 200) {
          msg = m.slice(0, 200) + "...";
        } else {
          msg = m;
        }
      }
      setError(msg);
      setStatus("error");
    }
  }, [canKill, walletAdapter, rpc, programId, network]);

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col pb-20 sm:pb-0">
      <Navbar />
      <main className="flex-1 flex flex-col px-4 py-4 sm:px-6 sm:py-8 sm:items-center">
        <PageTransition>
          <div className="w-full sm:max-w-lg space-y-6">
            <div className="text-center space-y-1">
              <AnimatedIcon icon={Skull} size={32} className="text-red-500" />
              <h1 className="text-2xl font-bold tracking-tight">Kill Switch</h1>
              <p className="text-gray-500 dark:text-white/50 text-sm">Emergency abort for upgradeable programs.</p>
            </div>

            {/* Wallet connection */}
            {!isConnected ? (
              <div className="space-y-2">
                {isConnecting ? (
                  <div className="w-full flex items-center justify-center gap-2 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3.5 text-gray-500 dark:text-white/50">
                    Connecting...
                  </div>
                ) : (
                  <>
                    {connectors.filter(c => c.ready).length > 0 ? (
                      <div className="space-y-2">
                        {connectors.filter(c => c.ready).map(c => (
                          <button
                            key={c.id}
                            onClick={() => void connectWallet(c.id)}
                            className="w-full flex items-center gap-3 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3.5 hover:bg-black/10 dark:hover:bg-white/10 transition cursor-pointer"
                          >
                            {c.icon && (
                              <img src={c.icon} alt="" className="w-6 h-6 rounded-md" />
                            )}
                            <span className="font-medium">{c.name}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <a
                        href="https://phantom.app/"
                        target="_blank"
                        className="w-full flex items-center justify-center gap-2 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-gray-900 dark:text-white font-semibold rounded-xl px-4 py-3.5 hover:bg-black/10 dark:hover:bg-white/10 transition"
                      >
                        Install a Solana wallet to continue
                      </a>
                    )}
                  </>
                )}
              </div>
            ) : (
              <>
                {/* Connected indicator */}
                <div className="flex items-center justify-between bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    {connector?.icon && (
                      <img src={connector.icon} alt="" className="w-5 h-5 rounded-md" />
                    )}
                    <div className="w-2 h-2 rounded-full bg-green-400" />
                    <code className="text-sm font-mono text-gray-700 dark:text-white/70">
                      {account ? `${account.slice(0, 4)}...${account.slice(-4)}` : ""}
                    </code>
                  </div>
                  <button onClick={() => void disconnectWallet()} className="p-1.5 text-gray-400 hover:text-red-400 transition cursor-pointer">
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>

                {status === "done" && txSig ? (
                  <div className="space-y-4">
                    <div className="bg-black/5 dark:bg-white/5 border border-green-500/30 rounded-xl p-4 space-y-4">
                      <div className="flex items-center gap-2 text-green-400 text-sm font-medium">
                        <Check className="w-4 h-4" />
                        Program killed
                      </div>
                      <p className="text-sm text-gray-600 dark:text-white/60">
                        All transactions to this program will now fail until you deploy a fixed version.
                      </p>
                      <div>
                        <p className="text-xs text-gray-400 dark:text-white/30 mb-1">Transaction</p>
                        <div className="flex items-center gap-2">
                          <code className="text-xs font-mono text-blue-400 break-all flex-1">{txSig}</code>
                          <button
                            onClick={() => copyText(txSig)}
                            className="p-1.5 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-black/10 dark:border-white/10 rounded-lg transition shrink-0"
                          >
                            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-gray-500 dark:text-white/50" />}
                          </button>
                        </div>
                      </div>
                      <a
                        href={`https://solscan.io/tx/${txSig}${clusterParam}`}
                        target="_blank"
                        className="w-full flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-400 text-white font-semibold rounded-xl px-4 py-3 transition"
                      >
                        <ExternalLink className="w-4 h-4" /> View on Solscan
                      </a>
                    </div>
                    <button
                      onClick={() => { setStatus("idle"); setTxSig(null); setProgramId(""); setError(null); }}
                      className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60 rounded-xl px-4 py-3 hover:text-gray-900 dark:hover:text-white transition cursor-pointer"
                    >
                      Kill another
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 flex gap-3">
                      <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                      <div className="text-sm text-gray-600 dark:text-white/60 space-y-1">
                        <p className="font-medium text-red-400">This is irreversible without a new deploy.</p>
                        <p>Deploys a 352-byte abort program that fails all transactions. Only works if you are the upgrade authority.</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm text-gray-500 dark:text-white/40">Program ID to kill</label>
                      <input
                        type="text"
                        placeholder="Paste program address..."
                        value={programId}
                        onChange={(e) => setProgramId(e.target.value)}
                        className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3.5 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-red-400/50 focus:ring-1 focus:ring-red-400/25 transition font-mono text-sm"
                      />
                      {programId && !validProgram && (
                        <p className="text-xs text-red-400">Invalid Solana address</p>
                      )}
                    </div>

                    {error && (
                      <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm whitespace-pre-wrap">{error}</div>
                    )}

                    {status === "deploying" || status === "confirming" ? (
                      <div className="w-full space-y-3">
                        <div className="relative h-12 overflow-hidden rounded-xl">
                          <div
                            className="absolute top-1/2 -translate-y-1/2 flex items-center"
                            style={{
                              left: status === "deploying" ? "30%" : "115%",
                              transition: status === "confirming"
                                ? "left 0.5s cubic-bezier(0.55, 0, 1, 0.45)"
                                : "left 0.9s cubic-bezier(0.25, 0, 0.7, 0.4)",
                            }}
                          >
                            <div className="flex items-center gap-0.5 mr-1">
                              {[...Array(5)].map((_, i) => (
                                <div
                                  key={i}
                                  className="rounded-full animate-pulse"
                                  style={{
                                    width: `${3 + i}px`,
                                    height: `${3 + i}px`,
                                    background: i > 2 ? "#ef4444" : i > 0 ? "#dc2626" : "#991b1b",
                                    opacity: 0.3 + i * 0.15,
                                    animationDelay: `${i * 0.08}s`,
                                    boxShadow: i > 2 ? "0 0 6px #ef4444" : "0 0 4px #dc2626",
                                  }}
                                />
                              ))}
                            </div>
                            <Rocket className="w-7 h-7 text-red-500 rotate-45 drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                          </div>
                        </div>
                        <p className="text-center text-sm text-gray-500 dark:text-white/50">
                          {status === "deploying" && "Deploying abort program..."}
                          {status === "confirming" && "Confirming..."}
                        </p>
                      </div>
                    ) : (
                      <button
                        onClick={handleKill}
                        disabled={!canKill}
                        className="w-full bg-red-600 hover:bg-red-500 disabled:bg-black/10 dark:disabled:bg-white/10 disabled:text-gray-400 dark:disabled:text-white/30 text-white font-semibold rounded-xl px-4 py-3.5 transition cursor-pointer disabled:cursor-not-allowed"
                      >
                        ☠️ Kill Program
                      </button>
                    )}

                    <div className="text-center space-y-1">
                      <p className="text-xs text-gray-400 dark:text-white/30">
                        Only costs rent (~0.003 SOL) • Recoverable with a new deploy
                      </p>
                      <a
                        href="https://github.com/deanmlittle/sbpf-asm-abort"
                        target="_blank"
                        className="text-xs text-blue-400 hover:text-blue-300 transition"
                      >
                        How it works →
                      </a>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </PageTransition>
      </main>
    </div>
  );
}

export default function KillPage() {
  return (
    <ConnectorProvider>
      <KillPageInner />
    </ConnectorProvider>
  );
}
