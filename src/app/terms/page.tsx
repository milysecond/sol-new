import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/navbar";

export const metadata: Metadata = {
  title: "Terms — sol.new",
  description: "Terms of use for sol.new.",
};

const UPDATED = "May 8, 2026";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white">
      <Navbar />
      <main className="max-w-3xl mx-auto px-6 py-10 space-y-8 text-sm text-gray-700 dark:text-white/70">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
            Terms of Use
          </h1>
          <p className="text-gray-500 dark:text-white/40">
            Last updated {UPDATED}.
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            1. What sol.new is
          </h2>
          <p>
            sol.new is a non-custodial interface for the Solana blockchain. It
            helps you generate wallets, launch tokens and NFTs, sign
            transactions, and interact with on-chain programs. Your keys are
            generated and stored on your device, protected by your operating
            system&apos;s passkey support. We never hold your keys, your
            funds, or sign transactions on your behalf.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            2. Eligibility
          </h2>
          <p>
            You must be old enough to enter into a binding contract in your
            jurisdiction, and you must not be located in, or a resident of, a
            country or region subject to comprehensive sanctions or otherwise
            restricted from using services like sol.new.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            3. Your responsibility
          </h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              You are solely responsible for keeping your device, your
              passkeys, and any seed phrases or backups you create secure.
            </li>
            <li>
              Lost passkeys generally mean lost access to that wallet. We
              cannot recover keys we never held.
            </li>
            <li>
              You are responsible for the legality of the tokens, NFTs, and
              transactions you create. Don&apos;t use sol.new to commit fraud,
              run unregistered securities offerings, or violate sanctions or
              local law.
            </li>
            <li>
              You are responsible for any taxes that result from your
              on-chain activity.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            4. Not financial advice
          </h2>
          <p>
            Information on sol.new — including any cost estimates, market
            data, or token listings — is for general information only. It is
            not investment, legal, accounting, or tax advice. Tokens you
            create or interact with may be worthless, illiquid, fraudulent, or
            illegal in your jurisdiction. Do your own research before
            transacting.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            5. The service is provided as-is
          </h2>
          <p>
            sol.new is provided on an &quot;as is&quot; and &quot;as
            available&quot; basis, without warranties of any kind, express or
            implied. We don&apos;t guarantee the service will be uninterrupted,
            error-free, or that any transaction will succeed at the price or
            time you expect. Solana network conditions, RPC availability, and
            third-party programs are outside our control.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            6. Limitation of liability
          </h2>
          <p>
            To the maximum extent permitted by law, sol.new and its operators
            are not liable for any indirect, incidental, special,
            consequential, or punitive damages, or for any loss of funds,
            tokens, NFTs, profits, data, or goodwill arising out of your use
            of the service. Our total liability for direct damages is limited
            to USD $100.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            7. Open source and third-party programs
          </h2>
          <p>
            sol.new uses open-source libraries and connects to third-party
            on-chain programs and RPC providers. Their licenses and terms
            govern your use of those components. We don&apos;t control and
            aren&apos;t responsible for third-party programs you choose to
            interact with through sol.new.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            8. Changes
          </h2>
          <p>
            We may update these terms. Material changes will be reflected in
            the &quot;last updated&quot; date above. Continued use of sol.new
            after changes means you accept the updated terms.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            9. Contact
          </h2>
          <p>
            Questions, takedown requests, or anything else:{" "}
            <a
              href="mailto:gm@metasal.xyz"
              className="text-purple-400 hover:underline"
            >
              gm@metasal.xyz
            </a>
            .
          </p>
        </section>

        <footer className="pt-4 border-t border-black/5 dark:border-white/10 text-xs text-gray-400 dark:text-white/30">
          See also{" "}
          <Link href="/privacy" className="text-purple-400 hover:underline">
            Privacy
          </Link>
          {" · "}
          <Link href="/changelog" className="text-purple-400 hover:underline">
            Changelog
          </Link>
          .
        </footer>
      </main>
    </div>
  );
}
