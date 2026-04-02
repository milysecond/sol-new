"use client";

import { useState, useEffect } from "react";
import { PageTransition } from "@/components/page-transition";
import { Navbar } from "@/components/navbar";
import { Skull, Rocket, Check, Copy, ExternalLink, AlertTriangle, Wallet, LogOut } from "lucide-react";
import { AnimatedIcon } from "@/components/animated-icon";
import { useNetwork } from "@/lib/network";
import {
  Connection,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Keypair,
} from "@solana/web3.js";

// 352-byte abort program binary (base64)
// Source: https://github.com/deanmlittle/sbpf-asm-abort
const ABORT_SO_BASE64 =
  "f0VMRgIBAQAAAAAAAAAAAAMABwEBAAAAeAAAAAAAAABAAAAAAAAAAKAAAAAAAAAAAAAAAEAAOAABAEAAAwACAAEAAAAFAAAAeAAAAAAAAAB4AAAAAAAAAHgAAAAAAAAAGAAAAAAAAAAYAAAAAAAAAAgAAAAAAAAAGAAAAAEAAAAAAAAAAAAAAJUAAAAAAAAAAC50ZXh0AC5zAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAQAAAAYAAAAAAAAAeAAAAAAAAAB4AAAAAAAAABgAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABwAAAAMAAAAAAAAAAAAAAAAAAAAAAAAAkAAAAAAAAAAKAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAA==";

const UPGRADEABLE_LOADER = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
const SYSVAR_RENT = new PublicKey("SysvarRent111111111111111111111111111111111");
const SYSVAR_CLOCK = new PublicKey("SysvarC1ock11111111111111111111111111111111");

interface PhantomProvider {
  isPhantom?: boolean;
  publicKey?: { toBase58(): string; toBytes(): Uint8Array };
  connect(): Promise<{ publicKey: { toBase58(): string } }>;
  disconnect(): Promise<void>;
  signTransaction(tx: VersionedTransaction): Promise<VersionedTransaction>;
  on(event: string, cb: (...args: unknown[]) => void): void;
  off(event: string, cb: (...args: unknown[]) => void): void;
}

function getProvider(): PhantomProvider | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { solana?: PhantomProvider; phantom?: { solana?: PhantomProvider } };
  return w.phantom?.solana || w.solana || null;
}

