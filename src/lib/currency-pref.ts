"use client";

import { useCallback, useEffect, useState } from "react";

export type DefaultToken = "SOL" | "USDC";

const KEY = "sol.new.defaultToken";

export function getDefaultToken(): DefaultToken {
  if (typeof window === "undefined") return "SOL";
  try {
    const v = localStorage.getItem(KEY);
    return v === "USDC" ? "USDC" : "SOL";
  } catch {
    return "SOL";
  }
}

export function setDefaultToken(token: DefaultToken) {
  try {
    localStorage.setItem(KEY, token);
    window.dispatchEvent(new CustomEvent("sol.new.defaultToken", { detail: token }));
  } catch {
    /* ignore */
  }
}

/** React hook for default send/gift/pay currency (SOL or USDC). */
export function useDefaultToken(): [DefaultToken, (t: DefaultToken) => void] {
  const [token, setToken] = useState<DefaultToken>("SOL");

  useEffect(() => {
    setToken(getDefaultToken());
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setToken(e.newValue === "USDC" ? "USDC" : "SOL");
    };
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail === "USDC" || detail === "SOL") setToken(detail);
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("sol.new.defaultToken", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("sol.new.defaultToken", onCustom);
    };
  }, []);

  const update = useCallback((t: DefaultToken) => {
    setToken(t);
    setDefaultToken(t);
  }, []);

  return [token, update];
}
