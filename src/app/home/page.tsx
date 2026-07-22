"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import {
  motion,
  useMotionValue,
  useSpring,
  useScroll,
  useTransform,
  type Variants,
} from "motion/react";
import { useWallet } from "@/lib/wallet-context";
import { Spinner } from "@/components/spinner";
import {
  Coins,
  Image as ImageIcon,
  Wallet,
  ShieldCheck,
  CreditCard,
  Users,
  Gift,
  Trophy,
  Receipt,
  ArrowUpRight,
  ArrowRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

type Product = {
  index: string;
  href: string;
  title: string;
  blurb: string;
  icon: LucideIcon;
  accent: string; // hex for glow/active
};

const PRODUCTS: Product[] = [
  { index: "01", href: "/token", title: "Tokens", blurb: "Launch your own coin in seconds. Name it, add an image, go live.", icon: Coins, accent: "#fb923c" },
  { index: "02", href: "/nft", title: "NFTs", blurb: "Turn any image into an NFT — standard or compressed, minted instantly.", icon: ImageIcon, accent: "#34d399" },
  { index: "03", href: "/wallet", title: "Wallets", blurb: "A Solana wallet secured by Face ID. Get SOL, send, and manage it all.", icon: Wallet, accent: "#e879f9" },
  { index: "04", href: "/multisig", title: "Multisig", blurb: "Shared wallets with multiple signers — for couples, teams, and DAOs.", icon: ShieldCheck, accent: "#60a5fa" },
  { index: "05", href: "/pay", title: "Payments", blurb: "Create a Solana Pay link or QR anyone can pay with, in SOL or USDC.", icon: CreditCard, accent: "#a855f7" },
  { index: "06", href: "/split", title: "Splits", blurb: "Split a bill with friends. Add a tip, share a link, track who's paid.", icon: Users, accent: "#f472b6" },
  { index: "07", href: "/gift", title: "Gifts", blurb: "Send SOL with a link — even to people without a wallet. They claim it with Face ID.", icon: Gift, accent: "#f59e0b" },
  { index: "08", href: "/punt", title: "Punt", blurb: "Live World Cup odds with zero bookmaker margin — from the TXODDS oracle on Solana.", icon: Trophy, accent: "#4ade80" },
  { index: "09", href: "/receipt", title: "Receipts", blurb: "Turn any Solana signature into a clean, shareable payment receipt.", icon: Receipt, accent: "#fb923c" },
];

const MARQUEE = ["Tokens", "NFTs", "Wallets", "Payments", "Multisig", "Splits", "Gifts", "Receipts", "World Cup Odds", "Solana Pay", "Passkeys"];

/* ------------------------------------------------------------------ */
/*  Motion helpers                                                     */
/* ------------------------------------------------------------------ */

const EASE = [0.22, 1, 0.36, 1] as const;

const revealUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: EASE, delay: i * 0.08 },
  }),
};

