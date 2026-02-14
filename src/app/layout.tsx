import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/lib/wallet-context";
import { NetworkProvider } from "@/lib/network";
import { ThemeProvider } from "@/lib/theme-context";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "sol.new — Create anything on Solana",
  description: "The fastest way to create tokens, NFTs, wallets, payments, and DAOs on Solana. No wallet, low fees, no friction.",
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
    title: "sol.new",
    description: "Create anything on Solana",
    url: "https://sol.new",
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
        <script defer src="https://stats.sal.fun/script.js" data-website-id="2fd088a3-f7b5-486c-9b38-6c0f50ec5d9e" />
      </head>
      <body className={`${inter.className} antialiased`}>
        <ThemeProvider>
        <NetworkProvider><WalletProvider>{children}</WalletProvider></NetworkProvider>
        </ThemeProvider>
        <script
          dangerouslySetInnerHTML={{
            __html: `if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("/sw.js"))`,
          }}
        />
      </body>
    </html>
  );
}
