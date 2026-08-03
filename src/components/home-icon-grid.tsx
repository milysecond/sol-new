"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Reorder, useDragControls } from "motion/react";
import {
  Coins,
  Image,
  Wallet,
  ShieldCheck,
  Users,
  HandCoins,
  Gift,
  Trophy,
  Receipt,
  Dices,
  TrendingUp,
  Landmark,
  Droplets,
  Flame,
  Layers,
  GripVertical,
  RotateCcw,
  Check,
  Pencil,
  Star,
  ArrowLeftRight,
  Frame,
  Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AnimatedIcon } from "@/components/animated-icon";
import {
  getHomeIconOrder,
  setHomeIconOrder,
  resetHomeOrders,
  HOME_DEFAULT_ORDER,
  HOME_PIN_COUNT,
} from "@/lib/home-icons-pref";

type Tile = {
  href: string;
  title: string;
  desc: string;
  icon: LucideIcon;
  color: string;
};

/** Full catalog — every icon is free to move anywhere in the list. */
const ALL_TILES: Tile[] = [
  { href: "/starter", title: "Starter", desc: "New to Solana? Start here", icon: Sparkles, color: "text-purple-600 dark:text-purple-400" },
  { href: "/wallet", title: "Wallet", desc: "Get SOL, send, manage", icon: Wallet, color: "text-fuchsia-500 dark:text-fuchsia-400" },
  { href: "/token", title: "Token", desc: "Launch your own coin", icon: Coins, color: "text-orange-500 dark:text-orange-400" },
  { href: "/gift", title: "Gift", desc: "Send crypto with a link", icon: Gift, color: "text-amber-500 dark:text-amber-400" },
  { href: "/punt", title: "Punt", desc: "Odds, picks, markets", icon: Trophy, color: "text-green-600 dark:text-green-400" },
  { href: "/nft", title: "NFT", desc: "Image to NFT", icon: Image, color: "text-green-600 dark:text-green-400" },
  { href: "/nfts", title: "Browse", desc: "NFT gallery", icon: Layers, color: "text-emerald-600 dark:text-emerald-400" },
  { href: "/multisig", title: "Multisig", desc: "Shared wallet", icon: ShieldCheck, color: "text-blue-600 dark:text-blue-400" },
  { href: "/pay", title: "Pay", desc: "Request money", icon: HandCoins, color: "text-teal-600 dark:text-teal-400" },
  { href: "/split", title: "Split", desc: "Split a bill", icon: Users, color: "text-purple-600 dark:text-purple-400" },
  { href: "/receipt", title: "Receipt", desc: "Tx receipt", icon: Receipt, color: "text-orange-600 dark:text-orange-400" },
  { href: "/draw", title: "Draw", desc: "Fair raffle", icon: Dices, color: "text-violet-600 dark:text-violet-400" },
  { href: "/earn", title: "Earn", desc: "USDC yield", icon: TrendingUp, color: "text-emerald-600 dark:text-emerald-400" },
  { href: "/loan", title: "Loan", desc: "Lend & borrow", icon: Landmark, color: "text-lime-600 dark:text-lime-400" },
  { href: "/swap", title: "Swap", desc: "Trade tokens", icon: ArrowLeftRight, color: "text-fuchsia-600 dark:text-fuchsia-400" },
  { href: "/stake", title: "Stake", desc: "Stake SOL", icon: Landmark, color: "text-purple-600 dark:text-purple-400" },
  { href: "/lst", title: "LST", desc: "Liquid stake", icon: Droplets, color: "text-cyan-600 dark:text-cyan-400" },
  { href: "/burn", title: "Burn", desc: "Reclaim rent", icon: Flame, color: "text-rose-600 dark:text-rose-400" },
  { href: "/portfolio", title: "Portfolio", desc: "Holdings", icon: Wallet, color: "text-fuchsia-600 dark:text-fuchsia-400" },
  { href: "/frame", title: "Frame", desc: "LinkedIn photo ring", icon: Frame, color: "text-violet-600 dark:text-violet-400" },
];

function orderTiles(order: string[]): Tile[] {
  const map = new Map(ALL_TILES.map((t) => [t.href, t]));
  const out: Tile[] = [];
  for (const href of order) {
    const t = map.get(href);
    if (t) out.push(t);
  }
  for (const t of ALL_TILES) {
    if (!out.some((x) => x.href === t.href)) out.push(t);
  }
  return out;
}

