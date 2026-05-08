const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const {
  TwaManifest,
  TwaGenerator,
  ConsoleLog,
  BufferedLog,
} = require("/opt/homebrew/lib/node_modules/@bubblewrap/cli/node_modules/@bubblewrap/core/dist");

(async () => {
  const cwd = process.cwd();
  const manifestPath = path.join(cwd, "twa-manifest.json");
  const twaManifest = await TwaManifest.fromFile(manifestPath);

  const log = new BufferedLog(new ConsoleLog("scaffold"));
  const gen = new TwaGenerator();
  await gen.createTwaProject(cwd, twaManifest, log, () => {});
  log.flush();

  const sum = crypto
    .createHash("sha1")
    .update(await fs.promises.readFile(manifestPath))
    .digest("hex");
  await fs.promises.writeFile(path.join(cwd, "manifest-checksum.txt"), sum);

  console.log("scaffolded → ./app/, manifest-checksum.txt written");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
