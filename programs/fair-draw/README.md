# Fair Draw (MagicBlock Solana VRF)

On-chain consumer for [MagicBlock VRF](https://docs.magicblock.gg/pages/verifiable-randomness-functions-vrfs/introduction/solana-vrf).

## Why this program exists

MagicBlock VRF is **program-to-program only**: your program CPIs `RequestRandomness`, oracles fulfill, then VRF CPIs back into your `callback_*`. There is no HTTP “get random number” API. The web app reads the fulfilled Draw PDA.

## Deploy

```bash
# requires Anchor 0.31+ and Solana CLI
cd programs/fair-draw
# fix declare_id! after first keygen
anchor keys list
# set declare_id! in src/lib.rs to the program key
anchor build
anchor deploy --provider.cluster mainnet
```

## Env for sol.new Worker

```bash
# Required to enable MagicBlock path
wrangler secret put MAGICBLOCK_FAIR_DRAW_PROGRAM_ID   # deployed program id
# Fee payer that pays rent + VRF request (same as other SOL fee flows)
# SOL_FEE_PAYER_SECRET already used elsewhere

# Optional force
# DRAW_PROVIDER=magicblock   # fail if MagicBlock unavailable (default: try then fallback)
```

## Account layout

- Seeds: `["fair-draw", draw_id_16_bytes]`
- After callback: `fulfilled=true`, `randomness=[u8;32]`
- Winner index (off-chain): `u64_le(randomness[0..8]) % entry_count`
