# Solana dApp Store — sol.new

Publisher: `NEWZxFbNkjP3GuFTbd4ZSWABw83FiD14ompYVpoDGiT`
Keypair file: `~/.config/solana/dapp-publisher.json` (chmod 600, NOT in repo)

Two artifacts are produced and uploaded:

1. A **signed APK** wrapping sol.new as a Trusted Web Activity (TWA), via Bubblewrap.
2. A **portal submission** at https://publish.solanamobile.com that pins the
   App + Release on-chain and schedules the Solana Mobile review.

> **Note on the CLI flow.** Up until early 2026 the publishing CLI minted the
> Publisher / App / Release NFTs directly from your terminal
> (`dapp-store create publisher`, `create app`, `create release`,
> `publish submit`). That flow is gone. CLI v1.0.0 is **portal-backed**: the
> first submission happens through the web UI at publish.solanamobile.com,
> and the CLI is reduced to *version updates* on already-published apps
> (`dapp-store --apk-file ... --whats-new ...`). This file documents the
> new flow.

---

## Prerequisites

- Java 17 (`brew install openjdk@17`) — installed at `~/Library/Java/jdk17`
- Android SDK (Android Studio or `cmdline-tools` package) at `~/Library/Android/sdk`
- Node 20+
- Bubblewrap CLI (`npm i -g @bubblewrap/cli`)
- Playwright (already installed locally in `dapp-store/` — see `_capture.mjs`)
- The publisher keypair at `~/.config/solana/dapp-publisher.json`
- ≥0.05 SOL on the publisher address (currently funded with 0.1 SOL)

### Bubblewrap config (one-time)

`~/.bubblewrap/config.json` should point at your existing JDK 17 and Android SDK:

```json
{
  "jdkPath": "/Users/<you>/Library/Java/jdk17",
  "androidSdkPath": "/Users/<you>/Library/Android/sdk"
}
```

Note: the `jdkPath` must NOT include `/Contents/Home` — Bubblewrap appends it
itself on macOS. The `androidSdkPath` must contain a `tools/` or `bin/`
folder; if your SDK only has `cmdline-tools/`, symlink:

```bash
ln -sf ~/Library/Android/sdk/cmdline-tools/latest ~/Library/Android/sdk/tools
```

Verify with `bubblewrap doctor`.

---

## 1. Build the APK

The first build needs a signing keystore. We generate one non-interactively
with a random 32-char password, and feed Bubblewrap the password via env
vars so the build never needs a TTY:

```bash
cd dapp-store

# Generate the keystore once. Keep the password file safe — without it you
# can never sign updates to this app on the dApp Store.
KEYSTORE_PASSWORD=$(LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 32)
echo "$KEYSTORE_PASSWORD" > .keystore-password
chmod 600 .keystore-password

keytool -genkeypair -v \
  -keystore android.keystore \
  -alias android \
  -keyalg RSA -keysize 2048 -validity 36500 \
  -storepass "$KEYSTORE_PASSWORD" \
  -keypass  "$KEYSTORE_PASSWORD" \
  -dname "CN=sol.new, O=sol.new, L=Sydney, ST=NSW, C=AU"

# Extract the SHA-256 fingerprint — needed for assetlinks.json (step 2).
keytool -list -v -keystore android.keystore -alias android \
  -storepass "$KEYSTORE_PASSWORD" | grep SHA256
```

Now scaffold the Android project from `twa-manifest.json` and build. The
scaffold step is non-interactive — `_scaffold.cjs` calls Bubblewrap's
`TwaGenerator` directly and writes the matching `manifest-checksum.txt`
so `bubblewrap build` won't prompt to update.

```bash
node _scaffold.cjs

KS_PW=$(cat .keystore-password)
BUBBLEWRAP_KEYSTORE_PASSWORD="$KS_PW" \
BUBBLEWRAP_KEY_PASSWORD="$KS_PW"      \
bubblewrap build --skipPwaValidation
```

