"use client";

import { useCallback, useEffect, useState } from "react";

export const HIDE_BALANCES_KEY = "sol.new.privacy.hideBalances";
export const HIDE_BALANCES_EVENT = "sol.new.privacy";

export function getHideBalances(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(HIDE_BALANCES_KEY) === "1";
  } catch {
    return false;
  }
}

export function setHideBalances(hide: boolean) {
  try {
    localStorage.setItem(HIDE_BALANCES_KEY, hide ? "1" : "0");
    window.dispatchEvent(new Event(HIDE_BALANCES_EVENT));
  } catch {
    /* ignore */
  }
}

/** Live toggle — all balance UIs should use this. */
export function useHideBalances(): [boolean, (v: boolean) => void] {
  const [hide, setHide] = useState(false);

  useEffect(() => {
    setHide(getHideBalances());
    const sync = () => setHide(getHideBalances());
    window.addEventListener(HIDE_BALANCES_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(HIDE_BALANCES_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const update = useCallback((v: boolean) => {
    setHide(v);
    setHideBalances(v);
  }, []);

  return [hide, update];
}

/** Mask a formatted balance string when privacy is on. */
export function maskAmount(
  hide: boolean,
  value: string | number | null | undefined,
  opts?: { placeholder?: string; suffix?: string },
): string {
  const ph = opts?.placeholder ?? "••••";
  if (hide) return opts?.suffix ? `${ph} ${opts.suffix}` : ph;
  if (value === null || value === undefined || value === "") return "—";
  return typeof value === "number" ? String(value) : value;
}

/** Format SOL with privacy. */
export function formatSol(
  hide: boolean,
  sol: number | null | undefined,
  digits = 4,
): string {
  if (hide) return "•••• SOL";
  if (sol === null || sol === undefined || Number.isNaN(sol)) return "—";
  return `${sol.toFixed(digits)} SOL`;
}

/** Format USDC / fiat-ish with privacy. */
export function formatUsd(
  hide: boolean,
  usd: number | null | undefined,
  digits = 2,
  prefix = "$",
): string {
  if (hide) return `${prefix}••••`;
  if (usd === null || usd === undefined || Number.isNaN(usd)) return "—";
  return `${prefix}${usd.toFixed(digits)}`;
}

/** Generic number → fixed decimals or bullets. */
export function formatQty(
  hide: boolean,
  n: number | null | undefined,
  digits = 4,
): string {
  if (hide) return "••••";
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toFixed(digits);
}
