(() => {
  const ROULETTE_SEGMENTS = [
    { key: "kp5", shortLabel: "5KP", legend: "KP 5（35%）", chance: 35, color: "#facc15" },
    { key: "ap10", shortLabel: "10AP", legend: "AP 10（35%）", chance: 35, color: "#38bdf8" },
    { key: "ticket15", shortLabel: "×1.5", legend: "1.5倍チケット（20%）", chance: 20, color: "#22c55e" },
    { key: "ticket2", shortLabel: "×2", legend: "2倍チケット（8%）", chance: 8, color: "#a855f7" },
    { key: "hit", shortLabel: "当たり", legend: "石橋キャラ（2%）", chance: 2, color: "#ef4444" }
  ];
  const SPIN_ROUNDS = 6;
  const SPIN_MS = 3600;

  function getOrCreateOverlay(id, className) {
    let overlay = document.getElementById(id);
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = id;
      overlay.className = className;
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  function getSegmentIndex(resultKey) {
    const key = resultKey === "hit-duplicate" ? "ticket2" : resultKey;
    return Math.max(0, ROULETTE_SEGMENTS.findIndex((segment) => segment.key === key));
  }

  function getSegmentCenterDegrees(index) {
    const before = ROULETTE_SEGMENTS.slice(0, index).reduce((total, segment) => total + segment.chance, 0);
    return (before + ROULETTE_SEGMENTS[index].chance / 2) * 3.6;
  }

  function getFinalRotation(resultKey) {
    return SPIN_ROUNDS * 360 - getSegmentCenterDegrees(getSegmentIndex(resultKey));
  }

  function buildWheelLabels() {
    let offset = 0;
    return ROULETTE_SEGMENTS.map((segment) => {
      const center = offset + segment.chance / 2;
      offset += segment.chance;
      const distance = segment.chance <= 8 ? "25%" : "31%";
      return `<div class="roulette-effect-label" style="--label-angle:${center * 3.6 - 90}deg;--label-distance:${distance}">${segment.shortLabel}</div>`;
    }).join("");
  }

  function buildLegend() {
    return `<div class="roulette-effect-legend">${ROULETTE_SEGMENTS.map((segment) => `<div><i style="background:${segment.color}"></i>${segment.legend}</div>`).join("")}</div>`;
  }

  function getGradient() {
    let offset = 0;
    return `conic-gradient(from -90deg, ${ROULETTE_SEGMENTS.map((segment) => {
      const start = offset;
      offset += segment.chance;
      return `${segment.color} ${start}% ${offset}%`;
    }).join(", ")})`;
  }

  function showBonusReveal(reward = {}) {
    const bonuses = [
      Number(reward.bonusKp) > 0 && { type: "KP", amount: Number(reward.bonusKp), className: "kp" },
      Number(reward.bonusAp) > 0 && { type: "AP", amount: Number(reward.bonusAp), className: "ap" }
    ].filter(Boolean);
    if (!bonuses.length) return Promise.resolve();

    const overlay = getOrCreateOverlay("bonusRewardEffectOverlay", "bonus-reward-effect-overlay");
    return new Promise((resolve) => {
      let revealed = false;
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        overlay.classList.remove("is-open", "is-revealed");
        window.setTimeout(() => { if (!overlay.classList.contains("is-open")) overlay.innerHTML = ""; }, 160);
        resolve();
      };
      const reveal = () => {
        if (revealed) return;
        revealed = true;
        overlay.classList.add("is-revealed");
        const result = overlay.querySelector(".bonus-reward-effect-result");
        const skip = overlay.querySelector("#bonusRewardEffectSkip");
        if (skip) skip.textContent = "閉じる";
        if (result) {
          const title = bonuses.length > 1 ? "ダブルおまけ！" : "おまけ報酬！";
          result.innerHTML = `<strong>${title}</strong>${bonuses.map((bonus) => `<span class="${bonus.className}">おまけ${bonus.type} +${bonus.amount}</span>`).join("")}`;
        }
      };
      overlay.className = "bonus-reward-effect-overlay is-open";
      overlay.innerHTML = `
        <div class="bonus-reward-effect-stage" role="dialog" aria-modal="true">
          <div class="bonus-reward-effect-title">おまけ報酬発生！</div>
          <div class="bonus-reward-effect-orb" aria-hidden="true"></div>
          <div class="bonus-reward-effect-hint">何が出るかは、まだ秘密…</div>
          <div class="bonus-reward-effect-result"></div>
          <button id="bonusRewardEffectSkip" type="button">演出スキップ</button>
        </div>`;
      const skip = overlay.querySelector("#bonusRewardEffectSkip");
      skip?.addEventListener("click", (event) => {
        event.preventDefault();
        if (!revealed) reveal(); else close();
      });
      overlay.onclick = (event) => { if (revealed && event.target === overlay) close(); };
      window.setTimeout(reveal, 1350);
    });
  }

  function showRoulette(result = {}) {
    const overlay = getOrCreateOverlay("rouletteEffectOverlay", "roulette-effect-overlay");
    const resultKey = result.key || "kp5";
    const finalRotation = getFinalRotation(resultKey);
    const isHit = resultKey === "hit";
    return new Promise((resolve) => {
      let stopped = false;
      let resultShown = false;
      let closed = false;
      let spinTimer = null;
      const close = () => {
        if (closed) return;
        closed = true;
        overlay.classList.remove("is-open", "is-result", "is-hit");
        window.setTimeout(() => { if (!overlay.classList.contains("is-open")) overlay.innerHTML = ""; }, 180);
        resolve();
      };
      overlay.className = `roulette-effect-overlay is-open${isHit ? " is-hit" : ""}`;
      overlay.innerHTML = `
        <div class="roulette-effect-stage">
          <div class="roulette-effect-start">石橋ルーレット発生！</div>
          <div class="roulette-effect-arrow" aria-hidden="true"></div>
          <div class="roulette-effect-wheel-wrap"><div class="roulette-effect-wheel" style="background:${getGradient()}">${buildWheelLabels()}<div class="roulette-effect-center">石橋</div></div></div>
          ${buildLegend()}
          <div class="roulette-effect-result"></div>
          <button id="rouletteEffectSkipButton" class="roulette-effect-skip" type="button">演出スキップ</button>
        </div>`;
      const wheel = overlay.querySelector(".roulette-effect-wheel");
      const resultBox = overlay.querySelector(".roulette-effect-result");
      const skipButton = overlay.querySelector("#rouletteEffectSkipButton");
      const showResult = () => {
        if (resultShown) return;
        resultShown = true;
        overlay.classList.add("is-result");
        if (skipButton) skipButton.textContent = "閉じる";
        if (!resultBox) return;
        if (isHit) {
          const image = result.characterImage ? `<img class="roulette-effect-hit-image" src="${result.characterImage}" alt="${result.characterName || "石橋キャラ"}">` : "";
          resultBox.innerHTML = `<div class="roulette-effect-result-main">当たり！</div>${image}<div class="roulette-effect-hit-name">${result.characterName || "石橋キャラ"} 獲得！</div>`;
          return;
        }
        resultBox.innerHTML = `<div class="roulette-effect-result-main">${result.confirmText || result.label || "報酬確定！"}</div>`;
      };
      const stopAtResult = (immediate = false) => {
        if (stopped) return;
        stopped = true;
        if (spinTimer) window.clearTimeout(spinTimer);
        if (wheel) {
          wheel.style.transition = immediate ? "none" : "transform 220ms ease-out";
          wheel.style.transform = `rotate(${finalRotation}deg)`;
        }
        window.setTimeout(showResult, immediate ? 20 : 260);
      };
      if (wheel) {
        wheel.style.transition = "none";
        wheel.style.transform = "rotate(0deg)";
        wheel.offsetHeight;
        wheel.style.transition = `transform ${SPIN_MS}ms cubic-bezier(.12,.72,.18,1)`;
        wheel.style.transform = `rotate(${finalRotation}deg)`;
      }
      spinTimer = window.setTimeout(stopAtResult, SPIN_MS + 80);
      skipButton?.addEventListener("click", (event) => {
        event.preventDefault();
        if (!resultShown) stopAtResult(true); else close();
      });
      overlay.onclick = (event) => { if (resultShown && event.target === overlay) close(); };
    });
  }

  window.trackerEffects = { ...(window.trackerEffects || {}), showBonusReveal, showRoulette };
})();
