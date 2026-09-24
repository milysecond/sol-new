"use client";

import { useCallback, useEffect, useState } from "react";
import { EyeOff, ArrowRight, ShieldCheck, ShieldOff, Check, ExternalLink } from "lucide-react";
import { Spinner } from "@/components/spinner";
import { BottomSheet } from "@/components/bottom-sheet";
import { ActionButton, type ActionButtonState } from "@/components/action-button";
import { TxConfirm } from "@/components/tx-confirm";
import { useNetwork } from "@/lib/network";
import { friendlyError } from "@/lib/friendly-errors";
import { PublicKey } from "@solana/web3.js";
import {
  getPrivateSolBalance,
  openPrivacyCashSession,
  privateSendSol,
  shieldSol,
  solToLamports,
  isPrivacyCashAvailable,
  setDevnetRelayerUrl,
  getDevnetRelayerUrl,
  type PrivacyCashSession,
  type PrivacyNetwork,
} from "@/lib/privacy-cash";
import { resolveRecipient } from "@/lib/resolve-name";

type Mode = "send" | "shield" | "unshield";
type Step = "form" | "confirm";

type Props = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideLauncher?: boolean;
  initialMode?: Mode;
  initialRecipient?: string;
  initialAmount?: string;
};

function tap() {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(12);
    }
  } catch {
    /* ignore */
  }
}