Outputs:
- `dapp-store/app-release-signed.apk` — what gets uploaded
- `dapp-store/app-release-bundle.aab` — Play Store equivalent (kept for parity)

Stage the APK where the portal expects it:

```bash
cp app-release-signed.apk media/solnew.apk
```

> ⚠️ **Back this up now.** Lose `android.keystore` or `.keystore-password`
> and you can never publish a new version of this exact app. Both are
> gitignored on purpose. Stash a copy in a password manager / encrypted
> backup.

---

## 2. Update Digital Asset Links + redeploy

Without this, the TWA shows a Chrome URL bar at the top of every screen
because the Android app and `sol.new` aren't linked.

Replace the placeholder fingerprint in `public/.well-known/assetlinks.json`
with the SHA-256 from step 1. Format is uppercase hex with `:` between
bytes — exactly what `keytool -list` prints. Commit, push, redeploy
sol.new, then verify the live file:

```bash
curl -s https://sol.new/.well-known/assetlinks.json
```

The `sha256_cert_fingerprints` array must contain your real fingerprint,
no longer `REPLACE_WITH_…`.

---

## 3. Stage media

The portal asks for a fixed set of art at fixed dimensions. The `_capture.mjs`
script renders all of them in one shot via Playwright — three screenshots
captured directly from production sol.new (after dismissing the welcome
modal via injected localStorage), and two banner sizes rendered from the
local HTML templates in `media/_banner*.html`:

```bash
cd dapp-store && node _capture.mjs
```

After it runs, `dapp-store/media/` should contain:

| File | Dimensions | Required for |
|---|---|---|
| `icon.png` | 512×512 | always |
| `banner.png` | 1920×1080 | release banner |
| `banner-1200x600.png` | 1200×600 | mandatory for version updates |
| `screenshot-home.png` | 1080×1920 | always |
| `screenshot-launches.png` | 1080×1920 | always |
| `screenshot-docs.png` | 1080×1920 | always |
| `solnew.apk` | n/a | always |

To swap which routes appear in the screenshots, edit the `SHOTS` array in
`_capture.mjs`. Routes that require a connected passkey wallet (e.g. `/token`,
`/multisig`) render as the connect-form gate and are not useful as
screenshots — prefer public surfaces (`/whats-new`, `/docs`, the home page).

---

## 4. Submit through publish.solanamobile.com

Sign in with the publisher keypair. The portal walks you through:

1. **Publisher**: name, website, support email. Values from `config.yaml`.
2. **App**: name, package id (`xyz.solnew.app`), website, license / copyright /
   privacy URLs. Values from `config.yaml`.
3. **Release**: upload the APK, the icon, the 1920×1080 banner, the three
   screenshots, the locale catalog (short + long description, "what's new",
   testing instructions). Values from `config.yaml`'s `release.catalog.en-US`
   block.
4. **Compliance attestations**:
   - "Requestor is authorized to submit on behalf of the publisher"
   - "App complies with Solana dApp Store policies"
5. **Submit**.

Review window is typically 1–3 business days.

After the first submission lands, the portal issues an API key. Save it
into your environment:

```bash
export DAPP_STORE_API_KEY=<from-portal>
```

---

## 5. Updating the app later

For a normal version bump after the app is live:

1. Bump `appVersion` + `appVersionCode` in `dapp-store/twa-manifest.json`.
2. Rebuild the APK (`node _scaffold.cjs && bubblewrap build --skipPwaValidation`
   with the same env vars).
3. Push the update through the CLI:

```bash
cd dapp-store
DAPP_STORE_API_KEY="$DAPP_STORE_API_KEY" dapp-store \
  --apk-file ./app-release-signed.apk \
  --whats-new "Description of what changed in this release." \
  --keypair ~/.config/solana/dapp-publisher.json
```

If the CLI is interrupted mid-publication you can resume:

```bash
dapp-store resume --release-id <release-id> --keypair ~/.config/solana/dapp-publisher.json
```

The signing keystore must be the **same** android.keystore generated in
step 1 — Android refuses to install updates signed by a different key.
