(function attachOnboardingLogic(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.onboardingLogic = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createOnboardingLogic() {
  const STEPS = Object.freeze([
    { key: "boot", code: "BOOT", label: "起動" },
    { key: "system", code: "SYSTEM", label: "機能確認" },
    { key: "policy", code: "POLICY", label: "ポリシー" },
    { key: "link", code: "LINK", label: "Google接続" },
    { key: "identity", code: "ID", label: "ニックネーム" }
  ]);

  function shouldShowOnboarding({ hasSession = false, onboardingCompleted = false, replay = false } = {}) {
    if (replay) return true;
    if (!hasSession) return true;
    return !onboardingCompleted;
  }

  function clampStep(index) {
    const value = Number.isFinite(Number(index)) ? Math.trunc(Number(index)) : 0;
    return Math.max(0, Math.min(STEPS.length - 1, value));
  }

  function getRenderMode({ webglAvailable = true, averageFps = 60, reducedMotion = false, contextLost = false } = {}) {
    if (reducedMotion || !webglAvailable || contextLost) return "static";
    return Number(averageFps) < 45 ? "lite" : "full";
  }

  function accountStorageKey(uid) {
    const value = String(uid || "").trim();
    return value ? `valorant_collection_game_v3:${value}` : "";
  }

  function consentPayload(accepted) {
    const value = Boolean(accepted);
    return { policyAccepted: value, privacyAccepted: value };
  }

  return { STEPS, shouldShowOnboarding, clampStep, getRenderMode, accountStorageKey, consentPayload };
});
