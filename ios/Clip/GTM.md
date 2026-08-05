# sol.new App Clip — GTM

**Positioning:** Instant sol.new on iPhone — **no install**. QR / NFC / link → full product (wallet, swap, gift, POAP, stake…).

**Bundles**
| | ID |
|---|---|
| App | `xyz.solnew.app` |
| Clip | `xyz.solnew.app.Clip` |
| Team | `4CK2SMVS2Y` |

**AASA (live)** `https://sol.new/.well-known/apple-app-site-association`

---

## App Store Connect (ship)

1. Xcode → scheme **sol-new** → **Any iOS Device** → **Product → Archive**
2. **Distribute App** → App Store Connect → Upload
3. ASC → app → **App Clip**
4. **Default App Clip Experience**
   - Header image (1800×1200 recommended)
   - Subtitle: `Wallet, swap, gifts & more — no install`
   - Action: Open
   - URL: `https://sol.new`
5. **Advanced Experiences** (optional, high-intent):

| URL prefix | Use |
|---|---|
| `https://sol.new/poap` | Meetup claims |
| `https://sol.new/gift` | Gift send/claim |
| `https://sol.new/claim` | Claims |
| `https://sol.new/swap` | Swap |
| `https://sol.new/onboard` | First wallet |
| `https://sol.new/wallet` | Receive / ask funds |
| `https://sol.new/stake` | Stake |
| `https://sol.new/pay` | Pay links |

6. Submit parent app + Clip together for review.

---

## IRL distribution

| Channel | Asset |
|---|---|
| **QR** | `https://sol.new/` or path (`/poap/CODE`) |
| **NFC** | NDEF URI same URL |
| **Link** | iMessage / Notes / email |
| **Web** | [sol.new/clip](https://sol.new/clip) |

Generate QR: any generator, or `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=https://sol.new/poap`

---

## Messages / copy

**Short**
> sol.new on your iPhone — no install. Scan to open wallet, swap, gifts, POAPs.

**POAP drop**
> You're here. Scan → claim your sol.new POAP (Face ID, free cNFT).

**Gift**
> Someone sent you SOL. Open the link — claim with Face ID.

**Launch tweet / post** (3rd person, no hashtags per brand)
> sol.new ships as an iPhone App Clip. Point a QR or NFC tag at sol.new and the full app opens — passkey wallet, swap, gifts, POAPs — without the App Store first.

---

## Test matrix (pre-submit)

- [ ] Cold open Clip → `/home`
- [ ] QR `https://sol.new/poap` → POAP
- [ ] Create passkey / Face ID in Clip
- [ ] Swap / gift / ask-for-funds
- [ ] NFC tag with sol.new URL
- [ ] External `solana:` / Twitter links leave Clip cleanly
- [ ] Parent app install upgrade path (Clip → full app)

---

## Limits to know

- Clip binary **≤ ~15 MB** compressed (ours is WebView shell — fine)
- WebAuthn in WKWebView: works on recent iOS; if Face ID fails, show “Open in Safari”
- Production invocation needs **ASC experience** (Local Experience = dev only)
- Propagation of new experiences can take hours

---

## Dev invoke

```text
Scheme: sol-new Clip
Env: _XCAppClipURL=https://sol.new/swap
```

Or iPhone **Settings → Developer → Local Experiences**.
