"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { WalletShell } from "@/components/wallet-shell";
import { PageTransition } from "@/components/page-transition";
import { Coins, Image as ImageIcon, Check, ExternalLink } from "lucide-react";
import { Spinner } from "@/components/spinner";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import { getPasskeyKeypair } from "@/lib/passkey-wallet";
import { PrivateSendSheet } from "@/components/private-send-sheet";
import { SlideToSend } from "@/components/slide-to-send";
import { useDefaultToken } from "@/lib/currency-pref";
import { resolveRecipient, looksLikeDomain } from "@/lib/resolve-name";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { usdcMint } from "@/lib/usdc";
import { friendlyError } from "@/lib/friendly-errors";
import {
  fetchWalletTokens,
  formatTokenAmount,
  tokenLabel,
  type WalletToken,
} from "@/lib/wallet-tokens";

type Tab = "transfer" | "nft";

/** Asset key: "SOL" or mint address */
type AssetKey = string;

const SOL_FEE_RESERVE_LAMPORTS = 10_000;

function maxSendableSol(balanceSol: number | null | undefined): string {
  const bal = Math.round((balanceSol ?? 0) * LAMPORTS_PER_SOL);
  const sendable = Math.max(0, bal - SOL_FEE_RESERVE_LAMPORTS);
  if (sendable <= 0) return "";
  return (sendable / LAMPORTS_PER_SOL).toFixed(9).replace(/\.?0+$/, "");
}