export default function KillPage() {
  const [programId, setProgramId] = useState("");
  const [status, setStatus] = useState<"idle" | "deploying" | "confirming" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [hasProvider, setHasProvider] = useState(false);
  const { network, rpc } = useNetwork();

  const clusterParam = network === "devnet" ? "?cluster=devnet" : "";

  useEffect(() => {
    const provider = getProvider();
    if (provider) {
      setHasProvider(true);
      if (provider.publicKey) {
        setWalletAddress(provider.publicKey.toBase58());
      }
      const handleConnect = () => {
        const p = getProvider();
        if (p?.publicKey) setWalletAddress(p.publicKey.toBase58());
      };
      const handleDisconnect = () => setWalletAddress(null);
      provider.on("connect", handleConnect);
      provider.on("disconnect", handleDisconnect);
      return () => {
        provider.off("connect", handleConnect);
        provider.off("disconnect", handleDisconnect);
      };
    }
  }, []);

  const connectWallet = async () => {
    const provider = getProvider();
    if (!provider) {
      window.open("https://phantom.app/", "_blank");
      return;
    }
    try {
      const resp = await provider.connect();
      setWalletAddress(resp.publicKey.toBase58());
    } catch {
      // user rejected
    }
  };

  const disconnectWallet = async () => {
    const provider = getProvider();
    if (provider) await provider.disconnect().catch(() => {});
    setWalletAddress(null);
  };

  let validProgram = false;
  try {
    if (programId.trim()) {
      new PublicKey(programId.trim());
      validProgram = true;
    }
  } catch {
    validProgram = false;
  }

  const canKill = validProgram && !!walletAddress;

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleKill = async () => {
    if (!canKill) return;
    setError(null);

    const provider = getProvider();
    if (!provider || !provider.publicKey) {
      setError("Wallet not connected");
      return;
    }

    try {
      setStatus("deploying");

      const connection = new Connection(rpc, "confirmed");
      const creator = new PublicKey(walletAddress!);
      const targetProgram = new PublicKey(programId.trim());

      // Validate program is upgradeable and user is authority
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
      if (!authority.equals(creator)) {
        throw new Error(`You are not the upgrade authority.\nAuthority: ${authority.toBase58()}\nYour wallet: ${creator.toBase58()}`);
      }

      // Decode abort binary
      const abortBytes = Uint8Array.from(atob(ABORT_SO_BASE64), (c) => c.charCodeAt(0));

      // Create buffer account
      const bufferKeypair = Keypair.generate();
      const bufferSize = abortBytes.length + 48;
      const bufferRent = await connection.getMinimumBalanceForRentExemption(bufferSize);

      const balance = await connection.getBalance(creator);
      if (balance < bufferRent + 10000) {
        throw new Error(`Need ~${((bufferRent + 10000) / LAMPORTS_PER_SOL).toFixed(4)} SOL. You have ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL.`);
      }

      // Instructions: create buffer → init buffer → write abort.so → upgrade
      const createBufferIx = SystemProgram.createAccount({
        fromPubkey: creator,
        newAccountPubkey: bufferKeypair.publicKey,
        lamports: bufferRent,
        space: bufferSize,
        programId: UPGRADEABLE_LOADER,
      });

      const initBufferIx = {
        keys: [
          { pubkey: bufferKeypair.publicKey, isSigner: false, isWritable: true },
          { pubkey: creator, isSigner: true, isWritable: false },
        ],
        programId: UPGRADEABLE_LOADER,
        data: Buffer.from([0, 0, 0, 0]),
      };

      const writeData = Buffer.alloc(12 + abortBytes.length);
      writeData.writeUInt32LE(1, 0);
      writeData.writeUInt32LE(0, 4);
      writeData.writeUInt32LE(abortBytes.length, 8);
      writeData.set(abortBytes, 12);

      const writeIx = {
        keys: [
          { pubkey: bufferKeypair.publicKey, isSigner: false, isWritable: true },
          { pubkey: creator, isSigner: true, isWritable: false },
        ],
        programId: UPGRADEABLE_LOADER,
        data: writeData,
      };

      const upgradeData = Buffer.alloc(4);
      upgradeData.writeUInt32LE(3, 0);

      const upgradeIx = {
        keys: [
          { pubkey: programdataAddress, isSigner: false, isWritable: true },
          { pubkey: targetProgram, isSigner: false, isWritable: true },
          { pubkey: bufferKeypair.publicKey, isSigner: false, isWritable: true },
          { pubkey: creator, isSigner: false, isWritable: true },
          { pubkey: SYSVAR_RENT, isSigner: false, isWritable: false },
          { pubkey: SYSVAR_CLOCK, isSigner: false, isWritable: false },
          { pubkey: creator, isSigner: true, isWritable: false },
        ],
        programId: UPGRADEABLE_LOADER,
        data: upgradeData,
      };

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");

      const message = new TransactionMessage({
        payerKey: creator,
        recentBlockhash: blockhash,
        instructions: [createBufferIx, initBufferIx, writeIx, upgradeIx],
      }).compileToV0Message();

      const tx = new VersionedTransaction(message);

      // Buffer keypair must sign (createAccount requires it)
      tx.sign([bufferKeypair]);

      // Wallet signs
      const signed = await provider.signTransaction(tx);

      setStatus("confirming");
      const sig = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      });

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
  };

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
            {!walletAddress ? (
              <button
                onClick={connectWallet}
                className="w-full flex items-center justify-center gap-2 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-gray-900 dark:text-white font-semibold rounded-xl px-4 py-3.5 hover:bg-black/10 dark:hover:bg-white/10 transition cursor-pointer"
              >
                <Wallet className="w-5 h-5" />
                {hasProvider ? "Connect Wallet" : "Install Phantom"}
              </button>
            ) : (
              <>
                {/* Connected indicator */}
                <div className="flex items-center justify-between bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-400" />
                    <code className="text-sm font-mono text-gray-700 dark:text-white/70">
                      {walletAddress.slice(0, 4)}...{walletAddress.slice(-4)}
                    </code>
                  </div>
                  <button onClick={disconnectWallet} className="p-1.5 text-gray-400 hover:text-red-400 transition">
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
