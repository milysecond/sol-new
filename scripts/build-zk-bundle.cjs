#!/usr/bin/env node
/** Build Privacy Cash browser bundles for mainnet + devnet → public/zk/ */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const outDir = path.join(root, "public/zk");
fs.mkdirSync(outDir, { recursive: true });

const entry = path.join(root, "scripts/zk-privacy-entry.js");
const shim = path.join(root, "scripts/zk-shim.js");

const altPath = path.join(
  root,
  "services/pc-relayer-devnet/data/alt.json",
);
let devnetAlt = process.env.NEXT_PUBLIC_ALT_ADDRESS_DEVNET || "";
try {
  devnetAlt = JSON.parse(fs.readFileSync(altPath, "utf8")).address;
} catch {
  /* optional */
}

const devnetRelayer =
  process.env.NEXT_PUBLIC_RELAYER_API_URL_DEVNET ||
  process.env.PC_DEVNET_RELAYER_URL ||
  "";

const targets = [
  {
    name: "mainnet",
    outfile: path.join(outDir, "privacycash.js"),
    defines: {
      "process.env.NEXT_PUBLIC_RELAYER_API_URL": "https://api3.privacycash.org",
      "process.env.NEXT_PUBLIC_PROGRAM_ID":
        "9fhQBbumKEFuXtMBDw8AaQyAjCorLGJQiS3skWZdQyQD",
      "process.env.NEXT_PUBLIC_ALT_ADDRESS":
        "HEN49U2ySJ85Vc78qprSW9y6mFDhs1NczRxyppNHjofe",
    },
  },
];

if (devnetRelayer && devnetAlt) {
  targets.push({
    name: "devnet",
    outfile: path.join(outDir, "privacycash-devnet.js"),
    defines: {
      "process.env.NEXT_PUBLIC_RELAYER_API_URL": devnetRelayer,
      "process.env.NEXT_PUBLIC_PROGRAM_ID":
        "ATZj4jZ4FFzkvAcvk27DW9GRkgSbFnHo49fKKPQXU7VS",
      "process.env.NEXT_PUBLIC_ALT_ADDRESS": devnetAlt,
    },
  });
} else {
  console.warn(
    "build:zk skip devnet bundle (set PC_DEVNET_RELAYER_URL + create ALT)",
  );
}

function buildOne(t) {
  const args = [
    "esbuild",
    entry,
    "--bundle",
    "--format=esm",
    "--platform=browser",
    "--target=es2022",
    `--outfile=${t.outfile}`,
    "--alias:crypto=crypto-browserify",
    "--alias:stream=stream-browserify",
    "--alias:events=events",
    "--alias:buffer=buffer",
    "--define:global=globalThis",
    "--loader:.wasm=file",
    "--asset-names=[name]",
    "--public-path=/zk/",
    "--main-fields=browser,module,main",
    `--inject:${shim}`,
  ];
  for (const [k, v] of Object.entries(t.defines)) {
    args.push(`--define:${k}=${JSON.stringify(v)}`);
  }
  console.log("build:zk", t.name, "→", path.relative(root, t.outfile));
  console.log(" ", t.defines);
  execFileSync("npx", args, { stdio: "inherit", cwd: root });
}

for (const t of targets) buildOne(t);

// wasm siblings
const wasmSrc = path.join(
  root,
  "node_modules/@lightprotocol/hasher.rs/dist/browser-fat/es",
);
for (const f of ["hasher_wasm_simd_bg.wasm", "light_wasm_hasher_bg.wasm"]) {
  const from = path.join(wasmSrc, f);
  const alt = path.join(root, "node_modules/@lightprotocol/hasher.rs/dist", f);
  const src = fs.existsSync(from) ? from : alt;
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(outDir, f));
}

console.log("build:zk done");
