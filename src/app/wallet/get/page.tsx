"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { BottomSheet } from "@/components/bottom-sheet";
import { Copy, Check, Droplets, ExternalLink, DollarSign } from "lucide-react";
import { QrCode } from "@/components/qr-code";
import { WalletShell } from "@/components/wallet-shell";
import { PageTransition } from "@/components/page-transition";
import { ConvertToSolCard } from "@/components/convert-to-sol-card";
import { RequestFundsShare } from "@/components/request-funds-share";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import { addressPath, EXPLORER_LABEL } from "@/lib/explorer";

function QrModal({
  open,
  onClose,
  publicKey,
  onCopy,
  copied,
}: {
  open: boolean;
  onClose: () => void;
  publicKey: string;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      className="p-5 flex flex-col items-center gap-3 max-h-[90dvh] overflow-y-auto"
    >
      <p className="text-[11px] font-medium text-gray-500 dark:text-white/45 text-center">
        Connected wallet · scan to pay this address
      </p>
      <div className="bg-white rounded-2xl p-3">
        <QrCode data={`solana:${publicKey}`} size={240} className="w-60 h-60 max-w-[min(60vw,240px)] max-h-[min(60vw,240px)]" />
      </div>
      <p className="text-gray-600 dark:text-white/70 text-[11px] font-mono break-all text-center leading-relaxed px-1">
        {publicKey}
      </p>
      <button
        type="button"
        onClick={onCopy}
        className="w-full flex items-center justify-center gap-1.5 bg-fuchsia-500 hover:bg-fuchsia-400 text-white font-semibold rounded-xl px-4 py-3.5 transition min-h-[48px]"
      >
        {copied ? (
          <>
            <Check size={16} /> Copied
          </>
        ) : (
          <>
            <Copy size={16} /> Copy address
          </>
        )}
      </button>
      <div className="w-full">
        <RequestFundsShare publicKey={publicKey} variant="compact" />
      </div>
    </BottomSheet>
  );
}

export default function WalletGetPage() {
  const { publicKey, airdropping, airdropDone, handleAirdrop, walletKind } = useWallet();
  const { network } = useNetwork();
  const [copied, setCopied] = useState(false);
  const [qrFullscreen, setQrFullscreen] = useState(false);

  useEffect(() => {
    if (qrFullscreen && "wakeLock" in navigator) {
      let lock: WakeLockSentinel | null = null;
      (navigator as Navigator & { wakeLock: { request: (type: string) => Promise<WakeLockSentinel> } })
        .wakeLock.request("screen")
        .then((l) => {
          lock = l;
        })
        .catch(() => {});
      return () => {
        lock?.release();
      };
    }
  }, [qrFullscreen]);

  const copyAddress = useCallback(() => {
    if (!publicKey) return;
    void navigator.clipboard.writeText(publicKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [publicKey]);

  // Always pin QR / ask / explorer to the live connected session
  const receivePk = publicKey;

  return (
    <WalletShell>
      <PageTransition>
        {receivePk && (
            <div className="space-y-2.5 sm:space-y-3">
              <QrModal
                open={qrFullscreen}
                onClose={() => setQrFullscreen(false)}
                publicKey={receivePk}
                onCopy={copyAddress}
                copied={copied}
              />

              {/* Seeker-first: big QR + id, less chrome */}
              <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl p-3 sm:p-4 flex items-center gap-3">
                <button
                  type="button"
                  className="shrink-0 cursor-pointer active:scale-[0.98] transition flex flex-col items-center touch-manipulation"
                  onClick={() => setQrFullscreen(true)}
                  aria-label="Enlarge receive QR"
                >
                  <div className="bg-white rounded-lg p-1.5 sm:p-2">
                    <QrCode
                      data={`solana:${receivePk}`}
                      size={96}
                      className="w-[5.5rem] h-[5.5rem] sm:w-24 sm:h-24"
                    />
                  </div>
                  <p className="text-[10px] text-gray-400 dark:text-white/30 mt-0.5">Tap QR</p>
                </button>
                <div className="flex-1 min-w-0 space-y-1.5">
                  <p className="text-[11px] font-medium text-gray-600 dark:text-white/55 leading-snug">
                    Receive to{" "}
                    <span className="text-fuchsia-600 dark:text-fuchsia-300">
                      {walletKind === "external" ? "connected wallet" : "your passkey wallet"}
                    </span>
                  </p>
                  <code className="text-[11px] sm:text-xs font-mono text-fuchsia-500 dark:text-fuchsia-300 break-all block leading-snug select-all">
                    {receivePk}
                  </code>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={copyAddress}
                      className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white transition min-h-[36px] px-1 -ml-1"
                    >
                      {copied ? (
                        <>
                          <Check size={13} className="text-green-400" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy size={13} /> Copy
                        </>
                      )}
                    </button>
                    <Link
                      href={addressPath(receivePk)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white transition min-h-[36px]"
                    >
                      <ExternalLink size={13} /> {EXPLORER_LABEL}
                    </Link>
                  </div>
                </div>
              </div>

              {network === "mainnet" && <ConvertToSolCard />}

              <RequestFundsShare publicKey={receivePk} variant="full" />

              {network === "devnet" && (
                <button
                  type="button"
                  onClick={() => void handleAirdrop()}
                  disabled={airdropping}
                  className="w-full bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/30 text-yellow-700 dark:text-yellow-300 font-semibold rounded-xl px-4 py-3 transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5 min-h-[48px]"
                >
                  <Droplets size={14} />
                  {airdropping ? (
                    "Sending…"
                  ) : airdropDone ? (
                    <>
                      <Check className="w-4 h-4" /> 0.1 SOL sent!
                    </>
                  ) : (
                    "Airdrop 0.1 SOL"
                  )}
                </button>
              )}

              {network === "mainnet" && (
                <Link
                  href="/get"
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl px-4 py-3 transition cursor-pointer flex items-center justify-center gap-1.5 min-h-[48px]"
                >
                  <DollarSign size={14} /> Get USDC
                </Link>
              )}
            </div>
          )}
      </PageTransition>
    </WalletShell>
  );
}
