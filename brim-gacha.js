(function () {
  "use strict";

  const ASSETS = {
    bg: "img/ブリムガチャ/ガチャ背景.png",
    body: "img/ブリムガチャ/ブリム体.png",
    face: "img/ブリムガチャ/顔ブリム.png",
    kp: "img/その他/KP.png",
    ap: "img/その他/AP.png",
    cookie: "img/その他/クッキー.png",
    ticket15: "img/その他/1.5倍チケット.png",
    ticket2: "img/その他/2倍チケット.png"
  };

  let isRolling = false;

  function getState() {
    return window.collectionGame?.getState ? window.collectionGame.getState() : {};
  }

  function getCost() {
    return Number(window.collectionOperations?.BRIM_COST) || 400;
  }

  function canUseGacha() {
    return Number(getState().trackerLevel || 0) >= 11;
  }

  function openPanel() {
    injectStyles();
    let overlay = document.getElementById("brimGachaOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "brimGachaOverlay";
      overlay.className = "brim-gacha-overlay";
      document.body.appendChild(overlay);
    }
    renderPanel(overlay);
    overlay.classList.add("is-open");
  }

  function closePanel() {
    const overlay = document.getElementById("brimGachaOverlay");
    if (overlay) overlay.classList.remove("is-open");
  }

  function renderPanel(overlay, message = "") {
    const state = getState();
    const unlocked = canUseGacha();
    const cookies = Number(state.cookies || 0);
    const cost = getCost();
    const canRoll = unlocked && cookies >= cost && !isRolling && !window.collectionGame?.hasPendingCollectionOperation?.();
    overlay.innerHTML = `
      <div class="brim-gacha-panel">
        <button class="brim-gacha-close" type="button">閉じる</button>
        <div class="brim-gacha-stage" aria-label="ブリムガチャ">
          <img class="brim-gacha-layer" src="${ASSETS.bg}" alt="">
          <img class="brim-gacha-layer" src="${ASSETS.body}" alt="">
          <img id="brimGachaFace" class="brim-gacha-layer brim-gacha-face" src="${ASSETS.face}" alt="">
        </div>
        <button id="brimGachaRollButton" class="brim-gacha-roll" type="button" ${canRoll ? "" : "disabled"}>${unlocked ? "ガチャる" : "Lv11で解放"}</button>
        <div class="brim-gacha-cost"><img src="${ASSETS.cookie}" alt=""> <span>${cost}</span></div>
        <div class="brim-gacha-message">${message || (unlocked ? `所持クッキー ${cookies}` : "トラッカーLv11で解放")}</div>
      </div>
    `;
    overlay.onclick = (event) => {
      if (event.target === overlay) closePanel();
    };
    overlay.querySelector(".brim-gacha-close")?.addEventListener("click", closePanel);
    overlay.querySelector("#brimGachaRollButton")?.addEventListener("click", () => rollGacha(overlay));
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function playAnimation(overlay, rare) {
    const face = overlay.querySelector("#brimGachaFace");
    if (!face) return;
    face.classList.add("is-shaking");
    await wait(900);
    face.classList.remove("is-shaking");
    if (rare) {
      face.classList.add("is-spinning");
      await wait(900);
      face.classList.remove("is-spinning");
    }
  }

  async function rollGacha(overlay) {
    if (isRolling) return;
    if (!canUseGacha()) {
      renderPanel(overlay, "トラッカーLv11で解放されます。");
      return;
    }
    isRolling = true;
    renderPanel(overlay, "進捗を確定しています...");
    const committed = await window.collectionGame?.applyCollectionOperation?.("brimGacha", { deferPresentation: true });
    if (!committed?.ok) {
      isRolling = false;
      renderPanel(overlay, committed?.message || "進捗を保存できませんでした。もう一度お試しください。");
      return;
    }
    const prize = committed.result?.prize;
    if (!prize) {
      isRolling = false;
      renderPanel(overlay, "抽選結果を確認できませんでした。");
      return;
    }
    renderPanel(overlay, "抽選中...");
    await playAnimation(overlay, Boolean(prize.rare));
    isRolling = false;

    if (prize.ishibashi) {
      window.collectionGame?.presentCollectionOperationResult?.(committed.result || {});
      renderPanel(overlay, "石橋キャラ獲得！");
      return;
    }

    renderPanel(overlay, "景品を獲得しました。");
    showItemResult(prize.items);
  }

  function itemImage(type) {
    return ASSETS[type] || "";
  }

  function showItemResult(items = []) {
    let overlay = document.getElementById("brimGachaResultOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "brimGachaResultOverlay";
      overlay.className = "brim-gacha-result-overlay";
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = `
      <div class="brim-gacha-result-items">
        ${items.map((item) => `
          <div class="brim-gacha-result-item">
            <img src="${itemImage(item.type)}" alt="">
            <span>${item.count}</span>
          </div>
        `).join("")}
      </div>
    `;
    overlay.classList.add("is-open");
    overlay.onclick = () => overlay.classList.remove("is-open");
  }

  function injectStyles() {
    if (document.getElementById("brimGachaStyles")) return;
    const style = document.createElement("style");
    style.id = "brimGachaStyles";
    style.textContent = `
      .brim-gacha-overlay{display:none;position:fixed;inset:0;z-index:2050;align-items:center;justify-content:center;background:rgba(0,0,0,.62);padding:16px}
      .brim-gacha-overlay.is-open{display:flex}
      .brim-gacha-panel{position:relative;width:min(560px,94vw);min-height:min(720px,94vh);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:#ece8e1;background:#080b12;border:1px solid rgba(255,70,85,.78);box-shadow:0 28px 90px rgba(0,0,0,.68);padding:18px;overflow:hidden}
      .brim-gacha-close{position:absolute;left:14px;top:14px;z-index:2;border:1px solid rgba(255,255,255,.35);background:rgba(0,0,0,.55);color:#fff;font-weight:800;padding:7px 12px}
      .brim-gacha-stage{position:relative;width:min(470px,86vw);aspect-ratio:1/1}
      .brim-gacha-layer{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;user-select:none;pointer-events:none}
      .brim-gacha-face.is-shaking{animation:brimGachaShake .08s linear infinite}
      .brim-gacha-face.is-spinning{animation:brimGachaSpin .6s linear infinite}
      .brim-gacha-roll{width:min(260px,72vw);padding:13px 18px;border:1px solid #ff4655;background:#ff4655;color:#fff;font-size:20px;font-weight:900}
      .brim-gacha-roll:disabled{background:#4c5360;border-color:#606977;color:#c4cad4}
      .brim-gacha-cost{display:inline-flex;align-items:center;justify-content:center;gap:8px;color:#fff;font-size:22px;font-weight:900}
      .brim-gacha-cost img{width:34px;height:34px;object-fit:contain}
      .brim-gacha-message{min-height:22px;color:#f4e7b2;font-weight:800}
      .brim-gacha-result-overlay{display:none;position:fixed;inset:0;z-index:2250;align-items:center;justify-content:center;background:rgba(0,0,0,.72);padding:18px}
      .brim-gacha-result-overlay.is-open{display:flex}
      .brim-gacha-result-items{display:flex;align-items:center;justify-content:center;gap:18px;flex-wrap:wrap}
      .brim-gacha-result-item{position:relative;width:128px;height:128px;display:grid;place-items:center;background:rgba(15,18,26,.92);border:1px solid rgba(255,255,255,.22);box-shadow:0 20px 60px rgba(0,0,0,.52)}
      .brim-gacha-result-item img{max-width:86px;max-height:86px;object-fit:contain}
      .brim-gacha-result-item span{position:absolute;right:10px;bottom:8px;min-width:30px;height:30px;display:grid;place-items:center;border-radius:999px;background:#ff4655;color:#fff;font-size:18px;font-weight:900}
      @keyframes brimGachaShake{0%{transform:translate(0,0) rotate(0)}25%{transform:translate(5px,-3px) rotate(1deg)}50%{transform:translate(-4px,4px) rotate(-1deg)}75%{transform:translate(3px,3px) rotate(.8deg)}100%{transform:translate(-3px,-2px) rotate(-.8deg)}}
      @keyframes brimGachaSpin{to{transform:rotate(360deg)}}
    `;
    document.head.appendChild(style);
  }

  function bind() {
    injectStyles();
    document.getElementById("brimGachaButton")?.addEventListener("click", openPanel);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();

  window.brimGacha = { open: openPanel };
})();
