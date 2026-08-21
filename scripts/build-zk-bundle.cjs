#!/usr/bin/env node
/** Build Privacy Cash + Light hasher browser bundle → public/zk/ (fully self-contained) */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const outDir = path.join(root, "public/zk");
fs.mkdirSync(outDir, { recursive: true });

const entry = path.join(root, "scripts/zk-privacy-entry.js");
const shim = path.join(root, "scripts/zk-shim.js");
const outfile = path.join(outDir, "privacycash.js");

// Bundle EVERYTHING including @solana/web3.js so the browser has no bare imports.
const cmd = [
  "npx esbuild",
  JSON.stringify(entry),
  "--bundle",
  "--format=esm",
  "--platform=browser",
  "--target=es2022",
  `--outfile=${JSON.stringify(outfile)}`,
  "--alias:crypto=crypto-browserify",
  "--alias:stream=stream-browserify",
  "--alias:events=events",
  "--alias:buffer=buffer",
  "--define:global=globalThis",
  "--loader:.wasm=file",
  "--asset-names=[name]",
  "--public-path=/zk/",
  "--main-fields=browser,module,main",
  `--inject:${JSON.stringify(shim)}`,
].join(" ");

console.log("build:zk → public/zk/privacycash.js (self-contained)");
execSync(cmd, { stdio: "inherit", cwd: root });

const wasmSrc = path.join(
  root,
  "node_modules/@lightprotocol/hasher.rs/dist/browser-fat/es",
);
for (const f of ["hasher_wasm_simd_bg.wasm", "light_wasm_hasher_bg.wasm"]) {
  const from = path.join(wasmSrc, f);
  const alt = path.join(root, "node_modules/@lightprotocol/hasher.rs/dist", f);
  const src = fs.existsSync(from) ? from : alt;
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(outDir, f));
  }
}

// Sanity: no bare bare-module imports left (except maybe node builtins we polyfilled)
const js = fs.readFileSync(outfile, "utf8");
const bare = [...js.matchAll(/(?:from|import)\s*\(?\s*["'](@[^"']+|[^"'./][^"']*)["']/g)]
  .map((m) => m[1])
  .filter((s) => !s.endsWith(".wasm") && !s.startsWith("data:"));
const unique = [...new Set(bare)].filter(
  (s) =>
    !s.includes("\n") &&
    s.length < 80 &&
    (s.startsWith("@") || /^[a-zA-Z]/.test(s)),
);
if (unique.length) {
  console.warn("build:zk warning — possible bare imports still present:", unique.slice(0, 20));
} else {
  console.log("build:zk: no bare module imports detected");
}

const st = fs.statSync(outfile);
console.log(`build:zk done (${(st.size / 1024 / 1024).toFixed(1)} MiB)`);
