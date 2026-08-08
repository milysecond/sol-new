import { permanentRedirect } from "next/navigation";

// /track → /address (pretty) or bare address scan
export default async function TrackRedirect({
  searchParams,
}: {
  searchParams: Promise<{ wallet?: string; address?: string }>;
}) {
  const sp = await searchParams;
  const wallet = sp.wallet || sp.address;
  if (wallet) permanentRedirect(`/address/${encodeURIComponent(wallet)}`);
  permanentRedirect("/address");
}
