/** Curated mainnet vote accounts for native SOL staking at /stake. */

export type StakeValidator = {
  id: string;
  name: string;
  vote: string;
  commission: number;
  note?: string;
};

export const STAKE_VALIDATORS: StakeValidator[] = [
  {
    id: "helius",
    name: "Helius",
    vote: "he1iusunGwqrNtafDtLdhsUQDFvo13z9sUa36PauBtk",
    commission: 0,
    note: "0% commission · infra team",
  },
  {
    id: "jupiter",
    name: "Jupiter",
    vote: "CatzoSMUkTRidT5DwBxAC2pEtnwMBTpkCepHkFgZDiqb",
    commission: 5,
    note: "5% commission",
  },
];

export const DEFAULT_VOTE = STAKE_VALIDATORS[0].vote;

/** Stake account rent-exempt minimum ~0.00228288 SOL; keep buffer for fees. */
export const STAKE_RENT_LAMPORTS = 2_282_880;
export const STAKE_FEE_BUFFER_LAMPORTS = 15_000;
/**
 * Mainnet minimum delegation (getStakeMinimumDelegation) = 1 SOL.
 * Amount the user enters is the stake; rent is added on top when funding the account.
 */
export const MIN_STAKE_SOL = 1;
/** Lamports equivalent — used server-side. */
export const MIN_STAKE_LAMPORTS = 1_000_000_000;
