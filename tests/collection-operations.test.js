const test = require("node:test");
const assert = require("node:assert/strict");
const operations = require("../collection-operations");

function state(overrides = {}) {
  return {
    kp: 100,
    ap: 0,
    cookies: 500,
    tickets: { multiplier15: 0, multiplier2: 0 },
    trackerLevel: 21,
    skills: {},
    egg: null,
    characterCounts: {},
    achievements: { stats: { summonedEggTypes: [] } },
    ...overrides
  };
}

test("invalid saved eggs are cleared and valid egg labels are canonical", () => {
  assert.equal(operations.normalizeEgg({ type: "unknown", label: "broken" }), null);
  assert.deepEqual(operations.normalizeEgg({ type: "iron", label: "tampered", createdAt: "bad" }), { type: "iron", label: "アイアン", createdAt: 0 });
});

test("summoning and hatching apply the cost and result together", () => {
  const summoned = operations.applyOperation(state({ trackerLevel: 0, cookies: 0 }), { type: "summonEgg" }, () => 0.99, 123);
  assert.equal(summoned.ok, true);
  assert.equal(summoned.state.kp, 90);
  assert.equal(summoned.state.egg.createdAt, 123);
  const hatched = operations.applyOperation(summoned.state, { type: "hatchEgg" }, () => 0);
  assert.equal(hatched.ok, true);
  assert.equal(hatched.state.egg, null);
  assert.equal(hatched.state.kp, 75);
  assert.equal(Object.values(hatched.state.characterCounts).reduce((sum, value) => sum + value, 0), 1);
});

test("exhausted eggs can be discarded for free but hatchable eggs cannot", () => {
  const exhausted = state({ trackerLevel: 0, egg: { type: "iron" }, characterCounts: { iron1: 3, iron2: 3, iron3: 3 } });
  const discarded = operations.applyOperation(exhausted, { type: "discardEgg" });
  assert.equal(discarded.ok, true);
  assert.equal(discarded.state.egg, null);
  const blocked = operations.applyOperation(state({ egg: { type: "iron" } }), { type: "discardEgg" });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "egg-still-hatchable");
});

test("brim gacha charges cookies and grants the selected prize in one result", () => {
  const rolled = operations.applyOperation(state(), { type: "brimGacha" }, () => 0);
  assert.equal(rolled.ok, true);
  assert.equal(rolled.state.cookies, 100);
  assert.equal(rolled.result.prize.key, "kp5ap1");
  assert.equal(rolled.state.kp, 105);
  assert.equal(rolled.state.ap, 1);
});

test("ishibashi gacha result records the awarded stage for delayed presentation", () => {
  const rolled = operations.applyOperation(state(), { type: "brimGacha" }, () => 0.999);
  assert.equal(rolled.ok, true);
  assert.equal(rolled.result.prize.ishibashi, true);
  assert.equal(rolled.result.characterId, "series4_ishibashi1");
  assert.equal(rolled.result.stage, 1);
});

test("a seeded plan stays fixed and cannot be rerolled after a conflict", () => {
  const initial = state({ trackerLevel: 0, cookies: 0 });
  const plan = operations.planOperation(initial, { type: "summonEgg" }, operations.seededRandom("operation_seed_123456"), 99);
  assert.equal(plan.ok, true);
  const first = operations.applyPlannedOperation(initial, plan.plan);
  assert.equal(first.ok, true);
  assert.deepEqual(operations.applyPlannedOperation(initial, plan.plan).result, first.result);
  const conflicting = operations.applyPlannedOperation({ ...initial, egg: { type: "iron" } }, plan.plan);
  assert.equal(conflicting.ok, false);
  assert.equal(conflicting.code, "operation-conflict");
});

test("shared rules expose the same UI candidates, costs, and gacha cost", () => {
  const current = state({ trackerLevel: 10, skills: { summonDiscount: 2, hatchDiscount: 3 } });
  assert.equal(operations.summonCost(current), 8);
  assert.equal(operations.hatchCost(current), 12);
  assert.equal(operations.BRIM_COST, 400);
  assert.ok(operations.availableEggTypes(current).every((egg) => operations.availableCharacters(current, egg.id).length > 0));
});
