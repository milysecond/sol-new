"use client";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
const isNative = () =>
  typeof window !== "undefined" &&
  ((window as unknown as Record<string, unknown>).__SOLNEW_NATIVE__ === true ||
    !!localStorage.getItem("solnew_native"));

// ─── Permission state ───────────────────────────────────────────────────────

export type PushPermission = "default" | "granted" | "denied" | "unsupported";

export function getPushPermission(): PushPermission {
  if (typeof window === "undefined") return "unsupported";
  if (isNative()) return (window as unknown as Record<string, unknown>).__SOLNEW_PUSH_GRANTED__ ? "granted" : "default";
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return "unsupported";
  return Notification.permission as PushPermission;
}

// ─── Subscribe ─────────────────────────────────────────────────────────────

export async function subscribePush(wallet?: string): Promise<boolean> {
  if (typeof window === "undefined") return false;

  // iOS native app: ask Swift to register for APNs via JS bridge
  if (isNative()) {
    return new Promise((resolve) => {
      const handler = (e: MessageEvent) => {
        if (e.data?.type === "apns-token") {
          window.removeEventListener("message", handler);
          registerApnsToken(e.data.token, wallet).then(resolve);
        } else if (e.data?.type === "apns-denied") {
          window.removeEventListener("message", handler);
          resolve(false);
        }
      };
      window.addEventListener("message", handler);
      // Signal the native wrapper to request notification permission
      try {
        (window as unknown as { webkit?: { messageHandlers?: { notifications?: { postMessage: (m: unknown) => void } } } })
          .webkit?.messageHandlers?.notifications?.postMessage({ action: "requestPermission", wallet });
      } catch {
        resolve(false);
      }
      // Timeout if native doesn't respond
      setTimeout(() => { window.removeEventListener("message", handler); resolve(false); }, 10_000);
    });
  }

  // Web Push
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    const sub = existing ?? await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC).buffer as ArrayBuffer,
    });

    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "web", subscription: sub.toJSON(), wallet }),
    });
    return true;
  } catch {
    return false;
  }
}

async function registerApnsToken(token: string, wallet?: string) {
  try {
    localStorage.setItem("solnew_apns_token", token);
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "apns", token, wallet }),
    });
    return true;
  } catch {
    return false;
  }
}

// ─── Unsubscribe ────────────────────────────────────────────────────────────

export async function unsubscribePush(): Promise<void> {
  if (typeof window === "undefined") return;
  if (isNative()) return;
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await fetch("/api/push/subscribe", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  });
  await sub.unsubscribe();
}

// ─── Heartbeat — pings the server so the re-engagement cron knows you were here today
export async function touchPushSubscription(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    if (isNative()) {
      const token = localStorage.getItem("solnew_apns_token");
      if (token) {
        await fetch("/api/push/touch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: token }),
        });
      }
      return;
    }
    if (!("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    await fetch("/api/push/touch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
  } catch {
    // silent — heartbeat is best-effort
  }
}

// ─── Local notification (no server needed) ─────────────────────────────────
// Used for tx-confirmed while the user is in the app (background tab / locked screen)

export async function showLocalNotification(title: string, body: string, url = "/") {
  if (typeof window === "undefined") return;
  if (getPushPermission() !== "granted") return;
  if (!("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, {
      body,
      icon: "/icon-192.png",
      badge: "/icon-32.png",
      tag: "tx-confirmed",
      data: { url },
    });
  } catch {
    // sw not ready yet — silent fail
  }
}

// ─── Util ───────────────────────────────────────────────────────────────────

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
