/**
 * Copy to the clipboard and tell the user with a toast that stays
 * after any menu or sheet closes.
 */
import { toast } from "@/lib/toast";

const TOAST_MS = 4000;

async function writeClipboard(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      /* fall through to execCommand for older WebKit */
    }
  }
  if (typeof document === "undefined") throw new Error("copy unavailable");
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.top = "0";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(ta);
  if (!ok) throw new Error("copy failed");
}

export async function copyText(
  text: string,
  message = "Copied",
): Promise<boolean> {
  try {
    await writeClipboard(text);
    try {
      navigator.vibrate?.(10);
    } catch {
      /* ignore */
    }
    toast.success(message, { duration: TOAST_MS });
    return true;
  } catch {
    toast.error("Couldn’t copy — try again");
    return false;
  }
}

export async function copyAddress(address: string): Promise<boolean> {
  return copyText(address, "Address copied");
}
