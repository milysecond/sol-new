/**
 * Exact /token launch pricing. Numbers match what the forms enforce.
 * Meteora 0.045 is a hard wallet check. Other SOL figures are rent
 * (accounts + tx), not a sol.new take, unless platformSol > 0.
 */

export type TokenLaunchPrice = {
  id: string;
  label: string;
  live: boolean;
  /** SOL the creator spends at create (rent + our fee). null = not live. */
  launchSol: number | null;
  launchSolExact: boolean;
  platformSol: number;
  rentSol: number | null;
  tradeFeeBps: number | null;
  graduation: string;
  quote: string;
  note: string;
  costLabel: string;
};

export const TOKEN_LAUNCH_PRICES: TokenLaunchPrice[] = [
  {
    id: "meteora",
    label: "Meteora DBC",
    live: true,
    launchSol: 0.045,
    launchSolExact: true,
    platformSol: 0.005,
    rentSol: 0.04,
    tradeFeeBps: 100,
    graduation: "DAMM v2 at ~69 SOL",
    quote: "SOL",
    note: "Hard min 0.045 SOL: 0.040 rent + 0.005 sol.new (promo waives 0.005). Buyers pay 1% per swap.",
    costLabel: "0.045 SOL",
  },
  {
    id: "pump",
    label: "Pump.fun",
    live: true,
    launchSol: 0.008,
    launchSolExact: false,
    platformSol: 0,
    rentSol: 0.008,
    tradeFeeBps: 100,
    graduation: "Pump curve, then Raydium / PumpSwap",
    quote: "SOL",
    note: "No sol.new fee. ~0.008 SOL on-chain rent for mint + curve + metadata.",
    costLabel: "~0.008 SOL",
  },
  {
    id: "bags",
    label: "Bags",
    live: true,
    launchSol: 0.008,
    launchSolExact: false,
    platformSol: 0,
    rentSol: 0.008,
    tradeFeeBps: 100,
    graduation: "Same pump.fun curve",
    quote: "SOL",
    note: "Same create path as Pump. No sol.new fee. ~0.008 SOL rent.",
    costLabel: "~0.008 SOL",
  },
  {
    id: "jup",
    label: "Jupiter Studio",
    live: true,
    launchSol: 0.03,
    launchSolExact: false,
    platformSol: 0,
    rentSol: 0.03,
    tradeFeeBps: 100,
    graduation: "Meteora at 69,000 USDC MC (starts 16,000 USDC)",
    quote: "USDC",
    note: "No sol.new fee. You pay tx rent (~0.03 SOL). Trades 1%. Curve is USDC, LP locked.",
    costLabel: "~0.03 SOL",
  },
  {
    id: "launchlab",
    label: "Raydium LaunchLab",
    live: true,
    launchSol: 0.03,
    launchSolExact: false,
    platformSol: 0,
    rentSol: 0.03,
    tradeFeeBps: null,
    graduation: "Raydium CPMM at 85 SOL (JustSendit)",
    quote: "SOL",
    note: "No sol.new fee. ~0.03 SOL rent to create. 85 SOL is the curve raise, not the create price.",
    costLabel: "~0.03 SOL",
  },
  {
    id: "genesis",
    label: "Genesis TGE",
    live: true,
    launchSol: 0.01,
    launchSolExact: false,
    platformSol: 0,
    rentSol: 0.01,
    tradeFeeBps: null,
    graduation: "Claim after deposit window",
    quote: "SOL",
    note: "No sol.new fee. ~0.01 SOL rent for Genesis accounts. Raised SOL goes to the creator wallet.",
    costLabel: "~0.01 SOL",
  },
  {
    id: "metadao",
    label: "MetaDAO",
    live: true,
    launchSol: 0.05,
    launchSolExact: false,
    platformSol: 0,
    rentSol: 0.05,
    tradeFeeBps: null,
    graduation: "n/a (futarchy DAO, not a bonding curve)",
    quote: "USDC + token",
    note: "~0.05 SOL rent to create the DAO. Proposals need 10 USDC + 1,000 tokens in AMMs first.",
    costLabel: "~0.05 SOL",
  },
  {
    id: "bonkfun",
    label: "LetsBONK",
    live: false,
    launchSol: null,
    launchSolExact: false,
    platformSol: 0,
    rentSol: null,
    tradeFeeBps: null,
    graduation: "Raydium (when live)",
    quote: "SOL",
    note: "Not live on sol.new yet.",
    costLabel: "Coming soon",
  },
];

export function tokenLaunchCostLabel(id: string): string {
  return TOKEN_LAUNCH_PRICES.find((p) => p.id === id)?.costLabel ?? "";
}
