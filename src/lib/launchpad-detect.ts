/**
 * Detect which Solana launchpad created a mint.
 * PDA + mint-authority owner first, then rugcheck markets / copy / Mobula.
 */
import { PublicKey } from "@solana/web3.js";

export const PUMP_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
export const PUMP_AMM = "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA";
export const METEORA_DBC = "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN";
export const LAUNCHLAB_PROGRAM = "LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj";
export const MOONSHOT_PROGRAM = "MoonCVVNZFSYkqNXP6bxHLPL6QQJiMagDL3qcqUQTrG";
export const RAYDIUM_CPMM = "CPMMoo8L3F4NbTegBTsEFnIAOAXx6jYcw5R5AYuppump";

const PROGRAM_LABEL: Record<string, string> = {
  [PUMP_PROGRAM]: "Pump",
  [PUMP_AMM]: "Pump",
  [METEORA_DBC]: "Meteora",
  [LAUNCHLAB_PROGRAM]: "LaunchLab",
  [MOONSHOT_PROGRAM]: "Moonshot",
  [RAYDIUM_CPMM]: "Raydium",
};

export type LaunchpadHit = {
  id: string;
  label: string;
};

function labelFromProgram(id: string | null | undefined): LaunchpadHit | null {
  if (!id) return null;
  const label = PROGRAM_LABEL[id];
  if (!label) return null;
  return { id: label.toLowerCase(), label };
}

function fromText(s: string): LaunchpadHit | null {
  const t = s.toLowerCase();
  if (/\bstonkfun\b|\bstonk\.fun\b|\bstonkfun\.xyz\b/.test(t)) return { id: "stonkfun", label: "StonkFun" };
  if (/\bbags\b/.test(t)) return { id: "bags", label: "Bags" };
  if (/\bjupiter studio\b|\bstudio\.jup\b/.test(t)) return { id: "studio", label: "Jupiter Studio" };
  if (/\bpump\.fun\b|\bpumpfun\b/.test(t)) return { id: "pump", label: "Pump" };
  if (/\bmeteora\b/.test(t)) return { id: "meteora", label: "Meteora" };
  if (/\blaunchlab\b|\bjustsendit\b/.test(t)) return { id: "launchlab", label: "LaunchLab" };
  if (/\bmoonshot\b|\bmoonit\b/.test(t)) return { id: "moonshot", label: "Moonshot" };
  if (/\bletsbonk\b|\bbonk\.fun\b/.test(t)) return { id: "bonk", label: "LetsBonk" };
  if (/\bgenesis\b/.test(t)) return { id: "genesis", label: "Genesis" };
  return null;
}

export function launchpadFromMarkets(markets: unknown): LaunchpadHit | null {
  if (!markets) return null;
  const blob = JSON.stringify(markets);
  return fromText(blob);
}

export function launchpadFromCopy(description: string | null | undefined): LaunchpadHit | null {
  if (!description) return null;
  return fromText(description);
}

export function pumpBondingCurvePda(mint: string): string | null {
  try {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("bonding-curve"), new PublicKey(mint).toBuffer()],
      new PublicKey(PUMP_PROGRAM),
    );
    return pda.toBase58();
  } catch {
    return null;
  }
}

const WSOL = "So11111111111111111111111111111111111111112";

export function launchlabPoolPda(mint: string): string | null {
  try {
    const a = new PublicKey(mint);
    const b = new PublicKey(WSOL);
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("pool"), a.toBuffer(), b.toBuffer()],
      new PublicKey(LAUNCHLAB_PROGRAM),
    );
    return pda.toBase58();
  } catch {
    return null;
  }
}

export function labelFromAccountOwner(owner: string | null | undefined): LaunchpadHit | null {
  return labelFromProgram(owner);
}

export function mergeLaunchpad(
  ...hits: Array<LaunchpadHit | string | null | undefined>
): LaunchpadHit | null {
  for (const h of hits) {
    if (!h) continue;
    if (typeof h === "string") {
      const t = fromText(h) || { id: h.toLowerCase().replace(/\s+/g, ""), label: h };
      return t;
    }
    return h;
  }
  return null;
}
