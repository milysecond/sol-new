import { redirect } from "next/navigation";
import { initDb, getCreatorByUsername } from "@/lib/db";
import { normalizeUsername, usernameError } from "@/lib/username";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Public profile by username → creator wallet page. */
export default async function UsernamePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username: raw } = await params;
  const username = normalizeUsername(raw || "");
  if (usernameError(username)) {
    redirect("/creator/edit");
  }

  await initDb().catch(() => {});
  const profile = await getCreatorByUsername(username);
  if (!profile?.wallet) {
    redirect(`/creator/edit?u=${encodeURIComponent(username)}`);
  }

  redirect(`/creator/${profile.wallet}`);
}
