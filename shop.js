(() => {
  const PRICES = {
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

  const RARITY_LABELS = {
    iron: "アイアン",
    bronze: "ブロンズ",
    silver: "シルバー",
    gold: "ゴールド",
    platinum: "プラチナ",
    diamond: "ダイヤ",
    ascendant: "アセンダント",
    immortal: "イモータル",
    radiant: "レディアント",
    spike: "素材"
  };

  const SPIKE_ID = "expansion_spike";
  const SPIKE_PRICE = 20;
  const SPIKE_IMAGE = "img/その他/拡張スパイク.png";

  let activeTab = "buy";
  let selectedItemId = "";
  let listings = [];
  let profile = null;
  let user = null;
  let message = "";

  function api() {
    return window.trackerValorantApi || window.valorantApi || {};
  }

  function createOperationId() {
    return (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`).replace(/[^A-Za-z0-9_-]/g, "_");
  }

  function pendingOperationKey(uid) {
    return `shopPendingOperation.v2.${encodeURIComponent(String(uid || "").trim())}`;
  }

  function pendingOperation(type, target, uid) {
    const key = pendingOperationKey(uid);
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "null");
      if (saved?.uid === uid && saved.type === type && saved.target === target && /^[A-Za-z0-9_-]{16,128}$/.test(saved.id || "")) return saved.id;
      const id = createOperationId();
      localStorage.setItem(key, JSON.stringify({ id, uid, type, target }));
      return id;
    } catch (error) {
      return createOperationId();
    }
  }

  function clearPendingOperation(uid) {
    try { localStorage.removeItem(pendingOperationKey(uid)); } catch (error) {}
  }

  async function operationUid() {
    return String((await api().getGoogleSession?.())?.user?.uid || "").trim();
  }

  async function applyFarmSpikes(result, expectedUid) {
    if (!Number.isFinite(Number(result?.farmSpikes))) return { ok: true };
    return window.kayoFarm?.applyCloudSpikeBalance?.(Number(result.farmSpikes), expectedUid) || { ok: false, code: "farm-unavailable" };
  }

  async function isCurrentOperationAccount(expectedUid) {
    return Boolean(expectedUid) && await operationUid() === expectedUid;
  }

  async function beginProgressCommit() {
    if (window.collectionGame?.beginRemoteProgressOperation?.() !== true) return { ok: false, message: "他の進捗処理中です。完了後にもう一度お試しください。" };
    const flushed = await window.onboardingAccount?.flushPendingProgress?.();
    if (flushed && !flushed.ok) {
      window.collectionGame?.endRemoteProgressOperation?.();
      return { ok: false, message: flushed.message || "進捗の保存を完了できませんでした。" };
    }
    return { ok: true };
  }

  function endProgressCommit() {
    window.collectionGame?.endRemoteProgressOperation?.();
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
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

  function isSpikeListing(item) {
    return item?.itemType === "spike" || item?.itemId === SPIKE_ID || item?.characterId === SPIKE_ID;
  }

  function getItemName(item) {
    return isSpikeListing(item) ? "拡張スパイク" : String(item?.characterName || "");
  }

  function getItemImage(item) {
    return isSpikeListing(item) ? SPIKE_IMAGE : String(item?.image || "");
  }

  function getOverlay() {
    let overlay = document.getElementById("shopOverlay");
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.id = "shopOverlay";
    overlay.className = "shop-overlay";
    overlay.innerHTML = `
      <div class="shop-panel">
        <div class="shop-header">
          <button id="shopCloseButton" class="shop-close-button" type="button">閉じる</button>
          <div>
            <div class="shop-title">ショップ</div>
            <div class="shop-subtitle">完成済みコレクションと拡張スパイクをKPで売買</div>
          </div>
        </div>
        <div class="shop-tabs">
          <button type="button" class="shop-tab" data-shop-tab="buy">買う</button>
          <button type="button" class="shop-tab" data-shop-tab="sell">売る</button>
          <button type="button" class="shop-tab" data-shop-tab="mine">自分の出品</button>
        </div>
        <div id="shopMessage" class="shop-message"></div>
        <div id="shopContent" class="shop-content"></div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeShop();
    });
    overlay.querySelector("#shopCloseButton")?.addEventListener("click", closeShop);
    overlay.querySelector(".shop-tabs")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-shop-tab]");
      if (!button) return;
      activeTab = button.dataset.shopTab || "buy";
      selectedItemId = "";
      render();
    });
    overlay.querySelector("#shopContent")?.addEventListener("click", handleContentClick);
    return overlay;
  }

  function injectStyles() {
    if (document.getElementById("shopStyles")) return;
    const style = document.createElement("style");
    style.id = "shopStyles";
    style.textContent = `
      .shop-overlay{display:none;position:fixed;inset:0;z-index:9100;align-items:center;justify-content:center;padding:18px;background:rgba(0,0,0,.58)}
      .shop-overlay.is-open{display:flex}
      .shop-panel{width:min(1120px,96vw);height:min(720px,90vh);display:grid;grid-template-rows:auto auto auto minmax(0,1fr);gap:10px;padding:14px;border:1px solid #ff4655;background:#0e1118;color:#ece8e1;box-shadow:0 28px 80px rgba(0,0,0,.62);overflow:hidden}
      .shop-header{display:flex;align-items:center;gap:12px;border-bottom:1px solid rgba(255,70,85,.38);padding-bottom:8px}
      .shop-close-button{border-color:#ff4655;background:#ff4655;color:#fff}
      .shop-title{font-size:24px;font-weight:900;letter-spacing:0}
      .shop-subtitle{font-size:12px;color:#aeb8cf}
      .shop-tabs{display:flex;gap:8px;flex-wrap:wrap}
      .shop-tab{border-color:#2b3344;background:#151b27;color:#ece8e1}
      .shop-tab.is-active{border-color:#ff4655;background:#25151b;color:#fff}
      .shop-message{min-height:22px;color:#ffd166;font-weight:800}
      .shop-content{min-height:0;overflow:auto;padding-right:4px}
      .shop-login-required{height:100%;display:grid;place-items:center;text-align:center;color:#ece8e1;font-size:18px;font-weight:900}
      .shop-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px}
      .shop-card{display:grid;gap:7px;align-content:start;min-height:250px;padding:10px;border:1px solid rgba(255,255,255,.14);background:#121722;color:#ece8e1}
      .shop-card img{width:100%;height:116px;object-fit:contain;background:rgba(255,255,255,.04)}
      .shop-card-name{font-weight:900;min-height:34px}
      .shop-card-meta{display:grid;gap:3px;font-size:12px;color:#c7d0df}
      .shop-card button{margin-top:auto;border-color:#ff4655;background:#ff4655;color:#fff}
      .shop-card button:disabled{background:#3a3f4b;border-color:#666;color:#c7d0df}
      .shop-rarity-iron{border-color:#8b8f99}.shop-rarity-bronze{border-color:#a66a40}.shop-rarity-silver{border-color:#cfd6e6}.shop-rarity-gold{border-color:#e0b94c}.shop-rarity-platinum{border-color:#73dfd6}.shop-rarity-diamond{border-color:#8aa8ff}.shop-rarity-ascendant{border-color:#58d67b}.shop-rarity-immortal{border-color:#b05bff}.shop-rarity-radiant{border-color:#ffef8a}.shop-rarity-spike{border-color:#7ce7ff}
      .shop-sell-layout{display:grid;gap:12px}
      .shop-slots{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
      .shop-slot{min-height:132px;padding:10px;border:1px solid rgba(255,70,85,.45);background:#121722;display:grid;gap:6px;align-content:center;text-align:center}
      .shop-slot.is-locked{opacity:.55;border-style:dashed}
      .shop-slot img{width:70px;height:70px;object-fit:contain;margin:0 auto}
      .shop-rule-row{display:flex;justify-content:flex-end}
      .shop-help-button{width:34px;height:34px;border-radius:999px;border-color:#ece8e1;background:#151b27;color:#ece8e1}
      .shop-help-box{display:none;padding:10px;border:1px solid rgba(255,255,255,.16);background:#171d29;color:#c7d0df;line-height:1.55}
      .shop-help-box.is-open{display:block}
      .shop-character-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
      .shop-character-choice{display:grid;gap:6px;padding:8px;border:1px solid rgba(255,255,255,.13);background:#121722;color:#ece8e1;text-align:left}
      .shop-character-choice.is-selected{border-color:#ece8e1;box-shadow:0 0 0 1px rgba(255,255,255,.45)}
      .shop-character-choice img{width:100%;height:90px;object-fit:contain}
      .shop-selected-box{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px;border:1px solid rgba(255,70,85,.42);background:#171d29}
      .shop-selected-box button{border-color:#ff4655;background:#ff4655;color:#fff}
      .shop-empty{padding:24px;border:1px dashed rgba(255,255,255,.18);color:#aeb8cf;text-align:center}
      .shop-history{display:grid;gap:8px;margin-top:12px}
      .shop-history-item{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px;border:1px solid rgba(255,255,255,.12);background:#121722;color:#c7d0df}
    `;
    document.head.appendChild(style);
  }

  function closeShop() {
    getOverlay().classList.remove("is-open");
  }

  async function openShop() {
    injectStyles();
    const overlay = getOverlay();
    overlay.classList.add("is-open");
    message = "";
    renderLoading();
    await refreshData(true);
    render();
  }

  function renderLoading() {
    const content = document.getElementById("shopContent");
    if (content) content.innerHTML = `<div class="shop-empty">読み込み中...</div>`;
  }

  async function refreshData(claimPending = false) {
    const session = await api().getGoogleSession?.();
    user = session?.user || null;
    if (!user) {
      profile = null;
      listings = [];
      return;
    }

    const [profileResult, listingsResult] = await Promise.all([
      api().getShopProfile?.(),
      api().listShopListings?.()
    ]);
    if (!profileResult?.ok) {
      message = profileResult?.message || "ショップ情報を取得できませんでした";
      profile = null;
      listings = [];
      return;
    }
    profile = profileResult.profile || {};
    user = profileResult.user || user;
    listings = Array.isArray(listingsResult?.listings) ? listingsResult.listings : [];

    const localSlots = Math.max(1, Math.min(3, Number(window.collectionGame?.getShopSlotsUnlocked?.() || 1)));
    if (localSlots > Number(profile.shopSlotsUnlocked || 1)) {
      const slotResult = await api().syncShopSlotsUnlocked?.(localSlots);
      if (slotResult?.ok) {
        profile.shopSlotsUnlocked = slotResult.shopSlotsUnlocked;
        window.collectionGame?.setCloudRevision?.(slotResult.revision || "");
      }
    }

    if (claimPending && Number(profile.shopPendingKp || 0) > 0) {
      const started = await beginProgressCommit();
      if (!started.ok) { message = started.message; return; }
      try {
        const claim = await api().claimShopPendingKp?.();
        if (claim?.ok && Number(claim.pendingKp || 0) > 0) {
          window.collectionGame?.applyCommittedCloudState?.(claim.state || {}, claim.revision || "");
          message = `売上 ${Number(claim.pendingKp)}KPを受け取りました`;
          profile.shopPendingKp = 0;
        }
      } finally {
        endProgressCommit();
      }
    }
  }

  function render() {
    const overlay = getOverlay();
    overlay.querySelectorAll(".shop-tab").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.shopTab === activeTab);
    });
    const messageEl = document.getElementById("shopMessage");
    if (messageEl) messageEl.textContent = message || "";
    const content = document.getElementById("shopContent");
    if (!content) return;
    if (!user) {
      content.innerHTML = `<div class="shop-login-required">ショップを利用するにはGoogleログインが必要です</div>`;
      return;
    }
    if (activeTab === "sell") content.innerHTML = renderSell();
    else if (activeTab === "mine") content.innerHTML = renderMine();
    else content.innerHTML = renderBuy();
  }

  function getCharacterMap() {
    const characters = window.collectionGame?.getShopCharacters?.() || [];
    return new Map(characters.map((character) => [character.id, character]));
  }

  function getActiveOwnListings() {
    return listings.filter((item) => item.sellerUid === user?.uid && item.status === "active");
  }

  function getUnlockedSlots() {
    const localSlots = Number(window.collectionGame?.getShopSlotsUnlocked?.() || 1);
    const remoteSlots = Number(profile?.shopSlotsUnlocked || 1);
    return Math.max(1, Math.min(3, Math.max(localSlots, remoteSlots)));
  }

  function renderBuy() {
    const characterMap = getCharacterMap();
    const active = listings.filter((item) => item.status === "active");
    if (!active.length) return `<div class="shop-empty">現在出品されている商品はありません</div>`;
    return `<div class="shop-grid">${active.map((item) => {
      const own = item.sellerUid === user.uid;
      const spike = isSpikeListing(item);
      const character = spike ? null : characterMap.get(item.characterId);
      const completed = !spike && Number(character?.stage || 0) >= 3;
      const disabled = own || completed;
      const buttonText = own ? "自分の出品" : completed ? "完成済み" : "購入する";
      const rarity = spike ? "spike" : item.rarity;
      const rarityLabel = spike ? "素材" : (item.rarityLabel || RARITY_LABELS[item.rarity] || item.rarity);
      return `
        <div class="shop-card shop-rarity-${escapeHtml(rarity)}">
          ${getItemImage(item) ? `<img src="${escapeHtml(getItemImage(item))}" alt="${escapeHtml(getItemName(item))}">` : ""}
          <div class="shop-card-name">${escapeHtml(getItemName(item))}</div>
          <div class="shop-card-meta">
            <span>種別：${escapeHtml(rarityLabel)}</span>
            <span>価格：${Number(item.price || 0)}KP</span>
            <span>出品者：${escapeHtml(item.sellerName || "プレイヤー")}</span>
          </div>
          <button type="button" data-shop-action="buy" data-listing-id="${escapeHtml(item.id)}" ${disabled ? "disabled" : ""}>${buttonText}</button>
        </div>
      `;
    }).join("")}</div>`;
  }

  function renderSell() {
    const slots = getUnlockedSlots();
    const active = getActiveOwnListings();
    const sold = new Set(profile?.shopSoldCharacterIds || []);
    const activeIds = new Set(active.filter((item) => !isSpikeListing(item)).map((item) => item.characterId));
    const characters = (window.collectionGame?.getShopCharacters?.() || [])
      .filter((character) => character.completed && PRICES[character.rarity] && !sold.has(character.id) && !activeIds.has(character.id));
    const spikeCount = Math.max(0, Number(window.kayoFarm?.getSpikes?.() || 0));
    const canSellSpike = spikeCount > 0;
    const selectedCharacter = characters.find((character) => character.id === selectedItemId) || null;
    const selectedSpike = selectedItemId === SPIKE_ID && canSellSpike;

    const slotsHtml = [0, 1, 2].map((index) => {
      const listing = active[index];
      if (index >= slots) {
        return `<div class="shop-slot is-locked"><strong>未解放</strong><span>${index === 1 ? "2枠目：AP10で解放" : "3枠目：AP20で解放"}</span></div>`;
      }
      if (listing) {
        return `
          <div class="shop-slot">
            ${getItemImage(listing) ? `<img src="${escapeHtml(getItemImage(listing))}" alt="">` : ""}
            <strong>${escapeHtml(getItemName(listing))}</strong>
            <span>${Number(listing.price || 0)}KP</span>
            <span>出品中</span>
          </div>
        `;
      }
      return `<div class="shop-slot"><strong>空き</strong><span>出品できます</span></div>`;
    }).join("");

    let selectedHtml = `<div class="shop-empty">出品する商品を選んでください</div>`;
    if (selectedCharacter) {
      selectedHtml = `<div class="shop-selected-box"><div><strong>${escapeHtml(selectedCharacter.name)}</strong><br>${escapeHtml(RARITY_LABELS[selectedCharacter.rarity] || selectedCharacter.rarity)} / ${PRICES[selectedCharacter.rarity]}KP</div><button type="button" data-shop-action="sell" data-item-id="${escapeHtml(selectedCharacter.id)}">出品する</button></div>`;
    } else if (selectedSpike) {
      selectedHtml = `<div class="shop-selected-box"><div><strong>拡張スパイク</strong><br>素材 / ${SPIKE_PRICE}KP / 所持 ${spikeCount}</div><button type="button" data-shop-action="sell" data-item-id="${SPIKE_ID}">出品する</button></div>`;
    }

    const choices = [];
    if (canSellSpike) {
      choices.push(`
        <button type="button" class="shop-character-choice ${selectedItemId === SPIKE_ID ? "is-selected" : ""}" data-shop-action="select-item" data-item-id="${SPIKE_ID}">
          <img src="${SPIKE_IMAGE}" alt="">
          <strong>拡張スパイク</strong>
          <span>素材 / ${SPIKE_PRICE}KP / 所持 ${spikeCount}</span>
        </button>
      `);
    }
    characters.forEach((character) => {
      choices.push(`
        <button type="button" class="shop-character-choice ${character.id === selectedItemId ? "is-selected" : ""}" data-shop-action="select-item" data-item-id="${escapeHtml(character.id)}">
          ${character.image ? `<img src="${escapeHtml(character.image)}" alt="">` : ""}
          <strong>${escapeHtml(character.name)}</strong>
          <span>${escapeHtml(RARITY_LABELS[character.rarity] || character.rarity)} / ${PRICES[character.rarity]}KP</span>
        </button>
      `);
    });

    const choiceHtml = choices.length
      ? `<div class="shop-character-list">${choices.join("")}</div>`
      : `<div class="shop-empty">現在出品できる商品はありません</div>`;

    return `
      <div class="shop-sell-layout">
        <div class="shop-rule-row"><button id="shopHelpButton" class="shop-help-button" type="button" data-shop-action="help">?</button></div>
        <div id="shopHelpBox" class="shop-help-box">
          <div>3段階まで完成したキャラは、各キャラ1回だけ出品できます。</div>
          <div>出品しても、販売されても、自分の3段階完成状態は失われません。</div>
          <div>出品しただけでは販売済みになりません。</div>
          <div>他のユーザーが購入した時点で販売済みになります。</div>
          <div>出品を取り消した場合は、再出品できます。</div>
          <div>一度販売されたキャラは、再出品できません。</div>
          <div>拡張スパイクは1枠につき1個、20KP固定です。</div>
        </div>
        <div class="shop-slots">${slotsHtml}</div>
        ${selectedHtml}
        ${choiceHtml}
      </div>
    `;
  }

  function renderMine() {
    const active = getActiveOwnListings();
    const sales = parseJsonArray(profile?.shopSalesJson);
    const activeHtml = active.length
      ? `<div class="shop-grid">${active.map((item) => `
        <div class="shop-card shop-rarity-${escapeHtml(isSpikeListing(item) ? "spike" : item.rarity)}">
          ${getItemImage(item) ? `<img src="${escapeHtml(getItemImage(item))}" alt="">` : ""}
          <div class="shop-card-name">${escapeHtml(getItemName(item))}</div>
          <div class="shop-card-meta">
            <span>種別：${escapeHtml(isSpikeListing(item) ? "素材" : (item.rarityLabel || RARITY_LABELS[item.rarity] || item.rarity))}</span>
            <span>価格：${Number(item.price || 0)}KP</span>
            <span>出品中</span>
          </div>
          <button type="button" data-shop-action="cancel" data-listing-id="${escapeHtml(item.id)}">出品を取り消す</button>
        </div>
      `).join("")}</div>`
      : `<div class="shop-empty">現在出品中の商品はありません</div>`;
    const salesHtml = sales.length
      ? `<div class="shop-history">${sales.slice().reverse().map((item) => `<div class="shop-history-item"><span>${escapeHtml(item.characterName || item.itemName || "商品")} / ${Number(item.price || 0)}KP</span><strong>販売済み</strong></div>`).join("")}</div>`
      : `<div class="shop-empty">販売履歴はありません</div>`;
    return `${activeHtml}<h3>販売履歴</h3>${salesHtml}`;
  }

  async function handleContentClick(event) {
    const button = event.target.closest("[data-shop-action]");
    if (!button || button.disabled) return;
    const action = button.dataset.shopAction;
    if (action === "help") {
      document.getElementById("shopHelpBox")?.classList.toggle("is-open");
      return;
    }
    if (action === "select-item") {
      selectedItemId = button.dataset.itemId || "";
      render();
      return;
    }
    button.disabled = true;
    message = "処理中...";
    render();
    try {
      if (action === "sell") await createListing(button.dataset.itemId || selectedItemId);
      if (action === "cancel") await cancelListing(button.dataset.listingId || "");
      if (action === "buy") await buyListing(button.dataset.listingId || "");
    } catch (error) {
      message = error.message || String(error);
    }
    await refreshData(false);
    render();
  }

  async function createListing(itemId) {
    const started = await beginProgressCommit();
    if (!started.ok) { message = started.message; return; }
    try {
    const expectedUid = await operationUid();
    if (!expectedUid) { message = "Googleログインが必要です"; return; }
    const slots = getUnlockedSlots();
    if (getActiveOwnListings().length >= slots) {
      message = "出品枠が空いていません";
      return;
    }

    if (itemId === SPIKE_ID) {
      const spikeSync = await window.kayoFarm?.syncCloudSpikes?.();
      if (spikeSync && !spikeSync.ok) {
        message = spikeSync.message || "拡張スパイクを同期できませんでした";
        return;
      }
      if (Number(window.kayoFarm?.getSpikes?.() || 0) <= 0) {
        message = "拡張スパイクを持っていません";
        return;
      }
      const result = await api().createShopListing?.({
        itemType: "spike",
        itemId: SPIKE_ID,
        characterId: SPIKE_ID,
        characterName: "拡張スパイク",
        rarity: "spike",
        rarityLabel: "素材",
        image: SPIKE_IMAGE,
        price: SPIKE_PRICE,
        slotsUnlocked: slots
      }, pendingOperation("create", `spike:${SPIKE_ID}`, expectedUid), expectedUid);
      message = result?.ok ? "拡張スパイクを出品しました" : (result?.message || "出品に失敗しました");
      if (result?.ok) {
        if (!await isCurrentOperationAccount(expectedUid)) { message = "Googleアカウントが切り替わりました。再読み込みしてください。"; return; }
        const applied = await applyFarmSpikes(result, expectedUid);
        if (!applied?.ok) { message = "拡張スパイクの反映を確認できませんでした。"; return; }
        if (!await isCurrentOperationAccount(expectedUid)) { message = "Googleアカウントが切り替わりました。再読み込みしてください。"; return; }
        clearPendingOperation(expectedUid);
        window.collectionGame?.setCloudRevision?.(result.revision || "");
        activeTab = "mine";
        selectedItemId = "";
      }
      return;
    }

    const character = (window.collectionGame?.getShopCharacters?.() || []).find((item) => item.id === itemId);
    if (!character || !character.completed || !PRICES[character.rarity]) {
      message = "出品できないキャラです";
      return;
    }
    const result = await api().createShopListing?.({
      itemType: "character",
      characterId: character.id,
      characterName: character.name,
      rarity: character.rarity,
      rarityLabel: RARITY_LABELS[character.rarity] || character.rank,
      image: character.image,
      slotsUnlocked: slots
    }, pendingOperation("create", `character:${character.id}`, expectedUid), expectedUid);
    message = result?.ok ? `${character.name}を出品しました` : (result?.message || "出品に失敗しました");
    if (result?.ok) {
      if (!await isCurrentOperationAccount(expectedUid)) { message = "Googleアカウントが切り替わりました。再読み込みしてください。"; return; }
      clearPendingOperation(expectedUid);
      window.collectionGame?.setCloudRevision?.(result.revision || "");
      activeTab = "mine";
      selectedItemId = "";
    }
    } finally {
      endProgressCommit();
    }
  }

  async function cancelListing(listingId) {
    const started = await beginProgressCommit();
    if (!started.ok) { message = started.message; return; }
    try {
    const expectedUid = await operationUid();
    if (!expectedUid) { message = "Googleログインが必要です"; return; }
    const listing = listings.find((item) => item.id === listingId);
    const result = await api().cancelShopListing?.(listingId, pendingOperation("cancel", listingId, expectedUid), expectedUid);
    if (result?.ok) {
      if (!await isCurrentOperationAccount(expectedUid)) { message = "Googleアカウントが切り替わりました。再読み込みしてください。"; return; }
      const applied = await applyFarmSpikes(result, expectedUid);
      if (!applied?.ok) { message = "拡張スパイクの反映を確認できませんでした。"; return; }
      if (!await isCurrentOperationAccount(expectedUid)) { message = "Googleアカウントが切り替わりました。再読み込みしてください。"; return; }
      clearPendingOperation(expectedUid);
      window.collectionGame?.setCloudRevision?.(result.revision || "");
    }
    message = result?.ok ? "出品を取り消しました" : (result?.message || "取り消しに失敗しました");
    } finally {
      endProgressCommit();
    }
  }

  async function buyListing(listingId) {
    const listing = listings.find((item) => item.id === listingId);
    if (!listing) {
      message = "商品が見つかりません";
      return;
    }

    const started = await beginProgressCommit();
    if (!started.ok) { message = started.message; return; }
    try {
    const expectedUid = await operationUid();
    if (!expectedUid) { message = "Googleログインが必要です"; return; }
    const buyerState = window.collectionGame?.getShopBuyerState?.() || window.collectionGame?.getState?.() || {};
    if (Number(buyerState.kp || 0) < Number(listing.price || 0)) {
      message = "KPが足りません";
      return;
    }

    if (!isSpikeListing(listing)) {
      const character = getCharacterMap().get(listing.characterId);
      if (Number(character?.stage || 0) >= 3) {
        message = "完成済み";
        return;
      }
    }

    const result = await api().buyShopListing?.(listingId, buyerState, pendingOperation("buy", listingId, expectedUid), expectedUid);
    if (!result?.ok) {
      message = result?.message || "購入に失敗しました";
      return;
    }
    if (!await isCurrentOperationAccount(expectedUid)) { message = "Googleアカウントが切り替わりました。再読み込みしてください。"; return; }
    const applied = await applyFarmSpikes(result, expectedUid);
    if (!applied?.ok) { message = "拡張スパイクの反映を確認できませんでした。"; return; }
    if (!await isCurrentOperationAccount(expectedUid)) { message = "Googleアカウントが切り替わりました。再読み込みしてください。"; return; }
    clearPendingOperation(expectedUid);
    window.collectionGame?.applyCommittedCloudState?.(result.state || {}, result.revision || "");

    if (isSpikeListing(listing)) {
      message = "拡張スパイクを購入しました";
      return;
    }

    message = `${listing.characterName}を購入しました`;
    } finally {
      endProgressCommit();
    }
  }

  function bind() {
    injectStyles();
    document.getElementById("shopButton")?.addEventListener("click", openShop);
  }

  window.shopFeature = { open: openShop, close: closeShop };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
