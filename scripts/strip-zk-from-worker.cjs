#!/usr/bin/env node
/**
 * After OpenNext build: scrub Privacy Cash / Light Protocol from the Worker
 * server bundle so wrangler stays under the 10 MiB limit. Client chunks keep
 * the full packages via normal Next client bundling.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(process.cwd(), ".open-next");
if (!fs.existsSync(root)) {
  console.error("strip-zk-from-worker: .open-next missing — run build first");
  process.exit(1);
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// 1) Drop package copies under server-functions
const killDirs = [];
for (const p of walk(path.join(root, "server-functions"))) {
  if (
    p.includes(`${path.sep}node_modules${path.sep}@lightprotocol`) ||
    p.includes(`${path.sep}node_modules${path.sep}privacycash`) ||
    p.includes(`${path.sep}node_modules${path.sep}snarkjs`) ||
    p.includes(`${path.sep}node_modules${path.sep}ffjavascript`)
  ) {
    const parts = p.split(`${path.sep}node_modules${path.sep}`);
    if (parts.length >= 2) {
      const pkgRoot = path.join(
        parts[0],
        "node_modules",
        parts[1].split(path.sep)[0].startsWith("@")
          ? path.join(parts[1].split(path.sep)[0], parts[1].split(path.sep)[1])
          : parts[1].split(path.sep)[0],
      );
      killDirs.push(pkgRoot);
    }
  }
}
for (const d of [...new Set(killDirs)]) {
  if (fs.existsSync(d)) {
    rmrf(d);
    console.log("rm", d);
  }
}

// 2) Patch handler.mjs to stub remaining bare references
const handler = path.join(root, "server-functions/default/handler.mjs");
if (fs.existsSync(handler)) {
  let t = fs.readFileSync(handler, "utf8");
  const before = t.length;
  t = t.replace(
    /import\(["'][^"']*(?:@lightprotocol|privacycash|snarkjs|ffjavascript|index_browser_fat|hasher_wasm|light_wasm)[^"']*["']\)/g,
    'Promise.reject(new Error("ZK stack is browser-only"))',
  );
  t = t.replace(
    /require\(["'][^"']*(?:@lightprotocol|privacycash|snarkjs|ffjavascript)[^"']*["']\)/g,
    '(() => { throw new Error("ZK stack is browser-only") })()',
  );
  fs.writeFileSync(handler, t);
  console.log("patched handler.mjs", before, "->", t.length);
}

// 3) Remove accidental absolute path trees
const weird = path.join(root, "server-functions/default/Volumes");
if (fs.existsSync(weird)) {
  rmrf(weird);
  console.log("rm weird Volumes path");
}

console.log("strip-zk-from-worker: done");
