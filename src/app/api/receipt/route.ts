import { NextRequest, NextResponse } from "next/server";
import type { ReceiptData, ReceiptStatus, ReceiptType } from "@/lib/receipt";
import { mainnetRpcUrl } from "@/lib/rpc-server";

const SYSTEM_PROGRAM = "11111111111111111111111111111111";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const MEMO_PROGRAM_V1 = "Memo1UhkJBfCR6MNB4NQ1jwYtGUCAm5nC2cLo868Kcv";
const MEMO_PROGRAM_V2 = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const SOL_MINT = "So11111111111111111111111111111111111111112";
const SOL_LOGO =
  "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png";

const SIG_RE = /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{87,88}$/;

/**
 * Ordered RPC list. Prefer secret-backed endpoints first. Public nodes keep
 * older slots when private caches miss.
 */
function rpcEndpoints(): string[] {
  const list: string[] = [mainnetRpcUrl()];
  for (const envKey of [
    "MAINNET_RPC",
    "FLUXRPC_URL",
    "NEXT_PUBLIC_RPC_MAINNET",
    "NEXT_PUBLIC_RPC_URL",
    "SOLANA_RPC_URL",
  ] as const) {
    const v = process.env[envKey];
    if (v) list.push(v);
  }
  list.push(
    "https://solana-rpc.publicnode.com",
    "https://api.mainnet-beta.solana.com",
    "https://rpc.ankr.com/solana",
  );
  // de-dupe while preserving order
  return [...new Set(list)];
}

function isCacheMiss(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("not available in cache") ||
    m.includes("historical data") ||
    m.includes("transaction history") ||
    m.includes("long term storage") ||
    m.includes("pruned")
  );
}

async function fetchParsedTransaction(
  signature: string,
): Promise<{ tx: ParsedTx } | { error: string; status: number }> {
  let lastError: string | null = null;
  let sawCacheMiss = false;
  let sawNull = false;

  for (const rpc of rpcEndpoints()) {
    try {
      const rpcRes = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getTransaction",
          params: [
            signature,
            {
              encoding: "jsonParsed",
              maxSupportedTransactionVersion: 0,
              commitment: "confirmed",
            },
          ],
        }),
        signal: AbortSignal.timeout(12_000),
      });

      if (!rpcRes.ok) {
        lastError = `RPC HTTP ${rpcRes.status}`;
        continue;
      }

      const rpcData = (await rpcRes.json()) as {
        result?: ParsedTx | null;
        error?: { message: string; code?: number };
      };

      if (rpcData.error) {
        lastError = rpcData.error.message;
        if (isCacheMiss(rpcData.error.message)) {
          sawCacheMiss = true;
          continue; // try next provider
        }
        // other RPC errors: still try next, but keep message
        continue;
      }

      if (!rpcData.result) {
        sawNull = true;
        continue;
      }

      return { tx: rpcData.result };
    } catch (e) {
      lastError = e instanceof Error ? e.message : "RPC request failed";
      continue;
    }
  }

  if (sawCacheMiss || sawNull) {
    return {
      error:
        "Transaction not found on available RPCs. It may be too old, on another cluster, or not yet indexed. Check the signature on Solscan and try again.",
      status: 404,
    };
  }

  return {
    error: lastError || "Failed to fetch transaction from all RPCs",
    status: 502,
  };
}

interface AccountKey {
  pubkey: string;
  signer: boolean;
  writable: boolean;
}

interface TokenBalance {
  accountIndex: number;
  mint: string;
  uiTokenAmount: {
    amount: string;
    decimals: number;
    uiAmount: number | null;
  };
  owner?: string;
}

interface Instruction {
  programId?: string;
  program?: string;
  parsed?: {
    type: string;
    info: Record<string, unknown>;
  };
}

