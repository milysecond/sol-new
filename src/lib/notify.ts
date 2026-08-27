async function sendWebPush(payload: {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  topic: string;
}) {
  const secret = process.env.PUSH_SECRET;
  const base =
    process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ||
    process.env.SITE_URL?.replace(/\/$/, "") ||
    "https://sol.new";
  try {
    await fetch(`${base}/api/push/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "x-push-secret": secret } : {}),
      },
      body: JSON.stringify(payload),
    });
  } catch {
    // non-fatal
  }
}

const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
const TG_CHANNEL = "@soldotnew";

const TG_LOG_BOT_TOKEN = process.env.TG_LOG_BOT_TOKEN;
const TG_LOG_CHAT_ID = process.env.TG_LOG_CHAT_ID;

const escHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const flagFor = (cc?: string | null) => {
  if (!cc || cc.length !== 2) return "";
  const a = cc.toUpperCase().charCodeAt(0);
  const b = cc.toUpperCase().charCodeAt(1);
  if (a < 65 || a > 90 || b < 65 || b > 90) return "";
  return String.fromCodePoint(0x1f1e6 + a - 65, 0x1f1e6 + b - 65);
};

const isPrivateIp = (ip: string) =>
  !ip ||
  ip === "unknown" ||
  ip === "::1" ||
  ip === "127.0.0.1" ||
  ip.startsWith("10.") ||
  ip.startsWith("192.168.") ||
  /^172\.(1[6-9]|2[0-9]|3[01])\./.test(ip) ||
  ip.startsWith("fc") ||
  ip.startsWith("fd") ||
  ip.startsWith("100."); // CGNAT / some edges

/** Best-effort client IP (Cloudflare first). */
export function requestIp(req?: Request | null): string {
  if (!req) return "unknown";
  const h = req.headers;
  return (
    h.get("cf-connecting-ip") ||
    h.get("true-client-ip") ||
    h.get("x-real-ip") ||
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export type Geo = {
  country?: string;
  city?: string;
  region?: string;
  flag?: string;
  line?: string;
  lat?: number;
  lng?: number;
  /** ISO country code */
  countryCode?: string;
};

/** Fast geo from Cloudflare / edge request headers (no external call). */
export function geoFromCfHeaders(req: Request): Geo {
  const h = req.headers;
  const cc = (h.get("cf-ipcountry") || "").toUpperCase();
  if (!cc || cc === "XX" || cc === "T1") return {};
  const city = h.get("cf-ipcity") || h.get("x-vercel-ip-city") || undefined;
  const region =
    h.get("cf-region") ||
    h.get("cf-region-code") ||
    h.get("x-vercel-ip-country-region") ||
    undefined;
  const latRaw = h.get("cf-iplatitude") || h.get("x-vercel-ip-latitude");
  const lngRaw = h.get("cf-iplongitude") || h.get("x-vercel-ip-longitude");
  const lat = latRaw != null ? Number(latRaw) : undefined;
  const lng = lngRaw != null ? Number(lngRaw) : undefined;
  const flag = flagFor(cc);
  const parts = [city, region, cc].filter(Boolean) as string[];
  const line = parts.length
    ? `${flag ? flag + " " : ""}${parts.join(", ")}`
    : flag || cc;
  return {
    countryCode: cc,
    country: cc,
    city: city || undefined,
    region: region || undefined,
    flag,
    line,
    lat: lat != null && Number.isFinite(lat) ? lat : undefined,
    lng: lng != null && Number.isFinite(lng) ? lng : undefined,
  };
}

export async function geolocateIp(rawIp: string): Promise<Geo> {
  const ip = (rawIp || "").split(",")[0].trim();
  if (isPrivateIp(ip)) return {};
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(t);
    if (!res.ok) return {};
    const j: Record<string, unknown> = await res.json();
    if (j.error) return {};
    const country =
      (j.country_name as string) || (j.country as string) || undefined;
    const city = (j.city as string) || undefined;
    const region = (j.region as string) || undefined;
    const cc = ((j.country_code as string) || "").toUpperCase() || undefined;
    const flag = flagFor(cc);
    const lat = typeof j.latitude === "number" ? j.latitude : Number(j.latitude);
    const lng =
      typeof j.longitude === "number" ? j.longitude : Number(j.longitude);
    const parts = [city, region, country].filter(Boolean) as string[];
    const line = parts.length
      ? `${flag ? flag + " " : ""}${parts.join(", ")}`
      : flag || "";
    return {
      country,
      city,
      region,
      flag,
      line,
      countryCode: cc,
      lat: Number.isFinite(lat) ? lat : undefined,
      lng: Number.isFinite(lng) ? lng : undefined,
    };
  } catch {
    return {};
  }
}

/** CF headers first, then IP lookup for city/coords. */
export async function geolocateRequest(
  req: Request,
): Promise<Geo & { ip: string }> {
  const ip = requestIp(req);
  const fromCf = geoFromCfHeaders(req);
  if (fromCf.city && fromCf.lat != null && fromCf.lng != null) {
    return { ip, ...fromCf };
  }
  const fromIp = await geolocateIp(ip);
  const merged: Geo = {
    ...fromCf,
    ...fromIp,
    countryCode: fromIp.countryCode || fromCf.countryCode,
    flag: fromIp.flag || fromCf.flag,
    line: fromIp.line || fromCf.line,
  };
  return { ip, ...merged };
}

export type LogEvent = {
  kind: string;
  emoji?: string;
  title?: string;
  fields?: Record<string, string | number | undefined | null>;
};

export type NotifyCtx = {
  /** HTTP request — used to derive IP + geo automatically */
  req?: Request | null;
  /** Explicit IP if no request */
  ip?: string | null;
  /** Skip geo lookup (rare) */
  skipGeo?: boolean;
};

/**
 * solnewlog → Telegram log channel.
 * Always attaches user geolocation when req/ip is available.
 */
export async function notifyEvent(
  evt: LogEvent,
  ctx?: NotifyCtx,
): Promise<void> {
  if (!TG_LOG_BOT_TOKEN || !TG_LOG_CHAT_ID) return;

  const fields: Record<string, string | number | undefined | null> = {
    ...(evt.fields || {}),
  };

  if (!ctx?.skipGeo) {
    try {
      let geo: Geo & { ip?: string } = {};
      if (ctx?.req) {
        geo = await geolocateRequest(ctx.req);
      } else if (ctx?.ip) {
        const ip = ctx.ip;
        geo = { ip, ...(await geolocateIp(ip)) };
      }

      if (
        geo.ip &&
        (fields.ip == null || fields.ip === "" || fields.ip === "unknown")
      ) {
        fields.ip = geo.ip;
      }
      if (geo.line && !fields.location && !fields.geo) {
        fields.location = geo.line;
      }
      if (geo.city && !fields.city) fields.city = geo.city;
      if (geo.region && !fields.region) fields.region = geo.region;
      if ((geo.country || geo.countryCode) && !fields.country) {
        fields.country = geo.country || geo.countryCode;
      }
      if (geo.lat != null && geo.lng != null && !fields.coords) {
        fields.coords = `${geo.lat.toFixed(4)},${geo.lng.toFixed(4)}`;
      }
    } catch {
      /* geo never blocks logging */
    }
  }

  const head = `${evt.emoji ?? "•"} <b>${escHtml(evt.title ?? evt.kind)}</b>`;
  const lines: string[] = [head];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null || v === "") continue;
    lines.push(`<b>${escHtml(k)}:</b> <code>${escHtml(String(v))}</code>`);
  }

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${TG_LOG_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TG_LOG_CHAT_ID,
          text: lines.join("\n"),
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      },
    );
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as {
        description?: string;
      };
      console.warn("[notifyEvent] failed:", j.description || res.status);
    }
  } catch (err) {
    console.warn("[notifyEvent] error:", err);
  }
}

export async function notifyTokenLaunch(data: {
  name: string;
  symbol: string;
  description?: string | null;
  imageUrl?: string | null;
  mintAddress: string;
  network?: string | null;
}) {
  if (!TG_BOT_TOKEN) {
    console.error(
      "[notify] TG_BOT_TOKEN not configured - skipping notification",
    );
    return;
  }

  console.log("[notify] Sending token launch notification:", {
    name: data.name,
    symbol: data.symbol,
    mintAddress: data.mintAddress,
  });

  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const networkTag =
    data.network === "devnet"
      ? "🟡 <b>TEST</b> · "
      : data.network === "mainnet"
        ? "🟢 <b>LIVE</b> · "
        : "";

  const lines = [
    `${networkTag}<b>${esc(data.name)}</b> ($${esc(data.symbol)}) just launched on sol.new`,
  ];
  if (data.description) {
    lines.push("", esc(data.description));
  }
  lines.push(
    "",
    `<code>${data.mintAddress}</code>`,
    "",
    `<a href="https://sol.new/token/${data.mintAddress}">View token</a>  ·  <a href="https://jup.ag/tokens/${data.mintAddress}?refId=yfgv2ibxy07v">Buy on Jup</a>  ·  <a href="https://sol.new">Launch yours</a>`,
  );

  const caption = lines.join("\n");

  const reply_markup = {
    inline_keyboard: [
      [
        {
          text: "View token",
          url: `https://sol.new/token/${data.mintAddress}`,
        },
        {
          text: "Buy on Jup",
          url: `https://jup.ag/tokens/${data.mintAddress}?refId=yfgv2ibxy07v`,
        },
      ],
      [{ text: "Launch yours", url: "https://sol.new" }],
    ],
  };

  let photoUrl = data.imageUrl;
  if (photoUrl?.startsWith("ipfs://")) {
    photoUrl = photoUrl.replace("ipfs://", "https://nftstorage.link/ipfs/");
  }

  try {
    if (photoUrl) {
      console.log("[notify] Attempting to send with photo:", photoUrl);
      const photoRes = await fetch(
        `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendPhoto`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: TG_CHANNEL,
            photo: photoUrl,
            caption,
            parse_mode: "HTML",
            reply_markup,
          }),
        },
      );
      const photoJson = (await photoRes.json()) as {
        ok?: boolean;
        description?: string;
      };
      if (photoJson.ok) {
        console.log(
          "[notify] ✓ Token launch posted to",
          TG_CHANNEL,
          "(with photo)",
        );
        return;
      } else {
        console.warn(
          "[notify] Photo send failed:",
          photoJson.description || photoJson,
        );
      }
    }

    console.log("[notify] Sending text-only notification");
    const textRes = await fetch(
      `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TG_CHANNEL,
          text: caption,
          parse_mode: "HTML",
          disable_web_page_preview: false,
          reply_markup,
        }),
      },
    );
    const textJson = (await textRes.json()) as {
      ok?: boolean;
      description?: string;
    };
    if (textJson.ok) {
      console.log(
        "[notify] ✓ Token launch posted to",
        TG_CHANNEL,
        "(text-only)",
      );
    } else {
      console.error(
        "[notify] Text send also failed:",
        textJson.description || textJson,
      );
    }
  } catch (err) {
    console.error("[notify] Telegram notification failed:", err);
  }

  await sendWebPush({
    title: `${data.name} ($${data.symbol}) just launched`,
    body: data.description?.slice(0, 100) || "New token live on sol.new",
    url: `/token/${data.mintAddress}`,
    tag: `launch-${data.mintAddress}`,
    topic: "launch",
  });
}
