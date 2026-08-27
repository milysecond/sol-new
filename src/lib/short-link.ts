/** Shared validation + code generation for sol.new short links. */

/** Platform fee vault (same as NFT mint fees). */
export const LINK_FEE_VAULT = "Deqi6CBfo2FR2XVZXxSwmcjELy1JdbAXWDNFPzDAbtxW";

/** Custom short codes cost 0.01 SOL. Random codes are free. */
export const CUSTOM_LINK_FEE_SOL = 0.01;
export const CUSTOM_LINK_FEE_LAMPORTS = 10_000_000;

export const SHORT_CODE_RE = /^[a-z0-9][a-z0-9_-]{1,31}$/;
export const RESERVED_CODES = new Set([
  "api",
  "link",
  "links",
  "l",
  "admin",
  "www",
  "app",
  "static",
  "assets",
  "favicon",
  "robots",
  "sitemap",
  "health",
]);

const CODE_ALPHABET = "abcdefghijkmnopqrstuvwxyz23456789"; // no 0/o/1/l

export function randomShortCode(len = 7): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = "";
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  return out;
}

export function normalizeCode(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidCustomCode(code: string): boolean {
  if (!SHORT_CODE_RE.test(code)) return false;
  if (RESERVED_CODES.has(code)) return false;
  return true;
}

/**
 * Normalize and validate a destination URL.
 * Only http(s). Rejects javascript:, data:, bare hosts like "abc", etc.
 */
export function normalizeTargetUrl(
  raw: string,
): { ok: true; url: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "Enter a URL" };
  if (trimmed.length > 2048) return { ok: false, error: "URL is too long" };

  // Reject whitespace / obvious junk
  if (/\s/.test(trimmed)) {
    return { ok: false, error: "URL cannot contain spaces" };
  }

  let withScheme = trimmed;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    withScheme = `https://${trimmed}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { ok: false, error: "Invalid URL" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "Only http and https URLs are allowed" };
  }

  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return { ok: false, error: "URL is missing a domain" };

  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "[::1]" ||
    host.endsWith(".localhost")
  ) {
    return { ok: false, error: "Local URLs are not allowed" };
  }

  // Reject IP-only if private (basic)
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const parts = host.split(".").map(Number);
    if (
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 172 && parts[1]! >= 16 && parts[1]! <= 31)
    ) {
      return { ok: false, error: "Private IP addresses are not allowed" };
    }
  } else {
    // Public hostnames must look like a real domain: label.label (needs a dot)
    // Rejects bare words like "abc" → https://abc/
    if (!host.includes(".")) {
      return {
        ok: false,
        error: "Enter a full domain (e.g. example.com), not just a name",
      };
    }
    const labels = host.split(".");
    if (labels.some((l) => !l || l.length > 63)) {
      return { ok: false, error: "Invalid domain" };
    }
    // Each label: alnum + hyphens, not starting/ending with hyphen
    for (const l of labels) {
      if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i.test(l) && !/^xn--[a-z0-9-]+$/i.test(l)) {
        return { ok: false, error: "Invalid domain name" };
      }
    }
    const tld = labels[labels.length - 1] || "";
    // TLD at least 2 chars, not purely numeric
    if (tld.length < 2 || /^\d+$/.test(tld)) {
      return { ok: false, error: "Invalid domain extension" };
    }
    // Require at least one letter in TLD (catches foo.12)
    if (!/[a-z]/i.test(tld)) {
      return { ok: false, error: "Invalid domain extension" };
    }
  }

  // Drop credentials in URL
  parsed.username = "";
  parsed.password = "";

  return { ok: true, url: parsed.toString() };
}

export function shortPath(code: string): string {
  return `/link/${code}`;
}

/** Legacy path still resolved by middleware → canonical /link/… */
export function legacyShortPath(code: string): string {
  return `/l/${code}`;
}

export function absoluteShortUrl(code: string, origin?: string): string {
  const base = origin || (typeof window !== "undefined" ? window.location.origin : "https://sol.new");
  return `${base.replace(/\/$/, "")}${shortPath(code)}`;
}

/** Hosts we auto-redirect without an interstitial (same product brand). */
export function isTrustedShortLinkHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  return h === "sol.new" || h.endsWith(".sol.new");
}

export type ShortLinkDestinationInfo = {
  hostname: string;
  host: string;
  /** Human product / site name when known. */
  siteName: string;
  /** Short category label for badges. */
  kind: string;
  /** One-line explainer for the interstitial. */
  summary: string;
  /** Suggested headline when the creator left title empty. */
  defaultTitle: string;
  /** Continue button label. */
  continueLabel: string;
  /** Google s2 favicon URL (safe external). */
  faviconUrl: string;
};

/**
 * Infer a human-readable destination profile from a target URL.
 * Keeps interstitial / OG pages useful even when title is blank.
 */
export function describeShortLinkDestination(targetUrl: string): ShortLinkDestinationInfo {
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return {
      hostname: "",
      host: "",
      siteName: "External site",
      kind: "Link",
      summary: "This short link points to an external destination.",
      defaultTitle: "Shared link",
      continueLabel: "Continue",
      faviconUrl: "https://www.google.com/s2/favicons?domain=sol.new&sz=64",
    };
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  const host = parsed.host;
  const path = parsed.pathname.toLowerCase();
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`;

  const base = (
    siteName: string,
    kind: string,
    summary: string,
    defaultTitle: string,
    continueLabel?: string
  ): ShortLinkDestinationInfo => ({
    hostname,
    host,
    siteName,
    kind,
    summary,
    defaultTitle,
    continueLabel: continueLabel ?? `Continue to ${siteName}`,
    faviconUrl,
  });

  // Google Calendar booking / appointment pages
  if (
    hostname === "calendar.app.google" ||
    hostname === "calendar.google.com" ||
    (hostname.endsWith(".google.com") && path.includes("/calendar"))
  ) {
    return base(
      "Google Calendar",
      "Calendar",
      "Book or open a Google Calendar event from this short link.",
      "Schedule on Google Calendar",
      "Open Google Calendar"
    );
  }

  if (hostname === "calendly.com" || hostname.endsWith(".calendly.com")) {
    return base(
      "Calendly",
      "Calendar",
      "Pick a time on a Calendly scheduling page.",
      "Book a time on Calendly",
      "Open Calendly"
    );
  }

  if (hostname === "cal.com" || hostname.endsWith(".cal.com")) {
    return base(
      "Cal.com",
      "Calendar",
      "Pick a time on a Cal.com scheduling page.",
      "Book a time on Cal.com",
      "Open Cal.com"
    );
  }

  if (
    hostname === "x.com" ||
    hostname === "twitter.com" ||
    hostname === "mobile.twitter.com"
  ) {
    return base(
      "X",
      "Social",
      "Opens a profile or post on X (Twitter).",
      "View on X",
      "Open on X"
    );
  }

  if (
    hostname === "youtube.com" ||
    hostname === "www.youtube.com" ||
    hostname === "youtu.be" ||
    hostname === "m.youtube.com"
  ) {
    return base(
      "YouTube",
      "Video",
      "Opens a YouTube video or channel.",
      "Watch on YouTube",
      "Open YouTube"
    );
  }

  if (hostname === "github.com" || hostname === "www.github.com") {
    return base(
      "GitHub",
      "Code",
      "Opens a repository, issue, or profile on GitHub.",
      "View on GitHub",
      "Open GitHub"
    );
  }

  if (
    hostname === "docs.google.com" ||
    hostname === "drive.google.com" ||
    hostname === "sheets.google.com" ||
    hostname === "forms.gle"
  ) {
    return base(
      "Google Docs",
      "Document",
      "Opens a Google Drive / Docs / Forms resource.",
      "Open Google document",
      "Open document"
    );
  }

  if (hostname === "t.me" || hostname === "telegram.me" || hostname === "telegram.org") {
    return base(
      "Telegram",
      "Chat",
      "Opens a Telegram chat, channel, or invite.",
      "Open in Telegram",
      "Open Telegram"
    );
  }

  if (hostname === "discord.gg" || hostname === "discord.com" || hostname.endsWith(".discord.com")) {
    return base(
      "Discord",
      "Chat",
      "Opens a Discord invite or channel.",
      "Join on Discord",
      "Open Discord"
    );
  }

  if (hostname === "solscan.io" || hostname === "explorer.solana.com" || hostname === "solana.fm") {
    return base(
      siteLabelFromHost(hostname),
      "Explorer",
      "Opens a Solana explorer page for a transaction, account, or token.",
      "View on Solana explorer",
      `Open ${siteLabelFromHost(hostname)}`
    );
  }

  if (isTrustedShortLinkHost(hostname)) {
    return base(
      "sol.new",
      "sol.new",
      "Internal sol.new destination — safe auto-redirect.",
      "Continue on sol.new",
      "Continue"
    );
  }

  const siteName = siteLabelFromHost(hostname);
  return base(
    siteName,
    "External",
    `This short link leaves sol.new and opens ${host}. Only continue if you trust the destination.`,
    `Link to ${siteName}`,
    `Continue to ${siteName}`
  );
}

function siteLabelFromHost(hostname: string): string {
  const h = hostname.replace(/^www\./, "");
  if (!h) return "External site";
  const parts = h.split(".");
  // calendar.app.google → prefer meaningful middle when common multi-part TLDs
  if (parts.length >= 2) {
    const secondLevel = parts[parts.length - 2] || "";
    if (secondLevel && secondLevel.length > 2) {
      return secondLevel.charAt(0).toUpperCase() + secondLevel.slice(1);
    }
  }
  return h;
}

/** Display title: creator title wins, else destination default. */
export function shortLinkDisplayTitle(
  title: string | null | undefined,
  dest: ShortLinkDestinationInfo
): string {
  const t = title?.trim();
  return t || dest.defaultTitle;
}

/** Relative-ish created label for interstitial stats. */
export function formatShortLinkCreated(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 60) return `${days}d ago`;
  try {
    return new Date(t).toLocaleDateString("en-AU", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return null;
  }
}
