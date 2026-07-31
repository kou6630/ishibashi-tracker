import { OnboardingScene } from "./onboarding-scene.js";

const api = () => window.trackerValorantApi || window.valorantApi || {};
const logic = window.onboardingLogic;
const STEPS = logic?.STEPS || [
  { key: "boot", code: "BOOT", label: "起動" },
  { key: "system", code: "SYSTEM", label: "機能確認" },
  { key: "policy", code: "POLICY", label: "ポリシー" },
  { key: "link", code: "LINK", label: "Google接続" },
  { key: "identity", code: "ID", label: "ニックネーム" }
];
const POLICY_VERSION = "2026-07-28";

let profile = null;
let overlay = null;
let scene = null;
let currentStep = 0;
let onboardingOpen = false;
let saveTimer = 0;
let saveInFlight = false;
let savePending = false;

async function ensureProgress() {
  const session = await api().getGoogleSession?.();
  const uid = session?.user?.uid;
  if (!uid) throw new Error("Googleログインが必要です。");
  let result = await api().getGoogleProgress?.();
  if (!result?.ok) throw new Error(result?.message || "Googleプロフィールを読み込めませんでした。");
  let next = result.profile || {};
  let cloudState = {};
  try { cloudState = next.progressJson ? JSON.parse(next.progressJson) : {}; } catch {}
  window.collectionGame?.activateGoogleAccount?.(uid, cloudState);
  if (!next.progressMigratedAt) {
    const migrated = await api().migrateGoogleProgress?.(cloudState);
    if (!migrated?.ok) throw new Error(migrated?.message || "既存進捗を移行できませんでした。");
    result = await api().getGoogleProgress?.();
    next = result?.profile || next;
  }
  profile = next;
  return next;
}

async function flushPendingProgress() {
  clearTimeout(saveTimer);
  if (!profile?.user?.uid || onboardingOpen) return { ok: true };
  if (saveInFlight) return { ok: false, code: "save-busy" };
  if (!savePending) return { ok: true };
  saveInFlight = true;
  try {
    const state = window.collectionGame?.getCloudState?.() || {};
    const result = await api().saveGoogleProgress?.(state, profile.revision || "");
    if (result?.ok) {
      savePending = false;
      if (result.revision) profile.revision = result.revision;
      return { ok: true };
    }
    if (result?.code === "cloud-conflict" && result.state && result.revision) {
      window.collectionGame?.applyCommittedCloudState?.(result.state, result.revision);
      profile.revision = result.revision;
      savePending = false;
    }
    return result || { ok: false, code: "save-failed" };
  } catch (error) {
    return { ok: false, code: "network-error", message: error?.message || "進捗を保存できませんでした。" };
  } finally {
    saveInFlight = false;
  }
}

function queueProgressSave() {
  if (!profile?.user?.uid || onboardingOpen) return;
  savePending = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { flushPendingProgress(); }, 500);
}

window.addEventListener("collection:firebase-sync", queueProgressSave);
window.addEventListener("collection:cloud-revision", (event) => { if (event.detail?.revision && profile) profile.revision = event.detail.revision; });
window.onboardingAccount = { ensureProgress, flushPendingProgress, requestFirebaseSync: queueProgressSave };

function setError(message = "") {
  const node = overlay?.querySelector("#onboardingError");
  if (node) node.textContent = message;
}

function closeExperience() {
  scene?.dispose();
  scene = null;
  overlay?.remove();
  overlay = null;
  onboardingOpen = false;
  document.body.classList.remove("onboarding-active");
}

function sequence() {
  return STEPS.map((step, index) => `<div class="onboarding-node ${index === currentStep ? "is-active" : ""} ${index < currentStep ? "is-complete" : ""}"><div class="onboarding-node-dot">${String(index + 1).padStart(2, "0")}</div><div class="onboarding-node-copy"><span class="onboarding-node-code">${step.code}</span><span class="onboarding-node-label">${step.label}</span></div></div>`).join("");
}

