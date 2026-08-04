/** sol.new POAP — proof-of-attendance drops (link / QR claim). */

export type PoapDrop = {
  code: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  location: string | null;
  issuer: string;
  maxClaims: number | null;
  claimCount: number;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
};

export type PoapClaim = {
  dropCode: string;
  wallet: string;
  claimedAt: string;
};

const CODE_ALPHABET = "abcdefghijkmnopqrstuvwxyz23456789";

export function generatePoapCode(len = 8): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < len; i++) {
    out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  }
  return out;
}

export function poapClaimUrl(code: string, origin = "https://sol.new"): string {
  return `${origin.replace(/\/$/, "")}/poap/${code}`;
}

export function isPoapOpen(drop: Pick<PoapDrop, "startsAt" | "endsAt" | "maxClaims" | "claimCount">): {
  open: boolean;
  reason?: string;
} {
  const now = Date.now();
  if (drop.startsAt) {
    const t = Date.parse(drop.startsAt);
    if (!Number.isNaN(t) && now < t) return { open: false, reason: "Drop not started yet" };
  }
  if (drop.endsAt) {
    const t = Date.parse(drop.endsAt);
    if (!Number.isNaN(t) && now > t) return { open: false, reason: "Drop has ended" };
  }
  if (drop.maxClaims != null && drop.claimCount >= drop.maxClaims) {
    return { open: false, reason: "Fully claimed" };
  }
  return { open: true };
}

export function rowToDrop(r: Record<string, unknown>): PoapDrop {
  return {
    code: String(r.code),
    title: String(r.title),
    description: r.description != null ? String(r.description) : null,
    imageUrl: r.image_url != null ? String(r.image_url) : null,
    location: r.location != null ? String(r.location) : null,
    issuer: String(r.issuer),
    maxClaims: r.max_claims != null ? Number(r.max_claims) : null,
    claimCount: Number(r.claim_count ?? 0),
    startsAt: r.starts_at != null ? String(r.starts_at) : null,
    endsAt: r.ends_at != null ? String(r.ends_at) : null,
    createdAt: String(r.created_at ?? ""),
  };
}
