"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { copyAddress } from "@/lib/copy-text";

/** Tap (especially on mobile) copies the address and shows a lasting toast. */
export function CopyableAddress({
  address,
  display,
  className = "",
  onCopied,
}: {
  address: string;
  display?: string;
  className?: string;
  onCopied?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const onClick = async () => {
    const ok = await copyAddress(address);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
    onCopied?.();
  };

  return (
    <button
      type="button"
      onClick={() => void onClick()}
      className={`text-left font-mono break-all select-none touch-manipulation cursor-pointer ${className}`}
      title="Copy address"
      aria-label={copied ? "Address copied" : "Copy address"}
    >
      {display ?? address}
      {copied ? (
        <span className="ml-1.5 inline-flex items-center gap-0.5 align-middle font-sans font-medium text-emerald-500">
          <Check size={12} aria-hidden />
          Copied
        </span>
      ) : null}
    </button>
  );
}