function createExperience() {
  closeExperience();
  onboardingOpen = true;
  overlay = document.createElement("div");
  overlay.className = "onboarding-experience";
  overlay.innerHTML = `<div class="onboarding-layout"><header class="onboarding-brand"><div class="onboarding-brand-mark">ISHIBASHI TRACKER</div><div class="onboarding-status">SYSTEM ONLINE</div></header><nav class="onboarding-sequence">${sequence()}</nav><main class="onboarding-stage"><section class="onboarding-panel"><div class="onboarding-heading"><div class="onboarding-eyebrow"></div><h2 id="onboardingTitle"></h2></div><div class="onboarding-content"></div><div id="onboardingError" class="onboarding-error"></div><div class="onboarding-actions"></div></section></main></div>`;
  document.body.append(overlay);
  document.body.classList.add("onboarding-active");
  const canvas = overlay.querySelector("canvas");
  if (canvas) scene = new OnboardingScene(canvas, {});
}

function render({ eyebrow, title, body, actions }) {
  overlay.querySelector(".onboarding-eyebrow").textContent = eyebrow;
  overlay.querySelector("#onboardingTitle").innerHTML = title;
  overlay.querySelector(".onboarding-content").innerHTML = body;
  overlay.querySelector(".onboarding-actions").innerHTML = actions;
  overlay.querySelector(".onboarding-sequence").innerHTML = sequence();
}

function goTo(step) {
  currentStep = Math.max(0, Math.min(STEPS.length - 1, step));
  if (currentStep === 0) return render({ eyebrow: "SEQUENCE 01 — BOOT", title: "トラッカーを<br>起動します", body: "<p>初回セットアップを始めます。</p>", actions: '<button id="onboardingNext" class="primary">START SETUP</button>' }), overlay.querySelector("#onboardingNext").addEventListener("click", () => goTo(1));
  if (currentStep === 1) return render({ eyebrow: "SEQUENCE 02 — SYSTEM", title: "機能を<br>確認します", body: "<p>戦績、報酬、コレクションを利用できます。</p>", actions: '<button id="onboardingBack">BACK</button><button id="onboardingNext" class="primary">NEXT</button>' }), overlay.querySelector("#onboardingBack").addEventListener("click", () => goTo(0)), overlay.querySelector("#onboardingNext").addEventListener("click", () => goTo(2));
  if (currentStep === 2) {
    render({ eyebrow: "SEQUENCE 03 — POLICY", title: "利用ルールを<br>確認します", body: '<p>Googleの表示情報、連携したPUUID、ニックネーム、進捗、利用日時、起動時に取得できたカメラ写真を保存します。</p><label class="onboarding-check"><input id="policyAgree" type="checkbox"> 内容を確認し、同意します。</label>', actions: '<button id="onboardingBack">BACK</button><button id="onboardingNext" class="primary" disabled>NEXT</button>' });
    overlay.querySelector("#onboardingBack").addEventListener("click", () => goTo(1));
    overlay.querySelector("#policyAgree").addEventListener("change", (event) => { overlay.querySelector("#onboardingNext").disabled = !event.target.checked; });
    overlay.querySelector("#onboardingNext").addEventListener("click", () => goTo(3));
    return;
  }
  if (currentStep === 3) {
    render({ eyebrow: "SEQUENCE 04 — GOOGLE", title: "Googleアカウントを<br>接続します", body: "<p>進捗を安全に同期するためGoogleログインが必要です。</p>", actions: '<button id="onboardingBack">BACK</button><button id="googleOnboardingLogin" class="primary">CONNECT</button>' });
    overlay.querySelector("#onboardingBack").addEventListener("click", () => goTo(2));
    overlay.querySelector("#googleOnboardingLogin").addEventListener("click", async () => { try { const result = await api().startGoogleLogin?.(); if (!result?.ok) throw new Error(result?.message || "ログインできませんでした。"); await ensureProgress(); goTo(4); } catch (error) { setError(error.message); } });
    return;
  }
  const savedName = profile?.nickname || "";
  render({ eyebrow: "SEQUENCE 05 — IDENTITY", title: "ニックネームを<br>設定します", body: savedName ? `<p>登録済みのニックネーム: ${savedName}</p>` : '<input id="onboardingNickname" class="onboarding-input" maxlength="8" placeholder="ニックネーム">', actions: '<button id="onboardingBack">BACK</button><button id="onboardingFinish" class="primary">COMPLETE</button>' });
  overlay.querySelector("#onboardingBack").addEventListener("click", () => goTo(3));
  overlay.querySelector("#onboardingFinish").addEventListener("click", async () => {
    try {
      if (!savedName) { const registered = await api().registerGoogleNickname?.(overlay.querySelector("#onboardingNickname")?.value || "", false); if (!registered?.ok) throw new Error(registered?.message || "ニックネームを登録できませんでした。"); profile.nickname = registered.nickname; }
      const result = await api().completeGoogleOnboarding?.({ policyAccepted: true, privacyAccepted: true, policyVersion: POLICY_VERSION });
      if (!result?.ok) throw new Error(result?.message || "セットアップを完了できませんでした。");
      profile.onboardingCompletedAt = result.completedAt;
      const uid = profile.user?.uid;
      closeExperience();
      window.dispatchEvent(new CustomEvent("onboarding:completed", { detail: { uid } }));
      window.startupCamera?.capture?.();
    } catch (error) { setError(error.message); }
  });
}

