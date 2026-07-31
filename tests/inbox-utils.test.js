const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const inbox = require("../inbox-utils");
const firebase = require("../firebase");

test("inbox-utils.js is loaded by the page and included in the package", () => {
  const root = path.join(__dirname, "..");
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(indexHtml, /<script\s+src=["']inbox-utils\.js["']><\/script>/);
  assert.ok(packageJson.build.files.includes("inbox-utils.js"));
});

test("ランキング報酬とログインボーナスを添付メールとして表示・受取対象にする", () => {
  const mails = [
    { type: "weeklyRanking", body: "週間結果です", kp: 10, ap: 10 },
    { type: "loginBonus", body: "ログイン1日目の報酬です", cookies: 150 },
    { type: "item", message: "旧形式のアイテムです", ticket15: 1 }
  ];
  for (const mail of mails) {
    assert.equal(inbox.hasAttachment(mail), true);
    assert.notEqual(inbox.getBody(mail), "");
  }
});

test("本文はbodyを優先し、旧messageメールも表示する", () => {
  assert.equal(inbox.getBody({ body: "新しい本文", message: "古い本文" }), "新しい本文");
  assert.equal(inbox.getBody({ message: "古い本文" }), "古い本文");
});

test("Firestore変換は上位者オブジェクト配列を正しく復元する", () => {
  const winners = [{ uid: "a", rank: 1, kills: 20, assists: 5, reward: 10 }];
  const restored = firebase.__test.fromValue(firebase.__test.toValue(winners));
  assert.deepEqual(restored, winners);
});
