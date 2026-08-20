"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { WalletShell } from "@/components/wallet-shell";
import { PageTransition } from "@/components/page-transition";
import { Coins, Image as ImageIcon, Check, ExternalLink, ChevronDown } from "lucide-react";
import { Spinner } from "@/components/spinner";
import { useWallet } from "@/lib/wallet-context";
import { formatQty, useHideBalances } from "@/lib/privacy";
import { useNetwork } from "@/lib/network";
import { getPasskeyKeypair, ensureDocumentFocusForPasskey } from "@/lib/passkey-wallet";
import dynamic from "next/dynamic";
const PrivateSendSheet = dynamic(
  () => import("@/components/private-send-sheet").then((m) => m.PrivateSendSheet),
  { ssr: false },
);
import { SlideToSend } from "@/components/slide-to-send";
import { resolveRecipient, looksLikeDomain, NAME_PLACEHOLDER } from "@/lib/resolve-name";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { friendlyError } from "@/lib/friendly-errors";
import {
  fetchWalletTokens,
  formatTokenUi,
  formatAmountInput,
  uiToRawAmount,
  type WalletToken,
} from "@/lib/wallet-tokens";
import { AmountUsdHint, TokenMetaRow } from "@/components/token-meta";

type Tab = "transfer" | "nft";

const SOL_FEE_RESERVE_LAMPORTS = 10_000;

function maxSendableSol(balanceSol: number | null | undefined): string {
  const bal = Math.round((balanceSol ?? 0) * LAMPORTS_PER_SOL);
  const sendable = Math.max(0, bal - SOL_FEE_RESERVE_LAMPORTS);
  if (sendable <= 0) return "";
  return (sendable / LAMPORTS_PER_SOL).toFixed(9).replace(/\.?0+$/, "");
}

