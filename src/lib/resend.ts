/**
 * Resend helpers for sol.new mail.
 * Requires RESEND_API_KEY. From address must be verified on sol.new domain.
 *
 * Mailing list:
 *   - Segment: RESEND_SEGMENT_ID (defaults to Resend "General")
 *   - Topics: Product updates + Launch highlights
 */

const RESEND_API = "https://api.resend.com";

export const RESEND_FROM =
  process.env.RESEND_FROM || "sol.new <noreply@sol.new>";

export const SITE_URL =
  process.env.NEXT_PUBLIC_BASE_URL || "https://sol.new";

/** Resend "General" segment — used as the sol.new mailing list (plan limit: 3). */
export const RESEND_SEGMENT_ID =
  process.env.RESEND_SEGMENT_ID || "483bc3e7-ddd2-4ca4-8b05-82dcd0ff6996";

export const RESEND_TOPIC_PRODUCT =
  process.env.RESEND_TOPIC_PRODUCT || "6375d8d7-abd5-409d-8bc9-e7cb2c449cb4";

export const RESEND_TOPIC_LAUNCHES =
  process.env.RESEND_TOPIC_LAUNCHES || "76a07e10-b2da-46d9-86c0-f88b2cb15b68";

export function resendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export function parseEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const email = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  if (email.length > 254) return null;
  return email;
}

async function resendFetch(path: string, init: RequestInit = {}) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY not set");
  const res = await fetch(`${RESEND_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(
      (json.message as string) || (json.name as string) || `Resend ${res.status}`
    );
  }
  return json;
}

export type SendEmailOpts = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  listUnsubscribe?: boolean;
  tags?: { name: string; value: string }[];
};

export async function sendEmail(opts: SendEmailOpts) {
  const headers: Record<string, string> = {};
  if (opts.listUnsubscribe) {
    headers["List-Unsubscribe"] = `<${SITE_URL}/unsubscribe>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  return resendFetch("/emails", {
    method: "POST",
    body: JSON.stringify({
      from: RESEND_FROM,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      reply_to: opts.replyTo,
      headers: Object.keys(headers).length ? headers : undefined,
      tags: opts.tags,
    }),
  });
}

export type TopicPref = {
  product?: boolean;
  launches?: boolean;
};

function topicSubscriptions(prefs: TopicPref = {}) {
  const product = prefs.product !== false;
  const launches = prefs.launches !== false;
  return [
    {
      id: RESEND_TOPIC_PRODUCT,
      subscription: product ? "opt_in" : "opt_out",
    },
    {
      id: RESEND_TOPIC_LAUNCHES,
      subscription: launches ? "opt_in" : "opt_out",
    },
  ] as const;
}

