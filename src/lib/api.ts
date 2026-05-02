export async function uploadImage(file: File): Promise<{ url: string; preview: string }> {
  const form = new FormData();
  form.append("image", file);
  const res = await fetch("/api/upload-image", { method: "POST", body: form });
  if (!res.ok) throw new Error("Image upload failed");
  return res.json();
}

export async function uploadMetadata(meta: {
  name: string;
  symbol: string;
  description?: string;
  image?: string;
  twitter?: string;
  telegram?: string;
  website?: string;
}): Promise<{ id: string; uri: string }> {
  const metadata: Record<string, string> = {
    name: meta.name,
    symbol: meta.symbol,
    description: meta.description || "",
    image: meta.image || "",
    createdOn: "sol.new",
  };
  if (meta.website) metadata.website = meta.website;
  if (meta.twitter) metadata.twitter = meta.twitter;
  if (meta.telegram) metadata.telegram = meta.telegram;

  const res = await fetch("/api/metadata", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(metadata),
  });
  if (!res.ok) throw new Error("Metadata upload failed");
  return res.json();
}
