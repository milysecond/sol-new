# Solana dApp Store — sol.new

Publisher: `NEWZxFbNkjP3GuFTbd4ZSWABw83FiD14ompYVpoDGiT`
Keypair file: `~/.config/solana/dapp-publisher.json` (chmod 600, NOT in repo)

Two artifacts are produced:
1. A **signed APK** wrapping sol.new as a Trusted Web Activity (TWA), via Bubblewrap.
2. An **on-chain dApp Store submission** referencing that APK, via the Solana Mobile publishing CLI.

---

## Prerequisites

- Java 17 (`brew install openjdk@17`)
- Android SDK (Bubblewrap installs a copy on first run if missing)
- Node 20+
- The publisher keypair, already at `~/.config/solana/dapp-publisher.json`
- ≥0.05 SOL on the publisher address (currently funded with 0.1 SOL, headroom is fine)

## 1. Build the APK with Bubblewrap

```bash
npm i -g @bubblewrap/cli

# from repo root
cd dapp-store
bubblewrap init --manifest=../public/manifest.json
# when prompted, point twa-manifest.json at the version in this folder, OR copy ours over the generated one:
cp twa-manifest.json ./twa-manifest.json

bubblewrap build
# produces app-release-signed.apk + the SHA256 fingerprint of the signing key
```

After the first build, copy the SHA256 fingerprint Bubblewrap prints into:
- `public/.well-known/assetlinks.json` → replace `REPLACE_WITH_SHA256_OF_APK_SIGNING_CERT`

Redeploy sol.new so `https://sol.new/.well-known/assetlinks.json` serves the real fingerprint. Without this, the TWA shows a Chrome URL bar at the top of every screen.

## 2. Verify Mobile Wallet Adapter (MWA) usage

The Solana dApp Store reviewers reject submissions that depend on browser-extension wallets. sol.new's primary auth is passkeys (no wallet popups), so this should pass — but search for any `window.solana` / `window.phantom` / `WalletStandardConnect` usage anywhere in `src/` and route them through MWA on Android.

## 3. Stage media

Drop into `dapp-store/media/`:
- `icon.png` — 512×512
- `banner.png` — 1920×1080
- `screenshot-home.png`, `screenshot-token.png`, `screenshot-multisig.png` — 1080×1920 minimum
- `solnew.apk` — copy from Bubblewrap output

## 4. Submit on-chain

```bash
cd dapp-store
npx dapp-store create publisher -k ~/.config/solana/dapp-publisher.json -u https://api.mainnet-beta.solana.com
# writes the publisher mint address back into config.yaml

npx dapp-store create app       -k ~/.config/solana/dapp-publisher.json -u https://api.mainnet-beta.solana.com
npx dapp-store create release   -k ~/.config/solana/dapp-publisher.json -u https://api.mainnet-beta.solana.com

npx dapp-store publish submit   -k ~/.config/solana/dapp-publisher.json -u https://api.mainnet-beta.solana.com \
  --requestor-is-authorized --complies-with-solana-dapp-store-policies
```

Review window is typically 1–3 business days.

## Updating the app later

Bump `appVersion` + `appVersionCode` in `twa-manifest.json`, rebuild the APK, then:
```bash
npx dapp-store create release -k ~/.config/solana/dapp-publisher.json -u https://api.mainnet-beta.solana.com
npx dapp-store publish update -k ~/.config/solana/dapp-publisher.json -u https://api.mainnet-beta.solana.com
```
