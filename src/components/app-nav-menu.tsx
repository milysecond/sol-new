"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Reorder, useDragControls } from "motion/react";
import {
  ArrowDownAZ,
  FolderTree,
  GripVertical,
  LayoutGrid,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import {
  NAV_ITEMS,
  applyOrder,
  clearMenuCustomOrder,
  filterNav,
  getMenuCustomOrder,
  groupNavByCategory,
  setMenuCustomOrder,
  sortNavAlpha,
  type NavItem,
} from "@/lib/nav-catalog";

type ViewMode = "categories" | "az" | "custom";

function MenuTile({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={`flex flex-col items-center gap-1.5 px-2 py-3 min-h-[76px] rounded-xl transition active:scale-95 touch-manipulation ${
        active
          ? "text-purple-700 dark:text-purple-300 bg-purple-500/15"
          : "text-gray-700 dark:text-white/70 hover:bg-black/5 dark:hover:bg-white/5"
      }`}
    >
      <Icon size={22} className={active ? "" : item.color} />
      <span className="text-[11px] font-medium text-center leading-tight">{item.label}</span>
    </Link>
  );
}

function DragRow({
  item,
  onNavigate,
}: {
  item: NavItem;
  onNavigate: () => void;
}) {
  const controls = useDragControls();
  const Icon = item.icon;
  return (
    <Reorder.Item
      value={item.href}
      dragListener={false}
      dragControls={controls}
      className="flex items-center gap-2 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-black px-2 py-2 touch-pan-y list-none"
      whileDrag={{
        scale: 1.02,
        boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
        zIndex: 20,
      }}
    >
      <button
        type="button"
        className="shrink-0 p-2 rounded-lg text-gray-400 active:bg-black/5 dark:active:bg-white/10 cursor-grab active:cursor-grabbing"
        aria-label={`Drag ${item.label}`}
        onPointerDown={(e) => {
          e.preventDefault();
          controls.start(e);
        }}
        style={{ touchAction: "none" }}
      >
        <GripVertical size={18} />
      </button>
      <Link
        href={item.href}
        onClick={onNavigate}
        className="min-w-0 flex-1 flex items-center gap-3 py-1.5 pr-2 rounded-lg active:bg-black/5 dark:active:bg-white/5 touch-manipulation"
      >
        <Icon size={18} className={item.color} />
        <div className="min-w-0 flex-1 text-left">
          <p className="text-sm font-semibold truncate text-gray-900 dark:text-white">
            {item.label}
          </p>
          <p className="text-[11px] text-gray-500 dark:text-white/40 truncate">
            {item.desc}
          </p>
        </div>
        <span className="text-[11px] text-violet-500 font-medium shrink-0">
          Open
        </span>
      </Link>
    </Reorder.Item>
  );
}

export function AppNavMenu({
  open,
  onClose,
  isActive,
}: {
  open: boolean;
  onClose: () => void;
  isActive: (href: string) => boolean;
}) {
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<ViewMode>("categories");
  const [customOrder, setCustomOrder] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!open) return;
    const saved = getMenuCustomOrder();
    const base = NAV_ITEMS.filter((i) => i.href !== "/home").map((i) => i.href);
    setCustomOrder(saved?.length ? applyOrder(
      NAV_ITEMS.filter((i) => i.href !== "/home"),
      saved,
    ).map((i) => i.href) : base);
    setHydrated(true);
  }, [open]);

  const catalog = useMemo(
    () => NAV_ITEMS.filter((i) => i.href !== "/home"),
    [],
  );

  const filtered = useMemo(() => filterNav(catalog, q), [catalog, q]);

  const onReorder = useCallback((next: string[]) => {
    setCustomOrder(next);
    setMenuCustomOrder(next);
  }, []);

  const resetCustom = () => {
    clearMenuCustomOrder();
    setCustomOrder(catalog.map((i) => i.href));
  };

  if (!open) return null;

  const searching = q.trim().length > 0;

  let body: React.ReactNode;

  if (searching) {
    const list = sortNavAlpha(filtered);
    body = (
      <div>
        <p className="text-[10px] uppercase tracking-wider text-gray-400 px-2 mb-1.5">
          {list.length} result{list.length === 1 ? "" : "s"}
        </p>
        {list.length === 0 ? (
          <p className="text-sm text-gray-500 px-2 py-6 text-center">No matches</p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-1">
            {list.map((item) => (
              <MenuTile
                key={item.href}
                item={item}
                active={isActive(item.href)}
                onNavigate={onClose}
              />
            ))}
          </div>
        )}
      </div>
    );
  } else if (mode === "az") {
    const list = sortNavAlpha(catalog);
    body = (
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-1">
        {list.map((item) => (
          <MenuTile
            key={item.href}
            item={item}
            active={isActive(item.href)}
            onNavigate={onClose}
          />
        ))}
      </div>
    );
  } else if (mode === "custom") {
    const ordered = applyOrder(catalog, customOrder);
    body = (
      <div className="space-y-2">
        <p className="text-[11px] text-gray-400 px-1">
          Drag the handle to reorder. Tap a row to open. Saved on this device.
        </p>
        {hydrated && (
          <Reorder.Group
            axis="y"
            values={ordered.map((i) => i.href)}
            onReorder={onReorder}
            className="flex flex-col gap-2 list-none m-0 p-0"
          >
            {ordered.map((item) => (
              <DragRow key={item.href} item={item} onNavigate={onClose} />
            ))}
          </Reorder.Group>
        )}
      </div>
    );
  } else {
    // categories
    const groups = groupNavByCategory(catalog);
    body = (
      <div className="space-y-4">
        {groups.map((g) => (
          <div key={g.id}>
            <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-white/30 px-2 mb-1.5">
              {g.title}
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-1">
              {g.items.map((item) => (
                <MenuTile
                  key={item.href}
                  item={item}
                  active={isActive(item.href)}
                  onNavigate={onClose}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const modes: { id: ViewMode; label: string; icon: typeof FolderTree }[] = [
    { id: "categories", label: "Groups", icon: FolderTree },
    { id: "az", label: "A–Z", icon: ArrowDownAZ },
    { id: "custom", label: "Custom", icon: LayoutGrid },
  ];

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed bottom-0 left-0 right-0 z-[70] bg-white dark:bg-black border-t border-black/10 dark:border-white/10 rounded-t-2xl pb-safe animate-[slideUp_0.2s_ease-out] max-h-[88dvh] overflow-y-auto sm:left-1/2 sm:right-auto sm:bottom-auto sm:top-16 sm:-translate-x-1/2 sm:w-full sm:max-w-xl sm:rounded-2xl sm:border sm:shadow-xl sm:max-h-[min(88dvh,720px)]">
        <div className="flex justify-center pt-2 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-black/15 dark:bg-white/15" />
        </div>

        <div className="sticky top-0 z-10 bg-white dark:bg-black border-b border-black/5 dark:border-white/5 px-4 pt-1 pb-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">Menu</span>
            <div className="flex items-center gap-1">
              {mode === "custom" && !searching && (
                <button
                  type="button"
                  onClick={resetCustom}
                  className="text-gray-400 p-2 min-h-[40px] min-w-[40px] flex items-center justify-center cursor-pointer"
                  title="Reset order"
                >
                  <RotateCcw size={16} />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="text-gray-400 p-2 min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search apps…"
              autoComplete="off"
              className="w-full rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 pl-9 pr-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:border-purple-400/50 focus:ring-1 focus:ring-purple-400/25"
            />
          </div>

          {!searching && (
            <div className="flex gap-1 p-0.5 rounded-xl bg-black/5 dark:bg-white/5">
              {modes.map((m) => {
                const Icon = m.icon;
                const on = mode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMode(m.id)}
                    className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition cursor-pointer ${
                      on
                        ? "bg-white dark:bg-white/15 text-purple-700 dark:text-purple-200 shadow-sm"
                        : "text-gray-500 dark:text-white/45 hover:text-gray-800 dark:hover:text-white/70"
                    }`}
                  >
                    <Icon size={14} />
                    {m.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-3 pb-10 pt-3">{body}</div>
      </div>
    </>
  );
}
