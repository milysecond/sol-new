import { NextRequest, NextResponse } from "next/server";
import { Connection } from "@solana/web3.js";
import {
  relayerKeypair,
  parseTx,
  staticGuard,
  simulationGuard,
  quotaGuard,
  MAX_SUBSIDY_LAMPORTS,
} from "@/lib/relayer-guard";

// Kora-protocol JSON-RPC paymaster for the LazorKit SDK (see SPIKES.md SPIKE-1).
// The SDK calls exactly: getPayerSigner, getBlockhash, signTransaction,
// signAndSendTransaction — all POSTs to this one endpoint.

function rpcUrl(cluster: string | null): string {
  if (cluster === "devnet") return process.env.DEVNET_RPC || "https://api.devnet.solana.com";
  return (
    process.env.MAINNET_RPC ||
    (process.env.HELIUS_API_KEY
      ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
      : "https://api.mainnet-beta.solana.com")
  );
}

type RpcReq = { jsonrpc: "2.0"; id: number; method: string; params: unknown[] };

function ok(id: number, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id, result });
}
function err(id: number, message: string, code = -32000) {
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } });
}

export async function POST(req: NextRequest) {
  let body: RpcReq;
  try {
    body = (await req.json()) as RpcReq;
  } catch {
    return err(0, "invalid JSON", -32700);
  }
  const { id = 1, method, params = [] } = body;
  const conn = new Connection(rpcUrl(req.nextUrl.searchParams.get("cluster")), "confirmed");

  try {
    const relayer = relayerKeypair();

    switch (method) {
      case "getPayerSigner":
        return ok(id, { signer_address: relayer.publicKey.toBase58() });

      case "getBlockhash": {
        const { blockhash } = await conn.getLatestBlockhash("confirmed");
        return ok(id, { blockhash });
      }

      case "signTransaction":
      case "signAndSendTransaction": {
        const b64 = params[0];
        if (typeof b64 !== "string") return err(id, "params[0] must be a base64 transaction", -32602);
        const parsed = parseTx(b64);

        const s = staticGuard(parsed, "paymaster", relayer.publicKey.toBase58());
        if (!s.ok) return err(id, `rejected: ${s.reason}`);

        const sim = await simulationGuard(conn, parsed, relayer.publicKey.toBase58());
        if (!sim.ok) return err(id, `rejected: ${sim.reason}`);

        if (s.wallet) {
          const q = await quotaGuard(s.wallet, MAX_SUBSIDY_LAMPORTS);
          if (!q.ok) return err(id, `rejected: ${q.reason}`);
        }

        if (parsed.kind === "versioned") {
          parsed.tx.sign([relayer]);
        } else {
          parsed.tx.partialSign(relayer);
        }

        if (method === "signTransaction") {
          const signed =
            parsed.kind === "versioned"
              ? Buffer.from(parsed.tx.serialize()).toString("base64")
              : parsed.tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
          return ok(id, { signed_transaction: signed });
        }

        // Both shapes serialize fully-signed here; legacy throws if a required
        // signature is still missing, which surfaces as a JSON-RPC error.
        const raw = Buffer.from(parsed.kind === "versioned" ? parsed.tx.serialize() : parsed.tx.serialize());
        const sig = await conn.sendRawTransaction(raw, { skipPreflight: false, maxRetries: 3 });
        return ok(id, { signature: sig });
      }

      default:
        return err(id, `method not found: ${method}`, -32601);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return err(id, msg.slice(0, 200));
  }
}
