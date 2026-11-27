/**
 * Bundle and run the sponsor allowlist unit tests (src/lib/sponsor-policy.test.ts).
 * Pure checks: no RPC, no env, nothing sent anywhere.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const esbuild = path.join(path.dirname(require.resolve("esbuild/package.json")), "bin/esbuild");
const outfile = path.join(root, "node_modules", ".cache", "sponsor-test.mjs");

const build = spawnSync(
  esbuild,
  [
    path.join(root, "src/lib/sponsor-policy.test.ts"),
    "--bundle",
    "--platform=node",
    "--format=esm",
    `--outfile=${outfile}`,
    "--external:node:*",
    "--external:@solana/web3.js",
    "--banner:js=import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  ],
  { stdio: "inherit" },
);
if (build.status !== 0) process.exit(build.status ?? 1);

const run = spawnSync(process.execPath, ["--test", outfile], { stdio: "inherit", env: process.env });
process.exit(run.status ?? 1);
