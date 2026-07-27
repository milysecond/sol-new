import { redirect } from "next/navigation";

// /track → /scan (renamed; /scan handles wallets, tokens, and programs)
export default function TrackRedirect({
  searchParams,
}: {
  searchParams: { wallet?: string };
}) {
  const wallet = searchParams.wallet;
  if (wallet) redirect(`/scan?address=${encodeURIComponent(wallet)}`);
  redirect("/scan");
}
