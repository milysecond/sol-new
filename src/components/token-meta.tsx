"use client";

import { formatTokenUi, formatUsd, formatUsdPrice, type WalletToken } from "@/lib/wallet-tokens";
import { useHideBalances } from "@/lib/privacy";
import type { ReactNode } from "react";

/** Compact token chip: icon + symbol/name + bal + USD */
export function TokenMetaRow({
  token,
  amountUi,
  right,
  dense,
}: {
  token: WalletToken;
  amountUi?: number;
  right?: ReactNode;
  dense?: boolean;
}) {
  const [hide] = useHideBalances();
  const amt = amountUi != null ? amountUi : token.uiAmount;
  const lineUsd =
    token.priceUsd != null && Number.isFinite(amt)
      ? amt * token.priceUsd
      : amountUi == null
        ? token.valueUsd
        : null;

  return (
    <div className={`flex items-center gap-3 min-w-0 ${dense ? "" : ""}`}>
      <TokenIcon token={token} size={dense ? 32 : 36} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5 min-w-0">
          <p className="font-semibold text-sm truncate">{token.symbol}</p>
          {!hide && token.priceUsd != null && (
            <span className="text-[11px] text-gray-400 tabular-nums shrink-0">
              {formatUsdPrice(token.priceUsd)}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 dark:text-white/45 truncate">{token.name}</p>
        <p className="text-[11px] text-gray-400 dark:text-white/35 tabular-nums mt-0.5">
          {hide
            ? `•••• ${token.symbol}`
            : `${formatTokenUi(token.uiAmount, token.decimals)} ${token.symbol}`}
          {!hide && token.valueUsd != null && (
            <span className="text-gray-500 dark:text-white/40">
              {" · "}
              {formatUsd(token.valueUsd, { compact: true })}
            </span>
          )}
        </p>
        {!hide && amountUi != null && lineUsd != null && (
          <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">
            ≈ {formatUsd(lineUsd)}
          </p>
        )}
      </div>
      {right}
    </div>
  );
}

export function TokenIcon({
  token,
  size = 36,
}: {
  token: Pick<WalletToken, "icon" | "symbol">;
  size?: number;
}) {
  if (token.icon) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={token.icon}
        alt=""
        width={size}
        height={size}
        className="rounded-full bg-black/5 dark:bg-white/10 object-cover shrink-0"
        style={{ width: size, height: size }}
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
          const sib = (e.target as HTMLImageElement).nextElementSibling as HTMLElement | null;
          if (sib) sib.style.display = "flex";
        }}
      />
    );
  }
  return (
    <span
      className="rounded-full bg-purple-500/15 text-purple-600 dark:text-purple-300 flex items-center justify-center text-xs font-bold shrink-0"
      style={{ width: size, height: size }}
    >
      {(token.symbol || "?").slice(0, 2)}
    </span>
  );
}

/** Live USD under amount field */
export function AmountUsdHint({
  amount,
  priceUsd,
}: {
  amount: string;
  priceUsd?: number | null;
}) {
  const [hide] = useHideBalances();
  if (hide) return null;
  const n = parseFloat(amount);
  if (!amount || !Number.isFinite(n) || n <= 0 || priceUsd == null) {
    return priceUsd != null ? (
      <p className="text-[11px] text-gray-400 mt-1">
        1 token ≈ {formatUsdPrice(priceUsd)}
      </p>
    ) : null;
  }
  return (
    <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium tabular-nums mt-1">
      ≈ {formatUsd(n * priceUsd)}
      <span className="text-gray-400 font-normal">
        {" "}
        · {formatUsdPrice(priceUsd)} / token
      </span>
    </p>
  );
}
