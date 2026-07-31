(() => {
  const REWARDS = Object.freeze([
    { label: "KP 7", image: "img/その他/KP.png", rewards: { kp: 7 }, amount: 7 },
    { label: "AP 4", image: "img/その他/AP.png", rewards: { ap: 4 }, amount: 4 },
    { label: "KP 9", image: "img/その他/KP.png", rewards: { kp: 9 }, amount: 9 },
    { label: "クッキー 150", image: "img/その他/クッキー.png", rewards: { cookies: 150 }, amount: 150 },
    { label: "1.5倍チケット 1枚", image: "img/その他/1.5倍チケット.png", rewards: { ticket15: 1 }, amount: 1 }
  ]);

  function normalizeState(value = {}) {
    const rawDayIndex = Math.floor(Number(value.dayIndex ?? value.loginBonusDayIndex) || 0);
    const dayIndex = rawDayIndex < 0 ? 0 : rawDayIndex % REWARDS.length;
    return {
      dayIndex,
      lastClaimDate: String(value.lastClaimDate ?? value.loginBonusLastClaimDate ?? ""),
      canClaim: Boolean(value.canClaim),
      serverDate: String(value.serverDate || "")
    };
  }

  function canClaim(state = {}) {
    return Boolean(normalizeState(state).canClaim);
  }

  const api = { REWARDS, normalizeState, canClaim };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.loginBonus = api;
})();
