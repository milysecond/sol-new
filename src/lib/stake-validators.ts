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
/** Practical minimum stake above rent (user-facing). */
export const MIN_STAKE_SOL = 0.01;
