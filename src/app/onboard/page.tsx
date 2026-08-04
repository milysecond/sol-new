"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  ArrowRight,
  Check,
  Gift,
  Landmark,
  Sparkles,
  Wallet,
} from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import { Navbar } from "@/components/navbar";
import { Spinner } from "@/components/spinner";
import { useWallet } from "@/lib/wallet-context";
import { friendlyError } from "@/lib/friendly-errors";

type Goal = "gift" | "swap" | "stake" | "explore";

const GOALS: {
  id: Goal;
  title: string;
  blurb: string;
  href: string;
  cta: string;
  icon: typeof Gift;
}[] = [
  {
    id: "gift",
    title: "Send a gift",
    blurb: "Link anyone can claim — even without a wallet yet.",
    href: "/gift",
    cta: "Open Gift",
    icon: Gift,
  },
  {
    id: "swap",
    title: "Swap tokens",
    blurb: "Any mint, passkey-signed, optional free network fee.",
    href: "/swap",
    cta: "Open Swap",
    icon: ArrowLeftRight,
  },
  {
    id: "stake",
    title: "Stake SOL",
    blurb: "Native stake to a validator — earn while you hold.",
    href: "/stake",
    cta: "Open Stake",
    icon: Landmark,
  },
  {
    id: "explore",
    title: "Just explore",
    blurb: "Wallet, portfolio, POAPs, and the rest of sol.new.",
    href: "/home",
    cta: "See everything",
    icon: Sparkles,
  },
];

const ONBOARD_KEY = "sol.new.onboard.done";
const GOAL_KEY = "sol.new.onboard.goal";

/**
 * Onboarding playbook (activation first):
 * 1) activation moment = passkey wallet live
 * 2) value before effort
 * 3) one useful question (goal)
 * 4) one action per screen
 * 5) motion (Thinking Orbs)
 * 6) personal result
 * 7) end with next action — not empty home
 */
