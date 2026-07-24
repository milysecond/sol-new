/**
 * Curated Sanctum-ecosystem liquid staking tokens for /lst.
 * Swaps run via Jupiter (browser → lite-api) so no Sanctum API key is required.
 */

export type LstOption = {
  id: string;
  symbol: string;
  name: string;
  mint: string;
  /** Short one-liner for the UI */
  blurb: string;
};

export const WSOL_MINT = "So11111111111111111111111111111111111111112";

export const SANCTUM_LSTS: LstOption[] = [
  {
    id: "jitosol",
    symbol: "jitoSOL",
    name: "Jito Staked SOL",
    mint: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
    blurb: "MEV-boosted liquid stake",
  },
  {
    id: "msol",
    symbol: "mSOL",
    name: "Marinade Staked SOL",
    mint: "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",
    blurb: "Marinade liquid stake",
  },
  {
    id: "bsol",
    symbol: "bSOL",
    name: "BlazeStake SOL",
    mint: "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1",
    blurb: "BlazeStake / SolBlaze",
  },
  {
    id: "inf",
    symbol: "INF",
    name: "Sanctum Infinity",
    mint: "5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm",
    blurb: "Sanctum multi-LST infinity pool",
  },
  {
    id: "hsol",
    symbol: "hSOL",
    name: "Helius Staked SOL",
    mint: "he1iusmfkpAdwvxLNGV8Y1iSbj4rUy6yMhEA3fotn9A",
    blurb: "Helius liquid stake",
  },
  {
    id: "jupsol",
    symbol: "jupSOL",
    name: "Jupiter Staked SOL",
    mint: "jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v",
    blurb: "Jupiter liquid stake",
  },
  {
    id: "bonksol",
    symbol: "bonkSOL",
    name: "Bonk Staked SOL",
    mint: "BonK1YhkXEGLZzwtcvRTip3gAL9nCeQD7ppZBLXhtTs",
    blurb: "Community LST",
  },
];

export const DEFAULT_LST = SANCTUM_LSTS[0];

export const JUP_SWAP_API = "https://lite-api.jup.ag/swap/v1";
