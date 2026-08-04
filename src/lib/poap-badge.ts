/**
 * On-chain POAP badge art — compact SVG baked into metadata as data URI.
 * No external image host required for the NFT image field.
 */

export type PoapBadgeInput = {
  title: string;
  code: string;
  location?: string | null;
  claimedAt?: string;
  /** Optional short wallet tag e.g. 7KLG…y8H5 */
  walletTag?: string | null;
  geoLocked?: boolean;
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapTitle(title: string, max = 18): string[] {
  const t = title.trim() || "POAP";
  if (t.length <= max) return [t];
  const words = t.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > max && cur) {
      lines.push(cur);
      cur = w;
      if (lines.length >= 2) break;
    } else {
      cur = next;
    }
  }
  if (cur && lines.length < 3) lines.push(cur);
  return lines.slice(0, 3).map((l) => (l.length > max ? `${l.slice(0, max - 1)}…` : l));
}

/** Compact SVG badge (viewBox 400×400). */
export function buildPoapBadgeSvg(input: PoapBadgeInput): string {
  const lines = wrapTitle(input.title, 16);
  const titleY = lines.length === 1 ? 188 : lines.length === 2 ? 172 : 158;
  const titleSvg = lines
    .map(
      (line, i) =>
        `<text x="200" y="${titleY + i * 32}" text-anchor="middle" fill="#fff" font-family="ui-sans-serif,system-ui,sans-serif" font-size="28" font-weight="700">${esc(line)}</text>`
    )
    .join("");

  const date = (input.claimedAt || new Date().toISOString()).slice(0, 10);
  const loc = input.location ? esc(input.location.slice(0, 36)) : "";
  const tag = input.walletTag ? esc(input.walletTag) : "";
  const geo = input.geoLocked ? "GEO" : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#7c3aed"/>
      <stop offset="55%" stop-color="#a855f7"/>
      <stop offset="100%" stop-color="#db2777"/>
    </linearGradient>
    <radialGradient id="r" cx="30%" cy="25%" r="70%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="400" height="400" rx="48" fill="url(#g)"/>
  <rect width="400" height="400" rx="48" fill="url(#r)"/>
  <circle cx="200" cy="96" r="36" fill="none" stroke="#fff" stroke-opacity="0.85" stroke-width="3"/>
  <circle cx="200" cy="96" r="14" fill="#fff" fill-opacity="0.9"/>
  <text x="200" y="128" text-anchor="middle" fill="#fff" fill-opacity="0.75" font-family="ui-sans-serif,system-ui,sans-serif" font-size="12" font-weight="600" letter-spacing="3">POAP</text>
  ${titleSvg}
  <text x="200" y="280" text-anchor="middle" fill="#fff" fill-opacity="0.85" font-family="ui-monospace,monospace" font-size="14">${esc(input.code.toUpperCase())}</text>
  ${loc ? `<text x="200" y="308" text-anchor="middle" fill="#fff" fill-opacity="0.7" font-family="ui-sans-serif,system-ui,sans-serif" font-size="13">${loc}</text>` : ""}
  <text x="200" y="348" text-anchor="middle" fill="#fff" fill-opacity="0.65" font-family="ui-sans-serif,system-ui,sans-serif" font-size="12">${esc(date)}${geo ? " · " + geo : ""}${tag ? " · " + tag : ""}</text>
  <text x="200" y="378" text-anchor="middle" fill="#fff" fill-opacity="0.45" font-family="ui-sans-serif,system-ui,sans-serif" font-size="11">sol.new</text>
</svg>`;
}

/** data: URI for use as NFT image (on-chain art — no external host). */
export function poapBadgeDataUri(input: PoapBadgeInput): string {
  const svg = buildPoapBadgeSvg(input);
  // Prefer base64 for broad wallet compatibility
  const b64 = Buffer.from(svg, "utf8").toString("base64");
  return `data:image/svg+xml;base64,${b64}`;
}

export function shortWalletTag(pk: string): string {
  if (pk.length < 8) return pk;
  return `${pk.slice(0, 4)}…${pk.slice(-4)}`;
}
