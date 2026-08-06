/**
 * UI sound effects — muted when user prefers reduced motion / saved mute.
 */
export type SfxKind = "success" | "error" | "notify" | "tap" | "money";

const SRC: Record<SfxKind, string> = {
  success: "/sfx-notify.mp3",
  notify: "/sfx-notify.mp3",
  error: "/sfx-error.mp3",
  tap: "/sfx-tap.mp3",
  money: "/chaching.mp3",
};

const MUTE_KEY = "sol.new.sfx.mute";

let unlocked = false;

export function isSfxMuted(): boolean {
  if (typeof window === "undefined") return true;
  try {
    if (localStorage.getItem(MUTE_KEY) === "1") return true;
  } catch {
    /* ignore */
  }
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return true;
  return false;
}

export function setSfxMuted(muted: boolean) {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/** Call once from a user gesture so later toasts can play. */
export function unlockSfx() {
  unlocked = true;
}

export function playSfx(kind: SfxKind = "notify") {
  if (typeof window === "undefined") return;
  if (isSfxMuted()) return;
  try {
    const a = new Audio(SRC[kind] || SRC.notify);
    a.volume = kind === "money" ? 0.55 : 0.4;
    void a.play().then(() => {
      unlocked = true;
    }).catch(() => {
      /* autoplay blocked until gesture — ignore */
    });
  } catch {
    /* ignore */
  }
}

// Unlock audio on first pointer/key (common pattern)
if (typeof window !== "undefined") {
  const once = () => {
    unlockSfx();
    window.removeEventListener("pointerdown", once);
    window.removeEventListener("keydown", once);
  };
  window.addEventListener("pointerdown", once, { passive: true });
  window.addEventListener("keydown", once);
}
