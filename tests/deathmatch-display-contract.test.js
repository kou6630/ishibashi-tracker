const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (name) => fs.readFileSync(path.join(__dirname, "..", name), "utf8");

test("デスマッチは全員一覧と指定した5列へ自動で切り替える", () => {
  const source = read("index.html");
  assert.match(source, /id="deathmatchArea"/);
  assert.match(source, /デスマッチ参加者/);
  assert.match(source, /function getDeathmatchPlayerRowHtml/);
  assert.match(source, /getAgentHtml\(player\)/);
  assert.match(source, /teamsArea\.hidden = isDeathmatch/);
  assert.match(source, /entryStopInfo\.hidden = isDeathmatch/);
});

test("デスマッチの取得完了判定と取得率にはHS率を含める", () => {
  const core = read("tracker-core.js");
  const stats = read("tracker-stats.js");
  assert.match(core, /isDeathmatch\s*\?\s*!isMeaningfulValue\(hsRate\)/);
  assert.match(core, /\["rank", "hsRate", "peakRank"\]/);
  assert.match(stats, /\["rank", "hsRate", "peakRank"\]/);
});
