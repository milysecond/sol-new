const API_BASE = "https://api.metasal.xyz/api";

async function ensureTreasuryFunded(): Promise<void> {
  try {
    const res = await fetch("/api/treasury-balance", { cache: "no-store" });
    if (!res.ok) return; // don't block on diagnostic failures
    const data = await res.json();
    if (data.low) {
      throw new Error("Storage treasury empty — uploads paused. Top up the treasury wallet.");
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Storage treasury")) throw err;
    // network glitch — let the actual upload try
  }
}

export async function uploadImage(file: File): Promise<{ ipfs: string; preview: string }> {
  await ensureTreasuryFunded();
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
  // Build metadata matching Jupiter/standard format (top-level fields)
  const metadata: any = {
    name: meta.name,
    symbol: meta.symbol,
    description: meta.description || "",
    image: meta.image || "",
    createdOn: "sol.new",
  };
  
  if (meta.website) metadata.website = meta.website;
  if (meta.twitter) metadata.twitter = meta.twitter;
  if (meta.telegram) metadata.telegram = meta.telegram;

  await ensureTreasuryFunded();

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