function friendlyStatus(raw: string): string {
  const m = raw.toLowerCase();
  if (!raw || raw.length < 2) return "Working…";
  if (m.includes("utxo") || m.includes("fetching") || m.includes("/range")) {
    return "Loading private notes…";
  }
  if (m.includes("merkle") || m.includes("root") || m.includes("proofv2")) {
    return "Syncing tree…";
  }
  if (m.includes("proof") || m.includes("snark") || m.includes("groth") || m.includes("witness")) {
    return "Generating ZK proof…";
  }
  if (m.includes("sign")) return "Approve passkey…";
  if (m.includes("relay") || m.includes("submit") || m.includes("/deposit") || m.includes("/withdraw")) {
    return "Submitting…";
  }
  if (m.includes("confirm") || m.includes("wait") || m.includes("check")) {
    return "Confirming on-chain…";
  }
  if (m.includes("encrypt") || m.includes("deposit") || m.includes("utxo key")) {
    return "Preparing…";
  }
  if (/https?:\/\//.test(raw) || raw.length > 42) return "Working…";
  return raw;
}

export function PrivateSendSheet({
  open: openProp,
  onOpenChange,
  hideLauncher = false,
  initialMode = "send",
  initialRecipient = "",
  initialAmount = "",
}: Props = {}) {
  const { network, rpc, toggle } = useNetwork();
  const privacyNet = (network === "devnet" ? "devnet" : "mainnet") as PrivacyNetwork;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = (v: boolean) => {
    onOpenChange?.(v);
    if (openProp === undefined) setInternalOpen(v);
  };

  const [connecting, setConnecting] = useState(false);
  const [session, setSession] = useState<PrivacyCashSession | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [step, setStep] = useState<Step>("form");
  const [amount, setAmount] = useState(initialAmount);
  const [recipient, setRecipient] = useState(initialRecipient);
  const [resolvedTo, setResolvedTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [btnState, setBtnState] = useState<ActionButtonState>("idle");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doneTx, setDoneTx] = useState<string | null>(null);
  const [devRelayerInput, setDevRelayerInput] = useState("");

  const available = isPrivacyCashAvailable(privacyNet);

  const refreshBalance = useCallback(async (s: PrivacyCashSession) => {
    setBalance(await getPrivateSolBalance(s));
  }, []);

  const ensureSession = useCallback(async () => {
    if (session && session.network === privacyNet) return session;
    const s = await openPrivacyCashSession(rpc, privacyNet);
    setSession(s);
    return s;
  }, [session, rpc, privacyNet]);

  const resetFlow = () => {
    setStep("form");
    setBusy(false);
    setBtnState("idle");
    setStatusMsg(null);
    setResolvedTo(null);
  };

  const openSheet = async () => {
    if (!available || connecting) return;
    setConnecting(true);
    setError(null);
    resetFlow();
    try {
      const s = await ensureSession();
      setOpen(true);
      await refreshBalance(s);
    } catch (e) {
      setError(friendlyError(e, "Couldn't open private wallet. Try again."));
    } finally {
      setConnecting(false);
    }
  };

  useEffect(() => {
    setSession(null);
    setBalance(null);
    resetFlow();
    if (openProp === undefined) setInternalOpen(false);
  }, [network]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (open && available && !session && !connecting) {
      void openSheet();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, available]);

  useEffect(() => {
    if (initialMode) setMode(initialMode);
  }, [initialMode]);
  useEffect(() => {
    if (initialRecipient) setRecipient(initialRecipient);
  }, [initialRecipient]);

  const amountSol = parseFloat(amount || "0");
  const lamports = solToLamports(amountSol);
  const validAmount = Number.isFinite(lamports) && lamports > 0;
  let validRecipient = mode !== "send";
  if (mode === "send" && recipient.trim().length >= 3) {
    validRecipient = true;
  }

  const goConfirm = async () => {
    if (busy || !validAmount || !validRecipient) return;
    tap();
    setError(null);
    setDoneTx(null);
    setResolvedTo(null);

    if (mode === "send") {
      setBusy(true);
      setStatusMsg("Resolving recipient…");
      try {
        const r = await resolveRecipient(recipient.trim());
        if (!r.ok) throw new Error(r.error || "Could not resolve recipient");
        setResolvedTo(r.owner);
        setStep("confirm");
      } catch (e) {
        setError(friendlyError(e, "Could not resolve recipient."));
      } finally {
        setBusy(false);
        setStatusMsg(null);
      }
      return;
    }

    setStep("confirm");
  };

  const run = async () => {
    if (busy || !validAmount) return;
    tap();
    setBusy(true);
    setBtnState("loading");
    setError(null);
    setDoneTx(null);
    setStatusMsg(
      mode === "shield" ? "Starting shield…" : mode === "send" ? "Starting private send…" : "Starting unshield…",
    );
    try {
      const s = await ensureSession();
      const onStatus = (m: string) => setStatusMsg(friendlyStatus(m));
      let tx: string;
      if (mode === "shield") {
        setStatusMsg("Building shield…");
        tx = await shieldSol(s, lamports, onStatus);
      } else {
        let toPk = s.keypair.publicKey;
        if (mode === "send") {
          const addr = resolvedTo || recipient.trim();
          toPk = new PublicKey(addr);
        }
        setStatusMsg("Building private transfer…");
        tx = await privateSendSol(s, lamports, toPk, onStatus);
      }
      setStatusMsg("Done");
      setBtnState("success");
      tap();
      setDoneTx(tx);
      setAmount("");
      if (mode === "send") setRecipient("");
      setResolvedTo(null);
      const { toast } = await import("@/lib/toast");
      toast.success(
        mode === "shield" ? "Shielded!" : mode === "send" ? "Sent privately (ZK)!" : "Unshielded!",
      );
      try {
        new Audio("/chaching.mp3").play();
      } catch {
        /* ignore */
      }
      await refreshBalance(s);
      // brief success state, then back to form
      setTimeout(() => {
        setStep("form");
        setBtnState("idle");
        setStatusMsg(null);
      }, 1400);
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      console.error("[zk-private]", raw, e);
      setError(friendlyError(e, "Something went wrong. Try again."));
      setBtnState("error");
      try {
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          navigator.vibrate([30, 40, 30]);
        }
      } catch {
        /* ignore */
      }
      setTimeout(() => setBtnState("idle"), 1800);
    } finally {
      setBusy(false);
      if (btnState !== "success") setStatusMsg(null);
    }
  };

  const inputCls =
    "w-full px-3 py-2.5 bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-400/50 disabled:opacity-50";

  const ctaIdle =
    mode === "send" ? "Review send" : mode === "shield" ? "Review shield" : "Review unshield";

  const confirmTitle =
    mode === "shield" ? "Confirm shield" : mode === "send" ? "Confirm private send" : "Confirm unshield";

  const confirmRows = [
    {
      label: "Amount",
      value: `${Number.isFinite(amountSol) ? amountSol : "—"} SOL`,
      mono: true,
    },
    {
      label: "Network",
      value: privacyNet === "devnet" ? "Devnet (test)" : "Mainnet (live)",
    },
    {
      label: "Action",
      value:
        mode === "shield" ? "Shield → private pool" : mode === "send" ? "ZK send" : "Unshield → wallet",
    },
    ...(mode === "send"
      ? [
          {
            label: "To",
            value: resolvedTo
              ? `${resolvedTo.slice(0, 4)}…${resolvedTo.slice(-4)}`
              : recipient.trim() || "—",
            mono: true as const,
          },
        ]
      : []),
    {
      label: "Private bal",
      value: balance === null ? "…" : `${balance.toFixed(4)} SOL`,
      mono: true,
    },
  ];

  const sheet = (
    <BottomSheet
      open={open}
      onClose={() => {
        if (busy) return;
        setOpen(false);
        resetFlow();
      }}
      className="p-6 flex flex-col gap-4"
    >
      {step === "confirm" ? (
        <>
          {btnState === "idle" && !busy ? (
            <TxConfirm
              title={confirmTitle}
              subtitle={
                mode === "shield"
                  ? "SOL moves from your public wallet into the Privacy Cash pool."
                  : mode === "send"
                    ? "Withdraw from your private balance to the recipient."
                    : "Withdraw from private pool back to your passkey wallet."
              }
              kind={mode}
              rows={confirmRows}
              notice={
                mode === "shield" || mode === "send"
                  ? "ZK proof can take 10–30s on mobile. Keep the screen on and don’t close the sheet."
                  : "Relayer fee applies on unshield."
              }
              confirmLabel={
                mode === "shield"
                  ? "Confirm & shield"
                  : mode === "send"
                    ? "Confirm & send"
                    : "Confirm & unshield"
              }
              cancelLabel="Back"
              busy={busy}
              onCancel={() => {
                tap();
                setStep("form");
                setError(null);
              }}
              onConfirm={() => void run()}
            />
          ) : (
            <div className="flex flex-col gap-4">
              <div className="text-center space-y-1">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{confirmTitle}</p>
                <p className="text-xs text-gray-500 dark:text-white/45 tabular-nums">
                  {Number.isFinite(amountSol) ? amountSol : "—"} SOL ·{" "}
                  {privacyNet === "devnet" ? "devnet" : "mainnet"}
                </p>
              </div>

              {statusMsg && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-purple-500/10 border border-purple-400/25">
                  <Spinner size={14} className="text-purple-500 shrink-0" />
                  <p className="text-xs text-purple-700 dark:text-purple-200 font-medium leading-snug">
                    {statusMsg}
                  </p>
                </div>
              )}

              <ActionButton
                state={btnState}
                idleLabel={
                  mode === "shield"
                    ? "Confirm & shield"
                    : mode === "send"
                      ? "Confirm & send"
                      : "Confirm & unshield"
                }
                loadingLabel="Working…"
                successLabel="Done"
                errorLabel="Try again"
                onClick={() => void run()}
              />

              {btnState === "error" && (
                <button
                  type="button"
                  onClick={() => {
                    tap();
                    setStep("form");
                    setBtnState("idle");
                    setError(null);
                  }}
                  className="text-xs text-center text-gray-500 dark:text-white/45 py-1"
                >
                  Back to edit
                </button>
              )}
            </div>
          )}

          {error && (
            <div className="px-3 py-2.5 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}
          {doneTx && (
            <a
              href={`/receipt/${doneTx}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-center text-green-600 dark:text-green-400 hover:underline flex items-center justify-center gap-1"
            >
              View receipt <ExternalLink size={10} />
            </a>
          )}
        </>
      ) : (
        <>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <EyeOff size={18} className="text-purple-500" /> ZK private wallet
            </h2>
            <p className="text-xs text-gray-500 dark:text-white/40 mt-0.5">
              Private balance:{" "}
              <span className="font-semibold text-gray-900 dark:text-white tabular-nums">
                {balance === null ? (
                  <Spinner size={12} className="inline" />
                ) : (
                  `${balance.toFixed(4)} SOL`
                )}
              </span>
              <span className="ml-2 text-[10px] uppercase tracking-wide text-gray-400">
                · {privacyNet === "devnet" ? "devnet" : "mainnet"}
              </span>
            </p>
          </div>

          <div className="flex gap-1.5">
            {(
              [
                ["send", "Send", ArrowRight],
                ["shield", "Shield", ShieldCheck],
                ["unshield", "Unshield", ShieldOff],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  tap();
                  setMode(id);
                  setError(null);
                  setDoneTx(null);
                  setStep("form");
                }}
                disabled={busy}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 min-h-[40px] rounded-xl text-xs font-medium transition cursor-pointer touch-manipulation active:scale-[0.97] disabled:opacity-50 ${
                  mode === id
                    ? "bg-fuchsia-500/20 text-fuchsia-600 dark:text-fuchsia-300 border border-fuchsia-400/50"
                    : "bg-black/5 dark:bg-white/5 text-gray-500 dark:text-white/50 border border-black/10 dark:border-white/10"
                }`}
              >
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>

          <p className="text-[11px] text-gray-500 dark:text-white/40 leading-snug">
            {mode === "send" &&
              "ZK send from your shielded balance. No on-chain link between your public wallet and the recipient."}
            {mode === "shield" &&
              "Deposit SOL into the Privacy Cash pool (Groth16). You’ll confirm before proving."}
            {mode === "unshield" && "Withdraw SOL from the pool back to your public passkey wallet."}
          </p>

          {mode === "send" && (
            <input
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="Recipient · address or name.sol / .sns"
              disabled={busy}
              className={inputCls}
            />
          )}

          <div className="relative">
            <input
              type="number"
              inputMode="decimal"
              step="0.001"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount (SOL)"
              disabled={busy}
              className={inputCls}
            />
            {mode !== "shield" && balance !== null && balance > 0 && (
              <button
                type="button"
                onClick={() => {
                  tap();
                  setAmount(String(balance));
                }}
                disabled={busy}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1.5 min-h-[32px] bg-purple-500 hover:bg-purple-400 active:scale-95 text-white text-xs font-medium rounded-lg transition disabled:opacity-50 cursor-pointer touch-manipulation"
              >
                Max
              </button>
            )}
          </div>

          {error && open && (
            <div className="px-3 py-2.5 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {doneTx && (
            <div className="px-3 py-2.5 bg-green-500/10 border border-green-500/30 rounded-lg space-y-1">
              <div className="flex items-center gap-1.5">
                <Check size={14} className="text-green-500" />
                <p className="text-xs font-medium text-green-600 dark:text-green-400">Done!</p>
              </div>
              <a
                href={`/receipt/${doneTx}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-green-600 dark:text-green-400 hover:underline flex items-center gap-1"
              >
                View receipt <ExternalLink size={10} />
              </a>
            </div>
          )}

          <ActionButton
            state={busy ? "loading" : "idle"}
            idleLabel={
              <>
                <ArrowRight size={18} className="inline" /> {ctaIdle}
              </>
            }
            loadingLabel={statusMsg || "Working…"}
            disabled={!validAmount || !validRecipient}
            onClick={() => void goConfirm()}
          />

          <p className="text-[10px] text-gray-400 dark:text-white/30 text-center leading-snug">
            Privacy Cash · Groth16 · {privacyNet === "devnet" ? "devnet pool" : "mainnet pool"}
          </p>
        </>
      )}
    </BottomSheet>
  );

  if (hideLauncher) {
    return sheet;
  }

  return (
    <>
      {available ? (
        <button
          type="button"
          onClick={() => {
            tap();
            void openSheet();
          }}
          disabled={connecting}
          className="w-full flex items-center justify-between px-3 py-2.5 min-h-[44px] rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-black text-left transition hover:border-fuchsia-400/50 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer touch-manipulation"
        >
          <div className="flex items-center gap-2">
            {connecting ? <Spinner size={14} /> : <EyeOff size={14} className="text-purple-500" />}
            <div>
              <p className="text-xs font-medium text-gray-900 dark:text-white">ZK private send</p>
              <p className="text-[11px] text-gray-500 dark:text-white/40">
                Shielded transfers — no public link to recipient
              </p>
            </div>
          </div>
          <span className="text-[11px] text-purple-500 font-medium">Open</span>
        </button>
      ) : (
        <div className="w-full rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2.5 space-y-2">
          <div className="flex items-center gap-2">
            <EyeOff size={14} className="text-amber-600 shrink-0" />
            <div>
              <p className="text-xs font-medium text-gray-900 dark:text-white">
                {privacyNet === "devnet"
                  ? "Devnet ZK needs a relayer URL"
                  : "Hosted ZK pool is mainnet-only"}
              </p>
              <p className="text-[11px] text-gray-600 dark:text-white/50 leading-snug">
                {privacyNet === "devnet"
                  ? "Paste the sol.new devnet Privacy Cash relayer (tunnel or deployed URL)."
                  : "Privacy Cash public API is mainnet. Switch network or use self-host."}
              </p>
            </div>
          </div>
          {privacyNet === "devnet" ? (
            <div className="flex gap-2">
              <input
                type="url"
                value={devRelayerInput || getDevnetRelayerUrl()}
                onChange={(e) => setDevRelayerInput(e.target.value)}
                placeholder="https://….trycloudflare.com"
                className="flex-1 min-w-0 rounded-lg border border-black/10 dark:border-white/15 bg-white dark:bg-black px-2 py-1.5 text-xs"
              />
              <button
                type="button"
                onClick={() => {
                  const u = (devRelayerInput || getDevnetRelayerUrl()).trim();
                  if (!u) return;
                  setDevnetRelayerUrl(u);
                  setError(null);
                  void openSheet();
                }}
                className="shrink-0 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold px-3 py-1.5 active:scale-95 touch-manipulation"
              >
                Save & open
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => toggle()}
              className="w-full rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold py-2 transition active:scale-95 touch-manipulation"
            >
              Switch to mainnet
            </button>
          )}
        </div>
      )}
      {error && !open && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{error}</p>}
      {sheet}
    </>
  );
}
