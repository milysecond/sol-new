import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import crypto from "crypto";
import { db, initDb, saveMetadata } from "@/lib/db";
import {
  checkGeoLock,
  isGeoLocked,
  isPoapOpen,
  publicGeoSummary,
  rowToDrop,
  type PoapDrop,
} from "@/lib/poap";
import { mintCompressedNft } from "@/lib/mint-cnft";
import { notifyEvent } from "@/lib/notify";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ code: string }> };

const DEFAULT_IMAGE = "https://sol.new/poap/opengraph-image";

function originFrom(req: NextRequest): string {
  const h = req.headers.get("x-forwarded-host");
  if (h) return `https://${h}`;
  try {
    return new URL(req.url).origin;
  } catch {
    return "https://sol.new";
  }
}

async function mintPoapCnft(
  req: NextRequest,
  drop: PoapDrop,
  wallet: string
): Promise<{ assetId: string; signature: string; metadataUri: string }> {
  const origin = originFrom(req);
  const image = drop.imageUrl || DEFAULT_IMAGE;
  const claimedAt = new Date().toISOString();
  const attributes = [
    { trait_type: "Drop", value: drop.code },
    { trait_type: "Issuer", value: drop.issuer },
    { trait_type: "Claimed", value: claimedAt.slice(0, 10) },
  ];
  if (drop.location) attributes.push({ trait_type: "Location", value: drop.location });
  if (isGeoLocked(drop)) attributes.push({ trait_type: "Geo-locked", value: "yes" });

  const metaBody = {
    name: drop.title.slice(0, 32),
    symbol: "POAP",
    description: (
      drop.description ||
      `Proof of attendance · ${drop.title} · sol.new/poap/${drop.code}`
    ).slice(0, 800),
    image,
    external_url: `${origin}/poap/${drop.code}`,
    attributes,
    properties: {
      category: "image",
      files: [{ uri: image, type: "image/png" }],
    },
    collection: { name: "sol.new POAP", family: "sol.new" },
    creator: drop.issuer,
  };

  const id = crypto.randomBytes(8).toString("hex");
  await saveMetadata(id, JSON.stringify(metaBody), wallet);
  const metadataUri = `${origin}/metadata/${id}.json`;

  const mint = await mintCompressedNft({
    owner: wallet,
    name: drop.title.slice(0, 32),
    symbol: "POAP",
    uri: metadataUri,
    description: metaBody.description,
    network: "mainnet",
    externalUrl: metaBody.external_url,
    attributes,
  });

  return { ...mint, metadataUri };
}

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    await initDb();
    const { code: raw } = await ctx.params;
    const code = (raw || "").trim().toLowerCase();
    if (!/^[a-z0-9]{4,16}$/.test(code)) {
      return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }
    const rs = await db.execute({
      sql: `SELECT * FROM poap_drops WHERE code = ? LIMIT 1`,
      args: [code],
    });
    if (!rs.rows.length) {
      return NextResponse.json({ error: "Drop not found" }, { status: 404 });
    }
    const drop = rowToDrop(rs.rows[0] as Record<string, unknown>);
    const status = isPoapOpen(drop);

    // optional wallet= to return claim status + asset
    const wallet = req.nextUrl.searchParams.get("wallet")?.trim() || "";
    let claim: {
      claimedAt: string;
      assetId: string | null;
      mintSignature: string | null;
      metadataUri: string | null;
    } | null = null;
    if (wallet) {
      try {
        new PublicKey(wallet);
        const cr = await db.execute({
          sql: `SELECT claimed_at, asset_id, mint_signature, metadata_uri
                FROM poap_claims WHERE drop_code = ? AND wallet = ? LIMIT 1`,
          args: [code, wallet],
        });
        if (cr.rows.length) {
          const row = cr.rows[0] as unknown as Record<string, unknown>;
          claim = {
            claimedAt: String(row.claimed_at ?? ""),
            assetId: row.asset_id != null ? String(row.asset_id) : null,
            mintSignature: row.mint_signature != null ? String(row.mint_signature) : null,
            metadataUri: row.metadata_uri != null ? String(row.metadata_uri) : null,
          };
        }
      } catch {
        /* ignore bad wallet */
      }
    }

    return NextResponse.json({
      ok: true,
      drop,
      ...status,
      ...publicGeoSummary(drop),
      onchain: true,
      claim,
    });
  } catch (e) {
    console.error("poap/[code] GET", e);
    return NextResponse.json({ error: "Failed to load drop" }, { status: 500 });
  }
}

