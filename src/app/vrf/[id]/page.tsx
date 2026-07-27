import { redirect } from "next/navigation";

/** Legacy alias → /draw/[id] */
export default async function VrfIdAlias({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/draw/${id}`);
}
