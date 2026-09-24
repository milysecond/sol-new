const HOST = "solanaaddresses-metasal1.aws-ap-northeast-1.turso.io";

function stnkToken(): string {
  return (process.env.TURSO_SOLANAADDRESSES_AUTH_TOKEN || "").trim();
}

type Cell = { type?: string; value?: string | number | null };

async function pipeline(sqls: { sql: string; args?: { type: string; value: string }[] }[]) {
  const token = stnkToken();
  if (!token) throw new Error("STNK pool is not configured");
  const res = await fetch(`https://${HOST}/v2/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [
        ...sqls.map((s) => ({ type: "execute" as const, stmt: { sql: s.sql, args: s.args ?? [] } })),
        { type: "close" as const },
      ],
    }),
  });
  if (!res.ok) throw new Error(`STNK db ${res.status}`);
  const body = (await res.json()) as {
    results?: { type: string; response?: { result?: { rows?: Cell[][] } }; error?: { message?: string } }[];
  };
  for (const r of body.results || []) {
    if (r.type === "error" || r.error) throw new Error(r.error?.message || "STNK db error");
  }
  return (body.results || []).map((r) => r.response?.result);
}

function cell(row: Cell[] | undefined, i: number): string {
  const v = row?.[i]?.value;
  return v == null ? "" : String(v);
}

export async function claimStnkMint(): Promise<{ publicKey: string; secretKey: string } | null> {
  const [rowRes] = await pipeline([
    { sql: "SELECT public_key, private_key FROM stnk_keypairs WHERE COALESCE(consumed, 0) = 0 LIMIT 1" },
  ]);
  const row = rowRes?.rows?.[0];
  if (!row) return null;
  const publicKey = cell(row, 0);
  const secretKey = cell(row, 1);
  if (!publicKey || !secretKey) return null;
  await pipeline([
    {
      sql: "UPDATE stnk_keypairs SET consumed = 1 WHERE public_key = ? AND COALESCE(consumed, 0) = 0",
      args: [{ type: "text", value: publicKey }],
    },
  ]);
  return { publicKey, secretKey };
}

export async function releaseStnkMint(publicKey: string) {
  await pipeline([
    {
      sql: "UPDATE stnk_keypairs SET consumed = 0 WHERE public_key = ?",
      args: [{ type: "text", value: publicKey }],
    },
  ]);
}

export async function getStnkSecret(publicKey: string): Promise<string | null> {
  const [rowRes] = await pipeline([
    {
      sql: "SELECT private_key FROM stnk_keypairs WHERE public_key = ? LIMIT 1",
      args: [{ type: "text", value: publicKey }],
    },
  ]);
  const row = rowRes?.rows?.[0];
  const secret = cell(row, 0);
  return secret || null;
}
