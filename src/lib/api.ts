const API_BASE = "https://api.metasal.xyz/api";

export async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append("image", file);
  const res = await fetch(`${API_BASE}/upload`, { method: "POST", body: form });
  if (!res.ok) throw new Error("Image upload failed");
  const url = await res.text();
  return url.trim();
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
  const res = await fetch(`${API_BASE}/metadata`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...meta, createdAt: "sol.new" }),
  });
  if (!res.ok) throw new Error("Metadata upload failed");
  const data = await res.json();
  return {
    id: data.id,
    uri: data.gateways?.irys || `https://gateway.irys.xyz/${data.id}`,
  };
}
