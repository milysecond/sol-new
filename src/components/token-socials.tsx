"use client";

import { useMemo, useState } from "react";

export const SOCIAL_DEFAULTS = {
  website: "https://",
  twitter: "https://x.com/",
  telegram: "https://t.me/",
  instagram: "https://instagram.com/",
  github: "https://github.com/",
  youtube: "https://youtube.com/",
  tiktok: "https://tiktok.com/@",
} as const;

export type SocialKey = keyof typeof SOCIAL_DEFAULTS;
export type TokenSocialValues = Record<SocialKey, string>;

const KEYS: { key: SocialKey; label: string; placeholder: string; icon: React.ReactNode }[] = [
  {
    key: "website",
    label: "Website",
    placeholder: "Website URL",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
        <path d="M2 12h20" />
      </svg>
    ),
  },
  {
    key: "twitter",
    label: "X",
    placeholder: "X handle",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    key: "telegram",
    label: "Telegram",
    placeholder: "Telegram link",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
      </svg>
    ),
  },
  {
    key: "instagram",
    label: "Instagram",
    placeholder: "Instagram handle",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
      </svg>
    ),
  },
  {
    key: "github",
    label: "GitHub",
    placeholder: "GitHub URL",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
      </svg>
    ),
  },
  {
    key: "youtube",
    label: "YouTube",
    placeholder: "YouTube URL",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    ),
  },
  {
    key: "tiktok",
    label: "TikTok",
    placeholder: "TikTok handle",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
      </svg>
    ),
  },
];

const ACCENT: Record<string, string> = {
  orange: "bg-orange-500/20 border-orange-400/50 text-orange-400",
  purple: "bg-purple-500/20 border-purple-400/50 text-purple-400",
  lime: "bg-lime-500/20 border-lime-400/50 text-lime-400",
  indigo: "bg-indigo-500/20 border-indigo-400/50 text-indigo-400",
  emerald: "bg-emerald-500/20 border-emerald-400/50 text-emerald-400",
  blue: "bg-blue-500/20 border-blue-400/50 text-blue-400",
};

export function useTokenSocials(allowed?: SocialKey[]) {
  const keys = allowed ?? (Object.keys(SOCIAL_DEFAULTS) as SocialKey[]);
  const [active, setActive] = useState<Set<SocialKey>>(new Set());
  const [values, setValues] = useState<TokenSocialValues>({ ...SOCIAL_DEFAULTS });
  const filled = useMemo(() => {
    const out: Record<string, string> = {};
    for (const k of keys) {
      const v = values[k]?.trim();
      if (v && v !== SOCIAL_DEFAULTS[k]) out[k] = v;
    }
    return out;
  }, [values, keys]);
  return { active, setActive, values, setValues, filled, keys };
}

export function TokenSocials({
  socials,
  accent = "orange",
  disabled,
}: {
  socials: ReturnType<typeof useTokenSocials>;
  accent?: keyof typeof ACCENT | string;
  disabled?: boolean;
}) {
  const on = ACCENT[accent] || ACCENT.orange;
  const { active, setActive, values, setValues, keys } = socials;
  const shown = KEYS.filter((k) => keys.includes(k.key));
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-400 dark:text-white/30">Add links:</span>
        {shown.map(({ key, label, icon }) => (
          <button
            key={key}
            type="button"
            disabled={disabled}
            title={label}
            onClick={() => {
              const next = new Set(active);
              if (next.has(key)) next.delete(key);
              else next.add(key);
              setActive(next);
            }}
            className={`p-2 rounded-lg border transition cursor-pointer disabled:opacity-40 ${
              active.has(key)
                ? on
                : "bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-gray-400 dark:text-white/40 hover:text-gray-600 dark:hover:text-white/60"
            }`}
          >
            {icon}
          </button>
        ))}
      </div>
      {shown.filter((k) => active.has(k.key)).map(({ key, placeholder }) => (
        <input
          key={key}
          type={key === "website" ? "url" : "text"}
          placeholder={placeholder}
          value={values[key]}
          disabled={disabled}
          onChange={(e) => setValues({ ...values, [key]: e.target.value })}
          className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none text-sm disabled:opacity-50"
        />
      ))}
    </div>
  );
}
