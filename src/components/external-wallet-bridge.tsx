"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useConnector, useTransactionSigner } from "@solana/connector/react";
import type { WalletConnectorId } from "@solana/connector/react";
import type { Transaction, VersionedTransaction } from "@solana/web3.js";
import { X, Wallet, Loader2 } from "lucide-react";
import { useWallet } from "@/lib/wallet-context";
import {
  registerExternalDisconnect,
  registerExternalSigner,
  registerWalletPicker,
} from "@/lib/external-wallet";

/**
 * Bridges ConnectorKit ↔ sol.new wallet-context:
 * - multi-wallet picker modal
 * - external session activation
 * - legacy web3.js tx signing
 */
export function ExternalWalletBridge() {
  const [open, setOpen] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const [pickingId, setPickingId] = useState<string | null>(null);

  const {
    connectors,
    connectWallet,
    disconnectWallet,
    isConnected,
    isConnecting,
    account,
    connector,
    walletError,
  } = useConnector();

  const { signer, ready } = useTransactionSigner();
  const { activateExternal, walletKind, publicKey } = useWallet();

  useEffect(() => setPortalReady(true), []);

  useEffect(() => {
    registerWalletPicker(() => setOpen(true));
    return () => registerWalletPicker(null);
  }, []);

  useEffect(() => {
    registerExternalDisconnect(async () => {
      try {
        await disconnectWallet();
      } catch {
        /* ignore */
      }
    });
    return () => registerExternalDisconnect(null);
  }, [disconnectWallet]);

  useEffect(() => {
    if (walletKind === "external" && signer && ready) {
      registerExternalSigner(async <T extends Transaction | VersionedTransaction>(tx: T) => {
        const signed = await signer.signTransaction(tx);
        return signed as T;
      });
    } else {
      registerExternalSigner(null);
    }
    return () => registerExternalSigner(null);
  }, [walletKind, signer, ready]);

  useEffect(() => {
    if (!isConnected || !account) return;
    const pk = String(account);
    const label = connector?.name || "Wallet";
    activateExternal(pk, label);
    setOpen(false);
    setPickingId(null);
  }, [isConnected, account, connector?.name, activateExternal]);

  useEffect(() => {
    if (walletKind !== "external" && isConnected && !publicKey) {
      void disconnectWallet();
    }
  }, [walletKind, isConnected, publicKey, disconnectWallet]);

  const onPick = useCallback(
    async (id: WalletConnectorId | string) => {
      setPickingId(String(id));
      try {
        await connectWallet(id as WalletConnectorId);
      } catch {
        setPickingId(null);
      }
    },
    [connectWallet],
  );

  if (!portalReady || !open) return null;

  const list = [...connectors].sort((a, b) => {
    if (a.ready !== b.ready) return a.ready ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        aria-label="Close wallet picker"
        onClick={() => {
          setOpen(false);
          setPickingId(null);
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-picker-title"
        className="relative z-[301] w-full sm:max-w-md max-h-[85vh] overflow-hidden rounded-t-3xl sm:rounded-2xl bg-white dark:bg-[#0c0c0e] border border-black/10 dark:border-white/10 shadow-2xl flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/10 dark:border-white/10">
          <div>
            <h2
              id="wallet-picker-title"
              className="text-base font-semibold text-gray-900 dark:text-white"
            >
              Connect a wallet
            </h2>
            <p className="text-xs text-gray-500 dark:text-white/45 mt-0.5">
              Phantom, Solflare, Backpack, Glow, OKX, and more
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setPickingId(null);
            }}
            className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-gray-500"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto p-3 space-y-1.5 flex-1">
          {list.length === 0 ? (
            <div className="px-3 py-10 text-center space-y-2">
              <Wallet className="mx-auto text-gray-400" size={28} />
              <p className="text-sm text-gray-600 dark:text-white/60">
                No Solana wallets detected in this browser.
              </p>
              <p className="text-xs text-gray-400 dark:text-white/35 leading-relaxed">
                Install{" "}
                <a
                  className="text-violet-500 underline"
                  href="https://phantom.app"
                  target="_blank"
                  rel="noreferrer"
                >
                  Phantom
                </a>
                ,{" "}
                <a
                  className="text-violet-500 underline"
                  href="https://solflare.com"
                  target="_blank"
                  rel="noreferrer"
                >
                  Solflare
                </a>
                , Backpack, or Glow — then refresh. On mobile, open sol.new inside a wallet
                browser or use Solana Mobile.
              </p>
            </div>
          ) : (
            list.map((c) => {
              const busy = pickingId === String(c.id) || (isConnecting && pickingId === String(c.id));
              const iconUrl =
                typeof c.icon === "string"
                  ? c.icon
                  : c.icon && typeof c.icon === "object" && "src" in c.icon
                    ? String((c.icon as { src?: string }).src || "")
                    : "";
              return (
                <button
                  key={String(c.id)}
                  type="button"
                  disabled={!c.ready || isConnecting}
                  onClick={() => void onPick(c.id)}
                  className="w-full flex items-center gap-3 rounded-xl border border-black/10 dark:border-white/10 px-3 py-3 text-left hover:border-violet-400/50 hover:bg-violet-500/5 disabled:opacity-45 disabled:cursor-not-allowed transition"
                >
                  {iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={iconUrl}
                      alt=""
                      className="w-9 h-9 rounded-lg bg-black/5 dark:bg-white/10 object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-lg bg-violet-500/15 flex items-center justify-center shrink-0">
                      <Wallet size={18} className="text-violet-500" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                      {c.name}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {c.ready ? "Detected" : "Not available"}
                    </p>
                  </div>
                  {busy ? (
                    <Loader2 size={16} className="animate-spin text-violet-500 shrink-0" />
                  ) : (
                    <span className="text-xs font-semibold text-violet-600 dark:text-violet-400 shrink-0">
                      Connect
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {walletError && (
          <div className="mx-3 mb-3 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-300">
            {walletError.message || "Could not connect wallet"}
          </div>
        )}

        <div className="px-4 py-3 border-t border-black/10 dark:border-white/10 text-[11px] text-gray-400 dark:text-white/35 text-center">
          Optional — passkey wallets still work without an extension.
        </div>
      </div>
    </div>,
    document.body,
  );
}
