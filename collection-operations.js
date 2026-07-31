(function attachCollectionOperations(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.collectionOperations = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCollectionOperations() {
  const EGG_COST = 10;
  const HATCH_COST = 15;
  const EGG_TYPES = [["iron", "アイアン"], ["bronze", "ブロンズ"], ["silver", "シルバー"], ["gold", "ゴールド"], ["platinum", "プラチナ"], ["diamond", "ダイヤ"], ["ascendant", "アセンダント"], ["immortal", "イモータル"], ["radiant", "レディアント"]];
  const EGG_LABELS = Object.fromEntries(EGG_TYPES);
  const UNLOCK_LEVELS = { iron: 0, bronze: 0, silver: 0, gold: 5, platinum: 6, diamond: 7, ascendant: 8, immortal: 9, radiant: 10 };
  const RATE_TABLES = {
    0: { iron: 45, bronze: 35, silver: 20 },
    5: { iron: 40, bronze: 30, silver: 20, gold: 10 },
    6: { iron: 36, bronze: 28, silver: 20, gold: 10, platinum: 6 },
    7: { iron: 33, bronze: 26, silver: 20, gold: 10, platinum: 7, diamond: 4 },
    8: { iron: 30, bronze: 24, silver: 20, gold: 10, platinum: 8, diamond: 5, ascendant: 3 },
    9: { iron: 28, bronze: 22, silver: 20, gold: 10, platinum: 8, diamond: 6, ascendant: 4, immortal: 2 },
    10: { iron: 27, bronze: 21, silver: 19, gold: 10, platinum: 8, diamond: 6, ascendant: 5, immortal: 3, radiant: 0.1 }
  };
  const BRIM_COST = 400;
  const BRIM_PRIZES = [
    { key: "kp5ap1", rate: 22, rewards: { kp: 5, ap: 1 }, items: [{ type: "kp", count: 5 }, { type: "ap", count: 1 }] },
    { key: "kp10ap3", rate: 20, rewards: { kp: 10, ap: 3 }, items: [{ type: "kp", count: 10 }, { type: "ap", count: 3 }] },
    { key: "kp15ap8", rate: 18, rewards: { kp: 15, ap: 8 }, items: [{ type: "kp", count: 15 }, { type: "ap", count: 8 }] },
    { key: "ticket15", rate: 18, rewards: { ticket15: 1 }, items: [{ type: "ticket15", count: 1 }] },
    { key: "ticket2", rate: 12, rewards: { ticket2: 1 }, items: [{ type: "ticket2", count: 1 }] },
    { key: "kp30ap10", rate: 6, rewards: { kp: 30, ap: 10 }, items: [{ type: "kp", count: 30 }, { type: "ap", count: 10 }], rare: true },
    { key: "ticketSet", rate: 3, rewards: { ticket15: 1, ticket2: 1 }, items: [{ type: "ticket15", count: 1 }, { type: "ticket2", count: 1 }], rare: true },
    { key: "ishibashi", rate: 1, ishibashi: true, rare: true }
  ];

  function clone(value) { return value && typeof value === "object" ? JSON.parse(JSON.stringify(value)) : {}; }
  function integer(value) { return Math.max(0, Math.floor(Number(value) || 0)); }
  function stage(state, id) { return Math.min(3, integer(state.characterCounts?.[id])); }
  function fail(code, message, state) { return { ok: false, code, message, state }; }
  function normalizeEgg(value) {
    const type = String(value?.type || "");
    if (!EGG_LABELS[type]) return null;
    const createdAt = Number(value?.createdAt);
    return { type, label: EGG_LABELS[type], createdAt: Number.isFinite(createdAt) && createdAt > 0 ? createdAt : 0 };
  }
  function normalizeState(input = {}) {
    const state = clone(input);
    state.kp = integer(state.kp); state.ap = integer(state.ap); state.cookies = integer(state.cookies);
    state.tickets = { multiplier15: integer(state.tickets?.multiplier15), multiplier2: integer(state.tickets?.multiplier2) };
    state.characterCounts = Object.fromEntries(Object.entries(state.characterCounts || {}).map(([id, count]) => [id, Math.min(3, integer(count))]).filter(([, count]) => count > 0));
    state.trackerLevel = integer(state.trackerLevel); state.egg = normalizeEgg(state.egg);
    return state;
  }
  function unlockedSeries(state) { return state.trackerLevel >= 21 ? [1, 2, 3] : state.trackerLevel >= 12 ? [1, 2] : [1]; }
  function characterId(series, eggType, index) { return `${series === 1 ? "" : `series${series}_`}${eggType === "radiant" ? "radiant" : `${eggType}${index}`}`; }
  function availableCharacters(state, eggType) {
    if (!EGG_LABELS[eggType]) return [];
    return unlockedSeries(state).flatMap((series) => eggType === "radiant" ? [characterId(series, eggType, 0)] : [1, 2, 3].map((index) => characterId(series, eggType, index))).filter((id) => stage(state, id) < 3);
  }
  function summonCost(state) { return Math.max(1, EGG_COST - integer(state.skills?.summonDiscount)); }
  function hatchCost(state) { return Math.max(1, HATCH_COST - integer(state.skills?.hatchDiscount)); }
  function rateTable(state) { const level = Math.max(...Object.keys(RATE_TABLES).map(Number).filter((level) => state.trackerLevel >= level)); return RATE_TABLES[level] || RATE_TABLES[0]; }
  function availableEggTypes(state) { const rates = rateTable(state); return EGG_TYPES.map(([id, label]) => ({ id, label, rate: Number(rates[id]) || 0 })).filter((egg) => state.trackerLevel >= UNLOCK_LEVELS[egg.id] && egg.rate > 0 && availableCharacters(state, egg.id).length); }
  function brimPrizePool(state) { const done = stage(state, "series4_ishibashi1") >= 3; return BRIM_PRIZES.map((prize) => prize.key === "ishibashi" ? { ...prize, rate: done ? 0 : prize.rate } : prize.key === "ticketSet" ? { ...prize, rate: done ? 4 : prize.rate } : prize).filter((prize) => prize.rate > 0); }
  function pickWeighted(entries, random) { const total = entries.reduce((sum, entry) => sum + Number(entry.rate || 0), 0); let roll = random() * total; for (const entry of entries) { roll -= Number(entry.rate || 0); if (roll <= 0) return entry; } return entries[0] || null; }
  function recordSummon(state, eggType) { const stats = state.achievements?.stats; if (stats && eggType) stats.summonedEggTypes = [...new Set([...(Array.isArray(stats.summonedEggTypes) ? stats.summonedEggTypes : []), eggType])]; }
  function seededRandom(seed) { let value = 2166136261; for (const char of String(seed || "")) { value ^= char.charCodeAt(0); value = Math.imul(value, 16777619); } return () => { value += 0x6D2B79F5; let next = value; next = Math.imul(next ^ (next >>> 15), next | 1); next ^= next + Math.imul(next ^ (next >>> 7), next | 61); return ((next ^ (next >>> 14)) >>> 0) / 4294967296; }; }

  function planOperation(input, operation = {}, random = Math.random, now = Date.now()) {
    const state = normalizeState(input); const type = String(operation.type || "");
    if (type === "summonEgg") {
      if (state.egg) return fail("egg-exists", "すでに卵を所持しています", state);
      if (state.kp < summonCost(state)) return fail("insufficient-kp", "KPが不足しています", state);
      if (random() < 0.1) return { ok: true, plan: { type, cookieBonus: Math.floor(random() * 151) + 100 } };
      const egg = pickWeighted(availableEggTypes(state), random);
      return egg ? { ok: true, plan: { type, eggType: egg.id, createdAt: now } } : fail("no-available-egg", "出せる卵がありません", state);
    }
    if (type === "hatchEgg") {
      if (!state.egg) return fail("no-egg", "卵がありません", state);
      if (state.kp < hatchCost(state)) return fail("insufficient-kp", "KPが不足しています", state);
      const candidates = availableCharacters(state, state.egg.type);
      return candidates.length ? { ok: true, plan: { type, characterId: candidates[Math.floor(random() * candidates.length)] } } : fail("egg-exhausted", "この卵から出るキャラは全員3段階目です", state);
    }
    if (type === "discardEgg") return state.egg && !availableCharacters(state, state.egg.type).length ? { ok: true, plan: { type } } : fail(state.egg ? "egg-still-hatchable" : "no-egg", state.egg ? "この卵はまだ孵化できます" : "卵がありません", state);
    if (type === "brimGacha") {
      if (state.trackerLevel < 11) return fail("locked", "トラッカーレベル11から解放されます", state);
      if (state.cookies < BRIM_COST) return fail("insufficient-cookies", "クッキーが不足しています", state);
      const prize = pickWeighted(brimPrizePool(state), random);
      return prize ? { ok: true, plan: { type, prizeKey: prize.key } } : fail("no-prize", "景品を確定できませんでした", state);
    }
    return fail("unknown-operation", "操作を確認できませんでした", state);
  }

  function applyPlannedOperation(input, plan = {}) {
    const state = normalizeState(input); const type = String(plan.type || "");
    if (type === "summonEgg") {
      if (state.egg || state.kp < summonCost(state)) return fail("operation-conflict", "進捗が更新されています", state);
      const cost = summonCost(state); state.kp -= cost;
      if (integer(plan.cookieBonus)) { const cookieBonus = integer(plan.cookieBonus); state.cookies += cookieBonus; return { ok: true, state, result: { type, cookieBonus, cost } }; }
      const egg = availableEggTypes(state).find((entry) => entry.id === plan.eggType);
      if (!egg) return fail("operation-conflict", "進捗が更新されています", normalizeState(input));
      state.egg = { type: egg.id, label: EGG_LABELS[egg.id], createdAt: integer(plan.createdAt) }; recordSummon(state, egg.id);
      return { ok: true, state, result: { type, egg: state.egg, cost } };
    }
    if (type === "hatchEgg") {
      if (!state.egg || state.kp < hatchCost(state) || !availableCharacters(state, state.egg.type).includes(plan.characterId)) return fail("operation-conflict", "進捗が更新されています", state);
      const cost = hatchCost(state); state.kp -= cost; state.egg = null; state.characterCounts[plan.characterId] = stage(state, plan.characterId) + 1; state.activeCharacterId = plan.characterId;
      return { ok: true, state, result: { type, characterId: plan.characterId, stage: state.characterCounts[plan.characterId], cost } };
    }
    if (type === "discardEgg") { if (!state.egg || availableCharacters(state, state.egg.type).length) return fail("operation-conflict", "進捗が更新されています", state); state.egg = null; return { ok: true, state, result: { type } }; }
    if (type === "brimGacha") {
      if (state.trackerLevel < 11 || state.cookies < BRIM_COST) return fail("operation-conflict", "進捗が更新されています", state);
      const prize = brimPrizePool(state).find((entry) => entry.key === plan.prizeKey);
      if (!prize) return fail("operation-conflict", "進捗が更新されています", state);
      state.cookies -= BRIM_COST;
      if (prize.ishibashi) { state.series4Unlocked = true; state.characterCounts.series4_ishibashi1 = stage(state, "series4_ishibashi1") + 1; state.activeCharacterId = "series4_ishibashi1"; }
      else { state.kp += integer(prize.rewards.kp); state.ap += integer(prize.rewards.ap); state.tickets.multiplier15 += integer(prize.rewards.ticket15); state.tickets.multiplier2 += integer(prize.rewards.ticket2); }
      return { ok: true, state, result: { type, prize, ...(prize.ishibashi ? { characterId: "series4_ishibashi1", stage: state.characterCounts.series4_ishibashi1 } : {}) } };
    }
    return fail("unknown-operation", "操作を確認できませんでした", state);
  }
  function applyOperation(input, operation = {}, random = Math.random, now = Date.now()) { const planned = planOperation(input, operation, random, now); return planned.ok ? applyPlannedOperation(input, planned.plan) : planned; }
  return { EGG_LABELS, BRIM_COST, normalizeEgg, normalizeState, availableCharacters, availableEggTypes, summonCost, hatchCost, brimPrizePool, seededRandom, planOperation, applyPlannedOperation, applyOperation };
});
