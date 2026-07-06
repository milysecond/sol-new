# secp256r1 migration — M0 spike findings

Against `@lazorkit/wallet@2.0.1` (installed; peers include `@solana/kora`, anchor 0.31, web3.js ^1.98.2 ✓ compatible with our 1.98.4).

## SPIKE-1: Paymaster protocol — ANSWERED ✅

Single POST endpoint, JSON-RPC 2.0, optional `x-api-key` header (omitted if no apiKey configured — same-origin `/api/paymaster` with no key works). Methods the SDK calls:

| method | params | result |
|---|---|---|
| `getPayerSigner` | `[]` | `{signer_address: string}` |
| `getBlockhash` | `[]` | `{blockhash: string}` |
| `signTransaction` | `[base64 legacy tx (requireAllSignatures:false)]` | `{signed_transaction: base64}` |
| `signAndSendTransaction` | `[base64 tx — legacy OR VersionedTransaction]` | `{signature: string}` |

Errors: standard JSON-RPC `{error:{message}}`. Client retries 3× with exponential backoff.
Default hosted paymaster: `https://lazorkit-paymaster.onrender.com`. **Our Worker route implements these 4 methods + relayer-guard.**

## SPIKE-2: extraSigners — NO ❌ (fallback confirmed as the path)

`signAndSendTransaction` payload is `{instructions, transactionOptions:{feeToken?, addressLookupTableAccounts?, computeUnitLimit?, clusterSimulation?}}` — no extra-signers concept. Flows needing ephemeral mint co-signers (DBC createPool, pump launch, standard NFT mint) must use server-side co-sign via `/api/relay` (mints are already server-held ground keys) — as planned in the fallback.

## SPIKE-3: Tx size / ALTs — SUPPORTED ✅ (different shape than planned)

- `addressLookupTableAccounts` accepted in transactionOptions (Jupiter path viable).
- No public `authorizeAndExecute` in v2.0.1. Instead the SDK internally chunks oversized instruction sets: `_buildAuthorizationMessage` with action `{type: CreateChunk, args:{cpiInstructions}}` — big txs are split into authorization chunks automatically. Validate with a real pump-launch-sized ix set on devnet (M0 runtime test, pending).

## SPIKE-5: signMessage / pubkey exposure — PARTIAL ✅

- `WalletInfo` (returned by `connect()`) exposes `credentialId`, `passkeyPubkey: number[]` (P-256), `smartWallet` — everything `smart_wallets` table needs. ✅
- `signMessage(message)` routes through the **portal dialog** (`openSign(base64msg, credentialId)`) → `{signature, signedPayload}`. Payload internals need a runtime capture to confirm server-side verifiability (authenticatorData/clientDataJSON reconstruction). If unusable: fallback = own `navigator.credentials.get` pinned to the LazorKit credentialId, as planned.
- `verifyMessage({signedPayload, signature, publicKey})` exists client-side — its source shows the exact verification recipe to mirror server-side.

## Address model correction vs plan ⚠️

v2.0.1 has **no `vaultPda`** — the user-facing address is `smartWalletPubkey` / `wallet.smartWallet` (docs described a newer/older API). Plan's "vaultPda" = `smartWallet` everywhere. Storage manager persists CREDENTIAL_ID / SMART_WALLET_ADDRESS / PUBLIC_KEY in its own keys.

## Still open (need runtime dev page / devnet)

- SPIKE-3 runtime: chunking actually works for pump/DBC-sized payloads.
- SPIKE-4: Squads member-as-smart-wallet via CPI (needs on-chain test; default = legacy-gate multisig).
- SPIKE-5 runtime: capture signedPayload bytes.
- SPIKE-6: portal popup on iOS PWA (launch gate) + devnet/mainnet program IDs & portal duality; `clusterSimulation: 'devnet' | 'mainnet'` option exists which is promising.
- SPIKE-7: Genesis/UMI builders emit instructions with noop signer (static analysis of @metaplex-foundation/genesis next).

## Program identity — IMPORTANT ⚠️ (found during runtime spikes)

`@lazorkit/wallet@2.0.1` targets program `Gsuz7YcA5sbMGVRXT3xSYhJBessW4xFC4xYsihNCqMFh` ("lazorkit" v0.1.0 IDL) + `BiE9vSdz9MidUiyjVYsu3PG4C1fbPZ8CVPADA9jRfXw7` ("default_policy"). Both are deployed executable on **devnet AND mainnet** (verified via getAccountInfo 2026-07-06). The Accretion-audited program-v2 (`Lazorj…FAKi`, mainnet-only) is served by `@lazorkit/sdk-legacy` instead. **LAUNCH GATE: confirm audit coverage of the Gsuz program (ask LazorKit), or switch to sdk-legacy + audited program.** SDK defaults: rpc `api.devnet.solana.com`, portal `portal.lazor.sh`, paymaster `kora.devnet.lazorkit.com` (a hosted Kora node — protocol match confirmed).
