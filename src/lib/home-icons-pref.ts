/**
 * Persist home tool tile order in localStorage.
 * Defaults + merge from shared nav catalog.
 */

import { HOME_DEFAULT_ORDER as CATALOG_DEFAULT } from "@/lib/nav-catalog";

export const HOME_PIN_COUNT = 4;

export const HOME_DEFAULT_ORDER = CATALOG_DEFAULT;

const ORDER_KEY = "sol.new.home.iconOrder";
/** Legacy keys — migrated once into ORDER_KEY */
const PRIMARY_KEY = "sol.new.home.primaryOrder";
const SECONDARY_KEY = "sol.new.home.secondaryOrder";

function mergeKnown(ids: string[], defaults: readonly string[]): string[] {
  const known = new Set(defaults);
  let ordered = ids.filter((id) => known.has(id));

  // Ensure new items like /memes appear visibly (insert after related item)
  if (!ordered.includes("/memes")) {
    const giftIdx = ordered.indexOf("/gift");
    if (giftIdx !== -1) {
      ordered.splice(giftIdx + 1, 0, "/memes");
    } else {
      // append at end if no gift
      const insertIdx = ordered.findIndex(h => h === "/poap" || h === "/punt" || h === "/draw");
      if (insertIdx !== -1) {
        ordered.splice(insertIdx, 0, "/memes");
      } else {
        ordered.push("/memes");
      }
    }
  }

  // still append any other missing defaults
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
