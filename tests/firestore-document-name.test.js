const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const firebase = require("../firebase");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "firebase.js"), "utf8");
const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const helpers = firebase.__test;
const documentPrefix = "projects/ishibashi-tracker/databases/(default)/documents/";

test("Firestore commit document names never contain the REST /v1 prefix", () => {
  const rewardNames = helpers.getGoogleMatchRewardDocumentNames("uid-1", "puuid-1", "match-1", "2026-07-27");
  assert.equal(rewardNames.claimName.startsWith(documentPrefix), true);
  assert.equal(rewardNames.userName, `${documentPrefix}googleUsers/uid-1`);
  assert.equal(rewardNames.weeklyName, `${documentPrefix}weeklyCompetitive/2026-07-27/entries/uid-1`);
  assert.equal(rewardNames.claimName.includes("/v1/"), false);
  assert.equal(rewardNames.weeklyName.includes("/v1/"), false);

  const weeklyMail = helpers.getGoogleInboxDocumentName("uid-1", "weekly-ranking-2026-07-27");
  const loginBonusMail = helpers.getGoogleInboxDocumentName("uid-1", "login-bonus-2026-08-01");
  assert.equal(weeklyMail, `${documentPrefix}googleUsers/uid-1/inbox/weekly-ranking-2026-07-27`);
  assert.equal(loginBonusMail, `${documentPrefix}googleUsers/uid-1/inbox/login-bonus-2026-08-01`);
});

test("REST request paths add /v1 only at the HTTP boundary and accept old pending IDs", () => {
  const name = helpers.getGoogleInboxDocumentName("uid-1", "login-bonus-2026-08-01");
  assert.equal(helpers.normalizeDocumentName(name), name);
  assert.equal(helpers.getPathFromDocumentName(name), `/v1/${name}`);
  assert.equal(helpers.normalizeDocumentName(`/v1/${name}`), name);
  assert.equal(helpers.getPathFromDocumentName(`/v1/${name}`), `/v1/${name}`);
  assert.equal(helpers.getPathFromDocumentName("googleUsers/uid-1"), "");
});

test("commit validation rejects REST paths before sending them to Firestore", () => {
  const validName = helpers.getDocumentName("googleUsers", "uid-1");
  assert.equal(helpers.validateCommitWrites([{ update: { name: validName } }]), true);
  assert.throws(
    () => helpers.validateCommitWrites([{ update: { name: `/v1/${validName}` } }]),
    (error) => error?.response?.error?.status === "INVALID_ARGUMENT"
  );
});

test("only Firestore conflicts are classified as retryable conflicts", () => {
  assert.equal(helpers.isFirestoreConflict({ statusCode: 409 }), true);
  assert.equal(helpers.isFirestoreConflict({ statusCode: 400, response: { error: { status: "ABORTED" } } }), true);
  assert.equal(helpers.isFirestoreConflict({ statusCode: 400, response: { error: { status: "FAILED_PRECONDITION" } } }), true);
  assert.equal(helpers.isFirestoreConflict({ statusCode: 400, response: { error: { status: "INVALID_ARGUMENT" } } }), false);
  assert.equal(helpers.isFirestoreConflict({ statusCode: 403, response: { error: { status: "PERMISSION_DENIED" } } }), false);
  assert.equal(helpers.isFirestoreConflict(new Error("network")), false);
});

test("Firestore failures keep conflict, permission, invalid request, and network errors distinct", () => {
  assert.equal(helpers.firestoreOperationFailure(new Error("offline")).code, "network-error");
  assert.equal(helpers.firestoreOperationFailure({ statusCode: 503, response: { error: { status: "UNAVAILABLE" } } }).code, "network-error");
  assert.equal(helpers.firestoreOperationFailure({ statusCode: 403, response: { error: { status: "PERMISSION_DENIED" } } }).code, "permission-denied");
  assert.equal(helpers.firestoreOperationFailure({ statusCode: 400, response: { error: { status: "INVALID_ARGUMENT" } } }).code, "invalid-request");
});

test("all three affected mail and ranking paths use canonical document-name helpers", () => {
  assert.match(source, /const weeklyName = documentNames\.weeklyName/);
  assert.match(source, /getGoogleInboxDocumentName\(winner\.uid, `weekly-ranking-\$\{previousWeekId\}`\)/);
  assert.match(source, /getGoogleInboxDocumentName\(uid, `login-bonus-\$\{today\}`\)/);
  assert.doesNotMatch(source, /const (?:weeklyName|mailName) = `\$\{BASE_PATH\}/);
});

test("a failed cloud reward is not marked claimed locally", () => {
  const commitCall = index.indexOf("claimGoogleMatchReward?.(");
  const failureCheck = index.indexOf("if (!committed?.ok)", commitCall);
  const localClaimMark = index.indexOf("markCompetitiveKpClaimed?.(", commitCall);
  assert.ok(commitCall >= 0);
  assert.ok(failureCheck > commitCall);
  assert.ok(localClaimMark > failureCheck);
});
