import { NextRequest, NextResponse } from "next/server";
import { initDb, getPushSubscriptionsByTopic } from "@/lib/db";

export const dynamic = "force-dynamic";

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  url?: string;
  tag?: string;
  topic: "tx" | "launch";
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-push-secret");
  const INTERNAL_SECRET = process.env.PUSH_SECRET;
  // Fail closed: if PUSH_SECRET is unset or wrong, reject (do not allow open broadcast).
  if (!INTERNAL_SECRET || secret !== INTERNAL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload: PushPayload = await req.json();
  if (!payload.title || !payload.topic) {
    return NextResponse.json({ error: "Missing title or topic" }, { status: 400 });
  }

  const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
  const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
  const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:gm@metasal.xyz";

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return NextResponse.json({ error: "VAPID not configured" }, { status: 500 });
  }

  const webpush = (await import("web-push")).default;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

  await initDb();
  const subs = await getPushSubscriptionsByTopic(payload.topic);

  const notification = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon || "/icon-192.png",
    badge: "/icon-32.png",
    url: payload.url || "/",
    tag: payload.tag,
  });

  const webResults = await Promise.allSettled(
    subs
      .filter((s) => s.type === "web" && s.p256dh && s.auth)
      .map((s) =>
        webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh!, auth: s.auth! } },
          notification
        )
      )
  );

  // APNs (native iOS)
  const APNS_KEY = process.env.APNS_KEY;
  const APNS_KEY_ID = process.env.APNS_KEY_ID;
  const APNS_TOPIC = process.env.APNS_TOPIC || "new.sol";
  const TEAM_ID = process.env.APPLE_TEAM_ID || "4CK2SMVS2Y";

  let apnsSent = 0, apnsFailed = 0;
  const apnsErrors: unknown[] = [];
  const apnsSubs = subs.filter((s) => s.type === "apns" && s.endpoint);

  if (APNS_KEY && APNS_KEY_ID && apnsSubs.length > 0) {
    const apn = (await import("@parse/node-apn")).default;
    const provider = new apn.Provider({
      token: { key: Buffer.from(APNS_KEY.replace(/\\n/g, "\n"), "utf8"), keyId: APNS_KEY_ID, teamId: TEAM_ID },
      production: true,
    });
    const note = new apn.Notification();
    note.expiry = Math.floor(Date.now() / 1000) + 3600;
    note.sound = "default";
    note.alert = { title: payload.title, body: payload.body ?? "" };
    note.payload = { url: payload.url ?? "/" };
    note.topic = APNS_TOPIC;
    if (payload.tag) note.payload.tag = payload.tag;

    const apnsResults = await Promise.allSettled(
      apnsSubs.map((s) => provider.send(note, s.endpoint))
    );
    provider.shutdown();

    for (const r of apnsResults) {
      if (r.status === "fulfilled") {
        apnsSent += r.value.sent.length;
        apnsFailed += r.value.failed.length;
        if (r.value.failed.length > 0) apnsErrors.push(r.value.failed[0]);
      } else {
        apnsFailed++;
        apnsErrors.push(String(r.reason));
      }
    }
  }

  const webSent = webResults.filter((r) => r.status === "fulfilled").length;
  const webFailed = webResults.filter((r) => r.status === "rejected").length;
  for (const r of webResults) {
    if (r.status === "rejected") console.error("[web-push] failed:", r.reason?.message ?? r.reason);
  }

  const sent = webSent + apnsSent;
  const failed = webFailed + apnsFailed;

  return NextResponse.json({ sent, failed, total: subs.length });
}
