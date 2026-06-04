const https = require("https");

const ADMIN_PIN = "3613";
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDIiwhzuEXucBro2-PpFYNh9-BB37imLMI",
  authDomain: "ishibashi-tracker.firebaseapp.com",
  projectId: "ishibashi-tracker",
  storageBucket: "ishibashi-tracker.firebasestorage.app",
  messagingSenderId: "472088950213",
  appId: "1:472088950213:web:7c511bb46c1710464107ac"
};

const BASE_PATH = `/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`;

function requestFirestore(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "firestore.googleapis.com",
      port: 443,
      path,
      method,
      headers: {
        "Content-Type": "application/json"
      }
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
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (value === null || value === undefined) return { nullValue: null };
  return { stringValue: String(value) };
}

function fromValue(value) {
  if (!value || typeof value !== "object") return null;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return Boolean(value.booleanValue);
  if ("timestampValue" in value) return value.timestampValue;
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

async function patchDocument(collection, id, data) {
  const fieldPaths = Object.keys(data).map((key) => `updateMask.fieldPaths=${encodeURIComponent(key)}`).join("&");
  return requestFirestore(
    "PATCH",
    `${BASE_PATH}/${collection}/${encodeDocId(id)}${fieldPaths ? `?${fieldPaths}` : ""}`,
    { fields: toFields(data) }
  );
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
  const path = name.startsWith("projects/") ? `/v1/${name}` : name;
  await requestFirestore("DELETE", path);
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
    status: current?.status || "pending",
    notes: current?.notes || "",
    kp: Math.max(0, Number(inventory.kp ?? current?.kp) || 0),
    ap: Math.max(0, Number(inventory.ap ?? current?.ap) || 0),
    ticket15: Math.max(0, Number(inventory.ticket15 ?? current?.ticket15) || 0),
    ticket2: Math.max(0, Number(inventory.ticket2 ?? current?.ticket2) || 0),
    trackerLevel: Math.max(0, Number(inventory.trackerLevel ?? current?.trackerLevel) || 0),
    ownedCharacterCount: Math.max(0, Number(inventory.ownedCharacterCount ?? current?.ownedCharacterCount) || 0),
    series4Unlocked: Boolean(inventory.series4Unlocked ?? current?.series4Unlocked),
    skillsJson: inventory.skillsJson || current?.skillsJson || "{}",
    eggJson: inventory.eggJson || current?.eggJson || "null",
    ownedCharacterIdsJson: inventory.ownedCharacterIdsJson || current?.ownedCharacterIdsJson || "[]",
    characterCountsJson: inventory.characterCountsJson || current?.characterCountsJson || "{}",
    appVersion: inventory.appVersion || current?.appVersion || ""
  };

  await patchDocument("users", puuid, user);
  await createDocument("access_logs", {
    puuid,
    riotId: user.riotId,
    status: user.status,
    createdAt: now
  });
  return { ok: true, user };
}

async function listUsers() {
  const result = await requestFirestore("GET", `${BASE_PATH}/users?pageSize=100`);
  const documents = Array.isArray(result?.documents) ? result.documents : [];
  return {
    ok: true,
    users: documents.map(docToData).sort((a, b) => String(b.lastSeenAt || "").localeCompare(String(a.lastSeenAt || "")))
  };
}

async function grantUser(puuid, rewards = {}) {
  const current = await getUser(puuid);
  if (!current) return { ok: false, message: "ユーザーが見つかりません" };
  const next = {
    kp: Math.max(0, Number(current.kp || 0) + Number(rewards.kp || 0)),
    ap: Math.max(0, Number(current.ap || 0) + Number(rewards.ap || 0)),
    ticket15: Math.max(0, Number(current.ticket15 || 0) + Number(rewards.ticket15 || 0)),
    ticket2: Math.max(0, Number(current.ticket2 || 0) + Number(rewards.ticket2 || 0))
  };
  await patchDocument("users", puuid, next);
  return { ok: true, user: { ...current, ...next } };
}

