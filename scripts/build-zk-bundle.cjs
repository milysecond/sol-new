#!/usr/bin/env node
/** Build Privacy Cash + Light hasher browser bundle → public/zk/ (fully self-contained) */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const outDir = path.join(root, "public/zk");
fs.mkdirSync(outDir, { recursive: true });

const entry = path.join(root, "scripts/zk-privacy-entry.js");
const shim = path.join(root, "scripts/zk-shim.js");
const outfile = path.join(outDir, "privacycash.js");
const relayer =
  process.env.NEXT_PUBLIC_RELAYER_API_URL || "https://api3.privacycash.org";

// Bundle EVERYTHING including @solana/web3.js so the browser has no bare imports.
const args = [
  "esbuild",
  entry,
  "--bundle",
  "--format=esm",
  "--platform=browser",
  "--target=es2022",
  `--outfile=${outfile}`,
  "--alias:crypto=crypto-browserify",
  "--alias:stream=stream-browserify",
  "--alias:events=events",
  "--alias:buffer=buffer",
  "--define:global=globalThis",
  // String value must be a JSON-quoted string for esbuild --define
  `--define:process.env.NEXT_PUBLIC_RELAYER_API_URL=${JSON.stringify(relayer)}`,
  "--loader:.wasm=file",
  "--asset-names=[name]",
  "--public-path=/zk/",
  "--main-fields=browser,module,main",
  `--inject:${shim}`,
];

console.log("build:zk → public/zk/privacycash.js (self-contained)");
console.log("relayer", relayer);
execFileSync("npx", args, { stdio: "inherit", cwd: root });

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

const js = fs.readFileSync(outfile, "utf8");
const bare = [...js.matchAll(/(?:from|import)\s*\(?\s*["'](@solana\/[^"']+)["']/g)].map(
  (m) => m[1],
);
if (bare.length) {
  console.warn("build:zk warning — bare @solana imports:", bare);
} else {
  console.log("build:zk: no bare @solana imports");
}

const st = fs.statSync(outfile);
console.log(`build:zk done (${(st.size / 1024 / 1024).toFixed(1)} MiB)`);
