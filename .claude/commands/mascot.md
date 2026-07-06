# mascot

Generate a new sol.new mascot variant — a purple "This is Fine" dog reimagining a famous meme.

## Usage

```
/mascot <meme-name-or-description>
```

**Examples:**
- `/mascot distracted boyfriend`
- `/mascot drake pointing`
- `/mascot galaxy brain`
- `/mascot crying then smiling`
- `/mascot stonks`
- `/mascot probably nothing`

## What to do

1. The user's argument is `$ARGUMENTS` — a meme name or short description.

2. Research the meme if needed: what's the scene, expression, pose, caption format.

3. Map it to the sol.new purple dog character (see below) and a DeFi/Solana context.

4. Add the new variant to `/Volumes/PRO-G40/solnew/sol-new/src/components/mascot.tsx`:
   - Add the variant name to the `MascotProps` `variant` type union
   - Add a new branch in the `Mascot` switch
   - Write a new `MascotVariantName` function component returning an SVG

5. Add the variant to the exports table in the component file's top comment block.

6. Type-check: `cd /Volumes/PRO-G40/solnew/sol-new && npx tsc --noEmit 2>&1 | grep mascot`

## Character spec

**Dog breed:** Shiba-ish, meme-proportioned (big round head, floppy ears, calm eyes)

**Colors (always use these):**
- Body: `#9333ea` (purple-600)
- Head/face: `#c084fc` (purple-400)
- Snout: `#ddd6fe` (purple-200)
- Ears inner: `#a855f7` (purple-500)
- Nose/details: `#4c1d95` (purple-900)
- Eye pupils: `#1e1b4b`
- Background: `#0d0018` (near-black)

**Reusable helpers already in the file:**
- `<DogHead cx cy scale expression>` — expression: "calm" | "happy" | "sad" | "shocked"
- `<SpeechBubble x y text subtext>` — white bubble with tail

**Canvas:** Each sticker variant uses a 320×320 viewBox with `rx="16"` rounded rect background. The full scene (`fine`) uses 480×380.

**Meme adaptation rules:**
- Replace fire/chaos/crisis with crypto equivalents (red candles, rugs, gas fees, seed phrases)
- Replace positive outcomes with sol.new features (passkeys, fast launches, low fees)
- Speech bubbles use meme captions adapted for DeFi culture
- Keep the dog as the protagonist in all panels
- For multi-panel memes (e.g. Drake, distracted boyfriend), render panels side-by-side in a wider viewBox (e.g. 640×320)

## Example SVG structure for a sticker variant

```tsx
function MascotStonks({ size, className }: { size: number; className?: string }) {
  const w = 320, h = 320;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${w} ${h}`} width={size} height={size} className={cn(className)}>
      <rect width={w} height={h} fill="#0d0018" rx="16" />
      {/* scene-specific elements */}
      {/* ... */}
      <DogHead cx={160} cy={175} expression="happy" />
      <SpeechBubble x={80} y={80} text="stonks" subtext="📈 sol.new" />
      <text x="10" y="312" fontFamily="monospace" fontSize={10} fill="#7c3aed" opacity="0.4">sol.new</text>
    </svg>
  );
}
```
