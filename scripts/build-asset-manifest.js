const crypto = require("crypto");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");

const root = path.resolve(__dirname, "..");
const imageRoot = path.join(root, "img");
const outputRoot = path.resolve(root, process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "release-assets");

async function walk(directory) {
  const entries = await fsp.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  }));
  return nested.flat();
}

async function main() {
  const files = await walk(imageRoot);
  const assets = [];
  await fsp.mkdir(path.join(outputRoot, "files"), { recursive: true });
  for (const sourcePath of files) {
    const relative = path.relative(root, sourcePath).replace(/\\/g, "/");
    if (relative.startsWith("img/bootstrap/") || relative === "img/models/face_landmarker.task") continue;
    const content = await fsp.readFile(sourcePath);
    const digest = crypto.createHash("sha256").update(content).digest("hex");
    const extension = path.extname(sourcePath).toLowerCase();
    const assetName = `${digest}${extension}`;
    const destination = path.join(outputRoot, "files", assetName);
    try { await fsp.access(destination); } catch (error) { await fsp.copyFile(sourcePath, destination); }
    assets.push({ path: relative, assetName, size: content.length, sha256: digest, version: `assets-v1-${digest.slice(0, 12)}` });
  }
  assets.sort((left, right) => left.path.localeCompare(right.path, "ja"));
  const manifest = { schemaVersion: 1, version: "assets-v1", assets };
  await fsp.writeFile(path.join(outputRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  process.stdout.write(`Prepared ${assets.length} assets in ${outputRoot}\n`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
