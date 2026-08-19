import { permanentRedirect } from "next/navigation";

type Props = { params: Promise<{ address: string }> };

export default async function ExplorerAddressAlias({ params }: Props) {
  const { address } = await params;
  permanentRedirect(`/address/${encodeURIComponent(address)}`);
}
