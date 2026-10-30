"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FlaskConical,
  MousePointerClick,
  FileCheck2,
  MessageSquareHeart,
  Wallet,
  Command,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { Navbar } from "@/components/navbar";
import { ActionButton, type ActionButtonState } from "@/components/action-button";
import { TxConfirm } from "@/components/tx-confirm";
import { FeedbackModal } from "@/components/feedback-modal";
import { WalletInfoModal } from "@/components/wallet-info-modal";
import { CommandPalette, type CommandItem } from "@/components/command-palette";
import { WalletCreateDemo } from "@/components/wallet-create-demo";
import { ViewportMeasurePanel } from "@/components/viewport-measure-panel";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";

function Section({
  id,
  icon: Icon,
  title,
  source,
  children,
}: {
  id: string;
  icon: typeof FlaskConical;
  title: string;
  source: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-black overflow-hidden scroll-mt-24"
    >
      <div className="px-4 sm:px-5 py-3 border-b border-black/5 dark:border-white/5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon size={16} className="text-purple-500 shrink-0" />
          <h2 className="text-sm font-bold text-gray-900 dark:text-white truncate">{title}</h2>
        </div>
        <span className="text-[10px] text-gray-400 font-medium shrink-0">{source}</span>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

export default function LabPage() {
  const router = useRouter();
  const { publicKey, walletLabel, balance, refreshBalance } = useWallet();
  const { network } = useNetwork();

  // Action button demo
  const [abState, setAbState] = useState<ActionButtonState>("idle");
  const runActionDemo = () => {
    setAbState("loading");
    setTimeout(() => {
      setAbState("success");
      setTimeout(() => setAbState("idle"), 1400);
    }, 1200);
  };
  const runActionFail = () => {
    setAbState("loading");
    setTimeout(() => {
      setAbState("error");
      setTimeout(() => setAbState("idle"), 1600);
    }, 900);
  };

  // TX confirm demo
  const [txOpen, setTxOpen] = useState(false);
  const [txBusy, setTxBusy] = useState(false);

  // Feedback
  const [fbOpen, setFbOpen] = useState(false);
  const [fbTone, setFbTone] = useState<"success" | "error" | "info">("success");

  // Wallet modal
  const [wOpen, setWOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // CMD+K
  const [cmdOpen, setCmdOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const demoAddress =
    publicKey || "Demo1111111111111111111111111111111111111";

  const cmdItems: CommandItem[] = useMemo(
    () => [
      {
        id: "gift",
        label: "Gift",
        group: "Send",
        hint: "Claimable link",
        keywords: "send crypto",
        onSelect: () => router.push("/gift"),
      },
      {
        id: "private",
        label: "ZK Private",
        group: "Send",
        hint: "Shield & send",
        onSelect: () => router.push("/private"),
      },
      {
        id: "wallet",
        label: "Wallet",
        group: "Account",
        onSelect: () => router.push("/wallet"),
      },
      {
        id: "home",
        label: "Home",
        group: "Nav",
        onSelect: () => router.push("/home"),
      },
      {
        id: "fb",
        label: "Open feedback modal",
        group: "Lab",
        onSelect: () => {
          setFbTone("success");
          setFbOpen(true);
        },
      },
      {
        id: "winfo",
        label: "Open wallet info modal",
        group: "Lab",
        onSelect: () => setWOpen(true),
      },
    ],
    [router],
  );

  const copyAddr = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(demoAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }, [demoAddress]);

  return (
    <div className="min-h-app bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col pb-24 sm:pb-10">
      <Navbar />
      <main className="flex-1 w-full min-w-0">
        <div className="app-shell py-6 sm:py-10 space-y-6">
          <header className="space-y-2">
            <div className="inline-flex items-center gap-2 text-purple-500">
              <FlaskConical size={22} />
              <span className="text-xs font-bold uppercase tracking-wider">Lab</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Component playground</h1>
            <p className="text-sm text-gray-500 dark:text-white/50 max-w-xl leading-relaxed">
              Interactive sol.new ports of patterns from{" "}
              <a
                href="https://portfolio-2025-six.vercel.app/playground"
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-500 underline inline-flex items-center gap-0.5"
              >
                Steven&apos;s playground <ExternalLink size={11} />
              </a>
              . Touch them. Not production-critical — safe to break.
            </p>
            <ViewportMeasurePanel />
            <div className="flex flex-wrap gap-2 pt-1">
              {[
                ["#action", "Action button"],
                ["#confirm", "TX confirm"],
                ["#feedback", "Feedback"],
                ["#wallet", "Wallet modal"],
                ["#cmdk", "CMD+K"],
                ["#create", "Create wallet"],
              ].map(([href, label]) => (
                <a
                  key={href}
                  href={href}
                  className="text-[11px] font-medium px-2.5 py-1 rounded-full border border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60 hover:border-purple-400/40 hover:text-purple-600 dark:hover:text-purple-300 transition"
                >
                  {label}
                </a>
              ))}
            </div>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
            <Section
              id="action"
              icon={MousePointerClick}
              title="Family Action Button"
              source="states · haptic"
            >
              <div className="space-y-3">
                <p className="text-xs text-gray-500 dark:text-white/45 leading-relaxed">
                  Idle → loading → success/error. Used on ZK private sheet.
                </p>
                <ActionButton
                  state={abState}
                  idleLabel="Tap me"
                  loadingLabel="Working…"
                  successLabel="Done"
                  errorLabel="Failed — retry"
                  onClick={runActionDemo}
                />
                <button
                  type="button"
                  onClick={runActionFail}
                  className="w-full min-h-[40px] text-xs font-medium rounded-xl border border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60"
                >
                  Demo error state
                </button>
              </div>
            </Section>

            <Section id="confirm" icon={FileCheck2} title="Family TX Confirmation" source="pre-submit">
              <div className="space-y-3">
                <p className="text-xs text-gray-500 dark:text-white/45 leading-relaxed">
                  Review amount / network before the heavy action.
                </p>
                {!txOpen ? (
                  <ActionButton idleLabel="Open confirm demo" onClick={() => setTxOpen(true)} />
                ) : (
                  <TxConfirm
                    title="Confirm shield"
                    subtitle="Demo only — no chain write."
                    kind="shield"
                    rows={[
                      { label: "Amount", value: "0.1 SOL", mono: true },
                      {
                        label: "Network",
                        value: network === "devnet" ? "Devnet" : "Mainnet",
                      },
                      { label: "Action", value: "Shield → private pool" },
                      {
                        label: "Wallet",
                        value: publicKey
                          ? `${publicKey.slice(0, 4)}…${publicKey.slice(-4)}`
                          : "Not connected",
                        mono: true,
                      },
                    ]}
                    notice="ZK proof can take 10–30s on mobile."
                    confirmLabel="Confirm & shield"
                    busy={txBusy}
                    onCancel={() => setTxOpen(false)}
                    onConfirm={() => {
                      setTxBusy(true);
                      setTimeout(() => {
                        setTxBusy(false);
                        setTxOpen(false);
                        setFbTone("success");
                        setFbOpen(true);
                      }, 1100);
                    }}
                  />
                )}
              </div>
            </Section>

            <Section
              id="feedback"
              icon={MessageSquareHeart}
              title="Family Feedback Modal"
              source="post-action"
            >
              <div className="space-y-2">
                <p className="text-xs text-gray-500 dark:text-white/45 mb-3">
                  After success / error — receipt, share, dismiss.
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ["success", "Success"],
                      ["error", "Error"],
                      ["info", "Info"],
                    ] as const
                  ).map(([tone, label]) => (
                    <button
                      key={tone}
                      type="button"
                      onClick={() => {
                        setFbTone(tone);
                        setFbOpen(true);
                      }}
                      className="min-h-[44px] rounded-xl border border-black/10 dark:border-white/10 text-xs font-semibold hover:border-purple-400/40 transition active:scale-95 touch-manipulation"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </Section>

            <Section id="wallet" icon={Wallet} title="Wallet Info Modal" source="chip expand">
              <div className="space-y-3">
                <p className="text-xs text-gray-500 dark:text-white/45">
                  Header wallet chip pattern — balance + quick actions.
                </p>
                <button
                  type="button"
                  onClick={() => setWOpen(true)}
                  className="w-full flex items-center gap-2 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.04] px-3 py-2.5 min-h-[48px] hover:border-purple-400/40 transition active:scale-[0.99] touch-manipulation"
                >
                  <Wallet size={16} className="text-purple-500" />
                  <span className="text-sm font-medium flex-1 text-left truncate">
                    {walletLabel && walletLabel !== publicKey
                      ? walletLabel
                      : publicKey
                        ? `${publicKey.slice(0, 4)}…${publicKey.slice(-4)}`
                        : "Demo wallet"}
                  </span>
                  <span className="text-xs font-mono text-purple-500 tabular-nums">
                    {balance == null ? "—" : balance.toFixed(3)} SOL
                  </span>
                </button>
              </div>
            </Section>

            <Section id="cmdk" icon={Command} title="Wallet CMD + K" source="⌘K / Ctrl+K">
              <div className="space-y-3">
                <p className="text-xs text-gray-500 dark:text-white/45">
                  Command palette — jump anywhere. Press{" "}
                  <kbd className="font-mono text-[10px] border border-black/15 dark:border-white/15 rounded px-1">
                    ⌘K
                  </kbd>{" "}
                  anywhere on this page.
                </p>
                <ActionButton idleLabel="Open command palette" onClick={() => setCmdOpen(true)} />
              </div>
            </Section>

            <Section id="create" icon={Sparkles} title="Family Wallet Creation" source="passkey motion">
              <WalletCreateDemo />
            </Section>
          </div>

          <p className="text-[11px] text-center text-gray-400 leading-relaxed pb-4">
            Patterns adapted for sol.new tokens · opacity/scale only · no iOS folder toys.
            Production wiring: ActionButton + TxConfirm already on{" "}
            <a href="/private" className="underline text-purple-500">
              /private
            </a>
            .
          </p>
        </div>
      </main>

      <FeedbackModal
        open={fbOpen}
        onClose={() => setFbOpen(false)}
        tone={fbTone}
        title={
          fbTone === "success"
            ? "Shielded!"
            : fbTone === "error"
              ? "Something failed"
              : "Heads up"
        }
        body={
          fbTone === "success"
            ? "0.1 SOL is in your private balance (demo)."
            : fbTone === "error"
              ? "Simulation only — try the success state too."
              : "Info tone for neutral confirmations."
        }
        primaryLabel={fbTone === "success" ? "View receipt" : "OK"}
        secondaryLabel="Dismiss"
        onPrimary={() => setFbOpen(false)}
      />

      <WalletInfoModal
        open={wOpen}
        onClose={() => setWOpen(false)}
        address={demoAddress}
        label={walletLabel || undefined}
        balanceSol={balance}
        networkLabel={network === "devnet" ? "devnet" : "mainnet"}
        copied={copied}
        onCopy={() => void copyAddr()}
        onSend={() => {
          setWOpen(false);
          router.push("/wallet/send");
        }}
        onReceive={() => {
          setWOpen(false);
          router.push(publicKey ? `/address/${publicKey}` : "/wallet");
        }}
        onPrivate={() => {
          setWOpen(false);
          router.push("/private");
        }}
        onSettings={() => {
          setWOpen(false);
          router.push("/wallet/settings");
        }}
        onRefresh={() => void refreshBalance()}
      />

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} items={cmdItems} />
    </div>
  );
}
