import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Coins,
  ExternalLink,
  Shield,
  Sparkles,
  Wallet,
} from "lucide-react";
import { PageBack } from "@/components/page-back";

const site = "https://sol.new";
/** Full welcome curriculum (Solly) — primary subdomain */
const STARTER_HOST = "https://starter.sol.new";

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: "Starter — Welcome to Solana | sol.new",
  description:
    "New to Solana? Start here. Wallet, first SOL, safety, and next steps — Solana New Starter with Solly, on sol.new.",
  alternates: { canonical: "/starter" },
  openGraph: {
    title: "Starter · Welcome to Solana · sol.new",
    description:
      "Friendly welcome path for newcomers. Set up a wallet, get SOL, stay safe — then explore sol.new tools.",
    url: `${site}/starter`,
    siteName: "sol.new",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Starter · Welcome to Solana · sol.new",
    description: "New to Solana? Your friendly start path on sol.new.",
  },
  robots: { index: true, follow: true },
};

const steps = [
  {
    href: "/wallet",
    title: "Get a wallet",
    desc: "Passkey wallet on sol.new — no app store, seconds to start.",
    icon: Wallet,
    color: "text-fuchsia-600 dark:text-fuchsia-400",
  },
  {
    href: "/get",
    title: "Get SOL",
    desc: "Fund your wallet so you can send, swap, and explore.",
    icon: Coins,
    color: "text-amber-600 dark:text-amber-400",
  },
  {
    href: `${STARTER_HOST}/docs/security`,
    title: "Stay safe",
    desc: "Scams, phishing, and habits every newcomer should know.",
    icon: Shield,
    color: "text-rose-600 dark:text-rose-400",
    external: true,
  },
  {
    href: `${STARTER_HOST}/docs`,
    title: "Full welcome path",
    desc: "Solly’s step-by-step guides — wallets, staking, tokens, and more.",
    icon: BookOpen,
    color: "text-purple-600 dark:text-purple-400",
    external: true,
  },
];

const more = [
  { href: "/swap", label: "Swap" },
  { href: "/stake", label: "Stake" },
  { href: "/gift", label: "Gift" },
  { href: "/token", label: "Launch a token" },
  { href: "/loan", label: "Loan" },
  { href: "/frame", label: "LinkedIn frame" },
];

export default function StarterPage() {
  return (
    <main className="min-h-[100dvh] bg-white text-black dark:bg-black dark:text-white">
      <div className="mx-auto w-full max-w-lg px-4 pb-20 pt-3 sm:pt-5">
        <div className="mb-3 flex items-center gap-1">
          <PageBack />
        </div>

        <header className="mb-8 space-y-3 text-center sm:text-left">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-700 dark:bg-purple-500/20 dark:text-purple-300">
            <Sparkles className="h-3.5 w-3.5" />
            Solana New Starter
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Welcome to Solana
          </h1>
          <p className="text-sm leading-relaxed text-gray-600 dark:text-white/60 sm:text-base">
            New here? This is your friendly start path on{" "}
            <span className="font-semibold text-fuchsia-600 dark:text-fuchsia-400">
              sol.new
            </span>
            . Do the first hops with our tools, then dive deeper with Solly’s full
            guides on{" "}
            <a
              href={STARTER_HOST}
              className="font-semibold text-purple-600 underline-offset-2 hover:underline dark:text-purple-400"
              target="_blank"
              rel="noopener noreferrer"
            >
              starter.sol.new
            </a>
            .
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-white/40">
            Start here
          </h2>
          <ul className="space-y-2">
            {steps.map((s) => {
              const Icon = s.icon;
              const className =
                "group flex items-start gap-3 rounded-2xl border border-black/10 bg-white p-4 transition hover:border-purple-400/50 hover:shadow-md dark:border-white/10 dark:bg-zinc-950 dark:hover:border-purple-400/40";
              const body = (
                <>
                  <span
                    className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-black/[0.04] dark:bg-white/10 ${s.color}`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 font-semibold text-gray-900 dark:text-white">
                      {s.title}
                      {s.external ? (
                        <ExternalLink className="h-3.5 w-3.5 opacity-50" />
                      ) : (
                        <ArrowRight className="h-3.5 w-3.5 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-70" />
                      )}
                    </span>
                    <span className="mt-0.5 block text-sm text-gray-600 dark:text-white/55">
                      {s.desc}
                    </span>
                  </span>
                </>
              );
              return (
                <li key={s.href}>
                  {s.external ? (
                    <a href={s.href} className={className} target="_blank" rel="noopener noreferrer">
                      {body}
                    </a>
                  ) : (
                    <Link href={s.href} className={className}>
                      {body}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="mt-10 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-white/40">
            Then explore on sol.new
          </h2>
          <div className="flex flex-wrap gap-2">
            {more.map((m) => (
              <Link
                key={m.href}
                href={m.href}
                className="rounded-full border border-black/10 px-3.5 py-1.5 text-sm font-medium text-gray-800 transition hover:border-purple-400 hover:text-purple-700 dark:border-white/15 dark:text-white/80 dark:hover:border-purple-400 dark:hover:text-purple-300"
              >
                {m.label}
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-10 rounded-2xl bg-gradient-to-br from-[#9945FF] to-[#14F195] p-[1px]">
          <div className="rounded-2xl bg-white px-5 py-5 dark:bg-black sm:px-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              Full curriculum with Solly
            </h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-white/60">
              Beginner guides, kids zone, dictionary, and audio walkthroughs — hosted
              at starter.sol.new.
            </p>
            <a
              href={STARTER_HOST}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#9945FF] px-5 text-sm font-bold text-white shadow transition hover:bg-[#7C33CC]"
            >
              Open starter.sol.new
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}
