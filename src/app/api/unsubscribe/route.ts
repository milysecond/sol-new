import { NextRequest, NextResponse } from "next/server";
import {
  getContact,
  getContactTopics,
  parseEmail,
  resendConfigured,
  setContactUnsubscribed,
  updateContactTopics,
} from "@/lib/resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!resendConfigured()) {
    return NextResponse.json(
      { error: "Email service not configured" },
      { status: 503 }
    );
  }
  const email = parseEmail(request.nextUrl.searchParams.get("email"));
  if (!email) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }
  const contact = await getContact(email);
  const topics = contact ? await getContactTopics(email) : null;
  return NextResponse.json({
    email,
    unsubscribed: Boolean(
      contact && (contact as { unsubscribed?: boolean }).unsubscribed
    ),
    found: Boolean(contact),
    product: topics?.product ?? true,
    launches: topics?.launches ?? true,
  });
}

export async function POST(request: NextRequest) {
  if (!resendConfigured()) {
    return new NextResponse(null, { status: 202 });
  }

  let email: string | null = null;
  let resubscribe = false;
  let product: boolean | undefined;
  let launches: boolean | undefined;
  const ct = request.headers.get("content-type") || "";

  try {
    if (ct.includes("application/json")) {
      const body = (await request.json()) as {
        email?: string;
        unsubscribed?: boolean;
        product?: boolean;
        launches?: boolean;
      };
      email = parseEmail(body.email ?? null);
      if (body.unsubscribed === false) resubscribe = true;
      if (typeof body.product === "boolean") product = body.product;
      if (typeof body.launches === "boolean") launches = body.launches;
    } else {
      const form = await request.formData();
      email = parseEmail(
        (form.get("email") as string) ||
          (form.get("List-Unsubscribe") as string) ||
          null
      );
    }
  } catch {
    email = parseEmail(request.nextUrl.searchParams.get("email"));
  }

  if (!email) {
    email = parseEmail(request.nextUrl.searchParams.get("email"));
  }

  if (!email) {
    return new NextResponse(null, { status: 202 });
  }

  let unsubscribed = false;

  try {
    if (resubscribe) {
      await setContactUnsubscribed(email, false);
      await updateContactTopics(email, {
        product: product ?? true,
        launches: launches ?? true,
      });
      unsubscribed = false;
    } else if (typeof product === "boolean" || typeof launches === "boolean") {
      const p = product ?? true;
      const l = launches ?? true;
      if (!p && !l) {
        await setContactUnsubscribed(email, true);
        unsubscribed = true;
      } else {
        await setContactUnsubscribed(email, false);
        await updateContactTopics(email, { product: p, launches: l });
        unsubscribed = false;
      }
    } else {
      // One-click unsubscribe / no topic body
      await setContactUnsubscribed(email, true);
      unsubscribed = true;
    }
  } catch (e) {
    console.error("[unsubscribe]", e);
  }

  if (ct.includes("application/json")) {
    return NextResponse.json({
      ok: true,
      email,
      unsubscribed,
      product: unsubscribed ? false : product,
      launches: unsubscribed ? false : launches,
    });
  }
  return new NextResponse(null, { status: 202 });
}