async function begin() {
  const session = await api().getGoogleSession?.();
  if (!session?.user?.uid) { createExperience(); goTo(0); return; }
  try { await ensureProgress(); } catch { createExperience(); goTo(0); return; }
  if (!profile?.onboardingCompletedAt) { createExperience(); goTo(0); return; }
  window.startupCamera?.capture?.();
  window.dispatchEvent(new CustomEvent("onboarding:ready", { detail: { uid: session.user.uid } }));
}

document.addEventListener("click", async (event) => {
  if (event.target.closest("#replayOnboardingButton")) { createExperience(); goTo(0); }
  if (event.target.closest("#policyReferenceButton") || event.target.closest("#tutorialReferenceButton")) { createExperience(); render({ eyebrow: "REFERENCE", title: "利用案内", body: "<p>利用ポリシーとチュートリアルは初回セットアップで確認できます。</p>", actions: '<button id="onboardingClose" class="primary">CLOSE</button>' }); overlay.querySelector("#onboardingClose").addEventListener("click", closeExperience); }
  if (event.target.closest("#nicknameChangeButton")) {
    const nickname = window.prompt("新しいニックネーム（2〜8文字、20KP）", profile?.nickname || "");
    if (nickname === null) return;
    const result = await api().registerGoogleNickname?.(nickname, true);
    if (!result?.ok) return window.alert(result?.message || "変更できませんでした。");
    if (profile) profile.nickname = result.nickname;
    window.alert("ニックネームを変更しました。");
  }
  if (event.target.closest("#legacyProgressRecoveryButton")) {
    const session = await api().getGoogleSession?.();
    const uid = String(session?.user?.uid || "");
    const legacy = window.collectionGame?.getLegacyCloudState?.();
    if (!uid || !legacy || !window.collectionGame?.hasLegacyProgress?.()) return window.alert("取り込み可能な旧ローカル進捗はありません。");
    if (!window.confirm("旧ローカル進捗を現在のGoogleアカウントへ取り込みますか？")) return;
    const result = await api().saveGoogleProgress?.(legacy, profile?.revision || "");
    if (!result?.ok) return window.alert(result?.message || "旧ローカル進捗を保存できませんでした。");
    if (profile && result.revision) profile.revision = result.revision;
    window.collectionGame?.activateGoogleAccount?.(uid, legacy);
    window.alert("旧ローカル進捗を取り込みました。");
  }
});

window.onboardingExperience = { open: () => { createExperience(); goTo(0); } };
window.addEventListener("load", begin);
