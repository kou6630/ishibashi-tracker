const test = require("node:test");
const assert = require("node:assert/strict");
const onboarding = require("../onboarding-logic");

test("未ログインまたは未完了なら初回セットアップを表示する", () => {
  assert.equal(onboarding.shouldShowOnboarding({ hasSession: false, onboardingCompleted: false }), true);
  assert.equal(onboarding.shouldShowOnboarding({ hasSession: true, onboardingCompleted: false }), true);
  assert.equal(onboarding.shouldShowOnboarding({ hasSession: true, onboardingCompleted: true }), false);
});

test("セットアップはアバター工程なしの5段階に収める", () => {
  assert.equal(onboarding.STEPS.length, 5);
  assert.equal(onboarding.clampStep(-1), 0);
  assert.equal(onboarding.clampStep(99), 4);
  assert.equal(onboarding.STEPS.some((step) => step.key === "avatar"), false);
});

test("描画環境に応じて軽量化または静的表示へ切り替える", () => {
  assert.equal(onboarding.getRenderMode({ webglAvailable: true, averageFps: 60 }), "full");
  assert.equal(onboarding.getRenderMode({ webglAvailable: true, averageFps: 35 }), "lite");
  assert.equal(onboarding.getRenderMode({ webglAvailable: false }), "static");
});

test("Google UIDごとにローカル進捗の保存先を分離する", () => {
  assert.equal(onboarding.accountStorageKey("account-a"), "valorant_collection_game_v3:account-a");
  assert.equal(onboarding.accountStorageKey(""), "");
});