/** Claim drop → mint compressed NFT to wallet */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    await initDb();
    const { code: raw } = await ctx.params;
    const code = (raw || "").trim().toLowerCase();
    if (!/^[a-z0-9]{4,16}$/.test(code)) {
      return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }

    const body = (await req.json()) as {
      wallet?: string;
      lat?: number;
      lng?: number;
      accuracyM?: number;
    };
    const wallet = (body.wallet || "").trim();
    try {
      new PublicKey(wallet);
    } catch {
      return NextResponse.json({ error: "Valid wallet required" }, { status: 400 });
    }

    const rs = await db.execute({
      sql: `SELECT * FROM poap_drops WHERE code = ? LIMIT 1`,
      args: [code],
    });
    if (!rs.rows.length) {
      return NextResponse.json({ error: "Drop not found" }, { status: 404 });
    }
    const drop = rowToDrop(rs.rows[0] as Record<string, unknown>);
    const status = isPoapOpen(drop);
    if (!status.open) {
      return NextResponse.json({ error: status.reason || "Drop closed" }, { status: 400 });
    }

    // already claimed?
    const existing = await db.execute({
      sql: `SELECT claimed_at, asset_id, mint_signature, metadata_uri
            FROM poap_claims WHERE drop_code = ? AND wallet = ? LIMIT 1`,
      args: [code, wallet],
    });
    if (existing.rows.length) {
      const row = existing.rows[0] as unknown as Record<string, unknown>;
      let assetId = row.asset_id != null ? String(row.asset_id) : null;
      let mintSignature = row.mint_signature != null ? String(row.mint_signature) : null;
      let metadataUri = row.metadata_uri != null ? String(row.metadata_uri) : null;

      // Retry on-chain mint if prior claim was DB-only
      if (!assetId) {
        try {
          const minted = await mintPoapCnft(req, drop, wallet);
          assetId = minted.assetId;
          mintSignature = minted.signature;
          metadataUri = minted.metadataUri;
          await db.execute({
            sql: `UPDATE poap_claims SET asset_id = ?, mint_signature = ?, metadata_uri = ?
                  WHERE drop_code = ? AND wallet = ?`,
            args: [assetId, mintSignature, metadataUri, code, wallet],
          });
        } catch (e) {
          console.error("poap remint", e);
        }
      }

      return NextResponse.json({
        ok: true,
        already: true,
        drop,
        claimedAt: String(row.claimed_at ?? ""),
        assetId,
        mintSignature,
        metadataUri,
        onchain: Boolean(assetId),
      });
    }

    let claimLat: number | null = null;
    let claimLng: number | null = null;
    let claimAcc: number | null = null;
    let distanceM: number | undefined;

    if (isGeoLocked(drop)) {
      const lat = Number(body.lat);
      const lng = Number(body.lng);
      const acc = body.accuracyM != null ? Number(body.accuracyM) : null;
      const geo = checkGeoLock(drop, lat, lng, acc);
      if (!geo.ok) {
        return NextResponse.json(
          {
            error: geo.reason,
            geoLocked: true,
            distanceM: geo.distanceM,
            requiredRadiusM: drop.geoRadiusM,
          },
          { status: 403 }
        );
      }
      claimLat = lat;
      claimLng = lng;
      claimAcc = acc != null && Number.isFinite(acc) ? acc : null;
      distanceM = geo.distanceM;
    } else if (body.lat != null && body.lng != null) {
      const lat = Number(body.lat);
      const lng = Number(body.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        claimLat = lat;
        claimLng = lng;
      }
    }

    // Mint cNFT first (on-chain proof), then record claim
    let assetId: string | null = null;
    let mintSignature: string | null = null;
    let metadataUri: string | null = null;
    let mintError: string | null = null;

    try {
      const minted = await mintPoapCnft(req, drop, wallet);
      assetId = minted.assetId;
      mintSignature = minted.signature;
      metadataUri = minted.metadataUri;
    } catch (e) {
      mintError = e instanceof Error ? e.message : String(e);
      console.error("poap mint", mintError);
      // Still record attendance off-chain if mint fails — user can retry via already path
    }

    try {
      await db.execute({
        sql: `INSERT INTO poap_claims
              (drop_code, wallet, claim_lat, claim_lng, claim_accuracy_m, asset_id, mint_signature, metadata_uri)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          code,
          wallet,
          claimLat,
          claimLng,
          claimAcc,
          assetId,
          mintSignature,
          metadataUri,
        ],
      });
      await db.execute({
        sql: `UPDATE poap_drops SET claim_count = claim_count + 1 WHERE code = ?`,
        args: [code],
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("UNIQUE") || msg.includes("unique")) {
        return NextResponse.json({
          ok: true,
          already: true,
          drop,
          assetId,
          mintSignature,
          metadataUri,
          onchain: Boolean(assetId),
        });
      }
      throw e;
    }

    const updated = await db.execute({
      sql: `SELECT * FROM poap_drops WHERE code = ? LIMIT 1`,
      args: [code],
    });
    const next = rowToDrop(updated.rows[0] as Record<string, unknown>);

    if (assetId) {
      notifyEvent({
        kind: "poap_mint",
        emoji: "🎖️",
        title: "POAP minted on-chain",
        fields: {
          code,
          title: drop.title,
          wallet,
          assetId,
          signature: mintSignature,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      already: false,
      drop: next,
      claimedAt: new Date().toISOString(),
      distanceM,
      assetId,
      mintSignature,
      metadataUri,
      onchain: Boolean(assetId),
      ...(mintError && !assetId
        ? { mintError: "On-chain mint delayed — open this page again to finish minting" }
        : {}),
    });
  } catch (e) {
    console.error("poap/[code] POST", e);
    return NextResponse.json({ error: "Claim failed" }, { status: 500 });
  }
}
