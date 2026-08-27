"use client";

import { useEffect } from "react";
import { playSfx, type SfxKind } from "@/lib/sfx";

/**
 * Listens for service-worker push cues → play SFX when app is open.
 */
export function SfxBridge() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === "solnew-sfx") {
        playSfx((e.data.kind as SfxKind) || "notify");
      }
    };
    navigator.serviceWorker.addEventListener("message", onMsg);
    return () => navigator.serviceWorker.removeEventListener("message", onMsg);
  }, []);
  return null;
}
