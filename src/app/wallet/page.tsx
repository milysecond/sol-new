"use client";

import { Navbar } from "@/components/navbar";
import { useWallet } from "@/lib/wallet-context";

export default function WalletPage() {
  const { publicKey, balance, connect, recover, disconnect, loading, error } = useWallet();

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <Navbar label="Wallet" />
      <main className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="max-w-lg w-full space-y-8">
          <div className="text-center space-y-3">
            <div className="text-4xl">👛</div>
            <h1 className="text-3xl font-bold tracking-tight">Instant wallet</h1>
            <p className="text-white/50">
              Your face or fingerprint <span className="italic">is</span> your wallet. No seed phrase, no app.
            </p>
          </div>

          {publicKey ? (
            <div className="space-y-4">
              <div className="bg-white/5 border border-green-500/30 rounded-xl p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-green-400 text-sm font-medium">✓ Connected</span>
                  {balance !== null && (
                    <span className="text-purple-400 font-mono font-semibold">{balance.toFixed(4)} SOL</span>
                  )}
                </div>
                <div className="bg-black/50 rounded-lg px-4 py-3 font-mono text-sm text-white/70 break-all">
                  {publicKey}
                </div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-3">
                <h3 className="text-sm font-medium text-white/60">How it works</h3>
                <ul className="text-sm text-white/40 space-y-2">
                  <li>🔐 Your passkey (Face ID / fingerprint) generated this wallet</li>
                  <li>🔁 Same passkey = same wallet, every time</li>
                  <li>📱 Works on any device synced to your passkey provider</li>
                  <li>🚫 No seed phrase to lose</li>
                </ul>
              </div>

              <div className="flex gap-3">
                <a
                  href={`https://solscan.io/account/${publicKey}`}
                  target="_blank"
                  className="flex-1 text-center bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-purple-400 hover:text-purple-300 transition"
                >
                  View on Solscan →
                </a>
                <button
                  onClick={disconnect}
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 transition cursor-pointer"
                >
                  Disconnect
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-500/20 rounded-full flex items-center justify-center">🔐</div>
                  <div>
                    <p className="text-white/70 text-sm font-medium">Passkey-secured</p>
                    <p className="text-white/40 text-xs">Face ID, fingerprint, or device PIN</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-500/20 rounded-full flex items-center justify-center">🔁</div>
                  <div>
                    <p className="text-white/70 text-sm font-medium">Recoverable</p>
                    <p className="text-white/40 text-xs">Same passkey always generates the same wallet</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-500/20 rounded-full flex items-center justify-center">⚡</div>
                  <div>
                    <p className="text-white/70 text-sm font-medium">Instant</p>
                    <p className="text-white/40 text-xs">No downloads, no extensions, no seed phrases</p>
                  </div>
                </div>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <button
                onClick={connect}
                disabled={loading}
                className="w-full bg-purple-500 hover:bg-purple-400 disabled:bg-purple-500/50 text-white font-semibold rounded-xl px-4 py-3.5 transition cursor-pointer disabled:cursor-wait"
              >
                {loading ? "Authenticating..." : "Create wallet →"}
              </button>
              <button
                onClick={recover}
                disabled={loading}
                className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white font-medium rounded-xl px-4 py-3 transition text-sm cursor-pointer"
              >
                I already have a passkey wallet
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
