/**
 * Persist home tool tile order in localStorage.
 * One list: any icon can move to any position. First N show as large tiles.
 */

export const HOME_PIN_COUNT = 4;

export const HOME_DEFAULT_ORDER = [
  "/wallet",
  "/token",
  "/gift",
  "/punt",
  "/nft",
  "/nfts",
  "/multisig",
  "/pay",
  "/split",
  "/receipt",
  "/draw",
  "/earn",
  "/loan",
  "/stake",
  "/lst",
  "/burn",
  "/portfolio",
] as const;

const ORDER_KEY = "sol.new.home.iconOrder";
/** Legacy keys — migrated once into ORDER_KEY */
const PRIMARY_KEY = "sol.new.home.primaryOrder";
const SECONDARY_KEY = "sol.new.home.secondaryOrder";

function mergeKnown(ids: string[], defaults: readonly string[]): string[] {
  const known = new Set(defaults);
  const ordered = ids.filter((id) => known.has(id));
  for (const d of defaults) {
    if (!ordered.includes(d)) ordered.push(d);
  }
  return ordered;
}

function readJsonArray(key: string): string[] | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return null;
  }
}

export function getHomeIconOrder(): string[] {
  if (typeof window === "undefined") return [...HOME_DEFAULT_ORDER];

  const unified = readJsonArray(ORDER_KEY);
  if (unified?.length) {
    return mergeKnown(unified, HOME_DEFAULT_ORDER);
  }

  // Migrate split primary + secondary prefs
  const primary = readJsonArray(PRIMARY_KEY);
  const secondary = readJsonArray(SECONDARY_KEY);
  if (primary?.length || secondary?.length) {
    const migrated = mergeKnown(
      [...(primary || []), ...(secondary || [])],
      HOME_DEFAULT_ORDER,
    );
    setHomeIconOrder(migrated);
    return migrated;
  }

  return [...HOME_DEFAULT_ORDER];
}

export function setHomeIconOrder(order: string[]) {
  try {
    const next = mergeKnown(order, HOME_DEFAULT_ORDER);
    localStorage.setItem(ORDER_KEY, JSON.stringify(next));
    window.dispatchEvent(
      new CustomEvent("sol.new.homeOrder", { detail: { order: next } }),
    );
  } catch {
    /* ignore */
  }
}

export function resetHomeOrders() {
  try {
    localStorage.removeItem(ORDER_KEY);
    localStorage.removeItem(PRIMARY_KEY);
    localStorage.removeItem(SECONDARY_KEY);
    window.dispatchEvent(new CustomEvent("sol.new.homeOrder", { detail: { reset: true } }));
  } catch {
    /* ignore */
  }
}
