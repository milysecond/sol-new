"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Copy, Check, Droplets, ExternalLink, Apple } from "lucide-react";
import { QrCode } from "@/components/qr-code";
import { WalletShell } from "@/components/wallet-shell";
import { PageTransition } from "@/components/page-transition";
import { BuySolModal } from "@/components/buy-sol-modal";
import { ConvertToSolCard } from "@/components/convert-to-sol-card";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";

const BUY_MODAL_SEEN_KEY = "sol.new.buy_modal_seen";
const ONRAMP_ENABLED = process.env.NEXT_PUBLIC_ONRAMP_ENABLED === "1";

function QrModal({ open, onClose, publicKey, onCopy, copied }: {
  open: boolean; onClose: () => void; publicKey: string; onCopy: () => void; copied: boolean;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<number | null>(null);
  const dragY = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    dragStart.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (dragStart.current === null) return;
    const dy = e.touches[0].clientY - dragStart.current;
    dragY.current = Math.max(0, dy);
    if (sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${dragY.current}px)`;
      sheetRef.current.style.transition = 'none';
    }
  };

  const handleTouchEnd = () => {
    if (dragY.current > 100) {
      onClose();
    }
    if (sheetRef.current) {
      sheetRef.current.style.transform = '';
      sheetRef.current.style.transition = '';
    }
    dragStart.current = null;
    dragY.current = 0;
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop — click anywhere to close on desktop */}
      <div
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]"
        onClick={onClose}
      />
      {/* Mobile: bottom sheet / Desktop: centered */}
      <div className="fixed z-50 inset-x-0 bottom-0 sm:inset-0 sm:flex sm:items-center sm:justify-center" onClick={onClose}>
        <div
          ref={sheetRef}
          onClick={(e) => e.stopPropagation()}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-2xl w-full sm:max-w-sm p-8 flex flex-col items-center gap-5 animate-[slideUp_0.3s_ease-out] sm:animate-[scaleIn_0.2s_ease-out] shadow-2xl transition-transform"
        >
          {/* Drag handle (mobile) */}
          <div className="w-12 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 sm:hidden" />
          <div className="bg-white rounded-2xl p-4">
            <QrCode data={`solana:${publicKey}`} size={224} className="w-56 h-56" />
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-xs font-mono break-all text-center leading-relaxed">{publicKey}</p>
          <button
            onClick={onCopy}
            className="w-full flex items-center justify-center gap-1.5 bg-fuchsia-500 hover:bg-fuchsia-400 text-white font-semibold rounded-xl px-4 py-3 transition"
          >
            {copied ? <><Check size={16} /> Copied</> : <><Copy size={16} /> Copy address</>}
          </button>
        </div>
      </div>
    </>
  );
}

export default function WalletGetPage() {
  const { publicKey, balance, airdropping, airdropDone, handleAirdrop } = useWallet();
  const { network } = useNetwork();
  const [copied, setCopied] = useState(false);

  const clusterParam = network === "devnet" ? "?cluster=devnet&hideSpam=true" : "?hideSpam=true";
  const [qrFullscreen, setQrFullscreen] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);

  // Auto-prompt the buy modal once when a mainnet wallet has zero balance.
  // Why: empty new wallets can't actually use the app; surface Apple Pay
  // funding the first time we observe a 0 balance, then never re-trigger.
  useEffect(() => {
    if (!ONRAMP_ENABLED) return;
    if (network !== "mainnet" || !publicKey || balance === null || balance > 0) return;
    if (typeof window === "undefined") return;
    if (localStorage.getItem(BUY_MODAL_SEEN_KEY)) return;
    localStorage.setItem(BUY_MODAL_SEEN_KEY, "1");
    queueMicrotask(() => setBuyOpen(true));
  }, [network, publicKey, balance]);

  // Max brightness when fullscreen QR is shown
  useEffect(() => {
    if (qrFullscreen && 'wakeLock' in navigator) {
      let lock: WakeLockSentinel | null = null;
      (navigator as Navigator & { wakeLock: { request: (type: string) => Promise<WakeLockSentinel> } }).wakeLock.request('screen').then(l => { lock = l; }).catch(() => {});
      return () => { lock?.release(); };
    }
  }, [qrFullscreen]);

  const copyAddress = useCallback(() => {
    if (!publicKey) return;
    navigator.clipboard.writeText(publicKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [publicKey]);

  return (
    <WalletShell>
      <PageTransition>
      {/* QR modal — preloaded, toggled via visibility */}
      {publicKey && <>
      <QrModal
        open={qrFullscreen}
        onClose={() => setQrFullscreen(false)}
        publicKey={publicKey}
        onCopy={copyAddress}
        copied={copied}
      />
      <BuySolModal open={buyOpen} onClose={() => setBuyOpen(false)} publicKey={publicKey} />
      {ONRAMP_ENABLED && network === "mainnet" && <ConvertToSolCard />}
      <div className="space-y-3">
        <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl p-4 flex items-center gap-4">
          <div className="shrink-0 cursor-pointer hover:shadow-md transition flex flex-col items-center" onClick={() => setQrFullscreen(true)}>
            <div className="bg-white rounded-lg p-2">
              <QrCode data={`solana:${publicKey}`} size={80} className="w-20 h-20" />
            </div>
            <p className="text-[10px] text-gray-400 dark:text-white/30 mt-1">Tap to enlarge</p>
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <p className="text-xs text-gray-500 dark:text-white/40">Send SOL to this address</p>
            <code className="text-xs font-mono text-fuchsia-400 dark:text-fuchsia-300 break-all block leading-relaxed">{publicKey}</code>
            <button onClick={copyAddress} className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-white/50 hover:text-gray-700 dark:hover:text-white/70 transition cursor-pointer">
              {copied ? <><Check size={12} className="text-green-400" /> Copied</> : <><Copy size={12} /> Copy address</>}
            </button>
          </div>
        </div>

        {network === "devnet" && (
          <button onClick={handleAirdrop} disabled={airdropping} className="w-full bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/30 text-yellow-300 font-semibold rounded-xl px-4 py-3 transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5">
            <Droplets size={14} className="inline mr-1" />
            {airdropping ? "Sending..." : airdropDone ? <><Check className="w-4 h-4 inline" /> 0.1 SOL sent!</> : "Airdrop 0.1 SOL"}
          </button>
        )}

        {ONRAMP_ENABLED && network === "mainnet" && (
          <button onClick={() => setBuyOpen(true)} className="w-full bg-black dark:bg-white text-white dark:text-black font-semibold rounded-xl px-4 py-3 transition cursor-pointer hover:bg-black/85 dark:hover:bg-white/85 active:scale-[0.98] flex items-center justify-center gap-1.5">
            <Apple size={14} className="inline" />
            Buy SOL with Apple Pay
          </button>
        )}

        <a href={`https://orbmarkets.io/address/${publicKey}${clusterParam}`} target="_blank" className="flex items-center justify-center gap-1.5 w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60 rounded-xl px-4 py-3 hover:text-gray-900 dark:hover:text-white transition text-center text-sm">
          View on Orb Markets <ExternalLink className="w-3.5 h-3.5 inline ml-1" />
        </a>
      </div>
      </>}
      </PageTransition>
    </WalletShell>
  );
}
