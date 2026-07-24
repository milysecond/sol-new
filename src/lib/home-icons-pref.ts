/**
 * Persist home tool tile order (primary + secondary) in localStorage.
 */

export const PRIMARY_DEFAULT = ["/wallet", "/token", "/gift", "/punt"] as const;

export const SECONDARY_DEFAULT = [
  "/nft",
  "/nfts",
  "/multisig",
  "/pay",
  "/split",
  "/receipt",
  "/draw",
  "/earn",
  "/stake",
  "/lst",
  "/burn",
  "/portfolio",
] as const;

const PRIMARY_KEY = "sol.new.home.primaryOrder";
const SECONDARY_KEY = "sol.new.home.secondaryOrder";

function loadOrder(key: string, defaults: readonly string[]): string[] {
  if (typeof window === "undefined") return [...defaults];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [...defaults];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...defaults];
    const ids = parsed.filter((x): x is string => typeof x === "string");
    // Keep known ids in saved order, append any new defaults at the end
    const known = new Set(defaults);
    const ordered = ids.filter((id) => known.has(id));
    for (const d of defaults) {
      if (!ordered.includes(d)) ordered.push(d);
    }
    return ordered;
  } catch {
    return [...defaults];
  }
}

function saveOrder(key: string, order: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(order));
    window.dispatchEvent(new CustomEvent("sol.new.homeOrder", { detail: { key, order } }));
  } catch {
    /* ignore */
  }
}

export function getPrimaryOrder(): string[] {
  return loadOrder(PRIMARY_KEY, PRIMARY_DEFAULT);
}

export function getSecondaryOrder(): string[] {
  return loadOrder(SECONDARY_KEY, SECONDARY_DEFAULT);
}

export function setPrimaryOrder(order: string[]) {
  saveOrder(PRIMARY_KEY, order);
}

export function setSecondaryOrder(order: string[]) {
  saveOrder(SECONDARY_KEY, order);
}

export function resetHomeOrders() {
  try {
    localStorage.removeItem(PRIMARY_KEY);
    localStorage.removeItem(SECONDARY_KEY);
    window.dispatchEvent(new CustomEvent("sol.new.homeOrder", { detail: { reset: true } }));
  } catch {
    /* ignore */
  }
}
