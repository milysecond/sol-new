"use client";

import { useWallet } from "@/lib/wallet-context";

export function ConnectGate({ children, action }: { children: React.ReactNode; action: string }) {
  const { publicKey, connect, recover, loading, error } = useWallet();

  if (publicKey) return <>{children}</>;

  return (
    <div className="max-w-md w-full mx-auto space-y-6 text-center">
      <div className="bg-white/5 border border-white/10 rounded-2xl p-8 space-y-4">
        <div className="text-3xl">🔐</div>
        <h2 className="text-xl font-semibold">Connect to {action}</h2>
        <p className="text-white/40 text-sm">
          Create a passkey wallet with Face ID or fingerprint. Takes 2 seconds.
        </p>
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm text-left">
            {error}
          </div>
        )}
        <button
          onClick={connect}
          disabled={loading}
          className="w-full bg-purple-500 hover:bg-purple-400 disabled:bg-purple-500/50 text-white font-semibold rounded-xl px-4 py-3.5 transition cursor-pointer disabled:cursor-wait"
        >
          {loading ? "Authenticating..." : "Connect wallet →"}
        </button>
        <button
          onClick={recover}
          disabled={loading}
          className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white font-medium rounded-xl px-4 py-3 transition text-sm cursor-pointer"
        >
          I already have a passkey wallet
        </button>
      </div>
    </div>
  );
}
