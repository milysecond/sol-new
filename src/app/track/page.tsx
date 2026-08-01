import { redirect } from "next/navigation";

// /track → /address (pretty) or /scan
export default async function TrackRedirect({
  searchParams,
}: {
  searchParams: Promise<{ wallet?: string; address?: string }>;
}) {
  const sp = await searchParams;
  const wallet = sp.wallet || sp.address;
  if (wallet) redirect(`/address/${encodeURIComponent(wallet)}`);
  redirect("/address");
}
