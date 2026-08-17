/**
 * App navigation chrome style.
 * - sidebar: X / LinkedIn style left drawer (**default**)
 * - more: bottom sheet / More tray
 */
export type NavMenuStyle = "more" | "sidebar";

export const NAV_MENU_STYLE_KEY = "sol.new.nav.menuStyle";
export const NAV_MENU_STYLE_EVENT = "sol.new.nav.menuStyle";

export function readNavMenuStyle(): NavMenuStyle {
  if (typeof window === "undefined") return "sidebar";
  try {
    const v = localStorage.getItem(NAV_MENU_STYLE_KEY);
    // unset → left menu default; only "more" opts into tray
    if (v === "more") return "more";
    return "sidebar";
  } catch {
    return "sidebar";
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
