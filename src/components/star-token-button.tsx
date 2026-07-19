"use client";

import { useCallback, useEffect, useState } from "react";
import { Star, ListPlus } from "lucide-react";
import { useWallet } from "@/lib/wallet-context";
import {
  loadLists,
  toggleStar,
  isStarred,
  addToList,
  removeFromList,
  createList,
  type Watchlist,
} from "@/lib/lists";
import Link from "next/link";

type Props = {
  mint: string;
  name?: string | null;
  symbol?: string | null;
  imageUrl?: string | null;
  /** compact = icon only; default = star + label */
  size?: "sm" | "md";
  className?: string;
};

export function StarTokenButton({
  mint,
  name,
  symbol,
  imageUrl,
  size = "md",
  className = "",
}: Props) {
  const { publicKey } = useWallet();
  const [starred, setStarred] = useState(false);
  const [lists, setLists] = useState<Watchlist[]>([]);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(() => {
    setLists(loadLists(publicKey));
    setStarred(isStarred(mint, publicKey));
  }, [mint, publicKey]);

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener("sol.new.lists", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("sol.new.lists", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [refresh]);

  const onStarClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const next = toggleStar(
      {
        mint,
        name: name ?? undefined,
        symbol: symbol ?? undefined,
        imageUrl: imageUrl ?? undefined,
      },
      publicKey,
    );
    setStarred(next);
    setLists(loadLists(publicKey));
  };

  const inList = (listId: string) =>
    lists.find((l) => l.id === listId)?.items.some((it) => it.mint === mint);

  const toggleList = (listId: string) => {
    if (inList(listId)) {
      removeFromList(listId, mint, publicKey);
    } else {
      addToList(
        listId,
        {
          mint,
          name: name ?? undefined,
          symbol: symbol ?? undefined,
          imageUrl: imageUrl ?? undefined,
        },
        publicKey,
      );
    }
    refresh();
  };

  const newList = () => {
    const namePrompt = window.prompt("List name");
    if (!namePrompt?.trim()) return;
    try {
      const list = createList(namePrompt, publicKey);
      addToList(
        list.id,
        {
          mint,
          name: name ?? undefined,
          symbol: symbol ?? undefined,
          imageUrl: imageUrl ?? undefined,
        },
        publicKey,
      );
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not create list");
    }
  };

  const iconSize = size === "sm" ? 15 : 16;
  const pad = size === "sm" ? "p-1.5" : "px-2.5 py-1.5";

  return (
    <div className={`relative inline-flex items-center gap-1 ${className}`}>
      <button
        type="button"
        onClick={onStarClick}
        title={starred ? "Remove from favorites" : "Add to favorites"}
        className={`${pad} rounded-lg border transition cursor-pointer inline-flex items-center gap-1.5 text-xs font-medium ${
          starred
            ? "border-amber-400/40 bg-amber-500/15 text-amber-500 dark:text-amber-400"
            : "border-black/10 dark:border-white/10 text-gray-500 dark:text-white/40 hover:text-amber-500 hover:border-amber-400/30"
        }`}
      >
        <Star
          size={iconSize}
          className={starred ? "fill-amber-400 text-amber-400" : ""}
        />
        {size === "md" && <span>{starred ? "Starred" : "Star"}</span>}
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        title="Add to list"
        className={`${pad} rounded-lg border border-black/10 dark:border-white/10 text-gray-500 dark:text-white/40 hover:text-purple-400 hover:border-purple-400/30 transition cursor-pointer`}
      >
        <ListPlus size={iconSize} />
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-950 shadow-xl p-2 space-y-1">
            <p className="px-2 py-1 text-[10px] uppercase tracking-wider text-gray-400 dark:text-white/30">
              Lists
            </p>
            {lists.map((l) => {
              const on = inList(l.id);
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => toggleList(l.id)}
                  className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-sm text-left hover:bg-black/5 dark:hover:bg-white/5 transition cursor-pointer"
                >
                  <span className="truncate">{l.name}</span>
                  <Star
                    size={14}
                    className={
                      on
                        ? "fill-amber-400 text-amber-400 shrink-0"
                        : "text-gray-300 dark:text-white/20 shrink-0"
                    }
                  />
                </button>
              );
            })}
            <button
              type="button"
              onClick={newList}
              className="w-full text-left px-2 py-1.5 rounded-lg text-sm text-purple-500 hover:bg-purple-500/10 transition cursor-pointer"
            >
              + New list
            </button>
            <Link
              href="/lists"
              onClick={() => setOpen(false)}
              className="block px-2 py-1.5 text-xs text-gray-400 dark:text-white/40 hover:text-purple-400 transition"
            >
              Open /lists →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
