const test = require("node:test");
const assert = require("node:assert/strict");
const loginBonus = require("../login-bonus");
const firebase = require("../firebase");

function sequence(values) {
  let index = 0;
  return () => values[index++] ?? 0.99;
}

test("ログインボーナスは旧値を5日周期へ移行する", () => {
  assert.equal(loginBonus.normalizeState({ loginBonusDayIndex: 0 }).dayIndex, 0);
  assert.equal(loginBonus.normalizeState({ loginBonusDayIndex: 4 }).dayIndex, 4);
  assert.equal(loginBonus.normalizeState({ loginBonusDayIndex: 5 }).dayIndex, 0);
  assert.equal(loginBonus.normalizeState({ loginBonusDayIndex: 11 }).dayIndex, 1);
});

test("おまけKP・APは固定乱数で確定し、0量は発生しない", () => {
  const state = {
    kp: 10, ap: 20, tickets: { multiplier15: 0, multiplier2: 0 },
    skills: { bonusKpChance: 40, bonusKpAmount: 3, bonusApChance: 40, bonusApAmount: 2, rouletteChance: 0 },
    characterCounts: {}, achievements: { stats: {} }
  };
  const applied = firebase.__test.applyGoogleMatchReward(state, { kpEarned: 4, apEarned: 1 }, sequence([0, 0, 0.99]));
  assert.equal(applied.reward.bonusKp, 3);
  assert.equal(applied.reward.bonusAp, 2);
  assert.equal(applied.state.kp, 17);
  assert.equal(applied.state.ap, 23);

  const zeroAmount = firebase.__test.applyGoogleMatchReward({ ...state, skills: { bonusKpChance: 40, bonusKpAmount: 0, bonusApChance: 0, bonusApAmount: 0, rouletteChance: 0 } }, { kpEarned: 1, apEarned: 0 }, sequence([0.99]));
  assert.equal(zeroAmount.reward.bonusKp, 0);
  assert.equal(zeroAmount.reward.bonusAp, 0);
});

test("ルーレットの固定乱数は確率境界どおりの報酬を返す", () => {
  assert.equal(firebase.__test.rollGoogleRoulette({}, sequence([0.00])).key, "kp5");
  assert.equal(firebase.__test.rollGoogleRoulette({}, sequence([0.36])).key, "ap10");
  assert.equal(firebase.__test.rollGoogleRoulette({}, sequence([0.71])).key, "ticket15");
  assert.equal(firebase.__test.rollGoogleRoulette({}, sequence([0.91])).key, "ticket2");
  assert.equal(firebase.__test.rollGoogleRoulette({ characterCounts: {} }, sequence([0.99])).key, "hit");
  assert.equal(firebase.__test.rollGoogleRoulette({ characterCounts: { series4_ishibashi1: 3 } }, sequence([0.99])).key, "hit-duplicate");
});
