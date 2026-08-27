/**
 * Bottom phone nav tabs (4 slots + Menu/More).
 * Editable in Wallet → Settings.
 */
import { NAV_BY_HREF, NAV_ITEMS } from "@/lib/nav-catalog";
import type { LucideIcon } from "lucide-react";
import {
  Coins,
  Gift,
  Image,
  MoreHorizontal,
  Wallet,
  Zap,
} from "lucide-react";

export type BottomNavSlot = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const BOTTOM_NAV_KEY = "sol.new.nav.bottomTabs";
export const BOTTOM_NAV_EVENT = "sol.new.nav.bottomTabs";

/** Default 4 primary tabs (Menu is always last). */
export const BOTTOM_NAV_DEFAULT: string[] = [
  "/home",
  "/wallet",
  "/token",
  "/memes",
];

const FALLBACK_ICONS: Record<string, LucideIcon> = {
  "/home": Zap,
  "/wallet": Wallet,
  "/token": Coins,
  "/gift": Gift,
  "/memes": Image,
};

export function readBottomNavHrefs(): string[] {
  if (typeof window === "undefined") return [...BOTTOM_NAV_DEFAULT];
  try {
    const raw = localStorage.getItem(BOTTOM_NAV_KEY);
    let hrefs = !raw ? [...BOTTOM_NAV_DEFAULT] : (() => {
      try {
        const p = JSON.parse(raw);
        if (!Array.isArray(p)) return [...BOTTOM_NAV_DEFAULT];
        return p.filter((h): h is string => typeof h === "string" && h.startsWith("/")).slice(0, 4);
      } catch { return [...BOTTOM_NAV_DEFAULT]; }
    })();

    // Ensure Memes is visible (promote after gift or append/replace last)
    if (!hrefs.includes("/memes")) {
      const g = hrefs.indexOf("/gift");
      if (g !== -1 && g < 3) {
        hrefs.splice(g + 1, 0, "/memes");
        if (hrefs.length > 4) hrefs.pop();
      } else {
        // replace the last slot with memes to make it visible
        hrefs[3] = "/memes";
      }
    }
    return hrefs.length === 4 ? hrefs : [...BOTTOM_NAV_DEFAULT];
  } catch {
    return [...BOTTOM_NAV_DEFAULT];
  }
}

export function writeBottomNavHrefs(hrefs: string[]) {
  const next = hrefs.filter(Boolean).slice(0, 4);
  while (next.length < 4) {
    const fill = BOTTOM_NAV_DEFAULT.find((d) => !next.includes(d));
    if (!fill) break;
    next.push(fill);
  }
  try {
    localStorage.setItem(BOTTOM_NAV_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(
      new CustomEvent(BOTTOM_NAV_EVENT, { detail: next }),
    );
  } catch {
    /* ignore */
  }
}

export function clearBottomNavHrefs() {
  try {
    localStorage.removeItem(BOTTOM_NAV_KEY);
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(
      new CustomEvent(BOTTOM_NAV_EVENT, { detail: [...BOTTOM_NAV_DEFAULT] }),
    );
  } catch {
    /* ignore */
  }
}

/** Resolve hrefs → labels/icons for the bar. */
export function resolveBottomNav(hrefs?: string[]): BottomNavSlot[] {
  const list = hrefs?.length === 4 ? hrefs : BOTTOM_NAV_DEFAULT;
  return list.map((href) => {
    if (href === "/home") {
      return { href: "/home", label: "Home", icon: Zap };
    }
    const item = NAV_BY_HREF.get(href);
    if (item) {
      return {
        href: item.href,
        label: item.label.length > 8 ? item.label.slice(0, 7) + "…" : item.label,
        icon: item.icon,
      };
    }
    return {
      href,
      label: href.replace(/^\//, "").slice(0, 8) || "App",
      icon: FALLBACK_ICONS[href] || MoreHorizontal,
    };
  });
}

/** Candidates for bottom bar (excludes pure aliases). */
export function bottomNavCandidates() {
  const home = {
    href: "/home",
    label: "Home",
    title: "Home",
    desc: "App grid",
  };
  const rest = NAV_ITEMS.filter((i) => i.href !== "/home").map((i) => ({
    href: i.href,
    label: i.label,
    title: i.title,
    desc: i.desc,
  }));
  return [home, ...rest];
}
