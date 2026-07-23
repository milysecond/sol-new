"use client";

import { useState, useEffect, type ReactNode, type ImgHTMLAttributes } from "react";

type Props = {
  src?: string | null;
  alt?: string;
  /** Classes on the outer box (size, rounded, overflow). */
  className?: string;
  /** Classes on the img (usually object-cover w-full h-full). */
  imgClassName?: string;
  /** Fallback when no src or load error. */
  fallback?: ReactNode;
  /** Skeleton tone */
  tone?: "neutral" | "orange" | "purple";
} & Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt" | "className" | "onLoad" | "onError">;

const TONE: Record<NonNullable<Props["tone"]>, string> = {
  neutral: "bg-black/10 dark:bg-white/10",
  orange: "bg-orange-400/15",
  purple: "bg-purple-400/15",
};

/**
 * Image with shimmer skeleton while loading and a soft fade-in when ready.
 * Use for remote token/NFT art that may be slow or fail.
 */
export function ImageWithPlaceholder({
  src,
  alt = "",
  className = "",
  imgClassName = "w-full h-full object-cover",
  fallback,
  tone = "neutral",
  ...imgProps
}: Props) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(
    src ? "loading" : "error",
  );

  useEffect(() => {
    setStatus(src ? "loading" : "error");
  }, [src]);

  const showImg = Boolean(src) && status !== "error";
  const showSkeleton = showImg && status === "loading";
  const showFallback = !src || status === "error";

  return (
    <div className={`relative overflow-hidden ${TONE[tone]} ${className}`}>
      {showSkeleton && <div className="absolute inset-0 img-skeleton" aria-hidden />}
      {showImg && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src!}
          alt={alt}
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("error")}
          className={`${imgClassName} transition-opacity duration-300 ${
            status === "loaded" ? "opacity-100" : "opacity-0"
          }`}
          {...imgProps}
        />
      )}
      {showFallback && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-400 dark:text-white/30">
          {fallback ?? <span className="text-[10px] opacity-40">·</span>}
        </div>
      )}
    </div>
  );
}
