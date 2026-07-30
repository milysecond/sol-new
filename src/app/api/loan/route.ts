import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import {
  jupLendConfigured,
  jupEarnTokens,
  jupEarnPositions,
  jupEarnEarnings,
  jupEarnDeposit,
  jupEarnWithdraw,
  jupBorrowVaults,
  jupBorrowPositions,
  jupBorrowOperate,
} from "@/lib/jup-lend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

function badWallet(w: string): boolean {
  try {
    new PublicKey(w);
    return false;
  } catch {
    return true;
  }
}

/** GET ?mode=earn|borrow&wallet= */
export async function GET(req: NextRequest) {
  if (!jupLendConfigured()) {
    return NextResponse.json(
      { ok: false, configured: false, error: "Loan is not available" },
      { headers: noStore }
    );
  }

  const mode = req.nextUrl.searchParams.get("mode") === "borrow" ? "borrow" : "earn";
  const wallet = req.nextUrl.searchParams.get("wallet")?.trim() || "";
  const market = req.nextUrl.searchParams.get("market")?.trim() || "main";

  try {
    if (mode === "earn") {
      const tokens = await jupEarnTokens();
      if (!tokens.ok) {
        return NextResponse.json(
          { ok: false, configured: true, error: "Could not load earn vaults", details: tokens.data },
          { status: 502, headers: noStore }
        );
      }
      let positions: unknown = null;
      let earnings: unknown = null;
      if (wallet && !badWallet(wallet)) {
        const [p, e] = await Promise.all([
          jupEarnPositions(wallet),
          jupEarnEarnings(wallet),
        ]);
        if (p.ok) positions = p.data;
        if (e.ok) earnings = e.data;
      }
      return NextResponse.json(
        { ok: true, configured: true, mode: "earn", tokens: tokens.data, positions, earnings },
        { headers: noStore }
      );
    }

    // borrow
    const vaults = await jupBorrowVaults(market);
    if (!vaults.ok) {
      return NextResponse.json(
        { ok: false, configured: true, error: "Could not load borrow vaults", details: vaults.data },
        { status: 502, headers: noStore }
      );
    }
    let positions: unknown = null;
    if (wallet && !badWallet(wallet)) {
      const p = await jupBorrowPositions(wallet, market);
      if (p.ok) positions = p.data;
    }
    return NextResponse.json(
      {
        ok: true,
        configured: true,
        mode: "borrow",
        market,
        vaults: vaults.data,
        positions,
      },
      { headers: noStore }
    );
  } catch (e) {
    console.error("[api/loan GET]", e);
    return NextResponse.json(
      { ok: false, configured: true, error: e instanceof Error ? e.message : "Loan request failed" },
      { status: 502, headers: noStore }
    );
  }
}

/**
 * POST body:
 * Earn:  { mode:"earn", action:"deposit"|"withdraw", wallet, asset, amount }
 * Borrow:{ mode:"borrow", wallet, vaultId, positionId, colAmount, debtAmount, market? }
 */
export async function POST(req: NextRequest) {
  if (!jupLendConfigured()) {
    return NextResponse.json(
      { error: "Loan is not available", configured: false },
      { status: 503, headers: noStore }
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    mode?: string;
    action?: string;
    wallet?: string;
    asset?: string;
    amount?: string;
    vaultId?: number;
    positionId?: number;
    colAmount?: string;
    debtAmount?: string;
    market?: string;
  };

  const wallet = body.wallet?.trim() || "";
  if (!wallet || badWallet(wallet)) {
    return NextResponse.json({ error: "Invalid wallet" }, { status: 400, headers: noStore });
  }

  try {
    if (body.mode === "borrow") {
      const vaultId = Number(body.vaultId);
      const positionId = body.positionId == null ? 0 : Number(body.positionId);
      const colAmount = String(body.colAmount ?? "0");
      const debtAmount = String(body.debtAmount ?? "0");
      if (!Number.isFinite(vaultId) || vaultId <= 0) {
        return NextResponse.json({ error: "Invalid vault" }, { status: 400, headers: noStore });
      }
      if (!/^-?\d+$/.test(colAmount) || !/^-?\d+$/.test(debtAmount)) {
        return NextResponse.json(
          { error: "Amounts must be integer base units" },
          { status: 400, headers: noStore }
        );
      }
      const op = await jupBorrowOperate({
        vaultId,
        positionId: Number.isFinite(positionId) ? positionId : 0,
        signer: wallet,
        colAmount,
        debtAmount,
        market: body.market || "main",
      });
      if (!op.ok || !(op.data as { transaction?: string }).transaction) {
        const d = op.data as { message?: string; error?: string };
        return NextResponse.json(
          {
            error: d.message || d.error || "Could not build borrow transaction",
            details: op.data,
          },
          { status: op.status >= 400 ? op.status : 502, headers: noStore }
        );
      }
      return NextResponse.json(
        {
          ok: true,
          mode: "borrow",
          transaction: (op.data as { transaction: string }).transaction,
          nftId: (op.data as { nftId?: number }).nftId,
        },
        { headers: noStore }
      );
    }

    // earn default
    const action = body.action === "withdraw" ? "withdraw" : "deposit";
    const asset = body.asset?.trim() || "";
    const amount = String(body.amount ?? "").trim();
    if (!asset) {
      return NextResponse.json({ error: "Missing asset mint" }, { status: 400, headers: noStore });
    }
    if (!/^\d+$/.test(amount) || amount === "0") {
      return NextResponse.json(
        { error: "Amount must be positive base units" },
        { status: 400, headers: noStore }
      );
    }
    const res =
      action === "withdraw"
        ? await jupEarnWithdraw({ asset, signer: wallet, amount })
        : await jupEarnDeposit({ asset, signer: wallet, amount });

    if (!res.ok || !(res.data as { transaction?: string }).transaction) {
      const d = res.data as { message?: string; error?: string };
      return NextResponse.json(
        {
          error: d.message || d.error || `Could not build ${action} transaction`,
          details: res.data,
        },
        { status: res.status >= 400 ? res.status : 502, headers: noStore }
      );
    }
    return NextResponse.json(
      {
        ok: true,
        mode: "earn",
        action,
        transaction: (res.data as { transaction: string }).transaction,
      },
      { headers: noStore }
    );
  } catch (e) {
    console.error("[api/loan POST]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Loan request failed" },
      { status: 502, headers: noStore }
    );
  }
}
