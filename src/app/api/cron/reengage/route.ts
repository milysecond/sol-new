import { NextRequest, NextResponse } from "next/server";
import { initDb, getInactivePushSubscriptions, touchPushSubscription } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MESSAGES = [
  { title: "Still got that idea?", body: "Launch a token in 30 seconds." },
  { title: "Mint your moment", body: "Drop an NFT for free with a promo code." },
  { title: "Your wallet's waiting", body: "Tap to check in on sol.new." },
];

export async function GET(req: NextRequest) {
  // Vercel cron sends `Authorization: Bearer ${CRON_SECRET}` — fall back to PUSH_SECRET for manual runs
  const auth = req.headers.get("authorization");
  const CRON_SECRET = process.env.CRON_SECRET;
  const PUSH_SECRET = process.env.PUSH_SECRET;
  const ok =
    (CRON_SECRET && auth === `Bearer ${CRON_SECRET}`) ||
    (PUSH_SECRET && req.headers.get("x-push-secret") === PUSH_SECRET);
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await initDb();
  // Idle ≥ 24h, but ≤ 30 days (skip long-gone users so we don't bombard dead endpoints)
  const subs = await getInactivePushSubscriptions(24, 24 * 30);
  if (subs.length === 0) return NextResponse.json({ ok: true, sent: 0, skipped: 0 });

  const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
  const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
  const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:gm@metasal.xyz";
  const APNS_KEY = process.env.APNS_KEY;
  const APNS_KEY_ID = process.env.APNS_KEY_ID;
  const APNS_TOPIC = process.env.APNS_TOPIC || "new.sol";
  const TEAM_ID = process.env.APPLE_TEAM_ID || "4CK2SMVS2Y";

  const webpush = (await import("web-push")).default;
  if (VAPID_PUBLIC && VAPID_PRIVATE) webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

  const apn = (await import("@parse/node-apn")).default;
  const apnsProvider = APNS_KEY && APNS_KEY_ID
    ? new apn.Provider({
        token: { key: Buffer.from(APNS_KEY.replace(/\\n/g, "\n"), "utf8"), keyId: APNS_KEY_ID, teamId: TEAM_ID },
        production: true,
      })
    : null;

  let sent = 0;
  let failed = 0;

  await Promise.allSettled(
    subs.map(async (s) => {
      const msg = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
      try {
        if (s.type === "web" && s.p256dh && s.auth && VAPID_PUBLIC && VAPID_PRIVATE) {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify({
              title: msg.title,
              body: msg.body,
              icon: "/icon-192.png",
              badge: "/icon-32.png",
              url: "/",
              tag: "reengage",
            })
          );
          sent++;
        } else if (s.type === "apns" && apnsProvider) {
          const note = new apn.Notification();
          note.expiry = Math.floor(Date.now() / 1000) + 3600;
          note.sound = "default";
          note.alert = { title: msg.title, body: msg.body };
          note.payload = { url: "/", tag: "reengage" };
          note.topic = APNS_TOPIC;
          const res = await apnsProvider.send(note, s.endpoint);
          if (res.sent.length > 0) sent++;
          else failed++;
        }
        // Mark as just-seen so we don't re-ping on the next cron run
        await touchPushSubscription(s.endpoint);
      } catch {
        failed++;
      }
    })
  );

  apnsProvider?.shutdown();

  return NextResponse.json({ ok: true, sent, failed, total: subs.length });
}
