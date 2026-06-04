(() => {
  const ROULETTE_SEGMENTS = [
    { key: "kp5", label: "KP 5獲得", color: "#facc15" },
    { key: "ap10", label: "AP 10獲得", color: "#38bdf8" },
    { key: "ticket15", label: "1.5倍チケット獲得", color: "#22c55e" },
    { key: "ticket2", label: "2倍チケット獲得", color: "#a855f7" },
    { key: "hit", label: "当たり", color: "#ef4444" }
  ];

  const SPIN_ROUNDS = 6;
  const SPIN_MS = 3600;

  function getOrCreateOverlay() {
    let overlay = document.getElementById("rouletteEffectOverlay");
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = "rouletteEffectOverlay";
    overlay.className = "roulette-effect-overlay";
    document.body.appendChild(overlay);
    return overlay;
  }

  function getSegmentIndex(resultKey) {
    const index = ROULETTE_SEGMENTS.findIndex((segment) => segment.key === resultKey);
    return index >= 0 ? index : 0;
  }

  function getFinalRotation(resultKey) {
    const segmentSize = 360 / ROULETTE_SEGMENTS.length;
    const index = getSegmentIndex(resultKey);
    return SPIN_ROUNDS * 360 - (index * segmentSize + segmentSize / 2);
  }

  function buildWheelLabels() {
    return ROULETTE_SEGMENTS.map((segment, index) => {
      return `<div class="roulette-effect-label roulette-effect-label-${index + 1}">${segment.label}</div>`;
    }).join("");
  }

  function getGradient() {
    const segmentSize = 100 / ROULETTE_SEGMENTS.length;
    return `conic-gradient(from -90deg, ${ROULETTE_SEGMENTS.map((segment, index) => {
      const start = (index * segmentSize).toFixed(2);
      const end = ((index + 1) * segmentSize).toFixed(2);
      return `${segment.color} ${start}% ${end}%`;
    }).join(", ")})`;
  }

  function closeOverlay(overlay) {
    overlay.classList.remove("is-open", "is-result", "is-hit");
    window.setTimeout(() => {
      if (!overlay.classList.contains("is-open")) overlay.innerHTML = "";
    }, 180);
  }

  function showRoulette(result = {}) {
    const overlay = getOrCreateOverlay();
    const resultKey = result.key || "kp5";
    const finalRotation = getFinalRotation(resultKey);
    const isHit = resultKey === "hit";
    let stopped = false;
    let resultShown = false;
    let spinTimer = null;

    overlay.className = `roulette-effect-overlay is-open${isHit ? " is-hit" : ""}`;
    overlay.innerHTML = `
      <div class="roulette-effect-stage">
        <div class="roulette-effect-start">石橋ルーレット発生！</div>
        <div class="roulette-effect-arrow" aria-hidden="true"></div>
        <div class="roulette-effect-wheel-wrap">
          <div class="roulette-effect-wheel" style="background:${getGradient()}">
            ${buildWheelLabels()}
            <div class="roulette-effect-center">石橋</div>
          </div>
        </div>
        <div class="roulette-effect-result"></div>
        <button id="rouletteEffectSkipButton" class="roulette-effect-skip" type="button">演出スキップ</button>
      </div>
    `;

    const wheel = overlay.querySelector(".roulette-effect-wheel");
    const resultBox = overlay.querySelector(".roulette-effect-result");
    const skipButton = overlay.querySelector("#rouletteEffectSkipButton");

    function showResult() {
      if (resultShown) return;
      resultShown = true;
      overlay.classList.add("is-result");
      if (skipButton) skipButton.style.display = "none";

      if (resultBox) {
        resultBox.innerHTML = isHit
          ? `<div class="roulette-effect-result-main">当たり！</div>`
          : `<div class="roulette-effect-result-main">${result.confirmText || `${result.label || "報酬"}確定！`}</div>`;
      }

      if (isHit) {
        window.setTimeout(() => {
          if (!resultBox) return;
          const imageHtml = result.characterImage
            ? `<img class="roulette-effect-hit-image" src="${result.characterImage}" alt="${result.characterName || "石橋キャラ"}">`
            : "";
          resultBox.innerHTML = `
            <div class="roulette-effect-result-main">当たり！</div>
            ${imageHtml}
            <div class="roulette-effect-hit-name">${result.characterName || "石橋キャラ"} 獲得！</div>
          `;
        }, 700);
      }
    }

    function stopAtResult(immediate = false) {
      if (stopped) return;
      stopped = true;
      if (spinTimer) window.clearTimeout(spinTimer);
      if (wheel) {
        wheel.style.transition = immediate ? "none" : "transform 220ms ease-out";
        wheel.style.transform = `rotate(${finalRotation}deg)`;
      }
      window.setTimeout(showResult, immediate ? 20 : 260);
    }

    if (wheel) {
      wheel.style.transition = "none";
      wheel.style.transform = "rotate(0deg)";
      wheel.offsetHeight;
      wheel.style.transition = `transform ${SPIN_MS}ms cubic-bezier(.12,.72,.18,1)`;
      wheel.style.transform = `rotate(${finalRotation}deg)`;
    }

    spinTimer = window.setTimeout(stopAtResult, SPIN_MS + 80);

    if (skipButton) {
      skipButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        stopAtResult(true);
      });
    }

    overlay.onclick = (event) => {
      if (!resultShown || event.target.closest(".roulette-effect-skip")) return;
      closeOverlay(overlay);
    };
  }

  window.trackerEffects = {
    ...(window.trackerEffects || {}),
    showRoulette
  };
})();
