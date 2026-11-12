/**
 * Pure decision logic for /ring actions. Given balances and the form state it
 * says whether the primary button can run, why not (always in words), or that
 * a shield from the public balance has to happen first. No React, no network.
 */
import { formatRingAmount, parseRingAmount } from "./amount";
import {
  RING_ASSETS,
  RING_FEE_RESERVE_LAMPORTS,
  RING_JOIN_COST_LAMPORTS,
  RING_LINK_FEE_LAMPORTS,
  RING_MAX_LOCAL_INPUTS,
  RING_MIN_FEE_LAMPORTS,
  type RingAssetId,
} from "./constants";

export type RingFlowAction = "shield" | "send" | "link" | "unshield";

/** State of a typed recipient address. */
export type RingRecipientState =
  | "empty"
  | "invalid"
  | "checking"
  | "lookup-failed"
  | "private-transfer"
  | "public-withdrawal";

export type RingFlowBalances = {
  registered: boolean;
  mergingEnabled: boolean;
  publicLamports: bigint;
  publicUsdc: bigint;
  assets: Record<RingAssetId, { amount: bigint; spendable: bigint; notes: number }>;
};

export type RingFlowInput = {
  action: RingFlowAction;
  asset: RingAssetId;
  amountText: string;
  /** Send and Unshield only. */
  recipient?: RingRecipientState;
  balances: RingFlowBalances | null;
};

export type RingFlowFix = "join" | "merge" | "enable-merging" | "retry-lookup";

export type RingFlowPlan =
  | { status: "loading"; reason: string }
  | { status: "blocked"; reason: string; fix?: RingFlowFix; suggestAmount?: bigint }
  | { status: "ready"; amount: bigint }
  | { status: "shield-first"; amount: bigint; shieldAmount: bigint; reason: string };

const ZERO = BigInt(0);

export function fmtRing(asset: RingAssetId, base: bigint, max = 6): string {
  return `${formatRingAmount(base, RING_ASSETS[asset].decimals, max)} ${RING_ASSETS[asset].symbol}`;
}

const sol = (lamports: bigint) => fmtRing("SOL", lamports);

function pos(v: bigint): bigint {
  return v > ZERO ? v : ZERO;
}

/** Public balance that can be shielded right now for this action, after fees. */
export function ringShieldable(b: RingFlowBalances, asset: RingAssetId, action: RingFlowAction): bigint {
  const linkFee = action === "link" ? RING_LINK_FEE_LAMPORTS : ZERO;
  if (asset === "SOL") return pos(b.publicLamports - RING_FEE_RESERVE_LAMPORTS - linkFee);
  // USDC shields still pay SOL fees.
  return b.publicLamports >= RING_MIN_FEE_LAMPORTS * BigInt(2) + linkFee ? b.publicUsdc : ZERO;
}

function canTopUp(action: RingFlowAction, recipient: RingRecipientState | undefined): boolean {
  if (action === "link") return true;
  return action === "send" && recipient === "private-transfer";
}

/** Largest amount the flow can complete (including a shield-first step where it applies). */
export function ringFlowMax(input: Omit<RingFlowInput, "amountText">): bigint | null {
  const b = input.balances;
  if (!b) return null;
  if (input.action === "shield") return ringShieldable(b, input.asset, "shield");
  const p = b.assets[input.asset];
  if (canTopUp(input.action, input.recipient) && p.notes < RING_MAX_LOCAL_INPUTS) {
    return p.amount + ringShieldable(b, input.asset, input.action);
  }
  return p.spendable;
}

export function ringJoinPlan(b: RingFlowBalances | null): RingFlowPlan {
  if (!b) return { status: "loading", reason: "Decrypting your balance…" };
  if (b.registered) return { status: "blocked", reason: "You're already on the Ring." };
  if (b.publicLamports < RING_JOIN_COST_LAMPORTS) {
    return {
      status: "blocked",
      reason: `Joining needs about ${sol(RING_JOIN_COST_LAMPORTS)} in your public balance for rent and fees. You have ${sol(b.publicLamports)}. Add ${sol(RING_JOIN_COST_LAMPORTS - b.publicLamports)} more.`,
    };
  }
  return { status: "ready", amount: ZERO };
}

export function ringMergePlan(b: RingFlowBalances | null, asset: RingAssetId): RingFlowPlan {
  if (!b) return { status: "loading", reason: "Decrypting your balance…" };
  if (!b.registered) return { status: "blocked", reason: "Join the Default Ring first.", fix: "join" };
  if (!b.mergingEnabled) {
    return { status: "blocked", reason: "Turn on note merging first. It's a one-time setup.", fix: "enable-merging" };
  }
  const n = b.assets[asset].notes;
  if (n < 2) return { status: "blocked", reason: n === 1 ? "Only 1 note. Nothing to merge." : "No notes yet. Nothing to merge." };
  if (b.publicLamports < RING_MIN_FEE_LAMPORTS) return feeBlock(b, RING_MIN_FEE_LAMPORTS);
  return { status: "ready", amount: ZERO };
}

function feeBlock(b: RingFlowBalances, need: bigint): RingFlowPlan {
  return {
    status: "blocked",
    reason: `You need about ${sol(need)} public SOL for network fees. You have ${sol(b.publicLamports)}.`,
  };
}