export default function SendPage() {
  const [tab, setTab] = useState<Tab>("transfer");
  const [defaultToken] = useDefaultToken();
  const [asset, setAsset] = useState<AssetKey>("SOL");
  const [tokens, setTokens] = useState<WalletToken[]>([]);
  const [tokensLoading, setTokensLoading] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<"idle" | "auth" | "sending" | "confirming" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [txId, setTxId] = useState<string | null>(null);
  const [resolved, setResolved] = useState<{ owner: string; label?: string } | null>(null);
  const [resolving, setResolving] = useState(false);
  const [addressValid, setAddressValid] = useState<boolean | null>(null);
  const resolveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { publicKey, balance, usdcBalance, refreshBalance } = useWallet();
  const { network, rpc } = useNetwork();

  const selectedToken = asset === "SOL" ? null : tokens.find((t) => t.mint === asset) || null;

  const loadTokens = useCallback(async () => {
    if (!publicKey) {
      setTokens([]);
      return;
    }
    setTokensLoading(true);
    try {
      const conn = new Connection(rpc, "confirmed");
      const list = await fetchWalletTokens(conn, publicKey);
      setTokens(list);
    } catch {
      setTokens([]);
    } finally {
      setTokensLoading(false);
    }
  }, [publicKey, rpc]);

  useEffect(() => {
    void loadTokens();
  }, [loadTokens]);

  useEffect(() => {
    if (defaultToken === "USDC") {
      const mint = usdcMint(network).toBase58();
      setAsset(mint);
    } else {
      setAsset("SOL");
    }
  }, [defaultToken, network]);

  // If selected mint no longer held, fall back to SOL
  useEffect(() => {
    if (asset !== "SOL" && tokens.length && !tokens.some((t) => t.mint === asset)) {
      setAsset("SOL");
    }
  }, [tokens, asset]);

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
        label: result.kind !== "pubkey" ? result.domain || trimmed.toLowerCase() : undefined,
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
    if (!publicKey) return;
    setError(null);
    setStatus("auth");

    try {
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

      setStatus("sending");
      const { keypair: userKeypair } = await getPasskeyKeypair();
      const connection = new Connection(rpc, "confirmed");
      const from = new PublicKey(publicKey);
      const tx = new Transaction();

      if (asset === "SOL") {
        const amountLamports = Math.round(parsed * LAMPORTS_PER_SOL);
        const balanceLamports = Math.round((balance ?? 0) * LAMPORTS_PER_SOL);
        if (amountLamports <= 0) throw new Error("Invalid amount");
        if (amountLamports + SOL_FEE_RESERVE_LAMPORTS > balanceLamports) {
          const max = maxSendableSol(balance);
          if (!max) {
            throw new Error(
              "Not enough SOL to cover the network fee. Add a little more SOL, then try again.",
            );
          }
          throw new Error(
            `Not enough SOL after the network fee. Max you can send is ${max} SOL (use Max).`,
          );
        }
        tx.add(
          SystemProgram.transfer({
            fromPubkey: from,
            toPubkey: recipientPubkey,
            lamports: amountLamports,
          }),
        );
      } else {
        const tok = tokens.find((t) => t.mint === asset);
        if (!tok) throw new Error("Token not found in wallet");
        const amountBase = Math.round(parsed * 10 ** tok.decimals);
        if (amountBase <= 0) throw new Error("Invalid amount");
        if (BigInt(amountBase) > BigInt(tok.amount)) {
          throw new Error(
            `Not enough ${tokenLabel(tok)}. You have ${formatTokenAmount(tok.uiAmount, tok.decimals)}`,
          );
        }
        const mint = new PublicKey(tok.mint);
        const programId =
          tok.program === "token2022" ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
        const fromAta = getAssociatedTokenAddressSync(mint, from, false, programId);
        const toAta = getAssociatedTokenAddressSync(mint, recipientPubkey, false, programId);
        tx.add(
          createAssociatedTokenAccountIdempotentInstruction(
            from,
            toAta,
            recipientPubkey,
            mint,
            programId,
          ),
          createTransferCheckedInstruction(
            fromAta,
            mint,
            toAta,
            from,
            BigInt(amountBase),
            tok.decimals,
            [],
            programId,
          ),
        );
      }

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = from;
      tx.sign(userKeypair);

      const signature = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      });
      setStatus("confirming");
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");

      setTxId(signature);
      setStatus("done");
      await refreshBalance();
      await loadTokens();
      const { toast } = await import("sonner");
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

  const solBalance = balance != null ? balance.toFixed(4) : "0";
  const busy = status === "auth" || status === "sending" || status === "confirming";
  const canSend =
    !!recipient &&
    !!amount &&
    addressValid === true &&
    !!resolved?.owner &&
    !busy;

  const assetLabel =
    asset === "SOL" ? "SOL" : selectedToken ? tokenLabel(selectedToken) : "token";

  const maxAmount = () => {
    if (asset === "SOL") {
      const max = maxSendableSol(balance);
      if (!max) {
        setError("Not enough SOL left after the network fee. Add a little more SOL first.");
        return;
      }
      setError(null);
      setAmount(max);
    } else if (selectedToken) {
      setError(null);
      setAmount(String(selectedToken.uiAmount));
    }
  };

  const usdcMain = usdcMint(network).toBase58();

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
              onClick={() => setTab(id as Tab)}
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
                  Asset
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setAsset("SOL")}
                    disabled={busy}
                    className={`border rounded-xl px-3 py-2 text-xs font-medium transition cursor-pointer ${
                      asset === "SOL"
                        ? "bg-purple-500/20 border-purple-400/50 text-purple-300"
                        : "bg-white dark:bg-black border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60"
                    }`}
                  >
                    SOL · {solBalance}
                  </button>
                  {tokensLoading && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
                      <Spinner size={12} /> tokens…
                    </span>
                  )}
                  {tokens.map((t) => {
                    const label = t.mint === usdcMain ? "USDC" : tokenLabel(t);
                    return (
                      <button
                        key={t.mint}
                        type="button"
                        onClick={() => setAsset(t.mint)}
                        disabled={busy}
                        className={`border rounded-xl px-3 py-2 text-xs font-medium transition cursor-pointer max-w-[140px] truncate ${
                          asset === t.mint
                            ? "bg-purple-500/20 border-purple-400/50 text-purple-300"
                            : "bg-white dark:bg-black border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60"
                        }`}
                        title={t.mint}
                      >
                        {label} · {formatTokenAmount(t.uiAmount, t.decimals)}
                      </button>
                    );
                  })}
                </div>
                {asset !== "SOL" && selectedToken?.isWsol && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1.5">
                    Sending wrapped SOL (WSOL). Native SOL is the other button.
                  </p>
                )}
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
                    placeholder="Address or name.sol / .bonk / .skr"
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
                  Amount ({assetLabel})
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="any"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    disabled={busy}
                    className="w-full px-3 py-2.5 pr-16 bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400/50 disabled:opacity-50"
                  />
                  <button
                    onClick={maxAmount}
                    disabled={busy}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-purple-500 hover:bg-purple-400 text-white text-xs font-medium rounded transition disabled:opacity-50 cursor-pointer"
                  >
                    Max
                  </button>
                </div>
                <p className="text-[11px] text-gray-400 dark:text-white/30 mt-1">
                  Balance:{" "}
                  {asset === "SOL"
                    ? `${solBalance} SOL`
                    : selectedToken
                      ? `${formatTokenAmount(selectedToken.uiAmount, selectedToken.decimals)} ${assetLabel}`
                      : "—"}
                  {asset !== "SOL" && usdcBalance != null && asset === usdcMain
                    ? ` (wallet USDC $${usdcBalance.toFixed(2)})`
                    : ""}
                </p>
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
                    href={`https://explorer.solana.com/tx/${txId}${network === "devnet" ? "?cluster=devnet" : ""}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-green-600 dark:text-green-400 hover:underline flex items-center gap-1"
                  >
                    View transaction <ExternalLink size={10} />
                  </a>
                </div>
              )}

              <SlideToSend
                onConfirm={handleSend}
                disabled={!canSend}
                loading={busy}
                label={`Slide to send ${assetLabel}`}
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
    </WalletShell>
  );
}
