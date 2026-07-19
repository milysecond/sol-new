/**
 * Client-side watchlists — multi-list, wallet-scoped (or guest).
 * Zero Face-ID friction for starring; data lives in localStorage.
 */

export type ListItem = {
  mint: string;
  symbol?: string;
  name?: string;
  imageUrl?: string;
  addedAt: string;
};

export type Watchlist = {
  id: string;
  name: string;
  items: ListItem[];
  createdAt: string;
  updatedAt: string;
};

export type SortKey = "mc" | "change" | "added" | "name";
export type SortDir = "desc" | "asc";

const PREFIX = "sol.new.lists.";
const MAX_LISTS = 20;
const MAX_ITEMS = 100;

function storageKey(wallet: string | null | undefined): string {
  return `${PREFIX}${wallet?.trim() || "guest"}`;
}

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `wl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function defaultList(): Watchlist {
  const now = new Date().toISOString();
  return {
    id: "favorites",
    name: "Favorites",
    items: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function loadLists(wallet?: string | null): Watchlist[] {
  if (typeof window === "undefined") return [defaultList()];
  try {
    const raw = localStorage.getItem(storageKey(wallet));
    if (!raw) return [defaultList()];
    const parsed = JSON.parse(raw) as Watchlist[];
    if (!Array.isArray(parsed) || parsed.length === 0) return [defaultList()];
    return parsed.map((l) => ({
      ...l,
      items: Array.isArray(l.items) ? l.items : [],
    }));
  } catch {
    return [defaultList()];
  }
}

export function saveLists(lists: Watchlist[], wallet?: string | null): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(storageKey(wallet), JSON.stringify(lists));
  window.dispatchEvent(new CustomEvent("sol.new.lists", { detail: { wallet: wallet ?? null } }));
}

export function getList(listId: string, wallet?: string | null): Watchlist | null {
  return loadLists(wallet).find((l) => l.id === listId) ?? null;
}

export function createList(name: string, wallet?: string | null): Watchlist {
  const lists = loadLists(wallet);
  if (lists.length >= MAX_LISTS) throw new Error(`Max ${MAX_LISTS} lists`);
  const trimmed = name.trim().slice(0, 40) || "New list";
  const now = new Date().toISOString();
  const list: Watchlist = {
    id: uid(),
    name: trimmed,
    items: [],
    createdAt: now,
    updatedAt: now,
  };
  saveLists([...lists, list], wallet);
  return list;
}

export function renameList(listId: string, name: string, wallet?: string | null): Watchlist | null {
  const lists = loadLists(wallet);
  const i = lists.findIndex((l) => l.id === listId);
  if (i < 0) return null;
  const trimmed = name.trim().slice(0, 40);
  if (!trimmed) return lists[i];
  lists[i] = { ...lists[i], name: trimmed, updatedAt: new Date().toISOString() };
  saveLists(lists, wallet);
  return lists[i];
}

export function deleteList(listId: string, wallet?: string | null): Watchlist[] {
  let lists = loadLists(wallet).filter((l) => l.id !== listId);
  if (lists.length === 0) lists = [defaultList()];
  saveLists(lists, wallet);
  return lists;
}

export function isStarred(mint: string, wallet?: string | null, listId?: string): boolean {
  const lists = loadLists(wallet);
  if (listId) {
    const list = lists.find((l) => l.id === listId);
    return !!list?.items.some((it) => it.mint === mint);
  }
  return lists.some((l) => l.items.some((it) => it.mint === mint));
}

export function listsContaining(mint: string, wallet?: string | null): string[] {
  return loadLists(wallet)
    .filter((l) => l.items.some((it) => it.mint === mint))
    .map((l) => l.id);
}

export function addToList(
  listId: string,
  item: Omit<ListItem, "addedAt"> & { addedAt?: string },
  wallet?: string | null,
): Watchlist | null {
  const lists = loadLists(wallet);
  const i = lists.findIndex((l) => l.id === listId);
  if (i < 0) return null;
  const list = lists[i];
  if (list.items.some((it) => it.mint === item.mint)) return list;
  if (list.items.length >= MAX_ITEMS) throw new Error(`Max ${MAX_ITEMS} tokens per list`);
  const next: ListItem = {
    mint: item.mint,
    symbol: item.symbol,
    name: item.name,
    imageUrl: item.imageUrl,
    addedAt: item.addedAt ?? new Date().toISOString(),
  };
  lists[i] = {
    ...list,
    items: [next, ...list.items],
    updatedAt: new Date().toISOString(),
  };
  saveLists(lists, wallet);
  return lists[i];
}

export function removeFromList(listId: string, mint: string, wallet?: string | null): Watchlist | null {
  const lists = loadLists(wallet);
  const i = lists.findIndex((l) => l.id === listId);
  if (i < 0) return null;
  lists[i] = {
    ...lists[i],
    items: lists[i].items.filter((it) => it.mint !== mint),
    updatedAt: new Date().toISOString(),
  };
  saveLists(lists, wallet);
  return lists[i];
}

/** Toggle on default Favorites list (or first list). Returns starred state after toggle. */
export function toggleStar(
  item: Omit<ListItem, "addedAt">,
  wallet?: string | null,
  listId?: string,
): boolean {
  const lists = loadLists(wallet);
  const targetId = listId ?? lists[0]?.id ?? "favorites";
  let target = lists.find((l) => l.id === targetId);
  if (!target) {
    const fav = defaultList();
    saveLists([fav], wallet);
    target = fav;
  }
  const starred = target.items.some((it) => it.mint === item.mint);
  if (starred) {
    removeFromList(target.id, item.mint, wallet);
    return false;
  }
  addToList(target.id, item, wallet);
  return true;
}

export type TokenQuote = {
  mint: string;
  priceUsd: number | null;
  marketCapUsd: number | null;
  change24h: number | null;
  volume24h: number | null;
  liquidityUsd: number | null;
  imageUrl?: string | null;
  name?: string | null;
  symbol?: string | null;
  riskScore?: number | null;
  riskLevel?: "good" | "warn" | "danger" | "unknown";
  rugged?: boolean;
  risks?: { name: string; level: string; description?: string }[];
  lpLockedPct?: number | null;
  sources?: { jupiter?: boolean; rugcheck?: boolean };
  error?: string | null;
};

export function sortItems(
  items: ListItem[],
  quotes: Record<string, TokenQuote>,
  sort: SortKey,
  dir: SortDir,
): ListItem[] {
  const mul = dir === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    const qa = quotes[a.mint];
    const qb = quotes[b.mint];
    let cmp = 0;
    switch (sort) {
      case "mc":
        cmp = (qa?.marketCapUsd ?? -1) - (qb?.marketCapUsd ?? -1);
        break;
      case "change":
        cmp = (qa?.change24h ?? -Infinity) - (qb?.change24h ?? -Infinity);
        break;
      case "name": {
        const na = (a.symbol || a.name || a.mint).toLowerCase();
        const nb = (b.symbol || b.name || b.mint).toLowerCase();
        cmp = na.localeCompare(nb);
        break;
      }
      case "added":
      default:
        cmp = (a.addedAt || "").localeCompare(b.addedAt || "");
        break;
    }
    return cmp * mul;
  });
}