export async function setContactUnsubscribed(
  email: string,
  unsubscribed: boolean
): Promise<{ id?: string; created?: boolean }> {
  const normalized = parseEmail(email);
  if (!normalized) throw new Error("Invalid email");

  try {
    const updated = await resendFetch(
      `/contacts/${encodeURIComponent(normalized)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ unsubscribed }),
      }
    );
    return { id: updated.id as string | undefined };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/not found|404/i.test(msg)) throw e;
  }

  const created = await resendFetch("/contacts", {
    method: "POST",
    body: JSON.stringify({ email: normalized, unsubscribed }),
  });
  return { id: created.id as string | undefined, created: true };
}

export async function getContact(email: string) {
  const normalized = parseEmail(email);
  if (!normalized) return null;
  try {
    return await resendFetch(`/contacts/${encodeURIComponent(normalized)}`);
  } catch {
    return null;
  }
}

export async function getContactTopics(email: string): Promise<{
  product: boolean;
  launches: boolean;
} | null> {
  const normalized = parseEmail(email);
  if (!normalized) return null;
  try {
    const res = await resendFetch(
      `/contacts/${encodeURIComponent(normalized)}/topics`
    );
    const data = (res.data as Array<{ id?: string; subscription?: string }>) || [];
    const byId = new Map(data.map((t) => [t.id, t.subscription === "opt_in"]));
    return {
      product: byId.get(RESEND_TOPIC_PRODUCT) ?? true,
      launches: byId.get(RESEND_TOPIC_LAUNCHES) ?? true,
    };
  } catch {
    return null;
  }
}

export async function updateContactTopics(
  email: string,
  prefs: TopicPref
): Promise<void> {
  const normalized = parseEmail(email);
  if (!normalized) throw new Error("Invalid email");

  await resendFetch(`/contacts/${encodeURIComponent(normalized)}/topics`, {
    method: "PATCH",
    body: JSON.stringify({ topics: topicSubscriptions(prefs) }),
  });
}

async function addContactToSegment(email: string): Promise<void> {
  if (!RESEND_SEGMENT_ID) return;
  try {
    await resendFetch(
      `/contacts/${encodeURIComponent(email)}/segments/${RESEND_SEGMENT_ID}`,
      { method: "POST" }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Already in segment is fine
    if (!/already|exist|409|422/i.test(msg)) {
      console.warn("[resend] add to segment:", msg);
    }
  }
}

export type SubscribeOpts = {
  email: string;
  firstName?: string;
  product?: boolean;
  launches?: boolean;
  /** Default true — skip if re-subscribe of existing contact */
  sendWelcome?: boolean;
  source?: string;
};

export type SubscribeResult = {
  id?: string;
  created: boolean;
  alreadySubscribed: boolean;
};

/**
 * Add or re-activate a contact on the sol.new mailing list.
 * Opted into product + launches topics by default; added to the list segment.
 */
export async function subscribeToMailingList(
  opts: SubscribeOpts
): Promise<SubscribeResult> {
  const normalized = parseEmail(opts.email);
  if (!normalized) throw new Error("Invalid email");

  const firstName = opts.firstName?.trim().slice(0, 80) || undefined;
  const topics = topicSubscriptions({
    product: opts.product,
    launches: opts.launches,
  });

  const existing = await getContact(normalized);
  const wasUnsubscribed = Boolean(
    existing && (existing as { unsubscribed?: boolean }).unsubscribed
  );
  const alreadySubscribed = Boolean(existing && !wasUnsubscribed);

  let id = (existing as { id?: string } | null)?.id;

  if (existing) {
    await resendFetch(`/contacts/${encodeURIComponent(normalized)}`, {
      method: "PATCH",
      body: JSON.stringify({
        unsubscribed: false,
        ...(firstName ? { first_name: firstName } : {}),
      }),
    });
    try {
      await updateContactTopics(normalized, {
        product: opts.product,
        launches: opts.launches,
      });
    } catch (e) {
      console.warn("[resend] topic update:", e);
    }
  } else {
    const created = await resendFetch("/contacts", {
      method: "POST",
      body: JSON.stringify({
        email: normalized,
        unsubscribed: false,
        ...(firstName ? { first_name: firstName } : {}),
        segments: RESEND_SEGMENT_ID ? [{ id: RESEND_SEGMENT_ID }] : undefined,
        topics: [...topics],
      }),
    });
    id = created.id as string | undefined;
  }

  await addContactToSegment(normalized);

  const shouldWelcome =
    opts.sendWelcome !== false && (!alreadySubscribed || wasUnsubscribed);

  if (shouldWelcome) {
    try {
      await sendWelcomeEmail(normalized, firstName);
    } catch (e) {
      console.warn("[resend] welcome email:", e);
    }
  }

  return {
    id,
    created: !existing,
    alreadySubscribed,
  };
}

function welcomeHtml(firstName?: string): string {
  const name = firstName || "there";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="dark" />
  <title>Welcome to sol.new</title>
</head>
<body style="margin:0;padding:0;background:#000;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#000;">
    <tr>
      <td align="center" style="padding:40px 16px;background:linear-gradient(180deg,#1a0b2e 0%,#000 55%);">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:520px;background:#0c0c12;border:1px solid rgba(168,85,247,0.25);border-radius:16px;">
          <tr>
            <td style="padding:36px 28px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;text-align:center;">
              <img src="https://sol.new/icon-192.png" width="64" height="64" alt="" style="border-radius:16px;margin-bottom:16px;" />
              <div style="font-size:22px;font-weight:700;color:#fff;margin-bottom:6px;">
                Welcome to sol<span style="color:#a855f7;">.new</span>
              </div>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#a1a1aa;">
                Hey ${escapeHtml(name)} — you’re in. Create a token, NFT, or wallet on Solana in under a minute.
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto 28px;">
                <tr>
                  <td style="border-radius:999px;background:linear-gradient(90deg,#a855f7,#fb923c);">
                    <a href="https://sol.new" style="display:inline-block;padding:14px 28px;font-size:14px;font-weight:600;color:#fff;text-decoration:none;">
                      Start creating
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:12px;color:#6b6b76;line-height:1.6;">
                <a href="${SITE_URL}/unsubscribe" style="color:#8a8a96;">Unsubscribe</a>
                ·
                <a href="${SITE_URL}/unsubscribe" style="color:#8a8a96;">Preferences</a>
                ·
                <a href="${SITE_URL}/privacy" style="color:#8a8a96;">Privacy</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendWelcomeEmail(email: string, firstName?: string) {
  return sendEmail({
    to: email,
    subject: "You’re on the sol.new list",
    html: welcomeHtml(firstName),
    text: `Hey ${firstName || "there"} — you’re on the sol.new mailing list. Create a token, NFT, or wallet on Solana in under a minute: ${SITE_URL}\n\nUnsubscribe: ${SITE_URL}/unsubscribe`,
    listUnsubscribe: true,
    tags: [
      { name: "category", value: "welcome" },
      { name: "list", value: "mailing" },
    ],
  });
}
