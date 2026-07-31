const https = require("https");
const crypto = require("crypto");
const loginBonus = require("./login-bonus");
const collectionOperations = require("./collection-operations");

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDIiwhzuEXucBro2-PpFYNh9-BB37imLMI",
  authDomain: "ishibashi-tracker.firebaseapp.com",
  projectId: "ishibashi-tracker",
  storageBucket: "ishibashi-tracker.firebasestorage.app",
  messagingSenderId: "472088950213",
  appId: "1:472088950213:web:7c511bb46c1710464107ac"
};

const BASE_PATH = `/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`;

function withApiKey(path) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}key=${encodeURIComponent(FIREBASE_CONFIG.apiKey)}`;
}

function requestFirestore(method, path, body = null) {
  return requestFirestoreRaw(method, path, body);
}

function requestFirestoreWithAuth(method, path, idToken, body = null) {
  return requestFirestoreRaw(method, path, body, idToken);
}

function requestFirestoreRaw(method, path, body = null, idToken = "") {
  return new Promise((resolve, reject) => {
    const headers = {
      "Content-Type": "application/json"
    };
    if (idToken) headers.Authorization = `Bearer ${idToken}`;
    const req = https.request({
      hostname: "firestore.googleapis.com",
      port: 443,
      path: withApiKey(path),
      method,
      headers
    }, (res) => {
      let responseBody = "";
      res.on("data", (chunk) => { responseBody += chunk; });
      res.on("end", () => {
        let parsed = {};
        try {
          parsed = responseBody ? JSON.parse(responseBody) : {};
        } catch (error) {
          reject(error);
          return;
        }

        if (res.statusCode < 200 || res.statusCode >= 300) {
          const error = new Error(parsed?.error?.message || `Firestore error ${res.statusCode}`);
          error.statusCode = res.statusCode;
          error.response = parsed;
          reject(error);
          return;
        }

        resolve(parsed);
      });
    });

    req.setTimeout(6000, () => {
      req.destroy(new Error("Firestore timeout"));
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function encodeDocId(value) {
  return encodeURIComponent(String(value || "").trim());
}

function toValue(value) {
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toValue) } };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "object") return { mapValue: { fields: toFields(value) } };
  return { stringValue: String(value) };
}

function fromValue(value) {
  if (!value || typeof value !== "object") return null;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return Boolean(value.booleanValue);
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) return Array.isArray(value.arrayValue?.values) ? value.arrayValue.values.map(fromValue) : [];
  if ("mapValue" in value) return Object.fromEntries(Object.entries(value.mapValue?.fields || {}).map(([key, entry]) => [key, fromValue(entry)]));
  return null;
}

function toFields(data) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, toValue(value)]));
}

function docToData(doc) {
  const fields = doc?.fields || {};
  const data = {};
  Object.keys(fields).forEach((key) => {
    data[key] = fromValue(fields[key]);
  });
  data.id = doc?.name ? doc.name.split("/").pop() : data.puuid;
  return data;
}

function normalizeDocumentName(name) {
  const value = String(name || "").trim().replace(/^\/v1\//, "");
  const prefix = `projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/`;
  return value.startsWith(prefix) ? value : "";
}

function getPathFromDocumentName(name) {
  const normalized = normalizeDocumentName(name);
  return normalized ? `/v1/${normalized}` : "";
}

function getCollectionAndIdFromName(name) {
  const clean = String(name || "");
  const parts = clean.split("/documents/")[1]?.split("/") || [];
  if (parts.length < 2) return null;
  return {
    collectionPath: parts.slice(0, -1).join("/"),
    id: parts[parts.length - 1]
  };
}

function getDocumentName(...segments) {
  const path = segments.map((value) => String(value || "").trim()).filter(Boolean).join("/");
  return `projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/${path}`;
}

function getGoogleInboxDocumentName(uid, mailId) {
  return getDocumentName("googleUsers", uid, "inbox", mailId);
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function normalizeNickname(value) {
  return String(value || "").normalize("NFKC").trim().toLowerCase();
}

function isValidNickname(value) {
  const name = String(value || "").trim();
  return /^[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}\p{L}\p{N}_-]{2,8}$/u.test(name);
}

function normalizeGoogleProgress(user = {}) {
  return {
    kp: Math.max(0, Number(user.kp) || 0),
    ap: Math.max(0, Number(user.ap) || 0),
    cookies: Math.max(0, Number(user.cookies) || 0),
    ticket15: Math.max(0, Number(user.ticket15) || 0),
    ticket2: Math.max(0, Number(user.ticket2) || 0),
    trackerLevel: Math.max(0, Number(user.trackerLevel) || 0),
    progressJson: String(user.progressJson || ""),
    progressMigratedAt: user.progressMigratedAt || "",
    onboardingCompletedAt: user.onboardingCompletedAt || "",
    privacyAcceptedAt: user.privacyAcceptedAt || "",
    policyAcceptedAt: user.policyAcceptedAt || "",
    policyVersion: String(user.policyVersion || ""),
    cameraMode: String(user.cameraMode || ""),
    nickname: String(user.nickname || ""),
    nicknameKey: String(user.nicknameKey || ""),
    avatarTestPhoto: String(user.avatarTestPhoto || ""),
    avatarTestCapturedAt: user.avatarTestCapturedAt || "",
    avatarTestDevice: String(user.avatarTestDevice || "")
  };
}

function progressFieldsFromState(state = {}) {
  const copy = state && typeof state === "object" ? JSON.parse(JSON.stringify(state)) : {};
  const tickets = copy.tickets || {};
  return {
    kp: Math.max(0, Number(copy.kp) || 0),
    ap: Math.max(0, Number(copy.ap) || 0),
    cookies: Math.max(0, Number(copy.cookies) || 0),
    ticket15: Math.max(0, Number(tickets.multiplier15) || 0),
    ticket2: Math.max(0, Number(tickets.multiplier2) || 0),
    trackerLevel: Math.max(0, Number(copy.trackerLevel) || 0),
    progressJson: JSON.stringify(copy)
  };
}

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch (error) {
    return "[]";
  }
}

async function commitWrites(writes, idToken = "") {
  validateCommitWrites(writes);
  const path = `${BASE_PATH}:commit`;
  const body = { writes };
  return idToken
    ? requestFirestoreWithAuth("POST", path, idToken, body)
    : requestFirestore("POST", path, body);
}

function validateCommitWrites(writes = []) {
  for (const write of writes) {
    const name = String(write?.update?.name || "");
    if (!name) continue;
    if (normalizeDocumentName(name) !== name) {
      const error = new Error("Firestore commit document name is invalid.");
      error.statusCode = 400;
      error.response = { error: { status: "INVALID_ARGUMENT", message: error.message } };
      throw error;
    }
  }
  return true;
}

function commitRevision(result, writeIndex) {
  return String(result?.writeResults?.[writeIndex]?.updateTime || "");
}

function networkFailure(message) {
  return { ok: false, code: "network-error", message };
}

function getFirestoreErrorStatus(error) {
  return String(error?.response?.error?.status || "").trim().toUpperCase();
}

function isFirestoreConflict(error) {
  const status = getFirestoreErrorStatus(error);
  return status === "ABORTED" || status === "FAILED_PRECONDITION" || Number(error?.statusCode) === 409;
}

function firestoreOperationFailure(error, fallbackMessage = "Firestore処理に失敗しました。") {
  const status = getFirestoreErrorStatus(error);
  const statusCode = Number(error?.statusCode) || 0;
  if (!statusCode || statusCode === 408 || statusCode === 429 || statusCode >= 500 || ["UNAVAILABLE", "DEADLINE_EXCEEDED", "RESOURCE_EXHAUSTED"].includes(status)) {
    return networkFailure("通信に失敗しました。接続を確認して、もう一度お試しください。");
  }
  if (status === "PERMISSION_DENIED" || Number(error.statusCode) === 403) return { ok: false, code: "permission-denied", message: "Firestoreへの書き込みが許可されていません。" };
  if (status === "INVALID_ARGUMENT") return { ok: false, code: "invalid-request", message: "Firestoreへ送信するデータ形式が不正です。" };
  return { ok: false, code: "save-failed", message: fallbackMessage };
}

async function getUser(puuid) {
  if (!puuid) return null;
  try {
    const doc = await requestFirestore("GET", `${BASE_PATH}/users/${encodeDocId(puuid)}`);
    return docToData(doc);
  } catch (error) {
    if (error.statusCode === 404) return null;
    throw error;
  }
}

async function getGoogleUser(uid, idToken) {
  if (!uid || !idToken) return null;
  try {
    const doc = await requestFirestoreWithAuth("GET", `${BASE_PATH}/googleUsers/${encodeDocId(uid)}`, idToken);
    return { ...docToData(doc), _updateTime: doc?.updateTime || "" };
  } catch (error) {
    if (error.statusCode === 404) return null;
    throw error;
  }
}

async function saveGoogleUserSession(user = {}, idToken = "", extra = {}) {
  const uid = String(user.uid || "").trim();
  if (!uid || !idToken) return { ok: false, message: "Googleログイン情報がありません。" };
  const current = await getGoogleUser(uid, idToken);
  const now = new Date();
  const puuids = Array.isArray(extra.puuids)
    ? extra.puuids
    : Array.isArray(current?.puuids) ? current.puuids : [];
  const data = {
    uid,
    email: String(user.email || current?.email || ""),
    displayName: String(user.displayName || current?.displayName || ""),
    photoURL: String(user.photoURL || current?.photoURL || ""),
    puuids: [...new Set(puuids.map((value) => String(value || "").trim()).filter(Boolean))],
    updatedAt: now
  };
  if (!current?.createdAt) data.createdAt = now;
  await patchDocumentWithAuth("googleUsers", uid, data, idToken);
  return { ok: true, user: data };
}

async function linkGooglePuuid(user = {}, idToken = "", puuid = "") {
  const uid = String(user.uid || "").trim();
  const nextPuuid = String(puuid || "").trim();
  if (!uid || !idToken) return { ok: false, message: "Googleログインが必要です。" };
  if (!nextPuuid) return { ok: false, message: "PUUIDを取得できませんでした。" };
  const current = await getGoogleUser(uid, idToken);
  const puuids = Array.isArray(current?.puuids) ? current.puuids : [];
  const nextPuuids = [...new Set([...puuids, nextPuuid].map((value) => String(value || "").trim()).filter(Boolean))];
  const result = await saveGoogleUserSession(user, idToken, { puuids: nextPuuids });
  return { ...result, puuids: nextPuuids };
}

async function getGoogleProgress(user = {}, idToken = "") {
  const uid = String(user.uid || "").trim();
  if (!uid || !idToken) return { ok: false, message: "Googleログインが必要です。" };
  let current = await getGoogleUser(uid, idToken);
  if (!current) {
    const saved = await saveGoogleUserSession(user, idToken);
    current = saved.user || {};
  }
  return { ok: true, profile: { ...normalizeGoogleProgress(current), revision: current._updateTime || "", accountStatus: current.accountStatus === "blocked" ? "blocked" : "active", user: normalizeShopUser({ ...current, ...user }), puuids: Array.isArray(current.puuids) ? current.puuids : [] } };
}

async function getGoogleAccountStatus(user = {}, idToken = "") {
  const current = await getGoogleUser(String(user.uid || "").trim(), idToken);
  if (!current) return { ok: true, accountStatus: "active" };
  return { ok: true, accountStatus: current.accountStatus === "blocked" ? "blocked" : "active" };
}

async function migrateGoogleProgress(user = {}, idToken = "", state = {}) {
  const uid = String(user.uid || "").trim();
  if (!uid || !idToken) return { ok: false, message: "Googleログインが必要です。" };
  const current = await getGoogleUser(uid, idToken) || {};
  const normalized = normalizeGoogleProgress(current);
  if (normalized.progressMigratedAt) return { ok: true, migrated: false, profile: normalized };
  const fields = progressFieldsFromState(state);
  const now = new Date();
  await patchDocumentWithAuth("googleUsers", uid, { ...fields, progressMigratedAt: now, updatedAt: now }, idToken);
  return { ok: true, migrated: true, profile: { ...normalized, ...fields, progressMigratedAt: now } };
}

async function saveGoogleProgress(user = {}, idToken = "", state = {}, expectedRevision = "") {
  const uid = String(user.uid || "").trim();
  if (!uid || !idToken) return { ok: false, message: "Googleログインが必要です。" };
  let current;
  try { current = await getGoogleUser(uid, idToken); } catch (error) { return networkFailure("Progress check failed. Local progress was kept."); }
  if (!current) return { ok: false, code: "save-failed", message: "Cloud progress is unavailable." };
  const revision = String(expectedRevision || "");
  if (!revision) return { ok: false, code: "cloud-conflict", message: "進捗の同期情報を更新しています。もう一度お試しください。", state: parseProgressState(current), revision: current._updateTime || "" };
  if (revision && current._updateTime !== revision) return { ok: false, code: "cloud-conflict", message: "別の端末で進捗が更新されています。最新の進捗を表示しました。", state: parseProgressState(current), revision: current._updateTime || "" };
  const fields = { ...progressFieldsFromState(state), updatedAt: new Date() };
  try {
    const committed = await commitWrites([{ update: { name: getDocumentName("googleUsers", uid), fields: toFields(fields) }, updateMask: { fieldPaths: Object.keys(fields) }, currentDocument: { updateTime: current._updateTime } }], idToken);
    return { ok: true, progress: fields, revision: commitRevision(committed, 0) };
  } catch (error) {
    const latest = await getGoogleUser(uid, idToken).catch(() => null);
    if (!latest) return networkFailure("Save result could not be confirmed. Local progress was kept.");
    if (latest._updateTime === revision) return { ok: false, code: "save-failed", message: "Progress could not be saved. Local progress was kept." };
    return { ok: false, code: "cloud-conflict", message: "別の端末で進捗が更新されています。最新の進捗を表示しました。", state: parseProgressState(latest), revision: latest._updateTime || "" };
  }
}

async function applyGoogleCollectionOperation(user = {}, idToken = "", operation = {}) {
  const uid = String(user.uid || "").trim();
  const operationId = String(operation?.id || "").trim();
  const type = String(operation?.type || "").trim();
  let seed = "";
  if (!uid || !idToken) return { ok: false, message: "Googleログインが必要です。" };
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(operationId) || !["summonEgg", "hatchEgg", "discardEgg", "brimGacha"].includes(type)) return { ok: false, message: "操作を確認できませんでした。" };
  const recordId = Buffer.from(`${uid}\n${operationId}`).toString("base64url");
  const recordName = getDocumentName("googleCollectionOperations", recordId);
  let plan = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const existing = await requestFirestoreWithAuth("GET", getPathFromDocumentName(recordName), idToken).catch((error) => error.statusCode === 404 ? null : Promise.reject(error));
    if (existing) {
      const data = docToData(existing);
      const latest = await getGoogleUser(uid, idToken);
      if (!latest) return networkFailure("Operation result could not be recovered.");
      return { ok: true, alreadyApplied: true, state: parseProgressState(latest), revision: latest._updateTime || "", result: data.result || {} };
    }
    const current = await getGoogleUser(uid, idToken) || {};
    const currentState = parseProgressState(current);
    if (!plan) {
      seed = crypto.randomBytes(24).toString("base64url");
      const planned = collectionOperations.planOperation(currentState, { type }, collectionOperations.seededRandom(seed));
      if (!planned.ok) return { ok: false, code: planned.code, message: planned.message, state: planned.state, revision: current._updateTime || "" };
      plan = planned.plan;
    }
    const applied = collectionOperations.applyPlannedOperation(currentState, plan);
    if (!applied.ok) return { ok: false, code: attempt > 0 ? "operation-conflict" : applied.code, message: attempt > 0 ? "A different device updated this progress. Please try again." : applied.message, state: applied.state, revision: current._updateTime || "" };
    const fields = { ...progressFieldsFromState(applied.state), updatedAt: new Date() };
    const record = { uid, operationId, type, seed, plan, result: applied.result, createdAt: new Date() };
    try {
      const committed = await commitWrites([
        { update: { name: recordName, fields: toFields(record) }, currentDocument: { exists: false } },
        { update: { name: getDocumentName("googleUsers", uid), fields: toFields(fields) }, updateMask: { fieldPaths: Object.keys(fields) }, currentDocument: current._updateTime ? { updateTime: current._updateTime } : { exists: false } }
      ], idToken);
      return { ok: true, state: applied.state, revision: commitRevision(committed, 1), result: applied.result };
    } catch (error) {
      if (attempt === 2) return { ok: false, message: "進捗を保存できませんでした。通信を確認して、もう一度お試しください。" };
    }
  }
  return { ok: false, message: "進捗を保存できませんでした。" };
}

function parseProgressState(user = {}) {
  try {
    const parsed = JSON.parse(String(user.progressJson || "{}"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

function getProgressSkillLevel(state, id) {
  return Math.max(0, Number(state?.skills?.[id]) || 0);
}

const SERIES_RANK_IDS = ["iron", "bronze", "silver", "gold", "platinum", "diamond", "ascendant", "immortal"];
const SERIES_CHARACTER_IDS = Object.freeze([null, 1, 2, 3].map((series) => {
  if (!series) return null;
  const prefix = series === 1 ? "" : `series${series}_`;
  return [
    ...SERIES_RANK_IDS.flatMap((rank) => [1, 2, 3].map((stage) => `${prefix}${rank}${stage}`)),
    `${prefix}radiant`
  ];
}));
const ISHIBASHI_CHARACTER_ID = "series4_ishibashi1";
const ISHIBASHI_CHARACTER_NAME = "石橋キャラ";
const ISHIBASHI_CHARACTER_IMAGE = "img/キャラ4/ChatGPT Image 2026年6月2日 21_37_41-1.png";

function isProgressSeriesComplete(state, series) {
  const counts = state?.characterCounts || {};
  const ids = SERIES_CHARACTER_IDS[Number(series)] || [];
  return ids.length > 0 && ids.every((id) => Number(counts[id]) > 0);
}

function rollGoogleRoulette(state, random = Math.random) {
  const roll = random() * 100;
  if (roll < 35) return { key: "kp5", kp: 5, label: "KP 5獲得" };
  if (roll < 70) return { key: "ap10", ap: 10, label: "AP 10獲得" };
  if (roll < 90) return { key: "ticket15", ticket15: 1, label: "1.5倍チケット獲得" };
  if (roll < 98) return { key: "ticket2", ticket2: 1, label: "2倍チケット獲得" };
  const characterId = ISHIBASHI_CHARACTER_ID;
  if (Math.max(0, Number(state?.characterCounts?.[characterId]) || 0) >= 3) {
    return { key: "hit-duplicate", ticket2: 1, label: "石橋キャラは最大所持のため2倍チケット獲得" };
  }
  return {
    key: "hit",
    unlockSeries4: true,
    characterId,
    characterName: ISHIBASHI_CHARACTER_NAME,
    characterImage: ISHIBASHI_CHARACTER_IMAGE,
    label: "当たり！石橋キャラ獲得"
  };
}

function applyGoogleMatchReward(state = {}, payload = {}, random = Math.random) {
  const next = JSON.parse(JSON.stringify(state || {}));
  next.tickets = next.tickets || { multiplier15: 0, multiplier2: 0 };
  next.skills = next.skills || {};
  next.characterCounts = next.characterCounts || {};
  next.achievements = next.achievements || { achievedIds: [], claimedIds: [], stats: {} };
  next.achievements.stats = next.achievements.stats || {};
  const baseKp = Math.max(0, Number(payload.kpEarned) || 0);
  const baseAp = Math.max(0, Number(payload.apEarned) || 0);
  let kp = baseKp;
  let ap = baseAp;
  let ticketUsed = "";
  if (next.selectedTicket === "multiplier15" && Number(next.tickets.multiplier15) > 0) {
    next.tickets.multiplier15 -= 1; kp = Math.ceil(kp * 1.5); ap = Math.ceil(ap * 1.5); ticketUsed = "1.5倍チケット";
  } else if (next.selectedTicket === "multiplier2" && Number(next.tickets.multiplier2) > 0) {
    next.tickets.multiplier2 -= 1; kp *= 2; ap *= 2; ticketUsed = "2倍チケット";
  }
  const kpChance = getProgressSkillLevel(next, "bonusKpChance") * 2.5 + (isProgressSeriesComplete(next, 1) ? 5 : 0);
  const apChance = getProgressSkillLevel(next, "bonusApChance") * 2.5 + (isProgressSeriesComplete(next, 2) ? 5 : 0);
  const rouletteChance = getProgressSkillLevel(next, "rouletteChance") * 2.5 + (isProgressSeriesComplete(next, 3) ? 5 : 0);
  const bonusKp = getProgressSkillLevel(next, "bonusKpAmount") > 0 && random() * 100 < kpChance ? getProgressSkillLevel(next, "bonusKpAmount") : 0;
  const bonusAp = getProgressSkillLevel(next, "bonusApAmount") > 0 && random() * 100 < apChance ? getProgressSkillLevel(next, "bonusApAmount") : 0;
  const roulette = random() * 100 < rouletteChance ? rollGoogleRoulette(next, random) : null;
  next.kp = Math.max(0, Number(next.kp) || 0) + kp + bonusKp + Number(roulette?.kp || 0);
  next.ap = Math.max(0, Number(next.ap) || 0) + ap + bonusAp + Number(roulette?.ap || 0);
  next.tickets.multiplier15 = Math.max(0, Number(next.tickets.multiplier15) || 0) + Number(roulette?.ticket15 || 0);
  next.tickets.multiplier2 = Math.max(0, Number(next.tickets.multiplier2) || 0) + Number(roulette?.ticket2 || 0);
  if (roulette?.unlockSeries4) {
    const currentStage = Math.max(0, Number(next.characterCounts[roulette.characterId]) || 0);
    next.series4Unlocked = true;
    next.characterCounts[roulette.characterId] = Math.min(3, currentStage + 1);
    next.activeCharacterId = roulette.characterId;
  }
  if (next.selectedTicket && !next.tickets[next.selectedTicket]) next.selectedTicket = "";
  next.achievements.stats.hasPointKp = Boolean(next.achievements.stats.hasPointKp || baseKp > 0);
  next.achievements.stats.hasPointAp = Boolean(next.achievements.stats.hasPointAp || baseAp > 0);
  next.achievements.stats.maxBaseKp = Math.max(Number(next.achievements.stats.maxBaseKp) || 0, baseKp);
  next.achievements.stats.maxBaseAp = Math.max(Number(next.achievements.stats.maxBaseAp) || 0, baseAp);
  return { state: next, reward: { kp, ap, bonusKp, bonusAp, ticketUsed, roulette } };
}

async function claimGoogleMatchReward(user = {}, idToken = "", payload = {}) {
  const uid = String(user.uid || "").trim();
  const matchId = String(payload.matchId || "").trim();
  const puuid = String(payload.puuid || "").trim();
  if (!uid || !idToken || !matchId) return { ok: false, message: "報酬確定に必要な情報がありません。" };
  const weekId = getWeeklyCompetitiveWeekId(String(payload.weekDate || ""));
  const documentNames = getGoogleMatchRewardDocumentNames(uid, puuid, matchId, weekId);
  const claimId = documentNames.claimId;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const claim = await requestFirestoreWithAuth("GET", `${BASE_PATH}/googleRewardClaims/${encodeDocId(claimId)}`, idToken).catch((error) => error.statusCode === 404 ? null : Promise.reject(error));
    if (claim) {
      const latest = await getGoogleUser(uid, idToken);
      return latest ? { ok: true, alreadyClaimed: true, state: parseProgressState(latest), revision: latest._updateTime || "" } : networkFailure("Reward state could not be recovered.");
    }
    const current = await getGoogleUser(uid, idToken) || {};
    const applied = applyGoogleMatchReward(parseProgressState(current), payload);
    const fields = { ...progressFieldsFromState(applied.state), updatedAt: new Date() };
    const weeklyName = documentNames.weeklyName;
    const weeklyDoc = weeklyName
      ? await requestFirestoreWithAuth("GET", getPathFromDocumentName(weeklyName), idToken).catch((error) => error.statusCode === 404 ? null : Promise.reject(error))
      : null;
    const weeklyCurrent = weeklyDoc ? docToData(weeklyDoc) : {};
    const baseKills = Math.max(0, Math.floor(Number(payload.kpEarned) || 0));
    const baseAssists = Math.max(0, Math.floor(Number(payload.apEarned) || 0));
    const weeklyKills = Math.max(0, Math.floor(Number(weeklyCurrent.kills) || 0)) + baseKills;
    const weeklyAssists = Math.max(0, Math.floor(Number(weeklyCurrent.assists) || 0)) + baseAssists;
    const weeklyFields = weekId ? {
      weekId,
      uid,
      nickname: String(current.nickname || "名無し"),
      kills: weeklyKills,
      assists: weeklyAssists,
      matches: Math.max(0, Math.floor(Number(weeklyCurrent.matches) || 0)) + 1,
      rankScore: weeklyKills * 1000000 + Math.min(999999, weeklyAssists),
      updatedAt: new Date()
    } : null;
    const writes = [
      { update: { name: documentNames.claimName, fields: toFields({ uid, puuid, matchId, createdAt: new Date() }) }, currentDocument: { exists: false } },
      { update: { name: documentNames.userName, fields: toFields(fields) }, updateMask: { fieldPaths: Object.keys(fields) }, currentDocument: current._updateTime ? { updateTime: current._updateTime } : undefined }
    ];
    if (weeklyFields) {
      writes.push({
        update: { name: weeklyName, fields: toFields(weeklyFields) },
        updateMask: { fieldPaths: Object.keys(weeklyFields) },
        currentDocument: weeklyDoc ? { updateTime: weeklyDoc.updateTime || "" } : { exists: false }
      });
    }
    try {
      const committed = await commitWrites(writes, idToken);
      return { ok: true, state: applied.state, revision: commitRevision(committed, 1), reward: applied.reward };
    } catch (error) {
      const recoveredClaim = await requestFirestoreWithAuth("GET", `${BASE_PATH}/googleRewardClaims/${encodeDocId(claimId)}`, idToken).catch(() => null);
      if (recoveredClaim) {
        const latest = await getGoogleUser(uid, idToken).catch(() => null);
        if (latest) return { ok: true, alreadyClaimed: true, state: parseProgressState(latest), revision: latest._updateTime || "" };
      }
      if (isFirestoreConflict(error)) {
        if (attempt === 2) return { ok: false, code: "cloud-conflict", message: "進捗の同時更新により報酬を確定できませんでした。もう一度お試しください。" };
        continue;
      }
      return firestoreOperationFailure(error, "報酬を確定できませんでした。");
    }
  }
  return { ok: false, message: "報酬を確定できませんでした。" };
}

function getGoogleMatchRewardDocumentNames(uid, puuid, matchId, weekId = "") {
  const claimId = Buffer.from(`${uid}\n${puuid}\n${matchId}`).toString("base64url");
  return {
    claimId,
    claimName: getDocumentName("googleRewardClaims", claimId),
    userName: getDocumentName("googleUsers", uid),
    weeklyName: weekId ? getWeeklyCompetitiveEntryName(weekId, uid) : ""
  };
}

async function registerNickname(user = {}, idToken = "", nickname = "", change = false) {
  const uid = String(user.uid || "").trim();
  const name = String(nickname || "").normalize("NFKC").trim();
  const key = normalizeNickname(name);
  if (!uid || !idToken) return { ok: false, message: "Googleログインが必要です。" };
  if (!isValidNickname(name)) return { ok: false, message: "ニックネームは日本語・英数字・_-で2〜8文字にしてください。" };
  const current = await getGoogleUser(uid, idToken) || {};
  const previousKey = String(current.nicknameKey || "");
  if (previousKey === key) return { ok: true, nickname: name, changed: false };
  if (change && Math.max(0, Number(current.kp) || 0) < 20) return { ok: false, message: "ニックネーム変更には20KP必要です。" };
  const existing = await requestFirestoreWithAuth("GET", `${BASE_PATH}/nicknames/${encodeDocId(key)}`, idToken).catch((error) => error.statusCode === 404 ? null : Promise.reject(error));
  if (existing && docToData(existing).uid !== uid) return { ok: false, message: "そのニックネームはすでに使われています。" };
  const now = new Date();
  const fields = { nickname: name, nicknameKey: key, updatedAt: now };
  if (change) fields.kp = Math.max(0, Number(current.kp) || 0) - 20;
  const writes = [
    { update: { name: getDocumentName("googleUsers", uid), fields: toFields(fields) }, updateMask: { fieldPaths: Object.keys(fields) } },
    { update: { name: getDocumentName("nicknames", key), fields: toFields({ uid, nickname: name, updatedAt: now }) }, currentDocument: { exists: false } }
  ];
  if (previousKey && previousKey !== key) writes.push({ delete: getDocumentName("nicknames", previousKey) });
  try {
    await commitWrites(writes, idToken);
  } catch (error) {
    return { ok: false, message: "そのニックネームはすでに使われているか、変更に失敗しました。" };
  }
  return { ok: true, nickname: name, kp: fields.kp ?? Math.max(0, Number(current.kp) || 0), changed: Boolean(change) };
}

async function completeGoogleOnboarding(user = {}, idToken = "", consent = {}) {
  const uid = String(user.uid || "").trim();
  const accepted = typeof consent === "object" && consent !== null ? consent : { privacyAccepted: Boolean(consent), policyAccepted: Boolean(consent) };
  if (!uid || !idToken || !accepted.privacyAccepted || !accepted.policyAccepted) return { ok: false, message: "利用ポリシーとプライバシー説明への同意が必要です。" };
  const now = new Date();
  await patchDocumentWithAuth("googleUsers", uid, { onboardingCompletedAt: now, privacyAcceptedAt: now, policyAcceptedAt: now, policyVersion: String(accepted.policyVersion || ""), cameraMode: String(accepted.cameraMode || ""), updatedAt: now }, idToken);
  return { ok: true, completedAt: now };
}

async function recordGoogleLastLogin(user = {}, idToken = "") {
  const uid = String(user.uid || "").trim();
  if (!uid || !idToken) return { ok: false, message: "Googleログインが必要です。" };
  const now = new Date();
  await patchDocumentWithAuth("googleUsers", uid, { lastLoginAt: now, updatedAt: now }, idToken);
  return { ok: true, lastLoginAt: now };
}

async function saveGoogleAvatarTestPhoto(user = {}, idToken = "", photoDataUrl = "", deviceLabel = "") {
  const uid = String(user.uid || "").trim();
  const photo = normalizeAvatarTestPhoto(photoDataUrl);
  if (!uid || !idToken) return { ok: false, message: "Googleログインが必要です。" };
  if (!photo) return { ok: false, message: "テスト写真の形式またはサイズが正しくありません。" };
  const now = new Date();
  await patchDocumentWithAuth("googleUsers", uid, { avatarTestPhoto: photo, avatarTestCapturedAt: now, avatarTestDevice: String(deviceLabel || ""), cameraMode: "internal", updatedAt: now }, idToken);
  return { ok: true, capturedAt: now };
}

async function patchDocument(collection, id, data) {
  return patchDocumentRaw(collection, id, data);
}

async function patchDocumentWithAuth(collection, id, data, idToken) {
  return patchDocumentRaw(collection, id, data, idToken);
}

async function patchDocumentRaw(collection, id, data, idToken = "") {
  const fieldPaths = Object.keys(data).map((key) => `updateMask.fieldPaths=${encodeURIComponent(key)}`).join("&");
  const path = `${BASE_PATH}/${collection}/${encodeDocId(id)}${fieldPaths ? `?${fieldPaths}` : ""}`;
  const body = { fields: toFields(data) };
  return idToken
    ? requestFirestoreWithAuth("PATCH", path, idToken, body)
    : requestFirestore("PATCH", path, body);
}

async function createDocument(collection, data) {
  return requestFirestore("POST", `${BASE_PATH}/${collection}`, { fields: toFields(data) });
}

async function createSubDocument(path, data) {
  return requestFirestore("POST", `${BASE_PATH}/${path}`, { fields: toFields(data) });
}

async function listDocuments(path) {
  const result = await requestFirestore("GET", `${BASE_PATH}/${path}?pageSize=100`);
  return Array.isArray(result?.documents) ? result.documents : [];
}

async function deleteDocumentByName(name) {
  if (!name) return { ok: false };
  const path = getPathFromDocumentName(name);
  await requestFirestore("DELETE", path);
  return { ok: true };
}

async function patchDocumentByName(name, data) {
  const parsed = getCollectionAndIdFromName(name);
  if (!parsed) return { ok: false, message: "メールIDが見つかりません。" };
  await patchDocument(parsed.collectionPath, parsed.id, data);
  return { ok: true };
}

async function patchDocumentByNameWithAuth(name, data, idToken) {
  const parsed = getCollectionAndIdFromName(name);
  if (!parsed) return { ok: false, message: "メールIDが見つかりません。" };
  await patchDocumentWithAuth(parsed.collectionPath, parsed.id, data, idToken);
  return { ok: true };
}

async function upsertUsage(account = {}, inventory = {}) {
  const puuid = String(account.puuid || "").trim();
  if (!puuid) return { ok: false, message: "puuidなし" };

  const now = new Date();
  const current = await getUser(puuid);
  const user = {
    puuid,
    riotId: account.riotId || current?.riotId || "-",
    firstSeenAt: current?.firstSeenAt || now,
    lastSeenAt: now,
    useCount: Number(current?.useCount || 0) + 1,
    appVersion: inventory.appVersion || current?.appVersion || ""
  };

  await patchDocument("users", puuid, user);
  await createDocument("access_logs", {
    puuid,
    riotId: user.riotId,
    createdAt: now
  });
  return { ok: true, user };
}

function normalizeAvatarTestPhoto(photoDataUrl) {
  const value = String(photoDataUrl || "");
  if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(value)) {
    return "";
  }
  // Keep well below Firestore's 1 MiB document limit after field encoding.
  if (Buffer.byteLength(value, "utf8") > 700 * 1024) return "";
  return value;
}

function inboxRewards(data = {}) {
  return {
    kp: Math.max(0, Math.min(10000, Math.floor(Number(data.kp) || 0))),
    ap: Math.max(0, Math.min(10000, Math.floor(Number(data.ap) || 0))),
    cookies: Math.max(0, Math.min(10000, Math.floor(Number(data.cookies) || 0))),
    ticket15: Math.max(0, Math.min(10000, Math.floor(Number(data.ticket15) || 0))),
    ticket2: Math.max(0, Math.min(10000, Math.floor(Number(data.ticket2) || 0)))
  };
}

function getWeeklyCompetitiveWeekId(serverDate = "") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(serverDate))) return "";
  const [year, month, day] = String(serverDate).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return "";
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return date.toISOString().slice(0, 10);
}

function getPreviousWeeklyCompetitiveWeekId(serverDate = "") {
  const weekId = getWeeklyCompetitiveWeekId(serverDate);
  if (!weekId) return "";
  const [year, month, day] = weekId.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 7);
  return date.toISOString().slice(0, 10);
}

function getWeeklyCompetitiveEntryName(weekId, uid) {
  return getDocumentName("weeklyCompetitive", weekId, "entries", uid);
}

function getWeeklyCompetitiveFinalizationName(weekId) {
  return getDocumentName("weeklyCompetitiveFinalizations", weekId);
}

function getWeeklyCompetitiveRewards(participantCount) {
  const count = Math.max(0, Number(participantCount) || 0);
  if (count === 1) return [1];
  if (count === 2) return [2, 1];
  if (count === 3) return [5, 3, 1];
  if (count <= 5) return [7, 5, 3];
  if (count <= 10) return [10, 7, 5];
  if (count <= 20) return [20, 13, 8];
  if (count <= 30) return [30, 20, 10];
  return [50, 30, 10];
}

function sortWeeklyCompetitiveEntries(entries = []) {
  return [...entries].sort((left, right) => {
    const killDiff = Number(right.kills || 0) - Number(left.kills || 0);
    if (killDiff) return killDiff;
    const assistDiff = Number(right.assists || 0) - Number(left.assists || 0);
    if (assistDiff) return assistDiff;
    return String(left.uid || "").localeCompare(String(right.uid || ""));
  });
}

function rankWeeklyCompetitiveEntries(entries = []) {
  let previous = null;
  return sortWeeklyCompetitiveEntries(entries).map((entry, index) => {
    const tied = previous && Number(previous.kills || 0) === Number(entry.kills || 0) && Number(previous.assists || 0) === Number(entry.assists || 0);
    const rank = tied ? previous.rank : index + 1;
    const ranked = { ...entry, rank };
    previous = ranked;
    return ranked;
  });
}

async function getWeeklyCompetitiveEntries(idToken = "", weekId = "") {
  if (!idToken || !weekId) return [];
  const structuredQuery = { from: [{ collectionId: "entries" }], limit: 500 };
  const result = await requestFirestoreWithAuth("POST", `${BASE_PATH}/weeklyCompetitive/${encodeDocId(weekId)}:runQuery`, idToken, { structuredQuery });
  return (Array.isArray(result) ? result : [])
    .filter((entry) => entry.document)
    .map((entry) => ({ ...docToData(entry.document), name: entry.document.name }));
}

async function getWeeklyCompetitiveRanking(user = {}, idToken = "", serverDate = "") {
  const weekId = getWeeklyCompetitiveWeekId(serverDate);
  if (!user?.uid || !idToken || !weekId) return { ok: false, message: "ランキングを取得できませんでした。", entries: [] };
  try {
    const entries = rankWeeklyCompetitiveEntries(await getWeeklyCompetitiveEntries(idToken, weekId));
    return { ok: true, weekId, participantCount: entries.length, entries: entries.filter((entry) => entry.rank <= 3) };
  } catch (error) {
    return { ok: false, message: "ランキングを取得できませんでした。", entries: [] };
  }
}

async function finalizePreviousWeeklyCompetitiveRanking(user = {}, idToken = "", serverDate = "") {
  const previousWeekId = getPreviousWeeklyCompetitiveWeekId(serverDate);
  if (!user?.uid || !idToken || !previousWeekId) return { ok: false, skipped: true };
  const finalizationName = getWeeklyCompetitiveFinalizationName(previousWeekId);
  const existing = await requestFirestoreWithAuth("GET", getPathFromDocumentName(finalizationName), idToken).catch((error) => error.statusCode === 404 ? null : Promise.reject(error));
  if (existing) return { ok: true, finalized: false, weekId: previousWeekId };

  const ranked = rankWeeklyCompetitiveEntries(await getWeeklyCompetitiveEntries(idToken, previousWeekId));
  const participantCount = ranked.length;
  const rewards = getWeeklyCompetitiveRewards(participantCount);
  const winners = ranked.filter((entry) => entry.rank <= 3).map((entry) => ({ ...entry, reward: rewards[entry.rank - 1] || 0 }));
  const now = new Date();
  const writes = [{
    update: {
      name: finalizationName,
      fields: toFields({ weekId: previousWeekId, participantCount, winners: winners.map((entry) => ({ uid: entry.uid, rank: entry.rank, kills: entry.kills, assists: entry.assists, reward: entry.reward })), finalizedAt: now })
    },
    currentDocument: { exists: false }
  }];
  winners.forEach((winner) => {
    if (!winner.reward || !winner.uid) return;
    const mailName = getGoogleInboxDocumentName(winner.uid, `weekly-ranking-${previousWeekId}`);
    writes.push({
      update: {
        name: mailName,
        fields: toFields({
          type: "weeklyRanking",
          title: "週間コンペランキング結果",
          sender: "運営",
          body: `${previousWeekId}週の結果です。${winner.rank}位（${winner.kills}キル / ${winner.assists}アシスト、参加${participantCount}人）でした。KP ${winner.reward}、AP ${winner.reward}を贈ります。`,
          kp: winner.reward,
          ap: winner.reward,
          read: false,
          claimed: false,
          createdAt: now
        })
      },
      currentDocument: { exists: false }
    });
  });
  try {
    await commitWrites(writes, idToken);
    return { ok: true, finalized: true, weekId: previousWeekId, participantCount };
  } catch (error) {
    const raced = await requestFirestoreWithAuth("GET", getPathFromDocumentName(finalizationName), idToken).catch((requestError) => requestError.statusCode === 404 ? null : Promise.reject(requestError));
    if (raced) return { ok: true, finalized: false, weekId: previousWeekId };
    if (isFirestoreConflict(error)) return { ok: false, code: "cloud-conflict", message: "週間ランキングの確定が他の端末と競合しました。" };
    return firestoreOperationFailure(error, "週間ランキングの確定に失敗しました。");
  }
}

function decodeInboxCursor(cursor = "") {
  try { const value = JSON.parse(Buffer.from(String(cursor), "base64url").toString("utf8")); return value?.createdAt && value?.name ? value : null; } catch (error) { return null; }
}

function encodeInboxCursor(item = {}) {
  if (!item?.createdAt || !item?.name) return "";
  return Buffer.from(JSON.stringify({ createdAt: String(item.createdAt), name: String(item.name) }), "utf8").toString("base64url");
}

async function getGoogleInbox(user = {}, idToken = "", pageToken = "") {
  const uid = String(user.uid || "").trim();
  if (!uid || !idToken) return { ok: false, inbox: [], message: "Googleログインが必要です。" };
  try {
    const cursor = decodeInboxCursor(pageToken);
    const structuredQuery = {
      from: [{ collectionId: "inbox" }],
      orderBy: [{ field: { fieldPath: "createdAt" }, direction: "DESCENDING" }, { field: { fieldPath: "__name__" }, direction: "DESCENDING" }],
      limit: 50
    };
    if (cursor) structuredQuery.startAt = { before: false, values: [{ timestampValue: cursor.createdAt }, { referenceValue: cursor.name }] };
    const result = await requestFirestoreWithAuth("POST", `${BASE_PATH}/googleUsers/${encodeDocId(uid)}:runQuery`, idToken, { structuredQuery });
    const inbox = (Array.isArray(result) ? result : []).filter((entry) => entry.document).map((entry) => ({ ...docToData(entry.document), name: entry.document.name }));
    return { ok: true, inbox, nextPageToken: inbox.length === 50 ? encodeInboxCursor(inbox[inbox.length - 1]) : "" };
  } catch (error) { return { ok: false, inbox: [], message: error.message || "受信箱を取得できませんでした。" }; }
}

async function markGoogleInboxRead(user = {}, idToken = "", name = "") {
  const uid = String(user.uid || "").trim();
  const prefix = `projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/googleUsers/${uid}/inbox/`;
  if (!uid || !idToken || !String(name).startsWith(prefix)) return { ok: false, message: "このメールは操作できません。" };
  try {
    const doc = await requestFirestoreWithAuth("GET", getPathFromDocumentName(name), idToken);
    const updateTime = doc.updateTime || "";
    const parsed = getCollectionAndIdFromName(name);
    if (!parsed) return { ok: false, message: "メールIDが見つかりません。" };
    const fieldPaths = ["read", "readAt"].map((key) => `updateMask.fieldPaths=${key}`).join("&");
    await requestFirestoreWithAuth("PATCH", `${BASE_PATH}/${parsed.collectionPath}/${encodeDocId(parsed.id)}?${fieldPaths}&currentDocument.updateTime=${encodeURIComponent(updateTime)}`, idToken, { fields: toFields({ read: true, readAt: new Date() }) });
    return { ok: true };
  } catch (error) { return { ok: false, message: "既読状態を保存できませんでした。" }; }
}

async function prepareGoogleInboxDelete(user = {}, idToken = "", name = "") {
  const uid = String(user.uid || "").trim();
  const prefix = `projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/googleUsers/${uid}/inbox/`;
  if (!uid || !idToken || !String(name).startsWith(prefix)) return { ok: false, message: "このメールは操作できません。" };
  try { const doc = await requestFirestoreWithAuth("GET", getPathFromDocumentName(name), idToken); return { ok: true, item: { ...docToData(doc), name: doc.name, updateTime: doc.updateTime || "" } }; } catch (error) { return error.statusCode === 404 ? { ok: true, deleted: true } : { ok: false, message: error.message || "メールを確認できませんでした。" }; }
}

async function deleteGoogleInboxItem(user = {}, idToken = "", name = "", updateTime = "") {
  const prepared = await prepareGoogleInboxDelete(user, idToken, name);
  if (prepared.deleted) return { ok: true, alreadyDeleted: true };
  if (!prepared.ok) return prepared;
  if (prepared.item.type === "loginBonus" && !prepared.item.claimed) return { ok: false, message: "未受取のログインボーナスは削除できません。" };
  if (prepared.item.updateTime !== String(updateTime || "")) return { ok: false, conflict: true, item: prepared.item, message: "メールの状態が変わりました。もう一度確認してください。" };
  try { await requestFirestoreWithAuth("DELETE", `${getPathFromDocumentName(name)}?currentDocument.updateTime=${encodeURIComponent(updateTime)}`, idToken); return { ok: true }; } catch (error) {
    if (error.statusCode === 404) return { ok: true, alreadyDeleted: true };
    const latest = await prepareGoogleInboxDelete(user, idToken, name);
    if (latest?.ok && latest.item) return { ok: false, conflict: true, item: latest.item, message: "メールの状態が変わりました。もう一度確認してください。" };
    return { ok: false, conflict: true, message: "メールの削除に失敗しました。" };
  }
}

async function claimGoogleInboxItem(user = {}, idToken = "", name = "") {
  const uid = String(user.uid || "").trim();
  const prefix = `projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/googleUsers/${uid}/inbox/`;
  if (!uid || !idToken || !String(name).startsWith(prefix)) return { ok: false, message: "このメールは操作できません。" };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const mailDoc = await requestFirestoreWithAuth("GET", getPathFromDocumentName(name), idToken);
    const mail = { ...docToData(mailDoc), _updateTime: mailDoc.updateTime || "" };
    if (mail.claimed) {
      const current = await getGoogleUser(uid, idToken);
      return current ? { ok: true, alreadyClaimed: true, rewards: inboxRewards(mail), progress: parseProgressState(current), revision: current._updateTime || "" } : { ok: false, message: "Googleプロフィールを読み込めませんでした。" };
    }
    const rewards = inboxRewards(mail);
    if (!Object.values(rewards).some(Boolean)) return { ok: false, message: "添付アイテムがありません。" };
    const profile = await getGoogleUser(uid, idToken);
    if (!profile) return { ok: false, message: "Googleプロフィールを読み込めませんでした。" };
    const state = parseProgressState(profile);
    state.kp = Math.max(0, Number(state.kp) || 0) + rewards.kp;
    state.ap = Math.max(0, Number(state.ap) || 0) + rewards.ap;
    state.cookies = Math.max(0, Number(state.cookies) || 0) + rewards.cookies;
    state.tickets = state.tickets || {};
    state.tickets.multiplier15 = Math.max(0, Number(state.tickets.multiplier15) || 0) + rewards.ticket15;
    state.tickets.multiplier2 = Math.max(0, Number(state.tickets.multiplier2) || 0) + rewards.ticket2;
    const progress = progressFieldsFromState(state);
    const isLoginBonus = mail.type === "loginBonus";
    const loginBonusDate = String(mail.loginBonusDate || "");
    const loginBonusDayIndex = Math.max(0, Math.floor(Number(mail.loginBonusDayIndex) || 0));
    const profileFields = {
      ...progress,
      updatedAt: new Date(),
      ...(isLoginBonus && /^\d{4}-\d{2}-\d{2}$/.test(loginBonusDate) ? {
        loginBonusDayIndex: (loginBonusDayIndex + 1) % loginBonus.REWARDS.length,
        loginBonusLastClaimDate: loginBonusDate,
        loginBonusPendingMailId: "",
        loginBonusPendingDate: "",
        loginBonusUpdatedAt: new Date()
      } : {})
    };
    try {
      const committed = await commitWrites([
        { update: { name, fields: toFields({ claimed: true, claimedAt: new Date(), read: true, readAt: new Date() }) }, updateMask: { fieldPaths: ["claimed", "claimedAt", "read", "readAt"] }, currentDocument: { updateTime: mail._updateTime } },
        { update: { name: getDocumentName("googleUsers", uid), fields: toFields(profileFields) }, updateMask: { fieldPaths: Object.keys(profileFields) }, currentDocument: { updateTime: profile._updateTime } }
      ], idToken);
      return { ok: true, rewards, progress: state, revision: commitRevision(committed, 1) };
    } catch (error) { if (attempt === 2) return { ok: false, message: "受取を確定できませんでした。" }; }
  }
  return { ok: false, message: "受取を確定できませんでした。" };
}

const SHOP_PRICES = {
  iron: 10,
  bronze: 13,
  silver: 15,
  gold: 18,
  platinum: 20,
  diamond: 25,
  ascendant: 32,
  immortal: 42,
  radiant: 55
};
const SHOP_SPIKE_ID = "expansion_spike";
const SHOP_SPIKE_PRICE = 20;

function isOperationId(value) {
  return /^[A-Za-z0-9_-]{16,128}$/.test(String(value || ""));
}

function operationRecordId(uid, operationId) {
  return Buffer.from(`${uid}\n${operationId}`).toString("base64url");
}

function farmSpikeBalance(user = {}) {
  return Math.max(0, Math.floor(Number(user?.farmSpikes) || 0));
}

async function syncGoogleFarmSpikes(user = {}, idToken = "", localSpikes = 0) {
  const uid = String(user.uid || "").trim();
  if (!uid || !idToken) return { ok: false, message: "Google login is required." };
  const current = await getGoogleUser(uid, idToken);
  if (!current) return { ok: false, message: "Cloud farm data is unavailable." };
  if (current.farmSpikesMigrated) return { ok: true, farmSpikes: farmSpikeBalance(current), revision: current._updateTime || "" };
  const fields = { farmSpikes: Math.max(0, Math.floor(Number(localSpikes) || 0)), farmSpikesMigrated: true, updatedAt: new Date() };
  try {
    const committed = await commitWrites([{ update: { name: getDocumentName("googleUsers", uid), fields: toFields(fields) }, updateMask: { fieldPaths: Object.keys(fields) }, currentDocument: { updateTime: current._updateTime } }], idToken);
    return { ok: true, farmSpikes: fields.farmSpikes, revision: commitRevision(committed, 0) };
  } catch (error) {
    return { ok: false, message: "Farm spike migration could not be saved." };
  }
}

async function applyGoogleFarmSpikeOperation(user = {}, idToken = "", operation = {}) {
  const uid = String(user.uid || "").trim();
  const operationId = String(operation?.id || "").trim();
  const type = String(operation?.type || "").trim();
  const delta = Math.floor(Number(operation?.delta) || 0);
  const target = String(operation?.target || "");
  const validHarvest = type === "harvest" && delta === 1 && /^\d+:\d{10,}$/.test(target);
  const validPotUnlock = type === "unlock-pot" && delta === -1 && /^(?:[3-9]|[12]\d|3[0-2])$/.test(target);
  const truckNumber = Math.floor(Number(target) || 0);
  const validTruckUnlock = type === "unlock-truck" && truckNumber >= 2 && truckNumber <= 5 && delta === -truckNumber;
  if (!uid || !idToken || !isOperationId(operationId) || !(validHarvest || validPotUnlock || validTruckUnlock)) return { ok: false, message: "Invalid farm spike operation." };
  const recordName = getDocumentName("googleFarmSpikeOperations", operationRecordId(uid, operationId));
  const existing = await requestFirestoreWithAuth("GET", getPathFromDocumentName(recordName), idToken).catch((error) => error.statusCode === 404 ? null : Promise.reject(error));
  if (existing) {
    const latest = await getGoogleUser(uid, idToken);
    return latest ? { ok: true, alreadyApplied: true, farmSpikes: farmSpikeBalance(latest), revision: latest._updateTime || "" } : networkFailure("Farm operation result could not be recovered.");
  }
  const current = await getGoogleUser(uid, idToken);
  if (!current?.farmSpikesMigrated) return { ok: false, message: "Farm spikes have not been synchronized yet." };
  const next = farmSpikeBalance(current) + delta;
  if (next < 0) return { ok: false, message: "Not enough farm spikes." };
  const fields = { farmSpikes: next, updatedAt: new Date() };
  const record = { uid, operationId, type, delta, farmSpikes: next, createdAt: new Date() };
  try {
    const committed = await commitWrites([
      { update: { name: recordName, fields: toFields(record) }, currentDocument: { exists: false } },
      { update: { name: getDocumentName("googleUsers", uid), fields: toFields(fields) }, updateMask: { fieldPaths: Object.keys(fields) }, currentDocument: { updateTime: current._updateTime } }
    ], idToken);
    return { ok: true, farmSpikes: next, revision: commitRevision(committed, 1) };
  } catch (error) {
    return { ok: false, message: "Farm spike operation could not be saved." };
  }
}

function normalizeShopUser(user = {}) {
  return {
    uid: String(user.uid || ""),
    email: String(user.email || ""),
    displayName: String(user.displayName || user.email || "プレイヤー"),
    photoURL: String(user.photoURL || "")
  };
}

function normalizeShopProfile(user = {}) {
  return {
    shopSlotsUnlocked: Math.max(1, Math.min(3, Number(user.shopSlotsUnlocked) || 1)),
    shopSoldCharacterIds: Array.isArray(user.shopSoldCharacterIds) ? user.shopSoldCharacterIds : [],
    shopPendingKp: Math.max(0, Number(user.shopPendingKp) || 0),
    shopSalesJson: String(user.shopSalesJson || "[]"),
    shopPurchasesJson: String(user.shopPurchasesJson || "[]")
  };
}

async function getShopProfile(user = {}, idToken = "") {
  const uid = String(user.uid || "").trim();
  if (!uid || !idToken) return { ok: false, message: "ショップを利用するにはGoogleログインが必要です" };
  const current = await getGoogleUser(uid, idToken);
  const normalizedUser = normalizeShopUser({ ...current, ...user });
  if (!current) {
    const saved = await saveGoogleUserSession(normalizedUser, idToken);
    return { ok: true, user: saved.user, profile: normalizeShopProfile(saved.user) };
  }
  return { ok: true, user: normalizedUser, profile: normalizeShopProfile(current) };
}

async function listShopListings() {
  const docs = await listDocuments("shopListings");
  const listings = docs.map((doc) => ({ ...docToData(doc), name: doc.name, updateTime: doc.updateTime }))
    .filter((item) => item.status === "active")
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  return { ok: true, listings };
}

async function getShopListing(listingId) {
  if (!listingId) return null;
  try {
    const doc = await requestFirestore("GET", `${BASE_PATH}/shopListings/${encodeDocId(listingId)}`);
    return { ...docToData(doc), name: doc.name, updateTime: doc.updateTime };
  } catch (error) {
    if (error.statusCode === 404) return null;
    throw error;
  }
}

async function createShopListing(user = {}, idToken = "", listing = {}, operationId = "") {
  const uid = String(user.uid || "").trim();
  operationId = String(operationId || "").trim();
  if (!uid || !idToken) return { ok: false, message: "\u30b7\u30e7\u30c3\u30d7\u3092\u5229\u7528\u3059\u308b\u306b\u306fGoogle\u30ed\u30b0\u30a4\u30f3\u304c\u5fc5\u8981\u3067\u3059" };
  if (!isOperationId(operationId)) return { ok: false, message: "Invalid shop operation." };
  const recordName = getDocumentName("googleShopOperations", operationRecordId(uid, operationId));
  const existing = await requestFirestoreWithAuth("GET", getPathFromDocumentName(recordName), idToken).catch((error) => error.statusCode === 404 ? null : Promise.reject(error));
  if (existing) {
    const result = docToData(existing).result || {};
    const latest = await getGoogleUser(uid, idToken);
    return { ok: true, alreadyApplied: true, ...result, farmSpikes: farmSpikeBalance(latest), revision: latest?._updateTime || "" };
  }
  const itemType = listing.itemType === "spike" ? "spike" : "character";
  const itemId = itemType === "spike" ? SHOP_SPIKE_ID : String(listing.characterId || "").trim();
  const characterId = itemType === "spike" ? "" : itemId;
  const rarity = String(listing.rarity || "").trim();
  const price = itemType === "spike" ? SHOP_SPIKE_PRICE : SHOP_PRICES[rarity];
  if (itemType === "character" && (!characterId || !price)) return { ok: false, message: "\u51fa\u54c1\u3067\u304d\u306a\u3044\u30ad\u30e3\u30e9\u3067\u3059" };
  if (itemType === "spike" && price !== SHOP_SPIKE_PRICE) return { ok: false, message: "\u51fa\u54c1\u3067\u304d\u306a\u3044\u5546\u54c1\u3067\u3059" };

  const profileResult = await getShopProfile(user, idToken);
  if (!profileResult.ok) return profileResult;
  const profile = profileResult.profile;
  profile.shopSlotsUnlocked = Math.max(profile.shopSlotsUnlocked, Math.max(1, Math.min(3, Number(listing.slotsUnlocked) || 1)));
  const active = (await listShopListings()).listings.filter((item) => item.sellerUid === uid);
  if (itemType === "character" && profile.shopSoldCharacterIds.includes(characterId)) return { ok: false, message: "\u3053\u306e\u30ad\u30e3\u30e9\u306f\u8ca9\u58f2\u6e08\u307f\u3067\u3059" };
  if (itemType === "character" && active.some((item) => item.characterId === characterId)) return { ok: false, message: "\u3053\u306e\u30ad\u30e3\u30e9\u306f\u51fa\u54c1\u4e2d\u3067\u3059" };
  if (active.length >= profile.shopSlotsUnlocked) return { ok: false, message: "\u51fa\u54c1\u67a0\u304c\u7a7a\u3044\u3066\u3044\u307e\u305b\u3093" };

  const now = new Date();
  const data = {
    sellerUid: uid,
    sellerName: String(user.displayName || user.email || "\u30d7\u30ec\u30a4\u30e4\u30fc"),
    sellerEmail: String(user.email || ""),
    itemType,
    itemId,
    characterId,
    characterName: itemType === "spike" ? "\u62e1\u5f35\u30b9\u30d1\u30a4\u30af" : String(listing.characterName || ""),
    rarity: itemType === "spike" ? "spike" : rarity,
    rarityLabel: itemType === "spike" ? "\u7d20\u6750" : String(listing.rarityLabel || ""),
    image: String(listing.image || ""),
    price,
    status: "active",
    createdAt: now,
    updatedAt: now
  };
  const current = await getGoogleUser(uid, idToken);
  if (!current) return { ok: false, message: "Cloud progress is unavailable." };
  const listingId = `shop_${operationRecordId(uid, operationId)}`;
  const listingName = getDocumentName("shopListings", listingId);
  const farmSpikes = farmSpikeBalance(current);
  if (itemType === "spike" && (!current.farmSpikesMigrated || farmSpikes < 1)) return { ok: false, message: "Not enough farm spikes." };
  const fields = { shopSlotsUnlocked: profile.shopSlotsUnlocked, updatedAt: now };
  if (itemType === "spike") {
    fields.farmSpikes = farmSpikes - 1;
    fields.farmSpikesMigrated = true;
  }
  const result = { listing: { ...data, id: listingId } };
  try {
    const committed = await commitWrites([
      { update: { name: recordName, fields: toFields({ uid, operationId, type: "create", result, createdAt: now }) }, currentDocument: { exists: false } },
      { update: { name: listingName, fields: toFields(data) }, currentDocument: { exists: false } },
      { update: { name: getDocumentName("googleUsers", uid), fields: toFields(fields) }, updateMask: { fieldPaths: Object.keys(fields) }, currentDocument: { updateTime: current._updateTime } }
    ], idToken);
    return { ok: true, ...result, farmSpikes: itemType === "spike" ? farmSpikes - 1 : farmSpikes, revision: commitRevision(committed, 2) };
  } catch (error) {
    return { ok: false, message: "Listing could not be saved." };
  }
}

async function cancelShopListing(user = {}, idToken = "", listingId = "", operationId = "") {
  const uid = String(user.uid || "").trim();
  operationId = String(operationId || "").trim();
  if (!uid || !idToken) return { ok: false, message: "ショップを利用するにはGoogleログインが必要です" };
  if (!isOperationId(operationId)) return { ok: false, message: "Invalid shop operation." };
  const recordName = getDocumentName("googleShopOperations", operationRecordId(uid, operationId));
  const existing = await requestFirestoreWithAuth("GET", getPathFromDocumentName(recordName), idToken).catch((error) => error.statusCode === 404 ? null : Promise.reject(error));
  if (existing) {
    const latest = await getGoogleUser(uid, idToken);
    return { ok: true, alreadyApplied: true, farmSpikes: farmSpikeBalance(latest), revision: latest?._updateTime || "" };
  }
  const listing = await getShopListing(listingId);
  if (!listing) return { ok: false, message: "出品が見つかりません" };
  if (listing.sellerUid !== uid) return { ok: false, message: "自分の出品だけ取り消せます" };
  if (listing.status !== "active") return { ok: false, message: "この出品は取り消せません" };
  const current = await getGoogleUser(uid, idToken);
  if (!current) return { ok: false, message: "Cloud progress is unavailable." };
  const isSpike = listing.itemType === "spike" || listing.itemId === SHOP_SPIKE_ID;
  const now = new Date();
  const fields = { updatedAt: now };
  if (isSpike) {
    fields.farmSpikes = farmSpikeBalance(current) + 1;
    fields.farmSpikesMigrated = true;
  }
  try {
    const committed = await commitWrites([
      { update: { name: recordName, fields: toFields({ uid, operationId, type: "cancel", listingId, createdAt: now }) }, currentDocument: { exists: false } },
      { update: { name: listing.name, fields: toFields({ status: "cancelled", updatedAt: now }) }, updateMask: { fieldPaths: ["status", "updatedAt"] }, currentDocument: { updateTime: listing.updateTime } },
      { update: { name: getDocumentName("googleUsers", uid), fields: toFields(fields) }, updateMask: { fieldPaths: Object.keys(fields) }, currentDocument: { updateTime: current._updateTime } }
    ], idToken);
    return { ok: true, farmSpikes: isSpike ? farmSpikeBalance(current) + 1 : farmSpikeBalance(current), revision: commitRevision(committed, 2) };
  } catch (error) {
    return { ok: false, message: "Listing cancellation could not be saved." };
  }
}

async function buyShopListing(user = {}, idToken = "", listingId = "", buyerState = {}, operationId = "") {
  const buyerUid = String(user.uid || "").trim();
  operationId = String(operationId || "").trim();
  if (!buyerUid || !idToken) return { ok: false, message: "\u30b7\u30e7\u30c3\u30d7\u3092\u5229\u7528\u3059\u308b\u306b\u306fGoogle\u30ed\u30b0\u30a4\u30f3\u304c\u5fc5\u8981\u3067\u3059" };
  if (!isOperationId(operationId)) return { ok: false, message: "Invalid shop operation." };
  const recordName = getDocumentName("googleShopOperations", operationRecordId(buyerUid, operationId));
  const existing = await requestFirestoreWithAuth("GET", getPathFromDocumentName(recordName), idToken).catch((error) => error.statusCode === 404 ? null : Promise.reject(error));
  if (existing) {
    const latest = await getGoogleUser(buyerUid, idToken);
    return latest ? { ok: true, alreadyApplied: true, state: parseProgressState(latest), farmSpikes: farmSpikeBalance(latest), revision: latest._updateTime || "" } : networkFailure("Purchase result could not be recovered.");
  }
  const listing = await getShopListing(listingId);
  if (!listing || listing.status !== "active") return { ok: false, message: "\u3053\u306e\u5546\u54c1\u306f\u3059\u3067\u306b\u58f2\u308c\u3066\u3044\u307e\u3059" };
  if (listing.sellerUid === buyerUid) return { ok: false, message: "\u81ea\u5206\u306e\u51fa\u54c1\u306f\u8cfc\u5165\u3067\u304d\u307e\u305b\u3093" };

  const itemType = listing.itemType === "spike" || listing.itemId === SHOP_SPIKE_ID ? "spike" : "character";
  const price = Math.max(0, Number(listing.price) || 0);
  let buyerKp = Math.max(0, Number(buyerState.kp) || 0);
  if (buyerKp < price) return { ok: false, message: "KP\u304c\u8db3\u308a\u307e\u305b\u3093" };

  const characterId = String(listing.characterId || "");
  let counts = buyerState.characterCounts && typeof buyerState.characterCounts === "object" ? { ...buyerState.characterCounts } : {};
  let ownedIds = Array.isArray(buyerState.ownedCharacterIds) ? [...buyerState.ownedCharacterIds] : [];
  let nextStage = 0;
  if (itemType === "character") {
    const currentStage = Math.max(0, Math.min(3, Number(counts[characterId]) || 0));
    if (currentStage >= 3) return { ok: false, message: "\u5b8c\u6210\u6e08\u307f" };
    counts[characterId] = Math.min(3, currentStage + 1);
    nextStage = counts[characterId];
    ownedIds = Object.keys(counts).filter((id) => Number(counts[id]) > 0);
  }

  const buyerCurrent = await getGoogleUser(buyerUid, idToken);
  const sellerCurrent = await getGoogleUser(listing.sellerUid, idToken).catch(() => null);
  if (!buyerCurrent || !sellerCurrent) return { ok: false, message: "購入に必要な進捗を確認できませんでした" };
  // 購入内容はリクエストに含まれる画面状態ではなく、強制保存済みのクラウド進捗から確定する。
  const buyerProgress = parseProgressState(buyerCurrent);
  buyerKp = Math.max(0, Number(buyerProgress.kp) || 0);
  if (buyerKp < price) return { ok: false, message: "KPが足りません" };
  counts = buyerProgress.characterCounts && typeof buyerProgress.characterCounts === "object" ? { ...buyerProgress.characterCounts } : {};
  ownedIds = Array.isArray(buyerProgress.ownedCharacterIds) ? [...buyerProgress.ownedCharacterIds] : [];
  if (itemType === "character") {
    const currentStage = Math.max(0, Math.min(3, Number(counts[characterId]) || 0));
    if (currentStage >= 3) return { ok: false, message: "完成済み" };
    counts[characterId] = Math.min(3, currentStage + 1);
    nextStage = counts[characterId];
    ownedIds = Object.keys(counts).filter((id) => Number(counts[id]) > 0);
  }
  buyerProgress.kp = buyerKp - price;
  buyerProgress.characterCounts = counts;
  buyerProgress.ownedCharacterIds = ownedIds;
  if (itemType === "character") buyerProgress.activeCharacterId = characterId;
  const sellerProfile = normalizeShopProfile(sellerCurrent || {});
  const buyerProfile = normalizeShopProfile(buyerCurrent || {});
  const soldIds = itemType === "character" ? [...new Set([...sellerProfile.shopSoldCharacterIds, characterId])] : sellerProfile.shopSoldCharacterIds;
  const now = new Date();
  const itemName = itemType === "spike" ? "\u62e1\u5f35\u30b9\u30d1\u30a4\u30af" : listing.characterName;
  const sale = { listingId, itemType, itemId: itemType === "spike" ? SHOP_SPIKE_ID : characterId, characterId, characterName: itemName, price, buyerUid, soldAt: now.toISOString() };
  const purchase = { listingId, itemType, itemId: itemType === "spike" ? SHOP_SPIKE_ID : characterId, characterId, characterName: itemName, price, sellerUid: listing.sellerUid, purchasedAt: now.toISOString() };
  const sales = [...parseJsonArray(sellerProfile.shopSalesJson), sale].slice(-100);
  const purchases = [...parseJsonArray(buyerProfile.shopPurchasesJson), purchase].slice(-100);
  const sellerPendingKp = Math.max(0, Number(sellerCurrent?.shopPendingKp) || 0) + price;

  const sellerFields = { shopSalesJson: safeJson(sales), shopPendingKp: sellerPendingKp, updatedAt: now };
  const sellerMask = ["shopSalesJson", "shopPendingKp", "updatedAt"];
  if (itemType === "character") { sellerFields.shopSoldCharacterIds = soldIds; sellerMask.unshift("shopSoldCharacterIds"); }
  const nextFarmSpikes = farmSpikeBalance(buyerCurrent) + (itemType === "spike" ? 1 : 0);
  const buyerFields = { ...progressFieldsFromState(buyerProgress), shopPurchasesJson: safeJson(purchases), updatedAt: now };
  if (itemType === "spike") {
    buyerFields.farmSpikes = nextFarmSpikes;
    buyerFields.farmSpikesMigrated = true;
  }
  const buyerMask = Object.keys(buyerFields);

  try {
    const committed = await commitWrites([
      { update: { name: recordName, fields: toFields({ uid: buyerUid, operationId, type: "buy", listingId, createdAt: now }) }, currentDocument: { exists: false } },
      { update: { name: listing.name, fields: toFields({ status: "sold", buyerUid, buyerName: String(user.displayName || user.email || "\u30d7\u30ec\u30a4\u30e4\u30fc"), soldAt: now, updatedAt: now }) }, updateMask: { fieldPaths: ["status", "buyerUid", "buyerName", "soldAt", "updatedAt"] }, currentDocument: { updateTime: listing.updateTime } },
      { update: { name: getDocumentName("googleUsers", listing.sellerUid), fields: toFields(sellerFields) }, updateMask: { fieldPaths: sellerMask }, currentDocument: { updateTime: sellerCurrent._updateTime } },
      { update: { name: getDocumentName("googleUsers", buyerUid), fields: toFields(buyerFields) }, updateMask: { fieldPaths: buyerMask }, currentDocument: { updateTime: buyerCurrent._updateTime } }
    ], idToken);
    return {
      ok: true,
      itemType,
      listing: { ...listing, status: "sold" },
      state: buyerProgress,
      farmSpikes: nextFarmSpikes,
      revision: commitRevision(committed, 3),
      buyer: { kp: buyerProgress.kp, characterCounts: counts, ownedCharacterIds: ownedIds, nextStage }
    };
  } catch (error) {
    return { ok: false, message: "\u3053\u306e\u5546\u54c1\u306f\u3059\u3067\u306b\u58f2\u308c\u3066\u3044\u308b\u304b\u3001\u8cfc\u5165\u51e6\u7406\u306b\u5931\u6557\u3057\u307e\u3057\u305f" };
  }
}

async function claimShopPendingKp(user = {}, idToken = "") {
  const uid = String(user.uid || "").trim();
  if (!uid || !idToken) return { ok: false, message: "Googleログインが必要です" };
  const current = await getGoogleUser(uid, idToken);
  const pending = Math.max(0, Number(current?.shopPendingKp) || 0);
  const state = parseProgressState(current || {});
  if (pending <= 0) return { ok: true, pendingKp: 0, state, revision: String(current?._updateTime || "") };
  state.kp = Math.max(0, Number(state.kp) || 0) + pending;
  const fields = { ...progressFieldsFromState(state), shopPendingKp: 0, updatedAt: new Date() };
  try {
    const committed = await commitWrites([{
      update: { name: getDocumentName("googleUsers", uid), fields: toFields(fields) },
      updateMask: { fieldPaths: Object.keys(fields) },
      currentDocument: current?._updateTime ? { updateTime: current._updateTime } : { exists: false }
    }], idToken);
    return { ok: true, pendingKp: pending, state, revision: commitRevision(committed, 0) };
  } catch (error) {
    return { ok: false, message: "売上の受け取りを保存できませんでした" };
  }
}

async function syncShopSlotsUnlocked(user = {}, idToken = "", slots = 1) {
  const uid = String(user.uid || "").trim();
  if (!uid || !idToken) return { ok: false, message: "Googleログインが必要です" };
  const current = await getGoogleUser(uid, idToken);
  const currentSlots = normalizeShopProfile(current || {}).shopSlotsUnlocked;
  const nextSlots = Math.max(currentSlots, Math.max(1, Math.min(3, Number(slots) || 1)));
  if (nextSlots !== currentSlots) {
    const updated = await patchDocumentWithAuth("googleUsers", uid, { shopSlotsUnlocked: nextSlots, updatedAt: new Date() }, idToken);
    return { ok: true, shopSlotsUnlocked: nextSlots, revision: String(updated?.updateTime || "") };
  }
  return { ok: true, shopSlotsUnlocked: nextSlots, revision: String(current?._updateTime || "") };
}

function getLoginBonusProfileState(user = {}, serverDate = "") {
  const normalized = loginBonus.normalizeState(user);
  return {
    ...normalized,
    canClaim: Boolean(serverDate) && normalized.lastClaimDate !== serverDate,
    serverDate: String(serverDate || "")
  };
}

function loginBonusMailText(reward = {}) {
  const values = reward.rewards || {};
  const items = [];
  if (Number(values.kp) > 0) items.push(`KP ${values.kp}`);
  if (Number(values.ap) > 0) items.push(`AP ${values.ap}`);
  if (Number(values.cookies) > 0) items.push(`クッキー ${values.cookies}`);
  if (Number(values.ticket15) > 0) items.push("1.5倍チケット 1枚");
  if (Number(values.ticket2) > 0) items.push("2倍チケット 1枚");
  return items.join(" / ") || "報酬";
}

async function ensureLoginBonusInboxMail(user = {}, idToken = "", serverDate = "") {
  const uid = String(user.uid || "").trim();
  const today = String(serverDate || "").trim();
  if (!uid || !idToken || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return { ok: false, skipped: true, message: "時刻確認に失敗しました。" };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let current = await getGoogleUser(uid, idToken);
    if (!current) {
      await saveGoogleUserSession(user, idToken);
      current = await getGoogleUser(uid, idToken);
    }
    if (!current) return { ok: false, message: "Googleプロフィールを読み込めませんでした。" };
    const state = getLoginBonusProfileState(current, today);
    if (state.lastClaimDate === today) return { ok: true, created: false, canClaim: false };
    const pendingMailId = String(current.loginBonusPendingMailId || "");
    if (pendingMailId) {
      const pendingPath = getPathFromDocumentName(pendingMailId);
      const pending = pendingPath ? await requestFirestoreWithAuth("GET", pendingPath, idToken).catch((error) => error.statusCode === 404 ? null : Promise.reject(error)) : null;
      if (pending && !docToData(pending).claimed) return { ok: true, created: false, pending: true };
    }
    const mailName = getGoogleInboxDocumentName(uid, `login-bonus-${today}`);
    const existingMail = await requestFirestoreWithAuth("GET", getPathFromDocumentName(mailName), idToken).catch((error) => error.statusCode === 404 ? null : Promise.reject(error));
    if (existingMail && !docToData(existingMail).claimed) return { ok: true, created: false, pending: true };
    const dayIndex = state.dayIndex;
    const reward = loginBonus.REWARDS[dayIndex] || loginBonus.REWARDS[0];
    const now = new Date();
    try {
      await commitWrites([
        {
          update: {
            name: mailName,
            fields: toFields({
              type: "loginBonus",
              title: "ログインボーナス",
              sender: "運営",
              body: `ログイン${dayIndex + 1}日目の報酬です。${loginBonusMailText(reward)}をお受け取りください。`,
              ...(reward.rewards || {}),
              loginBonusDate: today,
              loginBonusDayIndex: dayIndex,
              read: false,
              claimed: false,
              createdAt: now
            })
          },
          currentDocument: { exists: false }
        },
        {
          update: { name: getDocumentName("googleUsers", uid), fields: toFields({ loginBonusPendingMailId: mailName, loginBonusPendingDate: today, updatedAt: now }) },
          updateMask: { fieldPaths: ["loginBonusPendingMailId", "loginBonusPendingDate", "updatedAt"] },
          currentDocument: current._updateTime ? { updateTime: current._updateTime } : undefined
        }
      ], idToken);
      return { ok: true, created: true, reward };
    } catch (error) {
      const recoveredMail = await requestFirestoreWithAuth("GET", getPathFromDocumentName(mailName), idToken).catch(() => null);
      if (recoveredMail && !docToData(recoveredMail).claimed) return { ok: true, created: true, recovered: true, reward };
      if (isFirestoreConflict(error)) {
        if (attempt === 2) return { ok: false, code: "cloud-conflict", message: "ログインボーナスメールの作成が他の端末と競合しました。" };
        continue;
      }
      return firestoreOperationFailure(error, "ログインボーナスメールを作成できませんでした。");
    }
  }
  return { ok: false, message: "ログインボーナスメールを作成できませんでした。" };
}

function applyLoginBonusRewards(user = {}, reward = {}) {
  const next = parseProgressState(user);
  next.tickets = next.tickets || { multiplier15: 0, multiplier2: 0 };
  const rewards = reward.rewards || {};
  next.kp = Math.max(0, Number(next.kp ?? user.kp) || 0) + Math.max(0, Number(rewards.kp) || 0);
  next.ap = Math.max(0, Number(next.ap ?? user.ap) || 0) + Math.max(0, Number(rewards.ap) || 0);
  next.cookies = Math.max(0, Number(next.cookies ?? user.cookies) || 0) + Math.max(0, Number(rewards.cookies) || 0);
  next.tickets.multiplier15 = Math.max(0, Number(next.tickets.multiplier15) || 0) + Math.max(0, Number(rewards.ticket15) || 0);
  next.tickets.multiplier2 = Math.max(0, Number(next.tickets.multiplier2) || 0) + Math.max(0, Number(rewards.ticket2) || 0);
  return next;
}

async function getLoginBonusState(user = {}, idToken = "", serverDate = "") {
  const uid = String(user.uid || "").trim();
  if (!uid || !idToken) return { ok: false, message: "ログインボーナスを受け取るには、設定からGoogleにログインしてください" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(serverDate))) return { ok: false, message: "時刻確認に失敗しました。" };
  const current = await getGoogleUser(uid, idToken);
  if (!current) {
    const saved = await saveGoogleUserSession(user, idToken);
    return { ok: true, state: getLoginBonusProfileState(saved.user || {}, serverDate) };
  }
  return { ok: true, state: getLoginBonusProfileState(current, serverDate) };
}

async function claimLoginBonus(user = {}, idToken = "", serverDate = "") {
  const uid = String(user.uid || "").trim();
  if (!uid || !idToken) return { ok: false, message: "ログインボーナスを受け取るには、設定からGoogleにログインしてください" };
  const today = String(serverDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return { ok: false, message: "時刻確認に失敗しました。" };
  const claimId = Buffer.from(`${uid}\n${today}`).toString("base64url");

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const existingClaim = await requestFirestoreWithAuth("GET", `${BASE_PATH}/googleLoginBonusClaims/${encodeDocId(claimId)}`, idToken).catch((error) => error.statusCode === 404 ? null : Promise.reject(error));
    let current = await getGoogleUser(uid, idToken);
    if (!current) {
      await saveGoogleUserSession(user, idToken);
      current = await getGoogleUser(uid, idToken);
    }
    const currentState = getLoginBonusProfileState(current || {}, today);
    if (existingClaim || currentState.lastClaimDate === today) {
      return { ok: false, alreadyClaimed: true, state: { ...currentState, canClaim: false }, message: "今日は受け取り済みです" };
    }

    const claimedDayIndex = currentState.dayIndex;
    const reward = loginBonus.REWARDS[claimedDayIndex];
    const progress = applyLoginBonusRewards(current || {}, reward);
    const now = new Date();
    const fields = {
      ...progressFieldsFromState(progress),
      loginBonusDayIndex: (claimedDayIndex + 1) % loginBonus.REWARDS.length,
      loginBonusLastClaimDate: today,
      loginBonusUpdatedAt: now,
      updatedAt: now
    };
    const writes = [
      { update: { name: getDocumentName("googleLoginBonusClaims", claimId), fields: toFields({ uid, claimDate: today, claimedDayIndex, createdAt: now }) }, currentDocument: { exists: false } },
      { update: { name: getDocumentName("googleUsers", uid), fields: toFields(fields) }, updateMask: { fieldPaths: Object.keys(fields) }, currentDocument: current?._updateTime ? { updateTime: current._updateTime } : undefined }
    ];
    try {
      await commitWrites(writes, idToken);
      return {
        ok: true,
        claimedDayIndex,
        reward,
        progress,
        state: loginBonus.normalizeState({ dayIndex: fields.loginBonusDayIndex, lastClaimDate: today, canClaim: false, serverDate: today })
      };
    } catch (error) {
      if (attempt === 2) return { ok: false, message: "受取を確定できませんでした。もう一度お試しください。" };
    }
  }
  return { ok: false, message: "受取を確定できませんでした。" };
}

module.exports = {
  __test: {
    applyGoogleMatchReward,
    rollGoogleRoulette,
    getWeeklyCompetitiveWeekId,
    getPreviousWeeklyCompetitiveWeekId,
    getWeeklyCompetitiveRewards,
    rankWeeklyCompetitiveEntries,
    getDocumentName,
    getGoogleInboxDocumentName,
    getGoogleMatchRewardDocumentNames,
    getWeeklyCompetitiveEntryName,
    normalizeDocumentName,
    getPathFromDocumentName,
    getFirestoreErrorStatus,
    isFirestoreConflict,
    firestoreOperationFailure,
    validateCommitWrites,
    toValue,
    fromValue
  },
  FIREBASE_CONFIG,
  buyShopListing,
  cancelShopListing,
  claimShopPendingKp,
  completeGoogleOnboarding,
  createShopListing,
  prepareGoogleInboxDelete,
  deleteGoogleInboxItem,
  ensureLoginBonusInboxMail,
  finalizePreviousWeeklyCompetitiveRanking,
  getGoogleUser,
  getGoogleProgress,
  getGoogleAccountStatus,
  getGoogleInbox,
  getLoginBonusState,
  getWeeklyCompetitiveRanking,
  getShopProfile,
  linkGooglePuuid,
  listShopListings,
  markGoogleInboxRead,
  claimGoogleInboxItem,
  claimLoginBonus,
  claimGoogleMatchReward,
  applyGoogleCollectionOperation,
  applyGoogleFarmSpikeOperation,
  migrateGoogleProgress,
  recordGoogleLastLogin,
  registerNickname,
  saveGoogleAvatarTestPhoto,
  saveGoogleProgress,
  saveGoogleUserSession,
  syncGoogleFarmSpikes,
  syncShopSlotsUnlocked,
  upsertUsage
};
