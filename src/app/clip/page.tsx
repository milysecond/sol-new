import type { Metadata } from "next";
import Link from "next/link";
import { PageBack } from "@/components/page-back";
import { QrCode } from "@/components/qr-code";
import { Nfc, QrCode as QrIcon, Smartphone, Sparkles, Zap } from "lucide-react";

const site = "https://sol.new";

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: "App Clip · sol.new on iPhone — no install",
  description:
    "Open the full sol.new experience from a QR or NFC tag. Wallet, swap, gifts, POAPs — no App Store install required.",
  alternates: { canonical: "/clip" },
  openGraph: {
    title: "sol.new App Clip",
    description: "Full sol.new on iPhone. Scan and go.",
    url: `${site}/clip`,
    siteName: "sol.new",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "sol.new App Clip",
    description: "Wallet, swap, gifts, POAPs — no install.",
  },
};

const paths = [
  { href: "/", label: "Home / onboard" },
  { href: "/home", label: "All tools" },
  { href: "/poap", label: "POAP drops" },
  { href: "/gift", label: "Gifts" },
  { href: "/swap", label: "Swap" },
  { href: "/wallet/get", label: "Receive / ask funds" },
  { href: "/stake", label: "Stake" },
  { href: "/onboard", label: "Get a wallet" },
];

export default function ClipLandingPage() {
  const qrUrl = `${site}/home?source=appclip`;

  return (
    <div className="min-h-dvh bg-white dark:bg-black text-gray-900 dark:text-white">
      <div className="app-shell pt-6 pb-24 space-y-8">
        <PageBack />

        <header className="space-y-3 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 px-3 py-1 text-xs font-semibold">
            <Smartphone className="w-3.5 h-3.5" /> iPhone App Clip
          </div>
          <h1 className="text-3xl font-bold tracking-tight">
            sol.new — no install
          </h1>
          <p className="text-sm text-gray-500 dark:text-white/50 max-w-md mx-auto">
            Scan a QR or tap an NFC tag. The full product opens on iPhone:
            Face&nbsp;ID wallet, swap, gifts, POAPs, stake, and more.
          </p>
        </header>

        <div className="flex flex-col items-center gap-3 rounded-2xl border border-black/10 dark:border-white/10 p-6">
          <div className="bg-white rounded-xl p-3">
            <QrCode data={qrUrl} size={200} className="w-[200px] h-[200px]" />
          </div>
          <p className="text-xs text-gray-500 font-mono break-all text-center">{qrUrl}</p>
          <p className="text-[11px] text-gray-400 text-center">
            Camera app → point at QR → App Clip card → Open
          </p>
        </div>

        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { icon: QrIcon, t: "QR", d: "Print on posters, tables, badges" },
            { icon: Nfc, t: "NFC", d: "Stickers & tags at the door" },
            { icon: Zap, t: "Link", d: "iMessage, email, bio links" },
          ].map(({ icon: Icon, t, d }) => (
            <div
              key={t}
              className="rounded-2xl border border-black/10 dark:border-white/10 p-4 space-y-1"
            >
              <Icon className="w-5 h-5 text-violet-500" />
              <p className="font-semibold text-sm">{t}</p>
              <p className="text-[11px] text-gray-500">{d}</p>
            </div>
          ))}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-500" /> Deep links (full product)
          </h2>
          <ul className="rounded-2xl border border-black/10 dark:border-white/10 divide-y divide-black/5 dark:divide-white/10">
            {paths.map((p) => (
              <li key={p.href}>
                <Link
                  href={p.href}
                  className="flex items-center justify-between px-4 py-3 text-sm hover:bg-violet-500/5"
                >
                  <span>{p.label}</span>
                  <span className="font-mono text-[11px] text-gray-400">{p.href === "/" ? "/" : p.href}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <p className="text-[11px] text-center text-gray-400">
          Requires iPhone. Production Clip experiences go live via App Store Connect after upload.
          Dev: Settings → Developer → Local Experiences.
        </p>
      </div>
    </div>
  );
}