export default function OnboardPage() {
  const router = useRouter();
  const { publicKey, connect, loading, error: walletError } = useWallet();
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const goalMeta = useMemo(
    () => GOALS.find((g) => g.id === goal) || GOALS[3],
    [goal]
  );

  // Resume if already connected
  useEffect(() => {
    try {
      const saved = localStorage.getItem(GOAL_KEY) as Goal | null;
      if (saved && GOALS.some((g) => g.id === saved)) setGoal(saved);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (publicKey && step < 2) {
      // Skip create if wallet already exists
      if (step === 0 || step === 1) {
        /* stay — user may still pick goal */
      }
    }
  }, [publicKey, step]);

  const pickGoal = (id: Goal) => {
    setGoal(id);
    try {
      localStorage.setItem(GOAL_KEY, id);
    } catch {
      /* ignore */
    }
    setStep(2);
  };

  const createWallet = async () => {
    setError(null);
    setCreating(true);
    try {
      await connect();
      setStep(3);
      try {
        localStorage.setItem(ONBOARD_KEY, "1");
      } catch {
        /* ignore */
      }
    } catch (e) {
      setError(friendlyError(e, "Couldn't create wallet"));
    } finally {
      setCreating(false);
    }
  };

  const finish = () => {
    try {
      localStorage.setItem(ONBOARD_KEY, "1");
    } catch {
      /* ignore */
    }
    router.push(goalMeta.href);
  };

  return (
    <div className="min-h-dvh bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      <Navbar />
      <main className="flex-1 w-full max-w-md mx-auto px-4 pt-8 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
        {/* progress */}
        <div className="flex gap-1.5 mb-8">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition ${
                i <= step ? "bg-violet-500" : "bg-black/10 dark:bg-white/10"
              }`}
            />
          ))}
        </div>

        {/* 0 — value before effort */}
        {step === 0 && (
          <div className="space-y-8 text-center">
            <div className="flex justify-center py-4">
              <ThinkingOrb state="breathing" size={64} theme="auto" aria-label="sol.new" />
            </div>
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-wider text-violet-500 font-semibold">
                Welcome to sol.new
              </p>
              <h1 className="text-3xl font-bold tracking-tight leading-tight">
                A Solana wallet in your Face&nbsp;ID
              </h1>
              <p className="text-sm text-gray-500 dark:text-white/50 max-w-sm mx-auto">
                No seed phrase. No app store. Send, swap, gift, stake — secured by
                the same passkey that unlocks your phone.
              </p>
            </div>
            <ul className="text-left space-y-2.5 max-w-sm mx-auto">
              {[
                "Wallet in seconds",
                "Gifts anyone can claim",
                "Swap & stake when you’re ready",
              ].map((t) => (
                <li
                  key={t}
                  className="flex items-center gap-2.5 text-sm text-gray-700 dark:text-white/80"
                >
                  <span className="w-5 h-5 rounded-full bg-violet-500/15 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3" />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="w-full min-h-[52px] rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-semibold flex items-center justify-center gap-2"
            >
              Continue <ArrowRight className="w-4 h-4" />
            </button>
            <p className="text-[11px] text-gray-400">
              Already set up?{" "}
              <Link href="/wallet/find" className="text-violet-500">
                Find my wallet
              </Link>
            </p>
          </div>
        )}

        {/* 1 — one useful question */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-bold tracking-tight">
                What do you want first?
              </h1>
              <p className="text-sm text-gray-500">
                We’ll tailor your next step — one tap.
              </p>
            </div>
            <div className="space-y-2">
              {GOALS.map((g) => {
                const Icon = g.icon;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => pickGoal(g.id)}
                    className="w-full text-left rounded-2xl border border-black/10 dark:border-white/10 hover:border-violet-500/40 hover:bg-violet-500/5 px-4 py-3.5 flex items-start gap-3 transition"
                  >
                    <span className="w-10 h-10 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold text-sm">{g.title}</span>
                      <span className="block text-xs text-gray-500 mt-0.5">
                        {g.blurb}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setStep(0)}
              className="w-full text-xs text-gray-400"
            >
              Back
            </button>
          </div>
        )}

        {/* 2 — activation: create wallet */}
        {step === 2 && (
          <div className="space-y-6 text-center">
            <div className="flex justify-center py-2">
              {creating || loading ? (
                <ThinkingOrb
                  state="composing"
                  size={64}
                  theme="auto"
                  aria-label="Creating wallet"
                />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-violet-500/15 text-violet-600 dark:text-violet-400 flex items-center justify-center">
                  <Wallet className="w-8 h-8" />
                </div>
              )}
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold tracking-tight">
                {publicKey ? "Wallet ready" : "Create your wallet"}
              </h1>
              <p className="text-sm text-gray-500 max-w-sm mx-auto">
                {publicKey
                  ? "You're connected. One more step to personalise."
                  : "Tap once — Face ID creates a passkey wallet. No seed phrase to write down."}
              </p>
            </div>
            {(error || walletError) && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
                {error || walletError}
              </div>
            )}
            {publicKey ? (
              <button
                type="button"
                onClick={() => setStep(3)}
                className="w-full min-h-[52px] rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-semibold"
              >
                Continue
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void createWallet()}
                disabled={creating || loading}
                className="w-full min-h-[52px] rounded-2xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-semibold flex items-center justify-center gap-2"
              >
                {(creating || loading) && <Spinner size={20} state="composing" />}
                {creating || loading ? "Creating…" : "Create with Face ID"}
              </button>
            )}
            <button
              type="button"
              onClick={() => setStep(1)}
              className="w-full text-xs text-gray-400"
            >
              Back
            </button>
          </div>
        )}

        {/* 3 — meaningful result */}
        {step === 3 && (
          <div className="space-y-6 text-center">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <Check className="w-8 h-8" />
              </div>
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold tracking-tight">
                You’re set for {goalMeta.title.toLowerCase()}
              </h1>
              <p className="text-sm text-gray-500 max-w-sm mx-auto">
                {goalMeta.blurb}
              </p>
              {publicKey && (
                <p className="text-xs font-mono text-violet-600 dark:text-violet-400 bg-violet-500/10 border border-violet-500/20 rounded-full inline-flex px-3 py-1 mt-1">
                  {publicKey.slice(0, 4)}…{publicKey.slice(-4)}
                </p>
              )}
            </div>
            <div className="rounded-2xl border border-black/10 dark:border-white/10 p-4 text-left space-y-2">
              <p className="text-xs text-gray-500 uppercase tracking-wide">
                Your first move
              </p>
              <p className="font-semibold">{goalMeta.title}</p>
              <p className="text-sm text-gray-500">{goalMeta.blurb}</p>
            </div>
            <button
              type="button"
              onClick={finish}
              className="w-full min-h-[52px] rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-semibold flex items-center justify-center gap-2"
            >
              {goalMeta.cta} <ArrowRight className="w-4 h-4" />
            </button>
            {!publicKey && (
              <button
                type="button"
                onClick={() => setStep(2)}
                className="w-full text-xs text-amber-600"
              >
                Wallet missing — create it
              </button>
            )}
            <Link href="/get" className="block text-xs text-gray-400">
              Need SOL first? Get funds →
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
