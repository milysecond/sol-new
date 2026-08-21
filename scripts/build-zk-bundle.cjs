#!/usr/bin/env node
/** Build Privacy Cash + Light hasher browser bundle → public/zk/ */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const outDir = path.join(root, "public/zk");
fs.mkdirSync(outDir, { recursive: true });

const entry = path.join(root, "scripts/zk-privacy-entry.js");
const shim = path.join(root, "scripts/zk-shim.js");
const outfile = path.join(outDir, "privacycash.js");

const cmd = [
  "npx esbuild",
  JSON.stringify(entry),
  "--bundle",
  "--format=esm",
  "--platform=browser",
  "--target=es2022",
  `--outfile=${JSON.stringify(outfile)}`,
  "--external:@solana/web3.js",
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

console.log("build:zk → public/zk/privacycash.js");
execSync(cmd, { stdio: "inherit", cwd: root });

// Ensure wasm siblings exist next to the JS (import.meta.url relative)
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

const st = fs.statSync(outfile);
console.log(`build:zk done (${(st.size / 1024 / 1024).toFixed(1)} MiB)`);