interface ParsedTx {
  slot: number;
  blockTime: number | null;
  meta: {
    err: unknown | null;
    fee: number;
    preBalances: number[];
    postBalances: number[];
    preTokenBalances?: TokenBalance[];
    postTokenBalances?: TokenBalance[];
    logMessages?: string[];
  };
  transaction: {
    message: {
      accountKeys: AccountKey[];
      instructions: Instruction[];
    };
  };
}

function extractMemo(logs: string[] | undefined, instructions: Instruction[]): string | null {
  if (logs) {
    for (const log of logs) {
      const m1 = log.match(/^Program log: Memo \(len \d+\): "(.*)"$/);
      if (m1) return m1[1];
      if (log.includes("Program log: Memo")) {
        const m2 = log.match(/"([^"]*)"/);
        if (m2?.[1]) return m2[1];
      }
    }
    for (let i = 0; i < logs.length - 1; i++) {
      if (logs[i].includes(`${MEMO_PROGRAM_V2} invoke`) || logs[i].includes(`${MEMO_PROGRAM_V1} invoke`)) {
        const next = logs[i + 1];
        if (next?.includes("Program log:")) {
          const m = next.match(/"([^"]*)"/);
          if (m?.[1]) return m[1];
        }
      }
    }
  }

  for (const ix of instructions) {
    const pid = ix.programId || "";
    if (pid === MEMO_PROGRAM_V1 || pid === MEMO_PROGRAM_V2) {
      if (typeof ix.parsed === "string") return ix.parsed;
      const info = ix.parsed && (ix.parsed as { info?: unknown }).info;
      if (typeof info === "string") return info;
    }
  }
  return null;
}

async function resolveToken(mint: string): Promise<{
  symbol: string;
  decimals: number;
  logoURI: string | null;
}> {
  try {
    const res = await fetch(`https://tokens.jup.ag/token/${mint}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        symbol?: string;
        decimals?: number;
        logoURI?: string;
      };
      return {
        symbol: data.symbol || `${mint.slice(0, 4)}…`,
        decimals: data.decimals ?? 9,
        logoURI: data.logoURI || null,
      };
    }
  } catch {
    // ignore
  }
  return { symbol: `${mint.slice(0, 4)}…`, decimals: 9, logoURI: null };
}

async function getUsdPrice(mint: string): Promise<number | null> {
  try {
    // Same endpoint sol.new/api/costs uses
    const res = await fetch(`https://lite-api.jup.ag/price/v3?ids=${mint}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = (await res.json()) as Record<string, { usdPrice?: number } | undefined>;
      const p = data?.[mint]?.usdPrice;
      if (typeof p === "number") return p;
    }
  } catch {
    // ignore
  }
  return null;
}

