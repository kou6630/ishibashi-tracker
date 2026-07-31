const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const main = fs.readFileSync(path.join(root, "main.js"), "utf8");

test("パッケージとロックファイルのアプリ版は1.4.12で一致する", () => {
  assert.equal(pkg.version, "1.4.12");
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages?.[""]?.version, pkg.version);
});

test("タイトル横はv1.4.12を初期表示し実際のアプリ版で更新する", () => {
  assert.match(index, /id="appVersionBadge"[^>]*>v1\.4\.12<\/span>/);
  assert.match(index, /versionBadge\.textContent = `v\$\{info\.version\}`/);
  assert.match(main, /version:\s*app\.getVersion\(\)/);
});

test("利用者画面に古い固定バージョンを残さない", () => {
  const visibleVersions = [...index.matchAll(/v\d+\.\d+\.\d+/g)].map((match) => match[0]);
  assert.deepEqual([...new Set(visibleVersions)], ["v1.4.12"]);
});
