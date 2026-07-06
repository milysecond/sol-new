"use client";
/* eslint-disable react-hooks/purity -- click-time closures, not render-time; throwaway spike page */

// M0 spike harness — throwaway page, deleted before launch (see SPIKES.md).
// Runs on LazorKit's devnet defaults: portal.lazor.sh + kora.devnet.lazorkit.com paymaster.

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  LazorkitProvider,
  useWallet as useLazorWallet,
} from "@lazorkit/wallet";
import { Connection, PublicKey, TransactionInstruction, LAMPORTS_PER_SOL } from "@solana/web3.js";

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TySNcWxMyWCqXgDLGmfcHr");
const DEVNET_RPC = "https://api.devnet.solana.com";

function Btn({ onClick, children, disabled }: { onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full bg-teal-500 hover:bg-teal-400 disabled:opacity-40 text-white font-semibold rounded-xl px-4 py-3 transition cursor-pointer disabled:cursor-not-allowed text-sm"
    >
      {children}
    </button>
  );
}

function Harness() {
  const lazor = useLazorWallet();
  const [log, setLog] = useState<string[]>([]);
  const [balance, setBalance] = useState<string>("?");

  const append = useCallback((label: string, data: unknown) => {
    const line = `[${new Date().toISOString().slice(11, 19)}] ${label}: ${
      typeof data === "string" ? data : JSON.stringify(data, (_, v) => (v instanceof Uint8Array || (v && v.type === "Buffer") ? `bytes(${(v.data ?? v).length})` : v), 1)?.slice(0, 2000)
    }`;
    console.log("[spike]", label, data);
    setLog((l) => [line, ...l]);
  }, []);

  const run = (label: string, fn: () => Promise<unknown>) => async () => {
    append(label, "…");
    try {
      append(label, await fn());
    } catch (e) {
      append(`${label} FAILED`, e instanceof Error ? `${e.name}: ${e.message}` : String(e));
    }
  };

  const address = lazor.smartWalletPubkey?.toBase58() ?? null;

  const spike6Connect = run("SPIKE-6 connect", async () => {
    const info = await lazor.connect({ feeMode: "paymaster" });
    return {
      smartWallet: info.smartWallet,
      credentialId: info.credentialId?.slice(0, 16) + "…",
      passkeyPubkeyLen: info.passkeyPubkey?.length,
      passkeyPubkeyB64: btoa(String.fromCharCode(...(info.passkeyPubkey ?? []))),
      platform: info.platform,
      walletDevice: info.walletDevice,
    };
  });

  const refreshBalance = run("balance", async () => {
    if (!address) throw new Error("connect first");
    const b = await new Connection(DEVNET_RPC).getBalance(new PublicKey(address));
    setBalance((b / LAMPORTS_PER_SOL).toFixed(4));
    return `${b} lamports — fund via faucet.circle.com (native drip) or any devnet faucet if 0`;
  });

  const spike5SignMessage = run("SPIKE-5 signMessage", async () => {
    const out = await lazor.signMessage("sol.new spike " + Date.now());
    // Dump everything so we can reconstruct server-side verification offline.
    return {
      signature: out.signature,
      signedPayload: out.signedPayload,
      signedPayloadDecoded: (() => {
        try { return JSON.parse(atob(out.signedPayload)); } catch { return "(not base64 JSON)"; }
      })(),
    };
  });

  const memoIx = (text: string, size = 0) =>
    new TransactionInstruction({
      keys: [{ pubkey: lazor.smartWalletPubkey!, isSigner: true, isWritable: false }],
      programId: MEMO_PROGRAM_ID,
      data: Buffer.from(size ? text.padEnd(size, ".") : text, "utf8"),
    });

  const spike3Small = run("SPIKE-3a small memo tx (their paymaster)", async () => {
    if (!lazor.smartWalletPubkey) throw new Error("connect first");
    const sig = await lazor.signAndSendTransaction({
      instructions: [memoIx("sol.new spike small")],
      transactionOptions: { clusterSimulation: "devnet" },
    });
    return `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
  });

  const spike3Big = run("SPIKE-3b oversized ix set (chunking)", async () => {
    if (!lazor.smartWalletPubkey) throw new Error("connect first");
    // ~4 memo ixs × 400B data ≈ 1.6KB of ix data — comfortably past the 1232B tx limit.
    const ixs = [1, 2, 3, 4].map((i) => memoIx(`chunk-test-${i}`, 400));
    const t0 = performance.now();
    const sig = await lazor.signAndSendTransaction({
      instructions: ixs,
      transactionOptions: { clusterSimulation: "devnet" },
    });
    return { tookMs: Math.round(performance.now() - t0), tx: `https://explorer.solana.com/tx/${sig}?cluster=devnet` };
  });

  const spike6Disconnect = run("disconnect", async () => {
    await lazor.disconnect();
    return "disconnected";
  });

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white p-4 max-w-lg mx-auto space-y-3">
      <h1 className="text-xl font-bold">LazorKit M0 spike harness (devnet)</h1>
      <p className="text-xs text-gray-500 dark:text-white/40 font-mono break-all">
        {address ? `smartWallet: ${address} · ${balance} SOL` : "not connected"}
      </p>
      <Btn onClick={spike6Connect}>1 · Connect / create smart wallet (SPIKE-6)</Btn>
      <Btn onClick={refreshBalance} disabled={!address}>2 · Check devnet balance</Btn>
      <Btn onClick={spike5SignMessage} disabled={!lazor.isConnected}>3 · signMessage → capture payload (SPIKE-5)</Btn>
      <Btn onClick={spike3Small} disabled={!lazor.isConnected}>4 · Small memo tx via their paymaster (SPIKE-3a)</Btn>
      <Btn onClick={spike3Big} disabled={!lazor.isConnected}>5 · Oversized ix set → chunking (SPIKE-3b)</Btn>
      <Btn onClick={spike6Disconnect} disabled={!lazor.isConnected}>6 · Disconnect</Btn>
      <div className="text-[11px] font-mono whitespace-pre-wrap bg-black/5 dark:bg-white/5 rounded-xl p-3 max-h-[45vh] overflow-y-auto">
        {log.length ? log.join("\n\n") : "log output appears here — also mirrored to the browser console"}
      </div>
    </div>
  );
}

function LazorSpikePage() {
  return (
    <LazorkitProvider
      rpcUrl={DEVNET_RPC}
      portalUrl="https://portal.lazor.sh"
      paymasterConfig={{ paymasterUrl: "https://kora.devnet.lazorkit.com" }}
    >
      <Harness />
    </LazorkitProvider>
  );
}

// SDK touches localStorage at module scope in places — keep it fully client-side.
export default dynamic(() => Promise.resolve(LazorSpikePage), { ssr: false });
