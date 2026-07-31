const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Googleアカウントごとにローカル進捗の保存先を分離する", () => {
  const onboarding = read("onboarding.js");
  const collection = read("collection-game.js");
  assert.doesNotMatch(onboarding, /migrateGoogleProgress\?\.\(window\.collectionGame\?\.getCloudState/);
  assert.match(collection, /ACCOUNT_STORAGE_PREFIX = "valorant_collection_game_v3:"/);
  assert.match(collection, /deactivateGoogleAccount/);
});

test("セットアップ完了後にだけ通常画面を開始する", () => {
  const html = read("index.html");
  const onboarding = read("onboarding.js");
  assert.match(html, /function startAccountGateLifecycle\(\)/);
  assert.match(html, /onboarding:ready/);
  assert.match(html, /onboarding:completed/);
  assert.match(onboarding, /onboarding:completed/);
  assert.doesNotMatch(onboarding, /renderCamera|completeCamera|avatarTest|cameraCompletionHandler/);
});

test("起動時撮影は過去の許可記録に依存せず無言で試行する", () => {
  const camera = read("startup-camera.js");
  const onboarding = read("onboarding.js");
  const main = read("main.js");
  const preload = read("preload.js");
  assert.match(camera, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(camera, /setCameraAccessScope\?\.\("startup"\)/);
  assert.match(camera, /setCameraAccessScope\?\.\("none"\)/);
  assert.match(camera, /saveGoogleAvatarPhoto/);
  assert.doesNotMatch(camera, /avatar_camera_access_v1|alert\(|confirm\(|prompt\(/);
  assert.match(onboarding, /window\.startupCamera\?\.capture\?\.\(\);/);
  assert.match(main, /!\["startup", "none"\]\.includes\(scope\)/);
  assert.match(preload, /setCameraAccessScope: \(scope\) => ipcRenderer\.invoke\("set-camera-access-scope", scope\)/);
});

test("利用者向けアバター設定と保存写真削除を公開しない", () => {
  const html = read("index.html");
  const preload = read("preload.js");
  const firebase = read("firebase.js");
  const packageInfo = JSON.parse(read("package.json"));
  assert.doesNotMatch(html, /avatarTestRetryButton|deleteOwnAvatarPhotoButton|avatar-test\.js/);
  assert.doesNotMatch(preload, /deleteOwnGoogleAvatarPhoto/);
  assert.doesNotMatch(firebase, /deleteOwnGoogleAvatarTestPhoto/);
  assert.equal(packageInfo.build.files.includes("avatar-test.js"), false);
  assert.equal(packageInfo.build.files.includes("img/models/face_landmarker.task"), false);
  assert.equal(packageInfo.dependencies["@mediapipe/tasks-vision"], undefined);
});

test("大容量画像はオンデマンド素材配信へ分離される", () => {
  const main = read("main.js");
  const preload = read("preload.js");
  const packageInfo = JSON.parse(read("package.json"));
  assert.match(main, /protocol\.handle\("asset"/);
  assert.match(main, /assetManager\.sync\(\)/);
  assert.match(preload, /getAssetStatus: \(\) => ipcRenderer\.invoke\("get-asset-status"\)/);
  assert.equal(packageInfo.build.files.includes("img/**/*"), false);
  assert.equal(packageInfo.build.files.includes("img\/bootstrap\/\*\*\/*"), true);
});

test("ランキング画面は手動更新中の二重取得を防ぐ", () => {
  const html = read("index.html");
  assert.match(html, /id="weeklyRankingRefreshButton"/);
  assert.match(html, /if \(loading\) return/);
  assert.match(html, /refreshButton\.disabled = true/);
  assert.match(html, /await refresh\(\)/);
});
