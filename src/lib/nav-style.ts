/**
 * App navigation chrome style.
 * - more: bottom sheet / More tray (default)
 * - sidebar: X / LinkedIn style left drawer
 */
export type NavMenuStyle = "more" | "sidebar";

export const NAV_MENU_STYLE_KEY = "sol.new.nav.menuStyle";
export const NAV_MENU_STYLE_EVENT = "sol.new.nav.menuStyle";

export function readNavMenuStyle(): NavMenuStyle {
  if (typeof window === "undefined") return "more";
  try {
    const v = localStorage.getItem(NAV_MENU_STYLE_KEY);
    return v === "sidebar" ? "sidebar" : "more";
  } catch {
    return "more";
  }
}

export function writeNavMenuStyle(style: NavMenuStyle) {
  try {
    localStorage.setItem(NAV_MENU_STYLE_KEY, style);
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(
      new CustomEvent(NAV_MENU_STYLE_EVENT, { detail: style }),
    );
  } catch {
    /* ignore */
  }
}
