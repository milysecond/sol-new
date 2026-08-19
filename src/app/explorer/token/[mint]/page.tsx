import { permanentRedirect } from "next/navigation";

type Props = { params: Promise<{ mint: string }> };

export default async function ExplorerTokenAlias({ params }: Props) {
  const { mint } = await params;
  permanentRedirect(`/token/${encodeURIComponent(mint)}`);
}
