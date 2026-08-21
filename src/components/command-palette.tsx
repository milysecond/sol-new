"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, CornerDownLeft } from "lucide-react";

export type CommandItem = {
  id: string;
  label: string;
  hint?: string;
  group?: string;
  keywords?: string;
  onSelect: () => void;
};

type Props = {
  open: boolean;
  onClose: () => void;
  items: CommandItem[];
  placeholder?: string;
};

/**
 * Mobile-first command palette — full-width bottom sheet on phone.
 */
export function CommandPalette({
  open,
  onClose,
  items,
  placeholder = "Jump to…",
}: Props) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((it) => {
      const hay = `${it.label} ${it.hint || ""} ${it.keywords || ""} ${it.group || ""}`.toLowerCase();
      return hay.includes(s);
    });
  }, [items, q]);

  useEffect(() => {
    if (!open) {
      setQ("");
      setActive(0);
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [q]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const it = filtered[active];
        if (it) {
          it.onSelect();
          onClose();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, filtered, active, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className="fixed z-[210] inset-x-0 bottom-0 sm:inset-auto sm:left-1/2 sm:top-[10%] sm:-translate-x-1/2 sm:w-[min(100%-1.25rem,28rem)]">
        <div className="rounded-t-2xl sm:rounded-2xl border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-950 shadow-2xl overflow-hidden pb-[env(safe-area-inset-bottom)] max-h-[min(85dvh,40rem)] flex flex-col">
          <div className="sm:hidden flex justify-center pt-2.5" aria-hidden>
            <span className="w-10 h-1 rounded-full bg-black/15 dark:bg-white/20" />
          </div>
          <div className="flex items-center gap-2 px-3 border-b border-black/5 dark:border-white/5 shrink-0">
            <Search size={16} className="text-gray-400 shrink-0" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={placeholder}
              enterKeyHint="go"
              autoCapitalize="off"
              autoCorrect="off"
              className="flex-1 min-w-0 bg-transparent py-3.5 text-base sm:text-sm text-gray-900 dark:text-white placeholder:text-gray-400 outline-none"
            />
            <button
              type="button"
              onClick={onClose}
              className="sm:hidden text-xs font-semibold text-purple-500 px-2 py-2 touch-manipulation"
            >
              Close
            </button>
            <kbd className="hidden sm:inline text-[10px] font-mono text-gray-400 border border-black/10 dark:border-white/10 rounded px-1.5 py-0.5">
              esc
            </kbd>
          </div>
          <ul className="overflow-y-auto overscroll-contain py-1 flex-1">
            {filtered.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-gray-400">No matches</li>
            )}
            {filtered.map((it, i) => (
              <li key={it.id}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => {
                    it.onSelect();
                    onClose();
                  }}
                  className={`w-full flex items-center justify-between gap-3 px-3.5 min-h-[52px] sm:min-h-[44px] py-2.5 text-left transition touch-manipulation active:bg-purple-500/10 ${
                    i === active
                      ? "bg-purple-500/15 text-purple-800 dark:text-purple-200"
                      : "text-gray-800 dark:text-white/80"
                  }`}
                >
                  <div className="min-w-0">
                    {it.group && (
                      <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">
                        {it.group}
                      </p>
                    )}
                    <p className="text-sm font-medium truncate">{it.label}</p>
                    {it.hint && (
                      <p className="text-[11px] text-gray-500 dark:text-white/40 truncate">
                        {it.hint}
                      </p>
                    )}
                  </div>
                  {i === active && (
                    <CornerDownLeft size={14} className="shrink-0 opacity-60 hidden sm:block" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
