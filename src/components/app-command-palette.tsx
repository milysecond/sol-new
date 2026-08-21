"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { CommandPalette, type CommandItem } from "@/components/command-palette";
import { NAV_ITEMS } from "@/lib/nav-catalog";

/**
 * Global command palette — ⌘K / Ctrl+K, and optional external open.
 * Mobile: opened via search button in navbar.
 */
export function AppCommandPalette({
  open: openProp,
  onOpenChange,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
} = {}) {
  const router = useRouter();
  const [internal, setInternal] = useState(false);
  const open = openProp ?? internal;
  const setOpen = (v: boolean) => {
    onOpenChange?.(v);
    if (openProp === undefined) setInternal(v);
  };

  const items: CommandItem[] = useMemo(
    () =>
      NAV_ITEMS.filter((n) => n.href && !n.href.startsWith("http")).map((n) => ({
        id: n.href,
        label: n.title || n.label,
        hint: n.desc,
        group: n.category,
        keywords: `${n.label} ${n.title} ${n.desc}`,
        onSelect: () => router.push(n.href),
      })),
    [router],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  return <CommandPalette open={open} onClose={() => setOpen(false)} items={items} />;
}

/** Icon button for mobile header — opens palette */
export function CommandPaletteButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Search"
      title="Search (⌘K)"
      className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-gray-500 dark:text-white/45 hover:text-gray-900 dark:hover:text-white/75 hover:bg-black/5 dark:hover:bg-white/5 transition touch-manipulation active:scale-95"
    >
      <Search size={15} />
    </button>
  );
}
