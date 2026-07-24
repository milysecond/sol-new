"use client";

import { useState, useCallback, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PageTransition } from "@/components/page-transition";
import { Navbar } from "@/components/navbar";
import { ConnectGate } from "@/components/connect-gate";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import { Download, Copy, Check, Droplets, ExternalLink, DollarSign } from "lucide-react";
import { AnimatedIcon } from "@/components/animated-icon";
import { friendlyError } from "@/lib/friendly-errors";
import { Spinner } from "@/components/spinner";
import { StripeOnrampPanel } from "@/components/stripe-onramp";

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

function openExternal(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

function isReady(c: BridgeCustomer | null | undefined) {
  return c?.kycStatus === "approved" && c?.tosStatus === "approved";
}

function StripeGetSection() {
  const { publicKey, refreshBalance } = useWallet();
  const [stripeOk, setStripeOk] = useState<boolean | null>(null);
  const [amount, setAmount] = useState(50);
  const [asset, setAsset] = useState<"usdc" | "sol">("usdc");
  const [showCheckout, setShowCheckout] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/stripe/onramp", { cache: "no-store" });
        const data = (await res.json()) as { configured?: boolean };
        if (!cancelled) setStripeOk(data.configured === true);
      } catch {
        if (!cancelled) setStripeOk(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (stripeOk === null) {
    return (
      <div className="bg-purple-500/5 border border-purple-500/20 rounded-xl p-5 text-xs text-gray-500 flex items-center gap-2">
        <Spinner size={14} /> Checking Apple Pay / card…
      </div>
    );
  }

  if (!stripeOk) {
    return null;
  }

  return (
    <div className="bg-purple-500/5 border border-purple-500/20 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
          <DollarSign size={16} className="text-purple-500" /> Buy with Apple Pay
        </p>
        <span className="text-xs text-purple-600/80 dark:text-purple-400/80">via Stripe</span>
      </div>
      <p className="text-xs text-gray-500 dark:text-white/40">
        Card, Apple Pay, Google Pay, or bank. Stripe handles KYC and sends crypto to your wallet.
        Usually minutes. Available in the US and EU only (not Hawaii). Everywhere else, use bank
        deposit below.
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setAsset("usdc");
            setShowCheckout(false);
          }}
          className={`flex-1 text-sm font-semibold rounded-lg px-3 py-2 transition cursor-pointer ${
            asset === "usdc"
              ? "bg-purple-600 text-white"
              : "bg-black/5 dark:bg-white/5 text-gray-600 dark:text-white/60"
          }`}
        >
          USDC
        </button>
        <button
          type="button"
          onClick={() => {
            setAsset("sol");
            setShowCheckout(false);
          }}
          className={`flex-1 text-sm font-semibold rounded-lg px-3 py-2 transition cursor-pointer ${
            asset === "sol"
              ? "bg-purple-600 text-white"
              : "bg-black/5 dark:bg-white/5 text-gray-600 dark:text-white/60"
          }`}
        >
          SOL
        </button>
      </div>

      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
        <input
          type="number"
          min={5}
          max={10000}
          step={1}
          value={amount}
          onChange={(e) => {
            setAmount(Math.max(5, Math.min(10000, parseInt(e.target.value) || 5)));
            setShowCheckout(false);
          }}
          className="w-full pl-7 pr-3 py-2.5 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-sm"
        />
      </div>

      {!showCheckout && publicKey && (
        <button
          type="button"
          onClick={() => setShowCheckout(true)}
          className="w-full bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-xl px-4 py-3 transition cursor-pointer"
        >
          Continue to Apple Pay / card
        </button>
      )}

      {showCheckout && publicKey && (
        <StripeOnrampPanel
          wallet={publicKey}
          amountUsd={amount}
          asset={asset}
          onComplete={(st) => {
            if (st === "fulfillment_complete" || st === "fulfillment_processing") {
              void refreshBalance();
            }
          }}
        />
      )}
    </div>
  );
}

