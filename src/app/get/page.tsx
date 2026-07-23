"use client";

import { useState, useCallback, useEffect } from "react";
import { PageTransition } from "@/components/page-transition";
import { Navbar } from "@/components/navbar";
import { ConnectGate } from "@/components/connect-gate";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import { Download, Copy, Check, Droplets, ExternalLink, DollarSign } from "lucide-react";
import { AnimatedIcon } from "@/components/animated-icon";
import { friendlyError } from "@/lib/friendly-errors";
import { Spinner } from "@/components/spinner";

// Bridge UI on by default; set NEXT_PUBLIC_BRIDGE_ENABLED=0 to hide.
const BRIDGE_UI = process.env.NEXT_PUBLIC_BRIDGE_ENABLED !== "0";

type BridgeCustomer = {
  wallet: string;
  email: string;
  customerId: string | null;
  kycStatus: string | null;
  tosStatus: string | null;
  kycUrl: string | null;
  tosUrl: string | null;
};

type DepositInstructions = {
  bank_name?: string;
  bank_routing_number?: string;
  bank_account_number?: string;
  bank_beneficiary_name?: string;
  deposit_message?: string;
  amount?: string;
  currency?: string;
  payment_rail?: string;
};

export default function GetPage() {
  const { publicKey, refreshBalance } = useWallet();
  const { network } = useNetwork();
  const [copied, setCopied] = useState(false);
  const [airdropping, setAirdropping] = useState(false);
  const [airdropDone, setAirdropDone] = useState(false);

  // Bridge USDC onramp
  const [bridgeEmail, setBridgeEmail] = useState("");
  const [bridgeAmount, setBridgeAmount] = useState(50);
  const [bridgeFlexible, setBridgeFlexible] = useState(true);
  const [bridgeBusy, setBridgeBusy] = useState(false);
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  const [bridgeCustomer, setBridgeCustomer] = useState<BridgeCustomer | null>(null);
  // null = still checking API (do not flash "not configured")
  const [bridgeConfigured, setBridgeConfigured] = useState<boolean | null>(null);
  const [deposit, setDeposit] = useState<DepositInstructions | null>(null);
  const [transferId, setTransferId] = useState<string | null>(null);

  const copyAddress = useCallback(() => {
    if (!publicKey) return;
    navigator.clipboard.writeText(publicKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [publicKey]);

  const handleAirdrop = useCallback(async () => {
    if (!publicKey || network !== "devnet") return;
    setAirdropping(true);
    setAirdropDone(false);
    try {
      const res = await fetch("/api/airdrop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: publicKey }),
      });
      const data = (await res.json()) as { ok?: boolean };
      if (data.ok) {
        await new Promise((r) => setTimeout(r, 2000));
        await refreshBalance();
        setAirdropDone(true);
        setTimeout(() => setAirdropDone(false), 3000);
      }
    } catch {
      // silently fail
    } finally {
      setAirdropping(false);
    }
  }, [publicKey, network, refreshBalance]);

  const loadBridge = useCallback(async () => {
    if (!BRIDGE_UI) return;
    try {
      const q = publicKey
        ? `?wallet=${encodeURIComponent(publicKey)}`
        : "";
      const res = await fetch(`/api/bridge/kyc${q}`, { cache: "no-store" });
      const data = (await res.json()) as {
        configured?: boolean;
        customer?: BridgeCustomer | null;
      };
      setBridgeConfigured(data.configured === true);
      if (data.customer) setBridgeCustomer(data.customer);
      else if (publicKey) setBridgeCustomer(null);
    } catch {
      setBridgeConfigured(false);
    }
  }, [publicKey]);

  useEffect(() => {
    void loadBridge();
  }, [loadBridge]);

  const startBridgeKyc = async () => {
    if (!publicKey || !bridgeEmail.trim()) return;
    setBridgeError(null);
    setBridgeBusy(true);
    try {
      const res = await fetch("/api/bridge/kyc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: publicKey, email: bridgeEmail.trim() }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        customer?: BridgeCustomer;
        kycUrl?: string;
        tosUrl?: string;
        alreadyApproved?: boolean;
      };
      if (!res.ok || !data.ok) throw new Error(data.error || "Could not start KYC");
      setBridgeCustomer(data.customer ?? null);
      if (data.alreadyApproved) return;
      // Prefer KYC link; ToS is often embedded or listed separately
      const url = data.kycUrl || data.tosUrl || data.customer?.kycUrl || data.customer?.tosUrl;
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      else throw new Error("No KYC URL returned");
    } catch (e) {
      setBridgeError(friendlyError(e, "Could not start Bridge KYC."));
    } finally {
      setBridgeBusy(false);
    }
  };

  const createBridgeTransfer = async () => {
    if (!publicKey) return;
    setBridgeError(null);
    setBridgeBusy(true);
    setDeposit(null);
    try {
      const res = await fetch("/api/bridge/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: publicKey,
          amount: bridgeFlexible ? undefined : bridgeAmount,
          flexible: bridgeFlexible,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        needKyc?: boolean;
        kycUrl?: string;
        depositInstructions?: DepositInstructions | null;
        transfer?: { id?: string; state?: string };
      };
      if (!res.ok || !data.ok) {
        if (data.needKyc && data.kycUrl) {
          window.open(data.kycUrl, "_blank", "noopener,noreferrer");
        }
        throw new Error(data.error || "Could not create transfer");
      }
      setDeposit(data.depositInstructions || null);
      setTransferId(data.transfer?.id || null);
      await loadBridge();
    } catch (e) {
      setBridgeError(friendlyError(e, "Could not create Bridge transfer."));
    } finally {
      setBridgeBusy(false);
    }
  };

  const kycApproved = bridgeCustomer?.kycStatus === "approved";

  const solscanUrl = publicKey
    ? `https://orbmarkets.io/address/${publicKey}${network === "devnet" ? "?cluster=devnet&hideSpam=true" : "?hideSpam=true"}`
    : "#";

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      <Navbar />
      <main className="flex-1 flex flex-col px-4 py-4 sm:px-6 sm:py-8 sm:items-center">
        <ConnectGate action="get SOL">
          <PageTransition>
          <div className="w-full sm:max-w-lg space-y-8">
            <div className="text-center space-y-3">
              <AnimatedIcon icon={Download} size={40} className="text-purple-400" />
              <h1 className="text-3xl font-bold tracking-tight">Get funds</h1>
              <p className="text-gray-500 dark:text-white/50">
                Receive SOL or USDC to your wallet.
              </p>
            </div>

            {/* Your address */}
            <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl p-5 space-y-3">
              <p className="text-xs text-gray-500 dark:text-white/40 uppercase tracking-wider">Your address</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm font-mono text-purple-300 break-all">{publicKey}</code>
                <button
                  onClick={copyAddress}
                  className="shrink-0 p-2 rounded-lg bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition cursor-pointer"
                  title="Copy address"
                >
                  {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} className="text-gray-500 dark:text-white/50" />}
                </button>
              </div>
              {copied && <p className="text-xs text-green-400">Copied!</p>}
            </div>

            {/* QR Code */}
            <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl p-5 flex flex-col items-center gap-3">
              <p className="text-xs text-gray-500 dark:text-white/40 uppercase tracking-wider">Scan to send</p>
              <div className="bg-white rounded-xl p-4">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=solana:${publicKey}`}
                  alt="QR Code"
                  width={200}
                  height={200}
                />
              </div>
              <p className="text-xs text-gray-400 dark:text-white/30">Works with any Solana wallet</p>
            </div>

            {/* Devnet faucet */}
            {network === "devnet" && (
              <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Droplets size={18} className="text-yellow-400" />
                  <p className="font-semibold text-yellow-300">Devnet Faucet</p>
                </div>
                <p className="text-sm text-gray-500 dark:text-white/40">Get free devnet SOL for testing.</p>
                <button
                  onClick={handleAirdrop}
                  disabled={airdropping}
                  className="w-full bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/30 text-yellow-300 font-semibold rounded-xl px-4 py-3 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  {airdropping ? "Sending..." : airdropDone ? <><Check className="w-4 h-4 inline" /> 0.1 SOL sent!</> : "Airdrop 0.1 SOL"}
                </button>
              </div>
            )}

            {/* Bridge — Get USDC (ACH / wire) */}
            {BRIDGE_UI && network === "mainnet" && (
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
                    <DollarSign size={16} className="text-emerald-500" /> Get USDC
                  </p>
                  <span className="text-xs text-emerald-600/80 dark:text-emerald-400/80">via Bridge</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-white/40">
                  Deposit USD (ACH or wire). Bridge sends USDC to your Solana wallet after KYC.
                </p>

                {bridgeConfigured === null && (
                  <p className="text-xs text-gray-500 dark:text-white/40 flex items-center gap-2">
                    <Spinner size={14} /> Checking Bridge…
                  </p>
                )}

                {bridgeConfigured === false && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Bridge is temporarily unavailable. Refresh and try again.
                  </p>
                )}

                {bridgeConfigured === true && !kycApproved && (
                  <div className="space-y-3">
                    <input
                      type="email"
                      placeholder="Email for KYC"
                      value={bridgeEmail}
                      onChange={(e) => setBridgeEmail(e.target.value)}
                      disabled={bridgeBusy}
                      className="w-full px-3 py-2.5 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-sm focus:outline-none focus:border-emerald-400/50"
                    />
                    {bridgeCustomer?.kycStatus && (
                      <p className="text-xs text-gray-500 dark:text-white/40">
                        Status: <span className="font-mono">{bridgeCustomer.kycStatus}</span>
                        {bridgeCustomer.tosStatus ? ` · ToS ${bridgeCustomer.tosStatus}` : ""}
                      </p>
                    )}
                    <button
                      onClick={() => void startBridgeKyc()}
                      disabled={bridgeBusy || !bridgeEmail.trim()}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold rounded-xl px-4 py-3 transition cursor-pointer flex items-center justify-center gap-2"
                    >
                      {bridgeBusy ? <Spinner size={16} /> : null}
                      {bridgeCustomer?.kycUrl ? "Continue KYC" : "Start KYC"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void loadBridge()}
                      className="w-full text-xs text-gray-400 hover:text-emerald-500 transition cursor-pointer"
                    >
                      Refresh status after KYC
                    </button>
                  </div>
                )}

                {bridgeConfigured === true && kycApproved && !deposit && (
                  <div className="space-y-3">
                    <p className="text-xs text-emerald-600 dark:text-emerald-400">KYC approved. Create a deposit.</p>
                    <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-white/60 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={bridgeFlexible}
                        onChange={(e) => setBridgeFlexible(e.target.checked)}
                        className="rounded"
                      />
                      Flexible amount (any deposit size)
                    </label>
                    {!bridgeFlexible && (
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                        <input
                          type="number"
                          min={1}
                          max={50000}
                          value={bridgeAmount}
                          onChange={(e) => setBridgeAmount(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-full pl-7 pr-3 py-2 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-sm"
                        />
                      </div>
                    )}
                    <button
                      onClick={() => void createBridgeTransfer()}
                      disabled={bridgeBusy}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold rounded-xl px-4 py-3 transition cursor-pointer flex items-center justify-center gap-2"
                    >
                      {bridgeBusy ? <Spinner size={16} /> : null}
                      Get deposit instructions
                    </button>
                  </div>
                )}

                {deposit && (
                  <div className="space-y-2 text-left bg-black/5 dark:bg-white/5 rounded-xl p-4 text-sm">
                    <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
                      Send USD bank deposit
                    </p>
                    {deposit.bank_name && (
                      <p>
                        <span className="text-gray-400">Bank: </span>
                        {deposit.bank_name}
                      </p>
                    )}
                    {deposit.bank_routing_number && (
                      <p className="font-mono text-xs">
                        <span className="text-gray-400 font-sans">Routing: </span>
                        {deposit.bank_routing_number}
                      </p>
                    )}
                    {deposit.bank_account_number && (
                      <p className="font-mono text-xs">
                        <span className="text-gray-400 font-sans">Account: </span>
                        {deposit.bank_account_number}
                      </p>
                    )}
                    {deposit.bank_beneficiary_name && (
                      <p>
                        <span className="text-gray-400">Beneficiary: </span>
                        {deposit.bank_beneficiary_name}
                      </p>
                    )}
                    {deposit.deposit_message && (
                      <p className="font-mono text-xs break-all">
                        <span className="text-gray-400 font-sans">Memo (required): </span>
                        {deposit.deposit_message}
                      </p>
                    )}
                    {transferId && (
                      <p className="text-[11px] text-gray-400 font-mono">Transfer {transferId}</p>
                    )}
                    <p className="text-[11px] text-gray-500 dark:text-white/40 pt-1">
                      Memo must match exactly. USDC arrives on Solana after Bridge processes the deposit.
                    </p>
                  </div>
                )}

                {bridgeError && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-red-400 text-xs">
                    {bridgeError}
                  </div>
                )}
              </div>
            )}

            {/* View on explorer */}
            <a
              href={solscanUrl}
              target="_blank"
              className="flex items-center justify-center gap-1.5 w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60 rounded-xl px-4 py-3 hover:text-gray-900 dark:hover:text-white transition text-center text-sm"
            >
              View on Orb Markets <ExternalLink className="w-3.5 h-3.5 inline ml-1" />
            </a>
          </div>
          </PageTransition>
        </ConnectGate>
      </main>
    </div>
  );
}
