const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { AssetManager, normalizeManifest, safeRelativeAssetPath } = require("../asset-manager");

const manifestUrl = "https://assets.example.test/manifest.json";
const digest = (content) => crypto.createHash("sha256").update(content).digest("hex");

function manifestFor(relativePath, content, version = "assets-v1") {
  const sha256 = digest(content);
  return { schemaVersion: 1, version, assets: [{ path: relativePath, assetName: `${sha256}.png`, size: content.length, sha256, version: `${version}-${sha256.slice(0, 12)}` }] };
}

async function fixture(manifest, files, options = {}) {
  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "valorant-assets-"));
  const appPath = await fs.mkdtemp(path.join(os.tmpdir(), "valorant-app-"));
  await fs.mkdir(path.join(appPath, "img", "bootstrap"), { recursive: true });
  await fs.writeFile(path.join(appPath, "img", "bootstrap", "image-placeholder.svg"), "placeholder");
  const requests = [];
  const manager = new AssetManager({ cacheDir, appPath, isPackaged: options.isPackaged ?? true, manifestUrl, fetchBuffer: async (url) => {
    requests.push(url);
    if (url === manifestUrl) return Buffer.from(JSON.stringify(manifest));
    const name = path.basename(new URL(url).pathname);
    if (!files[name]) throw new Error("offline");
    return files[name];
  } });
  await manager.initialize();
  return { manager, requests, dispose: async () => Promise.all([fs.rm(cacheDir, { recursive: true, force: true }), fs.rm(appPath, { recursive: true, force: true })]) };
}

test("初回同期は検証済み素材とmanifestを原子的にキャッシュする", async () => {
  const content = Buffer.from("first image");
  const manifest = manifestFor("img/example.png", content);
  const subject = await fixture(manifest, { [manifest.assets[0].assetName]: content });
  try {
    const result = await subject.manager.sync();
    assert.equal(result.ok, true);
    assert.equal(result.changed, 1);
    assert.equal(await fs.readFile(subject.manager.getAssetPath("img/example.png"), "utf8"), "first image");
  } finally { await subject.dispose(); }
});

test("二回目の同期は同一ハッシュの素材を再取得しない", async () => {
  const content = Buffer.from("cached image");
  const manifest = manifestFor("img/example.png", content);
  const subject = await fixture(manifest, { [manifest.assets[0].assetName]: content });
  try {
    await subject.manager.sync();
    subject.requests.length = 0;
    await subject.manager.sync();
    assert.deepEqual(subject.requests, [manifestUrl]);
  } finally { await subject.dispose(); }
});

test("manifest更新失敗時は旧キャッシュを維持し、成功時は変更素材だけを入れ替える", async () => {
  const oldContent = Buffer.from("old image");
  const nextContent = Buffer.from("new image");
  const oldManifest = manifestFor("img/example.png", oldContent, "assets-v1");
  const nextManifest = manifestFor("img/example.png", nextContent, "assets-v2");
  const subject = await fixture(oldManifest, { [oldManifest.assets[0].assetName]: oldContent });
  try {
    await subject.manager.sync();
    subject.manager.fetchBuffer = async (url) => {
      if (url === manifestUrl) return Buffer.from(JSON.stringify(nextManifest));
      throw new Error("offline");
    };
    assert.equal((await subject.manager.sync()).ok, false);
    assert.equal(subject.manager.getStatus().version, "assets-v1");
    assert.equal(await fs.readFile(subject.manager.getAssetPath("img/example.png"), "utf8"), "old image");
    subject.manager.fetchBuffer = async (url) => url === manifestUrl ? Buffer.from(JSON.stringify(nextManifest)) : nextContent;
    assert.equal((await subject.manager.sync()).changed, 1);
    assert.equal(await fs.readFile(subject.manager.getAssetPath("img/example.png"), "utf8"), "new image");
  } finally { await subject.dispose(); }
});

test("manifest更新時は変更された素材だけを再取得する", async () => {
  const stable = Buffer.from("stable");
  const oldChanged = Buffer.from("old changed");
  const newChanged = Buffer.from("new changed");
  const stableEntry = manifestFor("img/stable.png", stable).assets[0];
  const oldEntry = manifestFor("img/changed.png", oldChanged).assets[0];
  const nextEntry = manifestFor("img/changed.png", newChanged, "assets-v2").assets[0];
  const oldManifest = { schemaVersion: 1, version: "assets-v1", assets: [stableEntry, oldEntry] };
  const nextManifest = { schemaVersion: 1, version: "assets-v2", assets: [stableEntry, nextEntry] };
  const subject = await fixture(oldManifest, { [stableEntry.assetName]: stable, [oldEntry.assetName]: oldChanged, [nextEntry.assetName]: newChanged });
  try {
    await subject.manager.sync();
    subject.requests.length = 0;
    subject.manager.fetchBuffer = async (url) => {
      subject.requests.push(url);
      if (url === manifestUrl) return Buffer.from(JSON.stringify(nextManifest));
      return newChanged;
    };
    const result = await subject.manager.sync();
    assert.equal(result.changed, 1);
    assert.deepEqual(subject.requests.slice(1), [new URL(`./${nextEntry.assetName}`, manifestUrl).toString()]);
  } finally { await subject.dispose(); }
});

test("ハッシュ不一致の素材は有効化せず、未取得時は同梱プレースホルダーを返す", async () => {
  const expected = Buffer.from("expected image");
  const manifest = manifestFor("img/example.png", expected);
  const subject = await fixture(manifest, { [manifest.assets[0].assetName]: Buffer.from("tampered") });
  try {
    assert.equal((await subject.manager.sync()).ok, false);
    assert.match(subject.manager.getAssetPath("img/example.png"), /image-placeholder\.svg$/);
  } finally { await subject.dispose(); }
});

test("素材パスとmanifestは安全なimg相対パスだけを受け入れる", () => {
  assert.equal(safeRelativeAssetPath("img/キャラ/a.png"), "img/キャラ/a.png");
  assert.equal(safeRelativeAssetPath("img/../secret.png"), null);
  assert.equal(safeRelativeAssetPath("file:///secret.png"), null);
  assert.equal(normalizeManifest({ schemaVersion: 1, version: "x", assets: [] }).assets.length, 0);
});

test("開発環境では未同期でもプロジェクト内imgをフォールバックする", async () => {
  const subject = await fixture({ schemaVersion: 1, version: "assets-v1", assets: [] }, {}, { isPackaged: false });
  try {
    const local = path.join(subject.manager.appPath, "img", "dev.png");
    await fs.writeFile(local, "dev image");
    assert.equal(subject.manager.getAssetPath("img/dev.png"), local);
  } finally { await subject.dispose(); }
});
