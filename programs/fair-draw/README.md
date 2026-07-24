# Fair Draw (MagicBlock Solana VRF)

On-chain consumer for [MagicBlock VRF](https://docs.magicblock.gg/pages/verifiable-randomness-functions-vrfs/introduction/solana-vrf).

## Why this program exists

MagicBlock VRF is **program-to-program only**: your program CPIs `RequestRandomness`, oracles fulfill, then VRF CPIs back into your `callback_*`. There is no HTTP “get random number” API. The web app reads the fulfilled Draw PDA.

## Deploy

```bash
# Requires Anchor 0.31.1 + Solana CLI 2.2+ (platform-tools ≥ v1.48 for edition2024 crates)
# From repo root (sol-new/):
export PATH="$HOME/.local/share/solana/install/releases/2.2.16/solana-release/bin:$PATH"
anchor build -p fair-draw
solana program deploy target/deploy/fair_draw.so \
  --program-id target/deploy/fair_draw-keypair.json \
  --url devnet   # or mainnet-beta when funded
```

**Devnet program id:** `EQmor7iQN23PbKEUA9yHjsRujnb4csV9L8stussV3znp`  
(fee payer: `feeUzA98vep5UvxQhwdQVBGsSFADqcYM7Dt4sLrpiyE`)

Smoke test after deploy:

```bash
MAGICBLOCK_FAIR_DRAW_PROGRAM_ID=EQmor7iQN23PbKEUA9yHjsRujnb4csV9L8stussV3znp \
  node --env-file=.env.local scripts/test-magicblock-vrf.mjs
```

## Env for sol.new Worker

```bash
# Required to enable MagicBlock path
wrangler secret put MAGICBLOCK_FAIR_DRAW_PROGRAM_ID   # deployed program id
# Fee payer that pays rent + VRF request (same as other SOL fee flows)
# SOL_FEE_PAYER_SECRET already used elsewhere

# Cluster for MagicBlock txs (must match where the program is deployed)
wrangler secret put MAGICBLOCK_CLUSTER   # devnet | mainnet

# Optional force
# DRAW_PROVIDER=magicblock   # fail if MagicBlock unavailable (default: try then fallback)
```

## Account layout

- Seeds: `["fair-draw", draw_id_16_bytes]`
- After callback: `fulfilled=true`, `randomness=[u8;32]`
- Winner index (off-chain): `u64_le(randomness[0..8]) % entry_count`