function DragRow({
  tile,
  index,
}: {
  tile: Tile;
  index: number;
}) {
  const controls = useDragControls();
  const Icon = tile.icon;
  const pinned = index < HOME_PIN_COUNT;
  return (
    <Reorder.Item
      value={tile.href}
      dragListener={false}
      dragControls={controls}
      className="flex items-center gap-3 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-black px-3 py-3 touch-none list-none min-h-[52px]"
      whileDrag={{ scale: 1.02, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 20 }}
    >
      <button
        type="button"
        className="shrink-0 p-2 -ml-1 rounded-lg text-gray-400 active:bg-black/5 dark:active:bg-white/10 cursor-grab active:cursor-grabbing touch-manipulation"
        aria-label={`Drag ${tile.title}`}
        onPointerDown={(e) => controls.start(e)}
        style={{ touchAction: "none" }}
      >
        <GripVertical size={18} />
      </button>
      <span className="w-5 text-[10px] font-mono text-gray-400 tabular-nums shrink-0">
        {index + 1}
      </span>
      <Icon className={`w-5 h-5 shrink-0 ${tile.color}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate flex items-center gap-1.5">
          {tile.title}
          {pinned && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
              <Star size={10} className="fill-current" /> large
            </span>
          )}
        </p>
        <p className="text-[11px] text-gray-500 dark:text-white/40 truncate">{tile.desc}</p>
      </div>
    </Reorder.Item>
  );
}

export function HomeIconGrid() {
  const [editing, setEditing] = useState(false);
  const [order, setOrder] = useState<string[]>([...HOME_DEFAULT_ORDER]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setOrder(getHomeIconOrder());
    setHydrated(true);
  }, []);

  const tiles = useMemo(() => orderTiles(order), [order]);
  const pinned = tiles.slice(0, HOME_PIN_COUNT);
  const rest = tiles.slice(HOME_PIN_COUNT);

  const onReorder = useCallback((next: string[]) => {
    setOrder(next);
    setHomeIconOrder(next);
  }, []);

  const reset = () => {
    resetHomeOrders();
    setOrder([...HOME_DEFAULT_ORDER]);
  };

  if (!hydrated) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 min-h-[120px] animate-pulse">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 min-h-[120px]"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <p className="text-[11px] text-gray-400 dark:text-white/30">
          {editing
            ? `Drag any icon. Top ${HOME_PIN_COUNT} show as large tiles.`
            : "Your tools · rearrange any icon"}
        </p>
        <div className="flex items-center gap-1.5">
          {editing && (
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] rounded-lg text-xs text-gray-600 dark:text-white/60 border border-black/10 dark:border-white/10 cursor-pointer touch-manipulation"
            >
              <RotateCcw size={12} /> Reset
            </button>
          )}
          <button
            type="button"
            onClick={() => setEditing((e) => !e)}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] rounded-lg text-xs font-medium cursor-pointer touch-manipulation border transition ${
              editing
                ? "bg-purple-600 text-white border-purple-600"
                : "text-purple-700 dark:text-purple-300 border-purple-400/40 bg-purple-500/10"
            }`}
          >
            {editing ? (
              <>
                <Check size={12} /> Done
              </>
            ) : (
              <>
                <Pencil size={12} /> Rearrange
              </>
            )}
          </button>
        </div>
      </div>

      {editing ? (
        <Reorder.Group
          axis="y"
          values={order}
          onReorder={onReorder}
          className="flex flex-col gap-2 list-none m-0 p-0"
        >
          {tiles.map((tile, i) => (
            <DragRow key={tile.href} tile={tile} index={i} />
          ))}
        </Reorder.Group>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            {pinned.map((p) => (
              <Link
                key={p.href}
                href={p.href}
                className="group relative z-0 flex flex-col items-center justify-center gap-2 sm:gap-3 py-6 sm:py-8 md:py-10 min-h-[120px] bg-black/[0.03] dark:bg-white/[0.03] hover:bg-black/[0.07] dark:hover:bg-white/[0.07] active:scale-[0.98] border border-black/10 dark:border-white/10 hover:border-purple-400/30 rounded-2xl transition-all duration-150 touch-manipulation select-none"
              >
                <AnimatedIcon
                  icon={p.icon}
                  size={28}
                  className={`${p.color} [&_svg]:w-7 [&_svg]:h-7 sm:[&_svg]:w-9 sm:[&_svg]:h-9`}
                />
                <div className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white pointer-events-none">
                  {p.title}
                </div>
                <div className="text-[11px] sm:text-xs text-gray-500 dark:text-white/40 px-2 text-center leading-tight pointer-events-none">
                  {p.desc}
                </div>
              </Link>
            ))}
          </div>

          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-3">
            {rest.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className="group relative z-0 flex flex-col items-center justify-center gap-1.5 py-3.5 sm:py-4 min-h-[84px] bg-black/[0.03] dark:bg-white/[0.03] hover:bg-black/[0.07] dark:hover:bg-white/[0.07] active:scale-[0.98] border border-black/10 dark:border-white/10 hover:border-purple-400/30 rounded-2xl transition-all duration-150 touch-manipulation select-none"
              >
                <t.icon
                  className={`w-5 h-5 sm:w-6 sm:h-6 ${t.color} pointer-events-none`}
                />
                <div className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white pointer-events-none">
                  {t.title}
                </div>
                <div className="text-[10px] text-gray-500 dark:text-white/40 leading-tight text-center px-1 hidden sm:block pointer-events-none">
                  {t.desc}
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
