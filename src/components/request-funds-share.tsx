"use client";

import { useMemo, useState } from "react";
import { Check, MessageCircle, Share2 } from "lucide-react";
import {
  requestFundsChannelLinks,
  requestFundsSharePayload,
  shareOrCopy,
} from "@/lib/share-copy";
import { analytics } from "@/lib/analytics";
import { toast } from "@/lib/toast";

type Props = {
  publicKey: string;
  /** compact = icon row under receive; full = with heading */
  variant?: "full" | "compact";
  className?: string;
};

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.727-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
    </svg>
  );
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 6.01L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.07-.279.14-.465-.04-.656-.18-.19-.435-.155-.62-.09-1.49.69-4.198 2.612-5.573 3.51-.45.3-.86.45-1.23.44-.405-.01-1.185-.23-1.765-.42-.71-.23-1.275-.35-1.225-.74.025-.2.375-.405 1.03-.615 4.03-1.75 6.72-2.905 8.07-3.465 3.85-1.585 4.65-1.86 5.17-1.87z" />
    </svg>
  );
}

/**
 * Open an external share URL while preserving the user gesture on mobile.
 * Prefer same-tab navigation when popup is blocked.
 */
function openShareUrl(url: string) {
  try {
    const w = window.open(url, "_blank", "noopener,noreferrer");
    if (w) return;
  } catch {
    /* fall through */
  }
  // Popup blocked / in-app browser — same tab
  window.location.assign(url);
}

/**
 * Ask friends for SOL/USDC via SMS, WhatsApp, Telegram, X, or system share.
 */
export function RequestFundsShare({ publicKey, variant = "full", className = "" }: Props) {
  const [copied, setCopied] = useState(false);
  const [amountHint, setAmountHint] = useState("");

  const payload = useMemo(
    () =>
      requestFundsSharePayload({
        publicKey,
        amountHint: amountHint.trim() || null,
      }),
    [publicKey, amountHint],
  );
  const links = useMemo(() => requestFundsChannelLinks(payload), [payload]);

  const track = (channel: string) => {
    try {
      analytics.shareClicked?.(channel, payload.url);
    } catch {
      /* ignore */
    }
  };

  const onNative = async () => {
    track("native");
    try {
      const r = await shareOrCopy(payload);
      if (r === "copied") {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      /* user cancel */
    }
  };

  /** X: open compose with prefilled ask (reliable). Copy as backup for DM paste. */
  const onX = () => {
    track("x");
    // Open FIRST (sync from click) so mobile doesn't drop the gesture
    openShareUrl(links.xPost);
    void navigator.clipboard
      ?.writeText(links.nativeText)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
        try {
          toast.success("Message copied — paste into an X DM if you prefer");
        } catch {
          /* toast optional */
        }
      })
      .catch(() => {
        /* clipboard may require permission; compose still has text */
      });
  };

  const btn =
    "flex flex-col items-center justify-center gap-1 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.04] hover:bg-violet-500/10 hover:border-violet-500/30 px-2 py-2.5 transition text-[10px] font-medium text-gray-600 dark:text-white/70 min-h-[64px]";

  const row = (
    <div className={`grid grid-cols-5 gap-2 ${className}`}>
      <a
        href={links.sms}
        onClick={() => track("sms")}
        className={btn}
        aria-label="Request via SMS"
      >
        <MessageCircle className="w-5 h-5 text-emerald-500" />
        SMS
      </a>
      <a
        href={links.whatsapp}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => track("whatsapp")}
        className={btn}
        aria-label="Request via WhatsApp"
      >
        <WhatsAppIcon className="w-5 h-5 text-[#25D366]" />
        WhatsApp
      </a>
      <a
        href={links.telegram}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => track("telegram")}
        className={btn}
        aria-label="Request via Telegram"
      >
        <TelegramIcon className="w-5 h-5 text-[#2AABEE]" />
        Telegram
      </a>
      <button
        type="button"
        onClick={onX}
        className={btn}
        aria-label="Share request on X"
      >
        <XIcon className="w-5 h-5" />
        X
      </button>
      <button
        type="button"
        onClick={() => void onNative()}
        className={btn}
        aria-label="Share"
      >
        {copied ? (
          <Check className="w-5 h-5 text-green-500" />
        ) : (
          <Share2 className="w-5 h-5 text-violet-500" />
        )}
        {copied ? "Copied" : "More"}
      </button>
    </div>
  );

  if (variant === "compact") return row;

  return (
    <div className="rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Ask for funds</p>
          <p className="text-[11px] text-gray-500 dark:text-white/45">
            SMS · WhatsApp · Telegram · X — your address + pay link
          </p>
        </div>
      </div>
      <label className="block space-y-1">
        <span className="text-[10px] uppercase tracking-wide text-gray-400">
          Amount (optional)
        </span>
        <input
          value={amountHint}
          onChange={(e) => setAmountHint(e.target.value)}
          placeholder="e.g. 0.5 SOL or $20"
          maxLength={40}
          className="w-full rounded-lg border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-3 py-2 text-sm"
        />
      </label>
      {row}
      <p className="text-[10px] text-gray-400 text-center">
        X opens a prefilled post (and copies the message so you can paste into a DM)
      </p>
    </div>
  );
}