/** Word-by-word mask reveal for the hero headline. */
function KineticHeadline({ lines }: { lines: string[] }) {
  return (
    <h1 className="text-[clamp(2.75rem,9vw,7.5rem)] font-bold leading-[0.95] tracking-[-0.04em]">
      {lines.map((line, li) => (
        <span key={li} className="block overflow-hidden">
          <motion.span
            className="block"
            initial={{ y: "110%" }}
            animate={{ y: 0 }}
            transition={{ duration: 0.9, ease: EASE, delay: 0.15 + li * 0.12 }}
          >
            {line}
          </motion.span>
        </span>
      ))}
    </h1>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function HomeShowcase() {
  const { publicKey, connect, loading } = useWallet();
  const heroRef = useRef<HTMLDivElement>(null);

  // Cursor-reactive aurora
  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.25);
  const sx = useSpring(mx, { stiffness: 60, damping: 20 });
  const sy = useSpring(my, { stiffness: 60, damping: 20 });
  const orbX = useTransform(sx, (v) => `${v * 100}%`);
  const orbY = useTransform(sy, (v) => `${v * 100}%`);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const handleMove = (e: React.MouseEvent) => {
    const r = heroRef.current?.getBoundingClientRect();
    if (!r) return;
    mx.set((e.clientX - r.left) / r.width);
    my.set((e.clientY - r.top) / r.height);
  };

  // Hero parallax on scroll
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 140]);
  const heroFade = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  return (
    <div className="min-h-dvh bg-[#08070d] text-white antialiased overflow-x-hidden selection:bg-purple-500/30">
      {/* Grain overlay */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[1] opacity-[0.035] mix-blend-soft-light"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      {/* Top bar */}
      <header className="fixed top-0 inset-x-0 z-50">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 py-4 flex items-center justify-between">
          <Link href="/home" className="flex items-center gap-2">
            <img src="/icon-192.png" alt="" className="w-7 h-7 rounded-lg" />
            <span className="text-lg font-bold tracking-tight">
              sol<span className="text-purple-400">.new</span>
            </span>
          </Link>
          <Link
            href="/"
            className="group flex items-center gap-1.5 text-sm font-medium rounded-full border border-white/15 bg-white/5 backdrop-blur px-4 py-2 hover:bg-white/10 transition-colors"
          >
            Open app
            <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </Link>
        </div>
      </header>

      {/* ---------------- HERO ---------------- */}
      <section
        ref={heroRef}
        onMouseMove={handleMove}
        className="relative min-h-dvh flex flex-col justify-center px-5 sm:px-8 pt-24 pb-16"
      >
        {/* Aurora background */}
        <div aria-hidden className="absolute inset-0 overflow-hidden">
          <motion.div
            className="absolute w-[55vw] h-[55vw] rounded-full blur-[90px]"
            style={{
              left: orbX,
              top: orbY,
              x: "-50%",
              y: "-50%",
              background: "radial-gradient(circle, rgba(168,85,247,0.45) 0%, transparent 65%)",
            }}
          />
          <div className="absolute -bottom-40 -right-40 w-[60vw] h-[60vw] rounded-full blur-[110px] bg-[radial-gradient(circle,rgba(251,146,60,0.22)_0%,transparent_65%)]" />
          <div className="absolute -top-40 -left-40 w-[45vw] h-[45vw] rounded-full blur-[110px] bg-[radial-gradient(circle,rgba(99,102,241,0.25)_0%,transparent_65%)]" />
          {/* subtle grid */}
          <div
            className="absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.6) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.6) 1px,transparent 1px)",
              backgroundSize: "64px 64px",
              maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)",
            }}
          />
        </div>

        <motion.div style={{ y: heroY, opacity: heroFade }} className="relative z-10 mx-auto max-w-7xl w-full">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 backdrop-blur px-3.5 py-1.5 text-xs font-medium text-white/70 mb-8"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-400" />
            </span>
            Live on Solana · no installs, no seed phrases
          </motion.div>

          <KineticHeadline lines={["Create anything", "on Solana."]} />

          <motion.p
            variants={revealUp}
            initial="hidden"
            animate="show"
            custom={5}
            className="mt-8 max-w-xl text-lg sm:text-xl text-white/55 leading-relaxed"
          >
            Tokens, NFTs, wallets, payments, and splits — built for everyone, not just developers.
            Secured by Face ID. Ready in seconds.
          </motion.p>

          <motion.div
            variants={revealUp}
            initial="hidden"
            animate="show"
            custom={7}
            className="mt-10 flex flex-col sm:flex-row items-start sm:items-center gap-3"
          >
            {publicKey ? (
              <Link
                href="/"
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-white text-black font-semibold px-7 py-4 text-base hover:bg-white/90 transition-colors"
              >
                Open your wallet
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            ) : (
              <button
                onClick={() => connect("My Wallet")}
                disabled={loading}
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-white text-black font-semibold px-7 py-4 text-base hover:bg-white/90 transition-colors disabled:opacity-60"
              >
                {loading ? (
                  <><Spinner size={16} className="text-black" /> Setting up…</>
                ) : (
                  <>Create my wallet <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" /></>
                )}
              </button>
            )}
            <a
              href="#products"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 backdrop-blur font-medium px-7 py-4 text-base text-white/80 hover:bg-white/10 transition-colors"
            >
              Explore what you can build
            </a>
          </motion.div>
        </motion.div>

        {/* scroll cue */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: mounted ? 1 : 0 }}
          transition={{ delay: 1.4, duration: 0.6 }}
          className="absolute bottom-7 left-1/2 -translate-x-1/2 text-white/40"
        >
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            className="flex h-9 w-5 items-start justify-center rounded-full border border-white/25 p-1"
          >
            <span className="h-1.5 w-1 rounded-full bg-white/50" />
          </motion.div>
        </motion.div>
      </section>

      {/* ---------------- MARQUEE ---------------- */}
      <div className="relative z-10 border-y border-white/10 bg-white/[0.02] py-5 overflow-hidden">
        <motion.div
          className="flex gap-10 whitespace-nowrap"
          animate={{ x: ["0%", "-50%"] }}
          transition={{ duration: 28, repeat: Infinity, ease: "linear" }}
        >
          {[...MARQUEE, ...MARQUEE].map((w, i) => (
            <span key={i} className="text-2xl sm:text-3xl font-semibold tracking-tight text-white/25 flex items-center gap-10">
              {w}
              <span className="text-purple-400/60">✦</span>
            </span>
          ))}
        </motion.div>
      </div>

      {/* ---------------- PRODUCTS ---------------- */}
      <section id="products" className="relative z-10 mx-auto max-w-7xl px-5 sm:px-8 py-24 sm:py-32">
        <motion.div
          variants={revealUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          className="max-w-2xl mb-14 sm:mb-20"
        >
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-purple-400 mb-4">What you can build</p>
          <h2 className="text-4xl sm:text-6xl font-bold tracking-[-0.03em] leading-[1.02]">
            One link. Everything on Solana.
          </h2>
        </motion.div>

        <div className="grid sm:grid-cols-2 gap-4 sm:gap-5">
          {PRODUCTS.map((p, i) => (
            <ProductCard key={p.href} product={p} i={i} />
          ))}
        </div>
      </section>

      {/* ---------------- STATS ---------------- */}
      <section className="relative z-10 border-y border-white/10 bg-white/[0.02]">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 py-16 grid grid-cols-2 lg:grid-cols-4 gap-10">
          {[
            { k: "0", v: "Installs required" },
            { k: "0", v: "Seed phrases" },
            { k: "1%", v: "Token launch fee" },
            { k: "Face ID", v: "Secures every wallet" },
          ].map((s, i) => (
            <motion.div
              key={s.v}
              variants={revealUp}
              custom={i}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true }}
            >
              <div className="text-4xl sm:text-5xl font-bold tracking-tight bg-gradient-to-br from-white to-white/50 bg-clip-text text-transparent">
                {s.k}
              </div>
              <div className="mt-2 text-sm text-white/45">{s.v}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ---------------- CTA ---------------- */}
      <section className="relative z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(168,85,247,0.25)_0%,transparent_70%)]" />
        <div className="relative mx-auto max-w-3xl px-5 sm:px-8 py-28 sm:py-40 text-center">
          <motion.h2
            variants={revealUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            className="text-5xl sm:text-7xl font-bold tracking-[-0.04em] leading-[0.98]"
          >
            Start in seconds.
          </motion.h2>
          <motion.p
            variants={revealUp}
            custom={1}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            className="mt-6 text-lg text-white/55"
          >
            No app to download. No seed phrase to write down. Just your face.
          </motion.p>
          <motion.div
            variants={revealUp}
            custom={2}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            className="mt-10 flex justify-center"
          >
            {publicKey ? (
              <Link href="/" className="group inline-flex items-center gap-2 rounded-full bg-white text-black font-semibold px-8 py-4 text-base hover:bg-white/90 transition-colors">
                Open your wallet <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            ) : (
              <button
                onClick={() => connect("My Wallet")}
                disabled={loading}
                className="group inline-flex items-center gap-2 rounded-full bg-white text-black font-semibold px-8 py-4 text-base hover:bg-white/90 transition-colors disabled:opacity-60"
              >
                {loading ? <><Spinner size={16} className="text-black" /> Setting up…</> : <>Create my wallet <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" /></>}
              </button>
            )}
          </motion.div>
        </div>
      </section>

      {/* ---------------- FOOTER ---------------- */}
      <footer className="relative z-10 border-t border-white/10">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/icon-192.png" alt="" className="w-6 h-6 rounded-md" />
            <span className="font-bold tracking-tight">sol<span className="text-purple-400">.new</span></span>
          </div>
          <div className="flex items-center gap-5 text-sm text-white/50">
            <a href="https://x.com/soldotnew" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">X</a>
            <a href="https://t.me/soldotnew" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Telegram</a>
            <Link href="/docs" className="hover:text-white transition-colors">Docs</Link>
            <Link href="/" className="hover:text-white transition-colors">Open app</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Product card                                                       */
/* ------------------------------------------------------------------ */

function ProductCard({ product, i }: { product: Product; i: number }) {
  const { index, href, title, blurb, icon: Icon, accent } = product;
  return (
    <motion.div
      variants={revealUp}
      custom={i % 2}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-60px" }}
    >
      <Link
        href={href}
        className="group relative flex flex-col justify-between h-full min-h-[220px] rounded-3xl border border-white/10 bg-white/[0.03] p-7 overflow-hidden transition-colors hover:border-white/20"
      >
        {/* hover glow */}
        <div
          className="pointer-events-none absolute -inset-px opacity-0 group-hover:opacity-100 transition-opacity duration-500"
          style={{ background: `radial-gradient(400px circle at 80% 0%, ${accent}22, transparent 70%)` }}
        />
        <div className="relative flex items-start justify-between">
          <span className="font-mono text-sm text-white/30">{index}</span>
          <div
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 transition-colors"
            style={{ color: accent }}
          >
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <div className="relative mt-10">
          <h3 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
            {title}
            <ArrowUpRight className="w-5 h-5 text-white/30 group-hover:text-white group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
          </h3>
          <p className="mt-2 text-white/50 leading-relaxed max-w-sm">{blurb}</p>
        </div>
      </Link>
    </motion.div>
  );
}
