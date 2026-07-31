const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (name) => fs.readFileSync(path.join(__dirname, "..", name), "utf8");

test("受取確定状態の反映は直後の再同期を起こさない", () => {
  const source = read("collection-game.js");
  assert.match(source, /applyCommittedCloudState/);
  assert.match(source, /options\.sync !== false/);
});

test("Google受信箱は50件ずつ追加読込できる", () => {
  const source = read("firebase.js") + read("index.html");
  assert.match(source, /collectionId: "inbox"/);
  assert.match(source, /fieldPath: "createdAt"/);
  assert.match(source, /fieldPath: "__name__"/);
  assert.match(source, /limit: 50/);
  assert.match(source, /firebaseInboxMoreButton/);
  assert.match(source, /getGoogleInboxPage/);
});

test("利用停止時は通常同期を開始しない", () => {
  const source = read("index.html") + read("main.js");
  assert.match(source, /accountGateState !== "active"/);
  assert.match(source, /accountStatus\.accountStatus === "blocked"/);
  assert.match(source, /setInterval\([^,]+, 60000\)/);
  assert.match(source, /accountGateLogin/);
});

test("連続する利用停止確認で監視再開条件を上書きしない", () => {
  const source = read("index.html");
  assert.match(source, /if \(accountGateState !== "blocked"\) \{\s*autoWatchWasRunningBeforeBlock = autoWatchRunning;/s);
  assert.match(source, /if \(wasBlocked && autoWatchWasRunningBeforeBlock\) \{\s*const resumed = await startMonitoringAutomatically\(\);\s*if \(resumed\?\.ok\) autoWatchWasRunningBeforeBlock = false;/s);
});

test("削除競合時は最新メールを再取得する", () => {
  const source = read("firebase.js");
  assert.match(source, /const latest = await prepareGoogleInboxDelete/);
  assert.match(source, /conflict: true, item: latest\.item/);
});

test("本文付きアイテムメールは本文表示と全添付受取に対応する", () => {
  const firebase = read("firebase.js");
  const inbox = require("../inbox-utils");
  assert.equal(inbox.getBody({ message: "旧メール本文" }), "旧メール本文");
  assert.equal(inbox.hasAttachment({ type: "item", kp: 1 }), true);
  assert.equal(inbox.hasAttachment({ type: "weeklyRanking", ap: 1 }), true);
  assert.equal(inbox.hasAttachment({ type: "loginBonus", cookies: 1 }), true);
  assert.match(firebase, /claimed:\s*true/);
});

test("利用者アプリは旧PUUID受信箱・一括配布APIを公開しない", () => {
  const firebase = require("../firebase");
  for (const name of ["sendMessage", "sendItem", "sendBulkMessage", "sendBulkItem", "getInbox", "claimInboxItem", "markInboxRead", "deleteInboxItem", "setUserStatus", "confiscateUserItems"]) {
    assert.equal(typeof firebase[name], "undefined", `${name} must not be exported`);
  }
});

test("利用者アプリに旧管理者UI・API・専用スタイルを残さない", () => {
  const source = read("index.html") + read("firebase.js") + read("main.js") + read("preload.js") + read("tracker-style.css");
  for (const identifier of ["adminPin", "adminPanel", "showAdmin", "loadAdminUsers", "sendFirebaseBulk", "confiscateFirebase", "banFirebaseUser", "listGoogleProfiles", ".admin-"]) {
    assert.doesNotMatch(source, new RegExp(identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
