#!/usr/bin/env node
/**
 * Patch privacycash prover for browser/mobile:
 * - force singleThread (Safari workers break)
 * - absolute circuit URLs
 */
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const targets = [
  path.join(root, "node_modules/privacycash/dist/utils/prover.js"),
  path.join(root, "node_modules/privacycash/src/utils/prover.ts"),
];

const MARKER = "solnew-singlethread-browser";

function patchJs(file) {
  if (!fs.existsSync(file)) return false;
  let t = fs.readFileSync(file, "utf8");
  if (t.includes(MARKER)) return false;

  // force single thread in browser
  if (t.includes("function shouldUseSingleThread")) {
    t = t.replace(
      /function shouldUseSingleThread\(\)\s*\{[\s\S]*?\n\}/,
      `function shouldUseSingleThread() {
    // ${MARKER}
    if (typeof window !== "undefined") return true;
    if (typeof Deno !== "undefined") return true;
    if (typeof Bun !== "undefined") return true;
    return false;
}`,
    );
  }

  // absolute paths for wasm/zkey in prove()
  if (t.includes("keyBasePath}.wasm") && !t.includes("origin + wasmPath")) {
    t = t.replace(
      /return await groth16Typed\.fullProve\([^;]+;/,
      `let wasmPath = \`\${keyBasePath}.wasm\`;
    let zkeyPath = \`\${keyBasePath}.zkey\`;
    if (typeof window !== "undefined" && wasmPath.startsWith("/")) {
        const origin = window.location.origin;
        wasmPath = origin + wasmPath;
        zkeyPath = origin + zkeyPath;
    }
    return await groth16Typed.fullProve(utilsTyped.stringifyBigInts(input), wasmPath, zkeyPath, undefined, singleThreadOpts, singleThreadOpts);`,
    );
  }

  fs.writeFileSync(file, t);
  console.log("patched", path.relative(root, file));
  return true;
}

let n = 0;
for (const f of targets) if (patchJs(f)) n++;
if (!n) console.log("patch-privacycash-prover: already applied or missing");
