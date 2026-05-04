import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/lib/wallet-context";
import { NetworkProvider } from "@/lib/network";
import { ThemeProvider } from "@/lib/theme-context";
import { Analytics } from "@vercel/analytics/react";
import { Toaster } from "sonner";
import { InstallPrompt } from "@/components/install-prompt";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "sol.new — Tokens, NFTs, and wallets on Solana",
  description: "The fastest way to create tokens, NFTs, wallets, payments, and DAOs on Solana. Passkey-secured, low fees. Start in seconds.",
  manifest: "/manifest.json",
  themeColor: "#a855f7",
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
    images: [
      {
        url: "https://sol.new/og.png",
        width: 1200,
        height: 630,
        alt: "sol.new — Create anything on Solana",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "sol.new — Tokens, NFTs, and wallets on Solana",
    description: "The fastest way to create tokens, NFTs, wallets, payments, and DAOs on Solana. Passkey-secured, low fees.",
    images: ["https://sol.new/og.png"],
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
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme:dark)').matches))document.documentElement.classList.add('dark')}catch(e){}})()` }} />

        {process.env.NEXT_PUBLIC_GA_ID && (
          <>
            <script async src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_ID}`} />
            <script dangerouslySetInnerHTML={{ __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${process.env.NEXT_PUBLIC_GA_ID}')` }} />
          </>
        )}
      </head>
      <body className={`${inter.className} antialiased`}>
        <ThemeProvider>
        <NetworkProvider><WalletProvider>{children}</WalletProvider></NetworkProvider>
        </ThemeProvider>
        <Toaster theme="dark" position="top-center" richColors />
        <InstallPrompt />
        <Analytics />
        <script
          dangerouslySetInnerHTML={{
            __html: `if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("/sw.js"))`,
          }}
        />
      </body>
    </html>
  );
}
