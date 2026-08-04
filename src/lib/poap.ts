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
  /** Geo-lock center (WGS84). Null = open world. */
  geoLat: number | null;
  geoLng: number | null;
  /** Radius in meters (default 200 when geo set). */
  geoRadiusM: number | null;
  createdAt: string;
};

export type PoapClaim = {
  dropCode: string;
  wallet: string;
  claimedAt: string;
};

const CODE_ALPHABET = "abcdefghijkmnopqrstuvwxyz23456789";

export const DEFAULT_GEO_RADIUS_M = 200;
export const MIN_GEO_RADIUS_M = 50;
export const MAX_GEO_RADIUS_M = 50_000;

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

export function isPoapOpen(
  drop: Pick<PoapDrop, "startsAt" | "endsAt" | "maxClaims" | "claimCount">
): {
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

export function isGeoLocked(drop: Pick<PoapDrop, "geoLat" | "geoLng">): boolean {
  return (
    drop.geoLat != null &&
    drop.geoLng != null &&
    Number.isFinite(drop.geoLat) &&
    Number.isFinite(drop.geoLng)
  );
}

/** Haversine distance in meters. */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Check claimer coords against drop geo-lock.
 * Adds a small slack for GPS accuracy (min 25m, max 150m of reported accuracy).
 */
export function checkGeoLock(
  drop: Pick<PoapDrop, "geoLat" | "geoLng" | "geoRadiusM">,
  lat: number,
  lng: number,
  accuracyM?: number | null
): { ok: true; distanceM: number } | { ok: false; reason: string; distanceM?: number } {
  if (!isGeoLocked(drop as PoapDrop)) return { ok: true, distanceM: 0 };
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, reason: "Location required to claim this drop" };
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { ok: false, reason: "Invalid coordinates" };
  }
  const radius = drop.geoRadiusM ?? DEFAULT_GEO_RADIUS_M;
  const dist = haversineMeters(drop.geoLat!, drop.geoLng!, lat, lng);
  const slack =
    accuracyM != null && Number.isFinite(accuracyM)
      ? Math.min(150, Math.max(25, accuracyM))
      : 40;
  if (dist > radius + slack) {
    return {
      ok: false,
      reason: `Too far — you're ~${Math.round(dist)}m away (need within ${radius}m)`,
      distanceM: dist,
    };
  }
  return { ok: true, distanceM: dist };
}

export function rowToDrop(r: Record<string, unknown>): PoapDrop {
  const geoLat = r.geo_lat != null ? Number(r.geo_lat) : null;
  const geoLng = r.geo_lng != null ? Number(r.geo_lng) : null;
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
    geoLat: geoLat != null && Number.isFinite(geoLat) ? geoLat : null,
    geoLng: geoLng != null && Number.isFinite(geoLng) ? geoLng : null,
    geoRadiusM: r.geo_radius_m != null ? Number(r.geo_radius_m) : null,
    createdAt: String(r.created_at ?? ""),
  };
}

/** Public fields safe to show before claim (hide exact coords if you want — we show radius only). */
export function publicGeoSummary(drop: PoapDrop): {
  geoLocked: boolean;
  geoRadiusM: number | null;
  /** Approximate center for maps — only if locked */
  geoLat: number | null;
  geoLng: number | null;
} {
  const locked = isGeoLocked(drop);
  return {
    geoLocked: locked,
    geoRadiusM: locked ? drop.geoRadiusM ?? DEFAULT_GEO_RADIUS_M : null,
    geoLat: locked ? drop.geoLat : null,
    geoLng: locked ? drop.geoLng : null,
  };
}
