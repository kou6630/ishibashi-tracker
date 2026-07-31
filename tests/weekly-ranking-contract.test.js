const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const firebase = require("../firebase");

const read = (name) => fs.readFileSync(path.join(__dirname, "..", name), "utf8");

test("週間ランキングは日本時間の月曜始まりになる", () => {
  assert.equal(firebase.__test.getWeeklyCompetitiveWeekId("2026-07-27"), "2026-07-27");
  assert.equal(firebase.__test.getWeeklyCompetitiveWeekId("2026-07-30"), "2026-07-27");
  assert.equal(firebase.__test.getPreviousWeeklyCompetitiveWeekId("2026-07-27"), "2026-07-20");
});

test("参加人数ごとの週間ランキング報酬はKPとAPで同額になる", () => {
  assert.deepEqual(firebase.__test.getWeeklyCompetitiveRewards(1), [1]);
  assert.deepEqual(firebase.__test.getWeeklyCompetitiveRewards(2), [2, 1]);
  assert.deepEqual(firebase.__test.getWeeklyCompetitiveRewards(3), [5, 3, 1]);
  assert.deepEqual(firebase.__test.getWeeklyCompetitiveRewards(5), [7, 5, 3]);
  assert.deepEqual(firebase.__test.getWeeklyCompetitiveRewards(10), [10, 7, 5]);
  assert.deepEqual(firebase.__test.getWeeklyCompetitiveRewards(20), [20, 13, 8]);
  assert.deepEqual(firebase.__test.getWeeklyCompetitiveRewards(30), [30, 20, 10]);
  assert.deepEqual(firebase.__test.getWeeklyCompetitiveRewards(31), [50, 30, 10]);
});

test("同キルはアシスト順、完全同点は同率順位になる", () => {
  const ranked = firebase.__test.rankWeeklyCompetitiveEntries([
    { uid: "a", kills: 10, assists: 2 },
    { uid: "b", kills: 10, assists: 5 },
    { uid: "c", kills: 9, assists: 9 },
    { uid: "d", kills: 9, assists: 9 }
  ]);
  assert.deepEqual(ranked.map((entry) => [entry.uid, entry.rank]), [["b", 1], ["a", 2], ["c", 3], ["d", 3]]);
});

test("ログインボーナスは受信箱メールでのみ作成し、専用ボタンを置かない", () => {
  const source = read("index.html") + read("firebase.js") + read("main.js") + read("preload.js");
  assert.doesNotMatch(read("index.html"), /id="loginBonusButton"/);
  assert.match(source, /ensureLoginBonusInboxMail/);
  assert.match(source, /type: "loginBonus"/);
  assert.match(source, /loginBonusPendingMailId/);
});

test("ランキング画面と前週確定メールを用意する", () => {
  const source = read("index.html") + read("firebase.js") + read("main.js") + read("preload.js");
  assert.match(source, /id="weeklyRankingButton"/);
  assert.match(source, /getWeeklyRanking/);
  assert.match(source, /finalizePreviousWeeklyCompetitiveRanking/);
  assert.match(source, /週間コンペランキング結果/);
});

test("Google同期はVALORANT情報より先に受信箱処理を行う", () => {
  const source = read("main.js").slice(read("main.js").indexOf('ipcMain.handle("firebase-sync-account"'));
  const ranking = source.indexOf("finalizePreviousWeeklyCompetitiveRanking");
  const bonus = source.indexOf("ensureLoginBonusInboxMail");
  const inbox = source.indexOf("getGoogleInbox(session.user, session.idToken)");
  const account = source.indexOf("let account;");
  assert.ok(ranking >= 0 && ranking < account);
  assert.ok(bonus >= 0 && bonus < account);
  assert.ok(inbox >= 0 && inbox < account);
});

test("optional sync failures do not prevent inbox retrieval", () => {
  const source = read("main.js").slice(read("main.js").indexOf('ipcMain.handle("firebase-sync-account"'));
  assert.match(source, /try\s*\{\s*serverDate = await getTrustedJstDate\(\);\s*\}\s*catch/s);
  assert.match(source, /try\s*\{\s*const ranking = await firebaseAdmin\.finalizePreviousWeeklyCompetitiveRanking[\s\S]*?\}\s*catch/s);
  assert.match(source, /try\s*\{\s*const loginBonus = await firebaseAdmin\.ensureLoginBonusInboxMail[\s\S]*?\}\s*catch/s);
  assert.match(source, /let inbox = \{ ok: false, inbox: \[\], message: "受信箱を取得できませんでした。" \};\s*try\s*\{\s*inbox = await firebaseAdmin\.getGoogleInbox/s);
});
