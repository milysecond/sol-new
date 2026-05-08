import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/navbar";

export const metadata: Metadata = {
  title: "Privacy — sol.new",
  description: "What sol.new collects, what it stores, and what stays on your device.",
};

const UPDATED = "May 8, 2026";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white">
      <Navbar />
      <main className="max-w-3xl mx-auto px-6 py-10 space-y-8 text-sm text-gray-700 dark:text-white/70">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
            Privacy
          </h1>
          <p className="text-gray-500 dark:text-white/40">
            Last updated {UPDATED}.
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            The short version
          </h2>
          <p>
            sol.new is non-custodial. Your wallet keys live on your device
            (passkey-protected by your operating system) and are never sent to
            our servers. We can&apos;t move your funds, and we can&apos;t see
            your private key.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            What stays on your device
          </h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              Your wallet&apos;s private key, generated locally and protected by
              a passkey (Face ID, Touch ID, Windows Hello, or a hardware
              security key).
            </li>
            <li>
              Your selected network (live / test) and theme preference, stored
              in your browser.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            What we store
          </h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <span className="font-medium text-gray-900 dark:text-white">Public on-chain activity.</span>{" "}
              When you launch a token or NFT through sol.new, we record the
              public mint address, the wallet that signed for it, the metadata
              you supplied (name, symbol, description, image), and a timestamp.
              This powers the public &quot;what&apos;s new&quot; feed and your
              portfolio. Everything we store here is already public on the
              Solana blockchain.
            </li>
            <li>
              <span className="font-medium text-gray-900 dark:text-white">Standard server logs.</span>{" "}
              Like most websites, our hosting provider records request
              metadata (IP address, user agent, timestamp) for short periods to
              defend against abuse and to debug outages.
            </li>
            <li>
              <span className="font-medium text-gray-900 dark:text-white">Aggregate analytics.</span>{" "}
              We use Vercel Analytics, which records page views and performance
              metrics without cookies and without tracking individuals across
              sites. If a Google Analytics ID is configured for the deployment
              you&apos;re visiting, page views are also reported there in
              aggregate.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            What we don&apos;t collect
          </h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>Names, emails, phone numbers, or government IDs.</li>
            <li>
              Private keys, seed phrases, passkey credentials, or any signing
              material.
            </li>
            <li>Browsing activity outside sol.new.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Third parties
          </h2>
          <p>
            sol.new uses public Solana RPC endpoints to read and submit
            transactions, and uses content-delivery and analytics providers
            (Vercel, optionally Google Analytics) listed above. Each of these
            sees the request metadata necessary to do its job.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Your choices
          </h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              Clearing your browser&apos;s site data for sol.new removes local
              preferences. To delete a wallet, remove its passkey from your
              device&apos;s passkey manager.
            </li>
            <li>
              Public on-chain records (token mints, transactions) are part of
              Solana itself and cannot be erased by us.
            </li>
            <li>
              For questions or requests, email{" "}
              <a
                href="mailto:gm@metasal.xyz"
                className="text-purple-400 hover:underline"
              >
                gm@metasal.xyz
              </a>
              .
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Changes
          </h2>
          <p>
            If this policy changes in a meaningful way, we&apos;ll update the
            date at the top and note what changed.
          </p>
        </section>

        <footer className="pt-4 border-t border-black/5 dark:border-white/10 text-xs text-gray-400 dark:text-white/30">
          See also{" "}
          <Link href="/terms" className="text-purple-400 hover:underline">
            Terms of Use
          </Link>
          .
        </footer>
      </main>
    </div>
  );
}
