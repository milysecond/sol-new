# sol.new App Clip (minimal)

Tiny iOS **App Clip** that opens `https://sol.new` (or the invocation URL) in a full-screen `WKWebView`.

## Why
iOS has **no Web NFC**. An App Clip is the lightest native surface for NFC/QR → instant experience without full install.

## Bundle IDs
| Target | ID |
|--------|-----|
| Full app | `xyz.solnew.app` |
| App Clip | `xyz.solnew.app.Clip` |

## Generate Xcode project
```bash
cd ios
xcodegen generate
open sol-new.xcodeproj
```

## Apple setup (required to go live)
1. **Developer portal** — App ID for `xyz.solnew.app.Clip` with App Clip capability; parent `xyz.solnew.app`.
2. **Associated domains** on both:
   - Parent: `applinks:sol.new`, `webcredentials:sol.new`
   - Clip: `appclips:sol.new`, `applinks:sol.new`
3. **AASA** on `https://sol.new/.well-known/apple-app-site-association`  
   See `public/.well-known/apple-app-site-association` (appclips + applinks).
4. **App Store Connect** — upload build with Clip embedded; configure **App Clip Experience**:
   - URL prefix e.g. `https://sol.new/` or `https://sol.new/frame`
   - Optional **NFC tag** / QR pointing at that URL
5. **Local test** — Xcode → scheme `sol-new Clip` → `_XCAppClipURL` env  
   `https://sol.new/frame?source=appclip`  
   Or Settings → Developer → Local Experience.

## NFC note
This Clip does **not** read NFC itself. Flow is:

**NFC tag (NDEF URL) → iOS shows App Clip card → user opens → Clip loads that URL.**

To *write* tags you still need a separate native helper or Android Web NFC. The Clip only *opens* when a tag/QR hits your `appclips:sol.new` URL.

## Size
Keep the Clip under **15 MB** uncompressed. This target is WebView-only on purpose.
