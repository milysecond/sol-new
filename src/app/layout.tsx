import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/lib/wallet-context";
import { NetworkProvider } from "@/lib/network";
import { ThemeProvider } from "@/lib/theme-context";
import { PodPlayerProvider } from "@/lib/pod-player";
import { Toaster } from "sonner";
import { InstallPrompt } from "@/components/install-prompt";
import { PushPrompt } from "@/components/push-prompt";
import { SiteFooter } from "@/components/site-footer";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-bricolage",
});

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Allow pinch-zoom for accessibility (a11y) while still feeling native
  maximumScale: 5,
};

export const metadata: Metadata = {
  metadataBase: new URL("https://sol.new"),
  title: "sol.new — Tokens, NFTs, and wallets on Solana",
  description: "The fastest way to create tokens, NFTs, wallets, payments, and DAOs on Solana. Passkey-secured, low fees. Start in seconds.",
  // Do NOT set a global canonical here — it made every route claim
  // canonical https://sol.new/ and GSC treated /token, /wallet, etc. as duplicates.
  // Each page sets its own alternates.canonical (home does so below via page metadata).
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "sol.new",
  },
  icons: {
    icon: [
      { url: "/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "sol.new — Tokens, NFTs, and wallets on Solana",
    description: "The fastest way to create tokens, NFTs, wallets, payments, and DAOs on Solana. Passkey-secured, low fees. Start in seconds.",
    url: "https://sol.new",
    siteName: "sol.new",
    type: "website",
    // Image from src/app/opengraph-image.tsx (dynamic dark brand card)
  },
  twitter: {
    card: "summary_large_image",
    title: "sol.new — Tokens, NFTs, and wallets on Solana",
    description: "The fastest way to create tokens, NFTs, wallets, payments, and DAOs on Solana. Passkey-secured, low fees.",
    creator: "@soldotnew",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* viewport also exported above; keep cover for PWA / notched devices */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark')document.documentElement.classList.add('dark')}catch(e){}})()` }} />

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "Organization",
                  "@id": "https://sol.new/#organization",
                  name: "sol.new",
                  url: "https://sol.new",
                  logo: "https://sol.new/icon-512.png",
                  sameAs: ["https://x.com/soldotnew", "https://t.me/soldotnew"],
                },
                {
                  "@type": "WebSite",
                  "@id": "https://sol.new/#website",
                  url: "https://sol.new",
                  name: "sol.new",
                  description:
                    "The fastest way to create tokens, NFTs, wallets, payments, and DAOs on Solana. Passkey-secured, no installs.",
                  publisher: { "@id": "https://sol.new/#organization" },
                },
                {
                  "@type": "SoftwareApplication",
                  name: "sol.new",
                  url: "https://sol.new",
                  applicationCategory: "FinanceApplication",
                  operatingSystem: "Web",
                  description:
                    "Create Solana tokens, NFTs, multisig wallets, and payment links in seconds. Passkey-secured (Face ID / Touch ID) — no seed phrases, no installs, no signup.",
                  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
                  publisher: { "@id": "https://sol.new/#organization" },
                },
              ],
            }),
          }}
        />

        {process.env.NEXT_PUBLIC_GA_ID && (
          <>
            <script async src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_ID}`} />
            <script dangerouslySetInnerHTML={{ __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${process.env.NEXT_PUBLIC_GA_ID}')` }} />
          </>
        )}
      </head>
      <body className={`${bricolage.variable} ${bricolage.className} antialiased`}>
        <ThemeProvider>
        <NetworkProvider>
          <WalletProvider>
            <PodPlayerProvider>
              <div className="min-h-screen flex flex-col">
                <div className="flex-1 flex flex-col">{children}</div>
                <SiteFooter />
              </div>
            </PodPlayerProvider>
          </WalletProvider>
        </NetworkProvider>
        </ThemeProvider>
        <Toaster theme="light" position="top-center" richColors />
        <InstallPrompt />
        <PushPrompt />
        <script
          dangerouslySetInnerHTML={{
            __html: `if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("/sw.js"))`,
          }}
        />
      </body>
    </html>
  );
}