export async function GET(request: NextRequest) {
  const signature = request.nextUrl.searchParams.get("signature")?.trim();
  if (!signature) {
    return NextResponse.json({ error: "Missing signature parameter" }, { status: 400 });
  }
  if (!SIG_RE.test(signature)) {
    return NextResponse.json({ error: "Invalid signature format" }, { status: 400 });
  }

  try {
    const fetched = await fetchParsedTransaction(signature);
    if ("error" in fetched) {
      return NextResponse.json({ error: fetched.error }, { status: fetched.status });
    }

    const tx = fetched.tx;
    const meta = tx.meta;
    const message = tx.transaction.message;
    const accountKeys = message.accountKeys;
    const postTokenBalances = meta.postTokenBalances || [];

    const status: ReceiptStatus = meta.err ? "failed" : "finalized";
    const errorMsg = meta.err ? JSON.stringify(meta.err) : null;
    const from =
      accountKeys.find((k) => k.signer)?.pubkey || accountKeys[0]?.pubkey || "";
    const memo = extractMemo(meta.logMessages, message.instructions);

    let type: ReceiptType = "unknown";
    let to: string | null = null;
    let amount = 0;
    let tokenMint: string | null = null;
    let tokenSymbol = "SOL";
    let tokenDecimals = 9;
    let tokenLogoURI: string | null = null;
    let programId = "";

    for (const ix of message.instructions) {
      if (ix.program === "system" && ix.parsed?.type === "transfer") {
        type = "sol-transfer";
        const info = ix.parsed.info;
        to = (info.destination as string) || null;
        amount = Number(info.lamports) || 0;
        programId = SYSTEM_PROGRAM;
        break;
      }

      if (
        ix.program === "spl-token" &&
        (ix.parsed?.type === "transfer" || ix.parsed?.type === "transferChecked")
      ) {
        type = "spl-transfer";
        const info = ix.parsed.info;
        programId = TOKEN_PROGRAM;

        if (ix.parsed.type === "transferChecked") {
          const ta = info.tokenAmount as { amount?: string; decimals?: number } | undefined;
          amount = Number(ta?.amount) || 0;
          tokenDecimals = Number(ta?.decimals) || 0;
          tokenMint = (info.mint as string) || null;
        } else {
          amount = Number(info.amount) || 0;
        }

        const destAccount = info.destination as string;
        if (destAccount) {
          const destIndex = accountKeys.findIndex((k) => k.pubkey === destAccount);
          const postBalance = postTokenBalances.find((b) => b.accountIndex === destIndex);
          to = postBalance?.owner || destAccount;
        }

        // Prefer authority as from when present
        const authority = (info.authority || info.source) as string | undefined;
        if (authority && accountKeys.some((k) => k.pubkey === authority)) {
          // keep signer-based from; authority may be a token account
        }
        break;
      }
    }

    // Fallback: largest positive SOL balance change (excluding fee payer net of fee)
    if (type === "unknown" && accountKeys.length >= 2) {
      let maxGain = 0;
      let recipientIdx = -1;
      for (let i = 0; i < accountKeys.length; i++) {
        const gain = meta.postBalances[i] - meta.preBalances[i];
        if (gain > maxGain) {
          maxGain = gain;
          recipientIdx = i;
        }
      }
      if (recipientIdx >= 0 && maxGain > 0) {
        type = "sol-transfer";
        to = accountKeys[recipientIdx].pubkey;
        amount = maxGain;
        programId = SYSTEM_PROGRAM;
      }
    }

    if (type === "spl-transfer" && !tokenMint && postTokenBalances.length > 0) {
      tokenMint = postTokenBalances[0].mint;
      tokenDecimals = postTokenBalances[0].uiTokenAmount.decimals;
      if (!amount && postTokenBalances[0].uiTokenAmount.amount) {
        // leave amount as parsed from instruction
      }
    }

    if (type === "spl-transfer" && tokenMint) {
      const metaInfo = await resolveToken(tokenMint);
      tokenSymbol = metaInfo.symbol;
      if (tokenDecimals === 0) tokenDecimals = metaInfo.decimals;
      tokenLogoURI = metaInfo.logoURI;
    }

    if (type === "sol-transfer") {
      tokenMint = SOL_MINT;
      tokenSymbol = "SOL";
      tokenDecimals = 9;
      tokenLogoURI = SOL_LOGO;
    }

    let usdPrice: number | null = null;
    let usdValue: number | null = null;
    const priceMint = tokenMint || SOL_MINT;
    usdPrice = await getUsdPrice(priceMint);
    if (usdPrice != null) {
      const display =
        type === "sol-transfer"
          ? amount / 1e9
          : amount / Math.pow(10, tokenDecimals || 9);
      usdValue = display * usdPrice;
    }

    const body: ReceiptData = {
      signature,
      status,
      timestamp: tx.blockTime || 0,
      slot: tx.slot,
      fee: meta.fee,
      from,
      to,
      amount,
      tokenSymbol,
      tokenMint,
      tokenDecimals,
      tokenLogoURI,
      usdValue,
      usdPrice,
      memo,
      programId,
      type,
      error: errorMsg,
    };

    return NextResponse.json(body, {
      headers: {
        "Cache-Control": "public, max-age=60, s-maxage=300",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch transaction";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
