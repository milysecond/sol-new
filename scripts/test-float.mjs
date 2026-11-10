/**
 * Bundle and run the Float unit tests (and, with FLOAT_SIM=1, a mainnet simulation).
 * Uses the esbuild already installed with Next. No extra test runner.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const esbuild = path.join(path.dirname(require.resolve("esbuild/package.json")), "bin/esbuild");
const outfile = path.join("/tmp", "float-test.cjs");

const build = spawnSync(
  esbuild,
  [
    path.join(root, "src/lib/float/float.test.ts"),
    "--bundle",
    "--platform=node",
    "--format=cjs",
    `--outfile=${outfile}`,
    "--external:node:*",
  ],
  { stdio: "inherit" },
);
if (build.status !== 0) process.exit(build.status ?? 1);

const run = spawnSync(process.execPath, ["--test", outfile], {
  stdio: "inherit",
  env: process.env,
});
process.exit(run.status ?? 1);
