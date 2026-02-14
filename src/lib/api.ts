const API_BASE = "https://api.metasal.xyz/api";

export async function uploadImage(file: File): Promise<{ ipfs: string; preview: string }> {
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
  // Build metadata with proper field names for token standard
  const metadata: any = {
    name: meta.name,
    symbol: meta.symbol,
    description: meta.description || "",
    image: meta.image || "",
    createdAt: "sol.new",
  };
  
  // Add external_url (standard field for website)
  if (meta.website) {
    metadata.external_url = meta.website;
  }
  
  // Add social links in a links object (common pattern)
  const links: any = {};
  if (meta.twitter) links.twitter = meta.twitter;
  if (meta.telegram) links.telegram = meta.telegram;
  if (Object.keys(links).length > 0) {
    metadata.links = links;
  }

  const res = await fetch(`${API_BASE}/metadata`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(metadata),
  });
  if (!res.ok) throw new Error("Metadata upload failed");
  const data = await res.json();
  return {
    id: data.id,
    uri: data.gateways?.irys || `https://gateway.irys.xyz/${data.id}`,
  };
}
