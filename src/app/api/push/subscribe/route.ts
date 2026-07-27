import { NextRequest, NextResponse } from "next/server";
import { initDb, savePushSubscription, deletePushSubscription } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      type?: string;
      subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      token?: string;
      wallet?: string;
      topics?: string;
    };
    const { type = "web", subscription, token, wallet, topics } = body;

    await initDb();

    if (type === "web") {
      if (!subscription?.endpoint) return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
      await savePushSubscription({
        endpoint: subscription.endpoint,
        p256dh: subscription.keys?.p256dh,
        auth: subscription.keys?.auth,
        type: "web",
        wallet: wallet || null,
        topics: topics || "tx,launch",
      });
    } else if (type === "apns") {
      if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });
      await savePushSubscription({
        endpoint: token,
        type: "apns",
        wallet: wallet || null,
        topics: topics || "tx,launch",
      });
    } else {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { endpoint } = (await req.json()) as { endpoint?: string };
    if (!endpoint) return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
    await initDb();
    await deletePushSubscription(endpoint);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
