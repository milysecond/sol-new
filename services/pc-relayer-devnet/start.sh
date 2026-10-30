#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
# Prefer public devnet (Helius key may be mainnet-only)
export PC_RPC="${PC_RPC:-https://api.devnet.solana.com}"
export PORT="${PORT:-8788}"
exec node src/server.js