async function confiscateUserItems(puuid, rewards = {}) {
  const current = await getUser(puuid);
  if (!current) return { ok: false, message: "ユーザーが見つかりません" };
  const next = {
    kp: Math.max(0, Number(current.kp || 0) - Math.max(0, Number(rewards.kp || 0))),
    ap: Math.max(0, Number(current.ap || 0) - Math.max(0, Number(rewards.ap || 0))),
    ticket15: Math.max(0, Number(current.ticket15 || 0) - Math.max(0, Number(rewards.ticket15 || 0))),
    ticket2: Math.max(0, Number(current.ticket2 || 0) - Math.max(0, Number(rewards.ticket2 || 0)))
  };
  await patchDocument("users", puuid, next);
  await createSubDocument(`users/${encodeDocId(puuid)}/inbox`, {
    puuid,
    type: "confiscate",
    kp: Math.max(0, Number(rewards.kp) || 0),
    ap: Math.max(0, Number(rewards.ap) || 0),
    ticket15: Math.max(0, Number(rewards.ticket15) || 0),
    ticket2: Math.max(0, Number(rewards.ticket2) || 0),
    createdAt: new Date()
  });
  return { ok: true, user: { ...current, ...next } };
}

async function setUserStatus(puuid, status) {
  await patchDocument("users", puuid, { status });
  return { ok: true };
}

async function sendMessage(puuid, message) {
  const text = typeof message === "object" ? String(message.message || "").trim() : String(message || "").trim();
  const title = typeof message === "object" ? String(message.title || "").trim() : "";
  if (!puuid || !text) return { ok: false, message: "メッセージが空です" };
  await createSubDocument(`users/${encodeDocId(puuid)}/inbox`, {
    puuid,
    type: "message",
    title,
    message: text,
    createdAt: new Date()
  });
  return { ok: true };
}

async function sendItem(puuid, rewards = {}) {
  if (!puuid) return { ok: false, message: "puuidなし" };
  const item = {
    puuid,
    type: "item",
    kp: Math.max(0, Number(rewards.kp) || 0),
    ap: Math.max(0, Number(rewards.ap) || 0),
    ticket15: Math.max(0, Number(rewards.ticket15) || 0),
    ticket2: Math.max(0, Number(rewards.ticket2) || 0),
    createdAt: new Date()
  };
  if (!item.kp && !item.ap && !item.ticket15 && !item.ticket2) return { ok: false, message: "アイテムが空です" };
  await createSubDocument(`users/${encodeDocId(puuid)}/inbox`, item);
  return { ok: true };
}

async function getInbox(puuid) {
  if (!puuid) return { ok: false, inbox: [] };
  try {
    const docs = await listDocuments(`users/${encodeDocId(puuid)}/inbox`);
    const inbox = docs.map((doc) => ({ ...docToData(doc), name: doc.name }))
      .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
    return { ok: true, inbox };
  } catch (error) {
    return { ok: false, inbox: [] };
  }
}

async function deleteInboxItem(documentName) {
  return deleteDocumentByName(documentName);
}

async function sendBulkMessage(title, message) {
  const result = await listUsers();
  const targets = result.users.filter((user) => user.status !== "blocked" && user.puuid);
  for (const user of targets) {
    await sendMessage(user.puuid, { title, message });
  }
  return { ok: true, count: targets.length };
}

async function sendBulkItem(rewards) {
  const result = await listUsers();
  const targets = result.users.filter((user) => user.status !== "blocked" && user.puuid);
  for (const user of targets) {
    await sendItem(user.puuid, rewards);
  }
  return { ok: true, count: targets.length };
}

async function isBlocked(puuid) {
  const user = await getUser(puuid);
  return Boolean(user && user.status === "blocked");
}

module.exports = {
  ADMIN_PIN,
  FIREBASE_CONFIG,
  confiscateUserItems,
  deleteInboxItem,
  getInbox,
  getUser,
  grantUser,
  isBlocked,
  listUsers,
  sendBulkItem,
  sendBulkMessage,
  sendItem,
  sendMessage,
  setUserStatus,
  upsertUsage
};