export default function SendPage() {
  const [tab, setTab] = useState<Tab>("transfer");
  const [tokens, setTokens] = useState<WalletToken[]>([]);
  const [selected, setSelected] = useState<WalletToken | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<
    "idle" | "auth" | "sending" | "confirming" | "done" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [txId, setTxId] = useState<string | null>(null);
  const [resolved, setResolved] = useState<{ owner: string; label?: string } | null>(null);
  const [resolving, setResolving] = useState(false);
  const [addressValid, setAddressValid] = useState<boolean | null>(null);
  const resolveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { publicKey, balance, usdcBalance, refreshBalance } = useWallet();
  const [hideBalances] = useHideBalances();
  const { network, rpc } = useNetwork();

  const loadTokens = useCallback(async () => {
    if (!publicKey) {
      setTokens([]);
      setSelected(null);
      return;
    }
    setLoadingTokens(true);
    try {
      const conn = new Connection(rpc, "confirmed");
      const list = await fetchWalletTokens(conn, publicKey, { solBalance: balance });
      setTokens(list);
      setSelected((prev) => {
        if (prev) {
          const again = list.find((t) => t.mint === prev.mint);
          if (again) return again;
        }
        return list[0] || null;
      });
    } catch {
      setTokens([]);
    } finally {
      setLoadingTokens(false);
    }
  }, [publicKey, rpc, balance]);

  useEffect(() => {
    void loadTokens();
  }, [loadTokens]);

  // Keep SOL/USDC balances fresh from context
  useEffect(() => {
    setTokens((prev) =>
      prev.map((t) => {
        if (t.isNativeSol && balance != null) {
          return {
            ...t,
            uiAmount: balance,
            amount: String(Math.round(balance * LAMPORTS_PER_SOL)),
          };
        }
        if (t.symbol === "USDC" && usdcBalance != null) {
          return {
            ...t,
            uiAmount: usdcBalance,
            amount: String(Math.round(usdcBalance * 1e6)),
          };
        }
        return t;
      })
    );
  }, [balance, usdcBalance]);

  const runResolve = useCallback(async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setResolved(null);
      setAddressValid(null);
      setResolving(false);
      return;
    }
    if (trimmed.length < 3) {
      setResolved(null);
      setAddressValid(null);
      setResolving(false);
      return;
    }
    setResolving(true);
    const result = await resolveRecipient(trimmed);
    setResolving(false);
    if (result.ok) {
      setResolved({
        owner: result.owner,
        label:
          result.kind !== "pubkey" ? result.domain || trimmed.toLowerCase() : undefined,
      });
      setAddressValid(true);
      setError(null);
    } else {
      setResolved(null);
      if (looksLikeDomain(trimmed) || trimmed.length >= 32) {
        setAddressValid(false);
        setError(result.error);
      } else {
        setAddressValid(null);
      }
    }
  }, []);

  const handleRecipientChange = (value: string, isPaste = false) => {
    const raw = isPaste ? value.trim() : value;
    setRecipient(raw);
    setError(null);
    setResolved(null);
    setAddressValid(null);
    if (resolveTimer.current) clearTimeout(resolveTimer.current);
    resolveTimer.current = setTimeout(() => {
      void runResolve(raw);
    }, isPaste ? 0 : 400);
  };

  useEffect(() => {
    return () => {
      if (resolveTimer.current) clearTimeout(resolveTimer.current);
    };
  }, []);

  const handleSend = async () => {
    if (!publicKey || !selected) return;
    setError(null);
    setStatus("auth");

    try {
      ensureDocumentFocusForPasskey();
      const { keypair: userKeypair } = await getPasskeyKeypair(publicKey);
      setStatus("sending");

      let owner = resolved?.owner;
      if (!owner) {
        const result = await resolveRecipient(recipient.trim());
        if (!result.ok) throw new Error(result.error);
        owner = result.owner;
        setResolved({
          owner,
          label: result.kind !== "pubkey" ? result.domain : undefined,
        });
      }

      const recipientPubkey = new PublicKey(owner);
      const parsed = parseFloat(amount);
      if (isNaN(parsed) || parsed <= 0) throw new Error("Invalid amount");

      if (recipientPubkey.toBase58() === publicKey) {
        if (!confirm("You are sending to yourself. Continue?")) {
          setStatus("idle");
          return;
        }
      }

      const connection = new Connection(rpc, "confirmed");
      const from = new PublicKey(publicKey);
      const tx = new Transaction();

      if (selected.isNativeSol) {
        const amountLamports = Math.round(parsed * LAMPORTS_PER_SOL);
        const balanceLamports = Math.round((balance ?? 0) * LAMPORTS_PER_SOL);
        if (amountLamports <= 0) throw new Error("Invalid amount");
        if (amountLamports + SOL_FEE_RESERVE_LAMPORTS > balanceLamports) {
          const max = maxSendableSol(balance);
          if (!max) {
            throw new Error(
              "Not enough SOL to cover the network fee. Add a little more SOL, then try again."
            );
          }
          throw new Error(
            `Not enough SOL after the network fee. Max you can send is ${max} SOL (use Max).`
          );
        }
        tx.add(
          SystemProgram.transfer({
            fromPubkey: from,
            toPubkey: recipientPubkey,
            lamports: amountLamports,
          })
        );
      } else {
        if (parsed > selected.uiAmount + 1e-12) {
          throw new Error(
            `Not enough ${selected.symbol}. You have ${formatTokenUi(selected.uiAmount, selected.decimals)}`
          );
        }
        if ((balance ?? 0) < 0.002) {
          throw new Error("Need a little SOL for network fees");
        }
        const raw = uiToRawAmount(parsed, selected.decimals);
        if (raw <= BigInt(0)) throw new Error("Invalid amount");
        const mint = new PublicKey(selected.mint);
        const programId = new PublicKey(selected.programId);
        const fromAta = getAssociatedTokenAddressSync(mint, from, false, programId);
        const toAta = getAssociatedTokenAddressSync(
          mint,
          recipientPubkey,
          false,
          programId
        );
        tx.add(
          createAssociatedTokenAccountIdempotentInstruction(
            from,
            toAta,
            recipientPubkey,
            mint,
            programId
          ),
          createTransferCheckedInstruction(
            fromAta,
            mint,
            toAta,
            from,
            raw,
            selected.decimals,
            [],
            programId
          )
        );
      }

      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = from;
      tx.sign(userKeypair);

      const signature = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      });
      setStatus("confirming");
      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed"
      );

      setTxId(signature);
      setStatus("done");
      await refreshBalance();
      void loadTokens();
      const { toast } = await import("@/lib/toast");
      toast.success("Transfer successful!");
      try {
        new Audio("/chaching.mp3").play();
      } catch {
        /* ignore */
      }
      setRecipient("");
      setAmount("");
      setAddressValid(null);
      setResolved(null);
    } catch (err: unknown) {
      setError(friendlyError(err));
      setStatus("error");
    }
  };

  const busy = status === "auth" || status === "sending" || status === "confirming";
  const canSend =
    !!recipient &&
    !!amount &&
    addressValid === true &&
    !!resolved?.owner &&
    !!selected &&
    !busy;

  const maxAmount = () => {
    if (!selected) return;
    if (selected.isNativeSol) {
      const max = maxSendableSol(balance);
      if (!max) {
        setError("Not enough SOL left after the network fee.");
        return;
      }
      setError(null);
      setAmount(max);
    } else {
      setError(null);
      setAmount(formatAmountInput(selected.uiAmount, selected.decimals));
    }
  };

  const symbol = selected?.symbol || "Token";

  return (
    <WalletShell>
      <PageTransition>
        <div className="flex gap-1.5 mb-3">
          {(
            [
              ["transfer", "Send", Coins],
              ["nft", "NFT", ImageIcon],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition cursor-pointer active:scale-95 ${
                tab === id
                  ? "bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-400/50"
                  : "bg-black/5 dark:bg-white/5 text-gray-500 dark:text-white/50 border border-black/10 dark:border-white/10"
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {tab === "transfer" && (
          <div className="space-y-3">
            <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl p-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-white/60 mb-1.5">
                  Token
                </label>
                <button
                  type="button"
                  disabled={busy || loadingTokens}
                  onClick={() => setPickerOpen(true)}
                  className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-black px-3 py-2.5 text-left"
                >
                  {selected ? (
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <TokenMetaRow token={selected} dense />
                      </div>
                      <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-400">
                        {loadingTokens ? "Loading tokens…" : "Select token"}
                      </span>
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    </div>
                  )}
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-white/60 mb-1.5">
                  To
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={recipient}
                    onChange={(e) => handleRecipientChange(e.target.value)}
                    onPaste={(e) => {
                      e.preventDefault();
                      handleRecipientChange(e.clipboardData.getData("text"), true);
                    }}
                    placeholder={NAME_PLACEHOLDER}
                    disabled={busy}
                    autoComplete="off"
                    spellCheck={false}
                    className={`w-full px-3 py-2.5 pr-10 bg-white dark:bg-black border rounded-lg text-sm focus:outline-none focus:ring-2 disabled:opacity-50 ${
                      addressValid === true
                        ? "border-green-500/50 focus:ring-green-400/50"
                        : addressValid === false
                          ? "border-red-500/50 focus:ring-red-400/50"
                          : "border-black/10 dark:border-white/10 focus:ring-purple-400/50"
                    }`}
                  />
                  {resolving && (
                    <Spinner
                      size={14}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-purple-400"
                    />
                  )}
                  {!resolving && addressValid === true && (
                    <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500" />
                  )}
                </div>
                {resolved?.label && (
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1 font-mono truncate">
                    {resolved.label} → {resolved.owner.slice(0, 4)}…{resolved.owner.slice(-4)}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-white/60 mb-1.5">
                  Amount ({symbol})
                </label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    disabled={busy}
                    className="w-full px-3 py-2.5 pr-16 bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400/50 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={maxAmount}
                    disabled={busy || !selected}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-purple-500 hover:bg-purple-400 text-white text-xs font-medium rounded transition disabled:opacity-50 cursor-pointer"
                  >
                    Max
                  </button>
                </div>
                <AmountUsdHint amount={amount} priceUsd={selected?.priceUsd} />
              </div>

              <PrivateSendSheet />

              {error && (
                <div className="px-3 py-2.5 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
                </div>
              )}

              {status === "done" && txId && (
                <div className="px-3 py-2.5 bg-green-500/10 border border-green-500/30 rounded-lg space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Check size={14} className="text-green-500" />
                    <p className="text-xs font-medium text-green-600 dark:text-green-400">
                      Transfer successful!
                    </p>
                  </div>
                  <a
                    href={`https://sol.new/receipt/${txId}`}
                    className="text-xs text-green-600 dark:text-green-400 hover:underline flex items-center gap-1"
                  >
                    View receipt <ExternalLink size={10} />
                  </a>
                </div>
              )}

              <SlideToSend
                onConfirm={handleSend}
                disabled={!canSend}
                loading={busy}
                label={`Slide to send ${symbol}`}
                loadingLabel={
                  status === "auth"
                    ? "Authenticating…"
                    : status === "confirming"
                      ? "Confirming…"
                      : "Sending…"
                }
                tone="purple"
              />
            </div>
          </div>
        )}

        {tab === "nft" && (
          <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl p-8 text-center">
            <ImageIcon size={32} className="mx-auto mb-3 text-gray-400 dark:text-white/40" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
              NFT Transfers
            </h3>
            <p className="text-xs text-gray-500 dark:text-white/40">Coming soon</p>
          </div>
        )}
      </PageTransition>

      {pickerOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center sm:items-center bg-black/50 backdrop-blur-sm">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Close"
            onClick={() => setPickerOpen(false)}
          />
          <div className="relative w-full sm:max-w-md max-h-[75dvh] rounded-t-3xl sm:rounded-3xl bg-white dark:bg-zinc-950 border border-black/10 dark:border-white/10 shadow-xl flex flex-col">
            <div className="p-4 border-b border-black/5 dark:border-white/10 flex items-center justify-between">
              <p className="text-sm font-semibold">Your tokens</p>
              <button
                type="button"
                onClick={() => void loadTokens()}
                className="text-xs text-purple-500"
              >
                Refresh
              </button>
            </div>
            <div className="overflow-y-auto p-2 pb-6">
              {loadingTokens && (
                <div className="flex justify-center py-8">
                  <Spinner size={20} />
                </div>
              )}
              {!loadingTokens && tokens.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-8">No tokens found</p>
              )}
              {tokens.map((t) => (
                <button
                  key={t.mint}
                  type="button"
                  onClick={() => {
                    setSelected(t);
                    setAmount("");
                    setPickerOpen(false);
                  }}
                  className={`w-full px-3 py-3 rounded-xl text-left hover:bg-black/5 dark:hover:bg-white/5 ${
                    selected?.mint === t.mint ? "bg-purple-500/10" : ""
                  }`}
                >
                  <TokenMetaRow
                    token={t}
                    right={
                      <span className="font-mono text-xs tabular-nums text-right shrink-0">
                        {hideBalances
                          ? "••••"
                          : formatTokenUi(t.uiAmount, t.decimals)}
                        {!hideBalances && t.valueUsd != null && (
                          <span className="block text-[10px] text-gray-400">
                            {t.valueUsd >= 0.01
                              ? `$${t.valueUsd.toFixed(2)}`
                              : t.valueUsd > 0
                                ? `$${t.valueUsd.toPrecision(2)}`
                                : ""}
                          </span>
                        )}
                      </span>
                    }
                  />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </WalletShell>
  );
}
