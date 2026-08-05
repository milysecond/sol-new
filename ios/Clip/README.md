# sol.new App Clip

**Full product shell** — WKWebView loads any `https://sol.new/…` path (wallet, swap, gift, POAP, stake…).

| | |
|---|---|
| Parent | `xyz.solnew.app` |
| Clip | `xyz.solnew.app.Clip` |
| Team | `4CK2SMVS2Y` |
| GTM | [GTM.md](./GTM.md) · https://sol.new/clip |

## Why a Clip
iOS has no Web NFC. Clip = lightest native surface for **QR / NFC / link → instant sol.new** without full install.

## Setup
1. Developer portal — App IDs above; parent has App Clips capability.
2. Associated Domains: `appclips:sol.new`, `applinks:sol.new`, parent also `webcredentials:sol.new`.
3. AASA live at `/.well-known/apple-app-site-association`.
4. ASC — upload build; configure default + advanced experiences (see GTM.md).

## Test
- Scheme **sol-new Clip** → device → ⌘R  
- Local Experience: URL prefix `https://sol.new`, bundle `xyz.solnew.app.Clip`  
- Env `_XCAppClipURL=https://sol.new/poap`

## NFC
System opens Clip from NDEF URL tags automatically. In-Clip **Scan NFC** FAB for secondary tags.