function BridgeGetSection() {
  const { publicKey } = useWallet();
  const searchParams = useSearchParams();
  const [bridgeEmail, setBridgeEmail] = useState("");
  const [bridgeAmount, setBridgeAmount] = useState(50);
  const [bridgeFlexible, setBridgeFlexible] = useState(true);
  const [bridgeBusy, setBridgeBusy] = useState(false);
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  const [bridgeNote, setBridgeNote] = useState<string | null>(null);
  const [bridgeCustomer, setBridgeCustomer] = useState<BridgeCustomer | null>(null);
  // null = still checking API (do not flash "not configured")
  const [bridgeConfigured, setBridgeConfigured] = useState<boolean | null>(null);
  const [deposit, setDeposit] = useState<DepositInstructions | null>(null);
  const [transferId, setTransferId] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [emailedTo, setEmailedTo] = useState<string | null>(null);

  const loadBridge = useCallback(async () => {
    if (!BRIDGE_UI) return;
    try {
      const q = publicKey ? `?wallet=${encodeURIComponent(publicKey)}` : "";
      const res = await fetch(`/api/bridge/kyc${q}`, { cache: "no-store" });
      const data = (await res.json()) as {
        configured?: boolean;
        customer?: BridgeCustomer | null;
      };
      setBridgeConfigured(data.configured === true);
      if (data.customer) {
        setBridgeCustomer(data.customer);
        if (data.customer.email && !bridgeEmail) {
          setBridgeEmail(data.customer.email);
        }
      } else if (publicKey) {
        setBridgeCustomer(null);
      }
    } catch {
      setBridgeConfigured(false);
    }
  }, [publicKey, bridgeEmail]);

  useEffect(() => {
    void loadBridge();
  }, [loadBridge]);

  // After Persona redirects back (?bridge=kyc_done), refresh status
  useEffect(() => {
    if (searchParams.get("bridge") === "kyc_done") {
      setBridgeNote("Returned from identity check. Refreshing status…");
      void loadBridge().then(() => {
        setBridgeNote("Status updated. If terms are still pending, open Accept Bridge terms.");
      });
    }
  }, [searchParams, loadBridge]);

  const startBridgeKyc = async () => {
    if (!publicKey || !bridgeEmail.trim()) return;
    setBridgeError(null);
    setBridgeNote(null);
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
        emailSent?: boolean;
      };
      if (!res.ok || !data.ok) throw new Error(data.error || "Could not start verification");
      setBridgeCustomer(data.customer ?? null);
      if (data.alreadyApproved) {
        setBridgeNote("Verification complete. You can create a deposit.");
        return;
      }

      // Never auto-open only KYC: ToS must be accepted by the end user first.
      // Keep both links on screen; open ToS if pending so they are not stuck in admin.
      const tos =
        data.tosUrl || data.customer?.tosUrl || null;
      const kyc =
        data.kycUrl || data.customer?.kycUrl || null;
      if (!tos && !kyc) throw new Error("No verification links returned");

      if (data.emailSent) {
        setBridgeNote(
          `We emailed both steps to ${bridgeEmail.trim()}. Accept Bridge terms first, then verify identity.`,
        );
      } else {
        setBridgeNote(
          "Accept Bridge terms first (step 1), then verify identity (step 2). Complete both yourself in the browser.",
        );
      }

      // Open the step they still need, preferring ToS
      const tosPending =
        (data.customer?.tosStatus || "pending") !== "approved";
      if (tosPending && tos) openExternal(tos);
      else if (kyc) openExternal(kyc);
    } catch (e) {
      setBridgeError(friendlyError(e, "Could not start Bridge verification."));
    } finally {
      setBridgeBusy(false);
    }
  };

  const createBridgeTransfer = async () => {
    if (!publicKey) return;
    setBridgeError(null);
    setBridgeNote(null);
    setBridgeBusy(true);
    setDeposit(null);
    setEmailSent(false);
    setEmailedTo(null);
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
        needTos?: boolean;
        kycUrl?: string;
        tosUrl?: string;
        depositInstructions?: DepositInstructions | null;
        transfer?: { id?: string; state?: string };
        emailSent?: boolean;
        emailedTo?: string | null;
      };
      if (!res.ok || !data.ok) {
        if (data.needTos && data.tosUrl) {
          openExternal(data.tosUrl);
        } else if (data.needKyc && data.kycUrl) {
          openExternal(data.kycUrl);
        }
        throw new Error(data.error || "Could not create transfer");
      }
      setDeposit(data.depositInstructions || null);
      setTransferId(data.transfer?.id || null);
      setEmailSent(Boolean(data.emailSent));
      setEmailedTo(data.emailedTo || null);
      if (data.emailSent && data.emailedTo) {
        setBridgeNote(`Deposit instructions emailed to ${data.emailedTo}.`);
      }
      await loadBridge();
    } catch (e) {
      setBridgeError(friendlyError(e, "Could not create Bridge transfer."));
    } finally {
      setBridgeBusy(false);
    }
  };

  const ready = isReady(bridgeCustomer);
  const tosApproved = bridgeCustomer?.tosStatus === "approved";
  const kycApproved = bridgeCustomer?.kycStatus === "approved";
  const hasLinks = Boolean(bridgeCustomer?.tosUrl || bridgeCustomer?.kycUrl);

  return (
    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
          <DollarSign size={16} className="text-emerald-500" /> Bank deposit (USDC)
        </p>
        <span className="text-xs text-emerald-600/80 dark:text-emerald-400/80">via Bridge</span>
      </div>
      <p className="text-xs text-gray-500 dark:text-white/40">
        ACH or wire. Usually lower fees, slower (1–3 business days). Complete Bridge terms + KYC yourself, then send a bank transfer.
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

      {bridgeConfigured === true && !ready && (
        <div className="space-y-3">
          <input
            type="email"
            placeholder="Email for verification + deposit instructions"
            value={bridgeEmail}
            onChange={(e) => setBridgeEmail(e.target.value)}
            disabled={bridgeBusy}
            className="w-full px-3 py-2.5 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-sm focus:outline-none focus:border-emerald-400/50"
          />

          {!hasLinks && (
            <button
              onClick={() => void startBridgeKyc()}
              disabled={bridgeBusy || !bridgeEmail.trim()}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold rounded-xl px-4 py-3 transition cursor-pointer flex items-center justify-center gap-2"
            >
              {bridgeBusy ? <Spinner size={16} /> : null}
              Start verification
            </button>
          )}

          {hasLinks && (
            <div className="space-y-2">
              <p className="text-[11px] text-gray-500 dark:text-white/40">
                Complete both steps yourself. The terms link is Bridge&apos;s customer page (not something you accept in the admin dashboard for the user).
              </p>

              {/* Step 1: ToS */}
              <div
                className={`rounded-lg border px-3 py-3 space-y-2 ${
                  tosApproved
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : "border-amber-500/30 bg-amber-500/5"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-gray-900 dark:text-white">
                    1. Accept Bridge terms
                  </p>
                  <span className="text-[10px] font-mono text-gray-500">
                    {bridgeCustomer?.tosStatus || "pending"}
                  </span>
                </div>
                {!tosApproved && bridgeCustomer?.tosUrl && (
                  <button
                    type="button"
                    onClick={() => openExternal(bridgeCustomer.tosUrl!)}
                    className="w-full bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold rounded-lg px-3 py-2.5 transition cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    Open terms to accept <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                )}
                {tosApproved && (
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Terms accepted
                  </p>
                )}
              </div>

              {/* Step 2: KYC */}
              <div
                className={`rounded-lg border px-3 py-3 space-y-2 ${
                  kycApproved
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : "border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-gray-900 dark:text-white">
                    2. Verify identity
                  </p>
                  <span className="text-[10px] font-mono text-gray-500">
                    {bridgeCustomer?.kycStatus || "not_started"}
                  </span>
                </div>
                {!kycApproved && bridgeCustomer?.kycUrl && (
                  <button
                    type="button"
                    onClick={() => openExternal(bridgeCustomer.kycUrl!)}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg px-3 py-2.5 transition cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    Open identity check <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                )}
                {kycApproved && (
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Identity approved
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => void startBridgeKyc()}
                disabled={bridgeBusy || !bridgeEmail.trim()}
                className="w-full text-xs text-gray-400 hover:text-emerald-500 transition cursor-pointer py-1"
              >
                Resend links by email
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => void loadBridge()}
            className="w-full text-xs text-gray-400 hover:text-emerald-500 transition cursor-pointer"
          >
            Refresh status after you finish a step
          </button>
        </div>
      )}

      {bridgeConfigured === true && ready && !deposit && (
        <div className="space-y-3">
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            Verification complete (terms + KYC). Create a deposit. Instructions show here and email to{" "}
            {bridgeCustomer?.email || "your address"}.
          </p>
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
          {emailSent && emailedTo && (
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
              Also emailed to {emailedTo}
            </p>
          )}
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

      {bridgeNote && !bridgeError && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2 text-emerald-700 dark:text-emerald-300 text-xs">
          {bridgeNote}
        </div>
      )}

      {bridgeError && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-red-400 text-xs">
          {bridgeError}
        </div>
      )}
    </div>
  );
}

export default function GetPage() {
  const { publicKey, refreshBalance } = useWallet();
  const { network } = useNetwork();
  const [copied, setCopied] = useState(false);
  const [airdropping, setAirdropping] = useState(false);
  const [airdropDone, setAirdropDone] = useState(false);

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

            {/* Stripe Apple Pay / card (primary) + Bridge bank (secondary) */}
            {network === "mainnet" && (
              <>
                <StripeGetSection />
                {BRIDGE_UI && (
                  <Suspense
                    fallback={
                      <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-5 text-xs text-gray-500">
                        Loading bank deposit…
                      </div>
                    }
                  >
                    <BridgeGetSection />
                  </Suspense>
                )}
              </>
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
