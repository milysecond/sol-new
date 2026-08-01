import { NextRequest, NextResponse } from "next/server";
import { mainnetRpcUrl } from "@/lib/rpc-server";

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const BPF_UPGRADEABLE = "BPFLoaderUpgradeab1e11111111111111111111111";

function heliusRpc() {
  return mainnetRpcUrl();
}

async function rpc<T = unknown>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(heliusRpc(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(10_000),
  });
  const j = (await res.json()) as { result?: T; error?: { message: string } };
  if (j.error) throw new Error(j.error.message);
  return j.result as T;
}

async function getAccountInfo(address: string) {
  const r = await rpc<{ value: any }>("getAccountInfo", [address, { encoding: "base64" }]);
  return r?.value ?? null;
}

function classifyAccount(info: any): "program" | "token" | "wallet" {
  if (!info) return "wallet";
  if (info.executable) return "program";
  if (info.owner === TOKEN_PROGRAM || info.owner === TOKEN_2022_PROGRAM) {
    const bytes = Buffer.from(info.data[0], "base64").length;
    if (bytes <= 200) return "token"; // mint=82, token acct=165
  }
  return "wallet";
}

// ── Program ──────────────────────────────────────────────────────────────────


function pubkeyFromBytes(bytes: Uint8Array, offset: number): string {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const slice = bytes.slice(offset, offset + 32);
  const digits: number[] = [0];
  for (const byte of slice) {
    let carry = byte;
    for (let i = digits.length - 1; i >= 0; i--) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.unshift(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let result = "";
  for (let i = 0; slice[i] === 0; i++) result += "1";
  for (const d of digits) result += ALPHABET[d];
  return result;
}

async function scanProgram(address: string, info: any) {
  let upgradeable = false;
  let upgradeAuthority: string | null = null;
  let deploySlot: number | null = null;
  let programDataAddress: string | null = null;

  if (info.owner === BPF_UPGRADEABLE) {
    try {
      const raw = Buffer.from(info.data[0], "base64");
      // Program account layout: [4 discriminator][32 programdata pubkey]
      if (raw.length >= 36) {
        programDataAddress = pubkeyFromBytes(raw, 4);
        const pdInfo = await getAccountInfo(programDataAddress);
        if (pdInfo) {
          const pdRaw = Buffer.from(pdInfo.data[0], "base64");
          // ProgramData layout: [4 disc][8 slot][1 has_authority][32 authority]
          if (pdRaw.length >= 45) {
            deploySlot = Number(pdRaw.readBigUInt64LE(4));
            const hasAuthority = pdRaw[12] === 1;
            upgradeable = true;
            upgradeAuthority = hasAuthority ? pubkeyFromBytes(pdRaw, 13) : null;
          }
        }
      }
    } catch {
      // non-upgradeable or parse error
    }
  }

  // Try programwatch API
  const pwData = await fetch(`https://api.programwatch.xyz/v1/programs/${address}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(5_000),
  })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);

  return {
    type: "program" as const,
    address,
    upgradeable,
    upgradeAuthority,
    deploySlot,
    programDataAddress,
    programwatchData: pwData,
    programwatchUrl: `https://programwatch.xyz/program/${address}`,
    solscanUrl: `https://solscan.io/account/${address}`,
    explorerUrl: `https://explorer.solana.com/address/${address}`,
  };
}

// ── Token ─────────────────────────────────────────────────────────────────────

type RugcheckReport = {
  mint?: string;
  tokenMeta?: { name?: string; symbol?: string; uri?: string; mutable?: boolean; updateAuthority?: string };
  token?: { mintAuthority?: string | null; freezeAuthority?: string | null; supply?: string; decimals?: number; isInitialized?: boolean };
  fileMeta?: { description?: string; image?: string; name?: string; symbol?: string };
  topHolders?: { address: string; pct?: number }[];
  markets?: unknown[];
  score?: number;
  risks?: { name: string; level: string; description: string }[];
  rugged?: boolean;
};

async function scanToken(address: string) {
  const [rugcheck, jup, sigs] = await Promise.allSettled([
    fetch(`https://api.rugcheck.xyz/v1/tokens/${address}/report`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    }).then((r) => (r.ok ? (r.json() as Promise<RugcheckReport>) : null)),

    fetch(`https://tokens.jup.ag/token/${address}`, {
      signal: AbortSignal.timeout(5_000),
    }).then((r) => (r.ok ? r.json() : null)),

    rpc<{ signature: string; blockTime: number | null }[]>("getSignaturesForAddress", [
      address,
      { limit: 1000 },
    ]).catch(() => null),
  ]);

  const rc: RugcheckReport | null = rugcheck.status === "fulfilled" ? rugcheck.value : null;
  const jupData = jup.status === "fulfilled" ? (jup.value as { decimals?: number; name?: string; symbol?: string; logoURI?: string } | null) : null;
  const sigsData = sigs.status === "fulfilled" ? (sigs.value as { signature: string; blockTime: number | null }[] | null) : null;

  // Creation date from oldest signature
  let createdAt: string | null = null;
  if (Array.isArray(sigsData) && sigsData.length > 0) {
    const oldest = sigsData[sigsData.length - 1];
    if (oldest?.blockTime) {
      createdAt = new Date(oldest.blockTime * 1000).toISOString();
    }
  }

  // Fetch metadata JSON from URI for description/image when rugcheck doesn't have it
  let fileMeta: { description?: string; image?: string; name?: string } | null =
    rc?.fileMeta ? { description: rc.fileMeta.description, image: rc.fileMeta.image, name: rc.fileMeta.name } : null;
  const metaUri: string | null = rc?.tokenMeta?.uri ?? null;
  if (!fileMeta && metaUri) {
    fileMeta = await fetch(metaUri, { signal: AbortSignal.timeout(5_000) })
      .then((r) => (r.ok ? (r.json() as Promise<{ description?: string; image?: string; name?: string }>) : null))
      .catch(() => null);
  }

  const supply = rc?.token?.supply ?? null;
  const decimals = rc?.token?.decimals ?? jupData?.decimals ?? 0;
  const mintAuthority: string | null = rc?.token?.mintAuthority ?? null;
  const freezeAuthority: string | null = rc?.token?.freezeAuthority ?? null;
  const name: string =
    rc?.tokenMeta?.name ?? fileMeta?.name ?? jupData?.name ?? address.slice(0, 8);
  const symbol: string = rc?.tokenMeta?.symbol ?? jupData?.symbol ?? "???";
  const imageUrl: string | null =
    fileMeta?.image ?? jupData?.logoURI ?? null;
  const description: string | null = fileMeta?.description ?? null;
  const mutable: boolean = rc?.tokenMeta?.mutable ?? false;
  const updateAuthority: string | null = rc?.tokenMeta?.updateAuthority ?? null;

  let supplyFormatted: string | null = null;
  if (supply != null) {
    const n = Number(supply) / Math.pow(10, decimals);
    supplyFormatted = n >= 1_000_000_000
      ? `${(n / 1_000_000_000).toFixed(2)}B`
      : n >= 1_000_000
      ? `${(n / 1_000_000).toFixed(2)}M`
      : n >= 1_000
      ? `${(n / 1_000).toFixed(2)}K`
      : n.toLocaleString();
  }

  return {
    type: "token" as const,
    address,
    name,
    symbol,
    decimals,
    supply: supplyFormatted,
    supplyRaw: supply,
    mintAuthority,
    freezeAuthority,
    mintable: mintAuthority !== null,
    freezable: freezeAuthority !== null,
    mutable,
    updateAuthority,
    metadataUri: metaUri,
    imageUrl,
    description,
    score: rc?.score ?? null,
    risks: rc?.risks ?? [],
    rugged: rc?.rugged ?? false,
    createdAt,
    topHolders: (rc?.topHolders ?? []).slice(0, 10),
    markets: (rc?.markets ?? []).slice(0, 5),
    rugcheckUrl: `https://rugcheck.xyz/tokens/${address}`,
    solscanUrl: `https://solscan.io/token/${address}`,
    jupiterUrl: `https://jup.ag/tokens/${address}`,
    dexscreenerUrl: `https://dexscreener.com/solana/${address}`,
  };
}

// ── Handler ───────────────────────────────────────────────────────────────────

const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address")?.trim() ?? "";
  if (!address) return NextResponse.json({ error: "Missing address" }, { status: 400 });
  if (!BASE58_RE.test(address)) return NextResponse.json({ error: "Invalid Solana address" }, { status: 400 });

  try {
    const info = await getAccountInfo(address);
    const type = classifyAccount(info);

    if (type === "program") {
      const data = await scanProgram(address, info);
      return NextResponse.json(data);
    }

    if (type === "token") {
      const data = await scanToken(address);
      return NextResponse.json(data, {
        headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" },
      });
    }

    // Wallet: prefer Jupiter holdings for SOL/USDC, fall back to RPC
    let sol = 0;
    let usdc: number | null = 0;
    try {
      const { jupConfigured, jupHoldings } = await import("@/lib/jup-portfolio");
      if (jupConfigured()) {
        const h = await jupHoldings(address);
        sol = (h.uiAmount ?? Number(h.uiAmountString)) || 0;
        const usdcAccounts = h.tokens?.["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"];
        if (usdcAccounts?.length) {
          usdc = usdcAccounts.reduce(
            (s, a) => s + ((a.uiAmount ?? Number(a.uiAmountString)) || 0),
            0
          );
        } else usdc = 0;
      } else {
        throw new Error("no jup");
      }
    } catch {
      try {
        const bal = await rpc<{ value: number }>("getBalance", [address]);
        sol = (bal?.value ?? 0) / 1e9;
      } catch {
        sol = 0;
      }
      try {
        const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
        const { PublicKey } = await import("@solana/web3.js");
        const { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } = await import(
          "@solana/spl-token"
        );
        const owner = new PublicKey(address);
        const ata = getAssociatedTokenAddressSync(new PublicKey(USDC), owner, true, TOKEN_PROGRAM_ID);
        const tb = await rpc<{ value?: { uiAmount?: number | null; uiAmountString?: string } }>(
          "getTokenAccountBalance",
          [ata.toBase58()]
        );
        const ui = tb?.value?.uiAmount;
        usdc =
          typeof ui === "number"
            ? ui
            : tb?.value?.uiAmountString != null
              ? Number(tb.value.uiAmountString)
              : 0;
        if (!Number.isFinite(usdc)) usdc = 0;
      } catch {
        usdc = 0;
      }
    }

    return NextResponse.json(
      {
        type: "wallet",
        address,
        sol,
        usdc,
        balances: { sol, usdc },
      },
      { headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60" } }
    );
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