export function ringFlowPlan(input: RingFlowInput): RingFlowPlan {
  const { action, asset, balances: b } = input;
  if (!b) return { status: "loading", reason: "Decrypting your balance…" };
  if (!b.registered) {
    return {
      status: "blocked",
      reason: "Join the Default Ring first. It publishes your Ring keys so you can hold a private balance.",
      fix: "join",
    };
  }

  // Recipient comes first in the Send and Unshield forms.
  if (action === "send" || action === "unshield") {
    switch (input.recipient ?? "empty") {
      case "empty":
        return { status: "blocked", reason: action === "send" ? "Paste the recipient's Solana address." : "Enter a destination address." };
      case "invalid":
        return { status: "blocked", reason: "That isn't a valid Solana address." };
      case "checking":
        if (action === "send") return { status: "loading", reason: "Checking whether they're on the Ring…" };
        break;
      case "lookup-failed":
        if (action === "send") {
          return { status: "blocked", reason: "Couldn't check whether they're on the Ring.", fix: "retry-lookup" };
        }
        break;
    }
  }

  const decimals = RING_ASSETS[asset].decimals;
  const text = input.amountText.trim();
  if (!text) return { status: "blocked", reason: "Enter an amount." };
  const amount = parseRingAmount(text, decimals);
  if (amount === null) return { status: "blocked", reason: `That amount isn't valid. ${asset} goes to ${decimals} decimal places.` };
  if (amount <= ZERO) return { status: "blocked", reason: "Enter an amount above 0." };

  if (action === "shield") {
    const max = ringShieldable(b, asset, "shield");
    if (asset === "SOL" && amount > max) {
      return {
        status: "blocked",
        reason:
          max > ZERO
            ? `You can shield up to ${sol(max)}. ${sol(RING_FEE_RESERVE_LAMPORTS)} stays public for network fees.`
            : `You have ${sol(b.publicLamports)} public. Shielding keeps ${sol(RING_FEE_RESERVE_LAMPORTS)} back for fees, so add more SOL first.`,
        ...(max > ZERO ? { suggestAmount: max } : {}),
      };
    }
    if (asset === "USDC") {
      if (amount > b.publicUsdc) {
        return {
          status: "blocked",
          reason: `You have ${fmtRing("USDC", b.publicUsdc)} public.`,
          ...(b.publicUsdc > ZERO ? { suggestAmount: b.publicUsdc } : {}),
        };
      }
      if (b.publicLamports < RING_MIN_FEE_LAMPORTS) return feeBlock(b, RING_MIN_FEE_LAMPORTS);
    }
    return { status: "ready", amount };
  }

  // Private actions pay their fee from public SOL. A pay link also carries public SOL.
  const solNeed = RING_MIN_FEE_LAMPORTS + (action === "link" ? RING_LINK_FEE_LAMPORTS : ZERO);
  if (b.publicLamports < solNeed) {
    if (action === "link") {
      return {
        status: "blocked",
        reason: `A pay link carries ${sol(RING_LINK_FEE_LAMPORTS)} public SOL for the claimer's fees, plus network fees. You have ${sol(b.publicLamports)} public. Add ${sol(solNeed - b.publicLamports)} more.`,
      };
    }
    return feeBlock(b, solNeed);
  }

  const p = b.assets[asset];
  if (amount <= p.spendable) return { status: "ready", amount };

  if (amount <= p.amount) {
    return {
      status: "blocked",
      reason: `That needs more than ${RING_MAX_LOCAL_INPUTS} notes in one proof. Merge your ${asset} notes first, or send up to ${fmtRing(asset, p.spendable)}.`,
      fix: b.mergingEnabled ? "merge" : "enable-merging",
      ...(p.spendable > ZERO ? { suggestAmount: p.spendable } : {}),
    };
  }

  const have = `You have ${fmtRing(asset, p.amount)} private`;

  if (!canTopUp(action, input.recipient)) {
    const verb = action === "unshield" ? "unshield" : "send";
    const tail =
      action === "send"
        ? " They aren't on the Ring, so this would be a public withdrawal. To send more publicly, use your wallet's Send, or shield more first."
        : " Shield more first if you need to.";
    return {
      status: "blocked",
      reason: `${have}, so you can ${verb} up to ${fmtRing(asset, p.spendable)}.${tail}`,
      ...(p.spendable > ZERO ? { suggestAmount: p.spendable } : {}),
    };
  }

  if (p.notes >= RING_MAX_LOCAL_INPUTS) {
    return {
      status: "blocked",
      reason: `${have} in ${p.notes} notes. Merge them first, then shield the rest.`,
      fix: b.mergingEnabled ? "merge" : "enable-merging",
    };
  }

  const shieldAmount = amount - p.amount;
  const shieldable = ringShieldable(b, asset, action);
  const verb = action === "link" ? "fund the link" : "send";
  if (shieldAmount <= shieldable) {
    return {
      status: "shield-first",
      amount,
      shieldAmount,
      reason: `${have}. Shield ${fmtRing(asset, shieldAmount)} more from your public balance and ${verb} in one go.`,
    };
  }

  const pub = asset === "SOL" ? b.publicLamports : b.publicUsdc;
  const missing = shieldAmount - shieldable;
  const max = p.amount + shieldable;
  const kept =
    asset === "SOL"
      ? ` (${sol(RING_FEE_RESERVE_LAMPORTS + (action === "link" ? RING_LINK_FEE_LAMPORTS : ZERO))} stays public for fees)`
      : "";
  return {
    status: "blocked",
    reason: `${have} and ${fmtRing(asset, pub)} public${kept}. You're ${fmtRing(asset, missing)} short. The most you can ${verb === "send" ? "send" : "put in a link"} is ${fmtRing(asset, max)}.`,
    ...(max > ZERO ? { suggestAmount: max } : {}),
  };
}

/** Which tab to open first: Shield until there's a private balance, then Send. */
export function ringSuggestedAction(b: RingFlowBalances | null): "shield" | "send" {
  if (!b || !b.registered) return "shield";
  return b.assets.SOL.amount > ZERO || b.assets.USDC.amount > ZERO ? "send" : "shield";
}
