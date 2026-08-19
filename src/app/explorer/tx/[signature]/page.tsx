import { permanentRedirect } from "next/navigation";

type Props = { params: Promise<{ signature: string }> };

export default async function ExplorerTxAlias({ params }: Props) {
  const { signature } = await params;
  permanentRedirect(`/receipt/${encodeURIComponent(signature)}`);
}
