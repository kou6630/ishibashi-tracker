(function () {
  "use strict";

  const data = window.kayoFarmData;
  if (!data) return;

  const LEGACY_STORAGE_KEY = "kayoFarmState.v1";
  const STORAGE_KEY_PREFIX = "kayoFarmState.v2.";
  const LEGACY_MIGRATION_KEY = "kayoFarmLegacyMigrated.v2";
  const cropById = data.cropById;
  const cropIds = data.crops.map((crop) => crop.id);
  let state = null;
  let shell = null;
  let ticker = null;
  const spikeSyncPromises = new Map();
  let activeStorageKey = "";
  let activeUid = "";
  let accountPromise = null;

  async function ensureFarmAccount() {
    if (accountPromise) return accountPromise;
    const api = window.trackerValorantApi || window.valorantApi || {};
    accountPromise = Promise.resolve(api.getGoogleSession?.()).then((session) => {
      const uid = String(session?.user?.uid || "").trim();
      if (!uid) return { ok: false, message: "Google login is required." };
      if (uid === activeUid && activeStorageKey) return { ok: true, uid };
      const key = `${STORAGE_KEY_PREFIX}${uid}`;
      if (!localStorage.getItem(key) && !localStorage.getItem(LEGACY_MIGRATION_KEY)) {
        const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (legacy) localStorage.setItem(key, legacy);
        localStorage.setItem(LEGACY_MIGRATION_KEY, uid);
      }
      activeUid = uid;
      activeStorageKey = key;
      state = null;
      loadState();
      return { ok: true, uid };
    }).finally(() => { accountPromise = null; });
    return accountPromise;
  }

  function spikeOperationId() {
    return (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`).replace(/[^A-Za-z0-9_-]/g, "_");
  }

  async function applyCloudSpikeBalance(balance, expectedUid = "") {
    if (!activeUid) {
      const account = await ensureFarmAccount();
      if (!account?.ok) return account;
    }
    if (!activeUid || (expectedUid && activeUid !== expectedUid)) return { ok: false, code: "account-changed" };
    loadState();
    state.spikes = Math.max(0, Math.floor(Number(balance) || 0));
    saveState();
    render();
    return { ok: true };
  }

  async function ensureCloudSpikes() {
    const api = window.trackerValorantApi || window.valorantApi || {};
    if (!api.syncFarmSpikes) return { ok: false, message: "Farm sync is unavailable." };
    const account = await ensureFarmAccount();
    if (!account?.ok) return account;
    const uid = account.uid;
    if (spikeSyncPromises.has(uid)) return spikeSyncPromises.get(uid);
    const promise = Promise.resolve(api.syncFarmSpikes(Math.max(0, Number(loadState().spikes) || 0)))
      .then(async (result) => {
        if (result?.ok) {
          const applied = await applyCloudSpikeBalance(result.farmSpikes, uid);
          if (!applied.ok) return { ...result, ok: false, code: "account-changed" };
          if (result.revision) window.collectionGame?.setCloudRevision?.(result.revision);
        }
        return result;
      })
      .finally(() => { spikeSyncPromises.delete(uid); });
    spikeSyncPromises.set(uid, promise);
    return promise;
  }

  async function commitSpikeChange(type, delta, target, details = {}) {
    const api = window.trackerValorantApi || window.valorantApi || {};
    if (!api.applyFarmSpikeOperation || window.collectionGame?.beginRemoteProgressOperation?.() !== true) return { ok: false };
    try {
      const account = await ensureFarmAccount();
      if (!account?.ok) return account;
      const flushed = await window.onboardingAccount?.flushPendingProgress?.();
      if (flushed && !flushed.ok) return { ok: false, message: flushed.message };
      const synced = await ensureCloudSpikes();
      if (!synced?.ok) return synced || { ok: false };
      const key = `${type}:${target}`;
      state.pendingSpikeOperations = state.pendingSpikeOperations || {};
      const pending = state.pendingSpikeOperations[key];
      const id = pending?.id || spikeOperationId();
      if (!pending) {
        state.pendingSpikeOperations[key] = { id, type, delta, target, ...details };
        saveState();
      }
      const result = await api.applyFarmSpikeOperation({ id, type, delta, target });
      if (result?.ok) {
        if (activeUid !== account.uid) return { ok: false, code: "account-changed" };
        const applied = await applyCloudSpikeBalance(result.farmSpikes, account.uid);
        if (!applied.ok) return applied;
        if (result.revision) window.collectionGame?.setCloudRevision?.(result.revision);
      }
      return result?.ok ? { ...result, operationKey: key } : result;
    } finally {
      window.collectionGame?.endRemoteProgressOperation?.();
    }
  }

  function completeSpikeOperation(operationKey) {
    if (!operationKey || !state?.pendingSpikeOperations) return;
    delete state.pendingSpikeOperations[operationKey];
  }

  function createDefaultState() {
    return {
      initialized: false,
      selectedSeedId: "",
      unlockedPots: data.farm.initialUnlockedPots,
      unlockedTrucks: data.truck.initialTrucks,
      knownSeedIds: [data.farm.initialSeedId],
      seeds: { [data.farm.initialSeedId]: 1 },
      crops: {},
      spikes: 0,
      pendingSpikeOperations: {},
      pots: Array.from({ length: data.farm.maxPots }, () => null),
      trucks: Array.from({ length: data.truck.maxTrucks }, (_, index) => createTruckSlot(index + 1))
    };
  }

  function loadState() {
    if (state) return state;
    try {
      state = normalizeState(JSON.parse(localStorage.getItem(activeStorageKey || LEGACY_STORAGE_KEY) || "null"));
    } catch (error) {
      state = createDefaultState();
    }
    if (!state.initialized) {
      state.initialized = true;
      state.seeds[data.farm.initialSeedId] = Math.max(1, state.seeds[data.farm.initialSeedId] || 0);
      state.knownSeedIds = [data.farm.initialSeedId];
      state.unlockedPots = data.farm.initialUnlockedPots;
      state.unlockedTrucks = data.truck.initialTrucks;
      state.trucks = Array.from({ length: data.truck.maxTrucks }, (_, index) => (
        index === 0 ? createTruck(1) : createTruckSlot(index + 1)
      ));
      saveState();
    }
    refreshRestedTrucks();
    return state;
  }

  function normalizeState(raw) {
    const base = createDefaultState();
    const next = Object.assign(base, raw || {});
    if (typeof next.unlockedCells === "number" && typeof next.unlockedPots !== "number") {
      next.unlockedPots = next.unlockedCells;
    }
    if (Array.isArray(next.cells) && !Array.isArray(raw?.pots)) {
      next.pots = next.cells;
    }
    next.unlockedPots = clampInt(next.unlockedPots, data.farm.initialUnlockedPots, data.farm.maxPots);
    next.unlockedTrucks = clampInt(next.unlockedTrucks, 1, data.truck.maxTrucks);
    next.seeds = normalizeCountMap(next.seeds);
    next.crops = normalizeCountMap(next.crops);
    next.spikes = Math.max(0, Math.floor(Number(next.spikes) || 0));
    next.pendingSpikeOperations = next.pendingSpikeOperations && typeof next.pendingSpikeOperations === "object" ? next.pendingSpikeOperations : {};
    next.knownSeedIds = Array.isArray(next.knownSeedIds) ? next.knownSeedIds.filter(isCropId) : [data.farm.initialSeedId];
    if (!next.knownSeedIds.length) next.knownSeedIds.push(data.farm.initialSeedId);
    next.pots = Array.isArray(next.pots) ? next.pots.slice(0, data.farm.maxPots) : [];
    while (next.pots.length < data.farm.maxPots) next.pots.push(null);
    next.pots = next.pots.map((pot) => {
      if (!pot || !isCropId(pot.seedId)) return null;
      return {
        seedId: pot.seedId,
        plantedAt: Number(pot.plantedAt) || Date.now()
      };
    });
    next.trucks = Array.isArray(next.trucks) ? next.trucks.slice(0, data.truck.maxTrucks) : [];
    for (let i = 0; i < data.truck.maxTrucks; i += 1) {
      next.trucks[i] = normalizeTruck(next.trucks[i], i + 1, i < next.unlockedTrucks, next);
    }
    next.trucks.length = data.truck.maxTrucks;
    return next;
  }

  function normalizeTruck(truck, id, unlocked, sourceState) {
    const next = truck && typeof truck === "object" ? truck : createTruckSlot(id);
    next.id = id;
    delete next.level;
    next.restingUntil = Number(next.restingUntil) || 0;
    next.departingUntil = Number(next.departingUntil) || 0;
    next.returningUntil = Number(next.returningUntil) || 0;
    if (next.order && !isValidOrder(next.order)) next.order = null;
    if (next.nextOrder && !isValidOrder(next.nextOrder)) next.nextOrder = null;
    if (!unlocked) {
      next.order = null;
      next.nextOrder = null;
      next.restingUntil = 0;
      next.departingUntil = 0;
      next.returningUntil = 0;
    } else if (!next.order && next.restingUntil <= Date.now()) {
      next.order = next.nextOrder || createOrder(sourceState, id);
      next.nextOrder = null;
    } else if (next.order && next.order.reward?.level !== getTruckLevel(sourceState, id)) {
      next.order.reward = createCookieReward(sourceState, id);
    }
    return next;
  }

  function isValidOrder(order) {
    return Array.isArray(order.requirements)
      && order.requirements.length
      && order.requirements.every((req) => isCropId(req.cropId) && Number(req.count) > 0)
      && order.reward
      && order.reward.type === "cookies"
      && Number(order.reward.count) > 0;
  }

  function normalizeCountMap(value) {
    const map = {};
    Object.entries(value || {}).forEach(([id, count]) => {
      if (isCropId(id)) map[id] = Math.max(0, Math.floor(Number(count) || 0));
    });
    return map;
  }

  function saveState() {
    if (state) localStorage.setItem(activeStorageKey || LEGACY_STORAGE_KEY, JSON.stringify(state));
  }

  function clampInt(value, min, max) {
    return Math.max(min, Math.min(max, Math.floor(Number(value) || min)));
  }

  function isCropId(id) {
    return cropIds.includes(id);
  }

  function createTruck(id, sourceState = state) {
    return {
      id,
      order: createOrder(sourceState, id),
      nextOrder: null,
      restingUntil: 0,
      departingUntil: 0,
      returningUntil: 0
    };
  }

  function createTruckSlot(id) {
    return {
      id,
      order: null,
      nextOrder: null,
      restingUntil: 0,
      departingUntil: 0,
      returningUntil: 0
    };
  }

  function getUnlockedBlockCount(sourceState = state) {
    return Math.max(1, Math.ceil((sourceState?.unlockedPots || data.farm.initialUnlockedPots) / data.farm.potsPerBlock));
  }

  function createOrder(sourceState = state, truckId = 1) {
    const cap = data.truck.orderTotalCapsByBlock[getUnlockedBlockCount(sourceState)] || 5;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const available = getOrderCropPool(sourceState);
      const picked = sampleMany(available.length ? available : [cropById[data.farm.initialSeedId]], Math.min(2, available.length || 1));
      const total = randomInt(1, cap);
      const requirements = splitRequirements(picked, total);
      return {
        id: `order-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        requirements,
        reward: createCookieReward(sourceState, truckId)
      };
    }
    return createFallbackOrder(cap, sourceState, truckId);
  }

  function getTruckLevel(sourceState = state, truckId = 1) {
    return Math.max(1, Math.min(5, Math.floor(Number(truckId) || 1)));
  }

  function createCookieReward(sourceState = state, truckId = 1) {
    const level = getTruckLevel(sourceState, truckId);
    const range = data.truck.cookieRewardsByLevel[level] || data.truck.cookieRewardsByLevel[1];
    return { type: "cookies", count: randomInt(range.min, range.max), level };
  }

  function createFallbackOrder(cap, sourceState = state, truckId = 1) {
    const crop = getOrderCropPool(sourceState)[0] || cropById[data.farm.initialSeedId];
    const count = Math.min(cap, 1);
    const requirements = [{ cropId: crop.id, count }];
    return {
      id: `order-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      requirements,
      reward: createCookieReward(sourceState, truckId)
    };
  }

  function getOrderCropPool(sourceState = state) {
    const known = new Set(sourceState ? sourceState.knownSeedIds : [data.farm.initialSeedId]);
    Object.entries(sourceState?.seeds || {}).forEach(([id, count]) => {
      if (count > 0) known.add(id);
    });
    return [...known].map((id) => cropById[id]).filter(Boolean);
  }

  function splitRequirements(picked, total) {
    if (picked.length === 1 || total === 1) return [{ cropId: picked[0].id, count: total }];
    const first = randomInt(1, total - 1);
    return [
      { cropId: picked[0].id, count: first },
      { cropId: picked[1].id, count: total - first }
    ].filter((req) => req.count > 0);
  }


  function sample(items) {
    return items[Math.floor(Math.random() * items.length)];
  }

  function sampleMany(items, count) {
    const copy = items.slice();
    const result = [];
    while (copy.length && result.length < count) {
      result.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
    }
    return result;
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function refreshRestedTrucks() {
    if (!state) return false;
    const now = Date.now();
    let changed = false;
    state.trucks.forEach((truck) => {
      if (!truck.order && truck.restingUntil && truck.restingUntil <= now) {
        truck.order = truck.nextOrder || createOrder(state, truck.id);
        truck.nextOrder = null;
        truck.restingUntil = 0;
        truck.departingUntil = 0;
        truck.returningUntil = now + 500;
        changed = true;
      }
    });
    if (changed) saveState();
    return changed;
  }

  async function openFarm() {
    await ensureFarmAccount();
    loadState();
    injectStyles();
    if (!shell) shell = createShell();
    if (!shell.overlay.parentNode) document.body.appendChild(shell.overlay);
    render();
    startTicker();
    ensureCloudSpikes();
  }

  function closeFarm() {
    if (shell?.overlay?.parentNode) shell.overlay.remove();
    if (ticker) {
      clearInterval(ticker);
      ticker = null;
    }
  }

  function createShell() {
    const overlay = document.createElement("div");
    overlay.className = "kayo-farm-overlay";
    overlay.innerHTML = `
      <section class="kayo-farm-panel" role="dialog" aria-modal="true" aria-label="K/AYO畑">
        <header class="kayo-farm-header">
          <div>
            <div class="kayo-farm-kicker">K/AYO FIELD</div>
            <h2>K/AYO畑</h2>
          </div>
          <div class="kayo-farm-header-actions">
            <button class="kayo-farm-harvest-all" type="button">まとめて収穫</button>
            <button class="kayo-farm-close" type="button" aria-label="K/AYO畑を閉じる">閉じる</button>
          </div>
        </header>
        <div class="kayo-farm-layout">
          <aside class="kayo-farm-card kayo-farm-seeds">
            <h3>種</h3>
            <div class="kayo-farm-seed-list"></div>
          </aside>
          <main class="kayo-farm-field-card">
            <div class="kayo-farm-selected"></div>
            <div class="kayo-farm-field"></div>
          </main>
          <aside class="kayo-farm-card kayo-farm-crops">
            <h3>作物</h3>
            <div class="kayo-farm-crop-list"></div>
          </aside>
          <aside class="kayo-farm-card kayo-farm-spikes"></aside>
          <section class="kayo-farm-card kayo-farm-trucks"></section>
        </div>
      </section>
    `;
    overlay.querySelector(".kayo-farm-panel").addEventListener("click", (event) => event.stopPropagation());
    overlay.querySelector(".kayo-farm-harvest-all").addEventListener("click", harvestReadyAll);
    overlay.querySelector(".kayo-farm-close").addEventListener("click", closeFarm);
    return {
      overlay,
      seedList: overlay.querySelector(".kayo-farm-seed-list"),
      cropList: overlay.querySelector(".kayo-farm-crop-list"),
      selected: overlay.querySelector(".kayo-farm-selected"),
      field: overlay.querySelector(".kayo-farm-field"),
      spikes: overlay.querySelector(".kayo-farm-spikes"),
      trucks: overlay.querySelector(".kayo-farm-trucks")
    };
  }

  function startTicker() {
    if (ticker) return;
    ticker = setInterval(() => {
      if (!state || !shell?.overlay?.parentNode) return;
      updateDynamicState();
    }, 1000);
  }

  function updateDynamicState() {
    if (refreshRestedTrucks()) {
      renderTrucks();
    } else {
      let truckPhaseChanged = false;
      state.trucks.slice(0, state.unlockedTrucks).forEach((truck) => {
        const card = shell.trucks.querySelector(`[data-truck-id="${truck.id}"]`);
        if (!card) return;
        const now = Date.now();
        if ((card.classList.contains("is-departing") && truck.departingUntil <= now)
          || (card.classList.contains("is-returning") && truck.returningUntil <= now)) {
          truckPhaseChanged = true;
        }
        const remain = card.querySelector(".kayo-farm-rest-remaining");
        if (remain && !truck.order) {
          remain.textContent = `運搬中　残り ${Math.max(0, Math.ceil((truck.restingUntil - now) / 1000))}秒`;
        }
      });
      if (truckPhaseChanged) renderTrucks();
    }

    state.pots.slice(0, state.unlockedPots).forEach((pot, index) => {
      if (!pot) return;
      const button = shell.field.querySelector(`[data-pot-index="${index}"]`);
      if (!button) return;
      const progress = getGrowthProgress(pot);
      const bar = button.querySelector(".kayo-farm-grow-bar span");
      if (bar) bar.style.width = `${Math.round(progress * 100)}%`;
      if (progress < 1 || button.classList.contains("is-ready")) return;
      button.classList.remove("is-growing");
      button.classList.add("is-ready");
      const plant = button.querySelector(".kayo-farm-plant");
      if (plant) plant.src = data.imagePaths.grownSprout;
      if (!button.querySelector(".kayo-farm-ready-sparkle")) {
        button.insertAdjacentHTML("beforeend", '<span class="kayo-farm-ready-sparkle"><i></i><i></i><i></i><i></i><i></i><i></i></span>');
      }
    });
  }

  function render() {
    if (!shell || !state) return;
    renderInventory(shell.seedList, "seeds", true);
    renderInventory(shell.cropList, "crops", false);
    renderSelectedSeed();
    renderSpikes();
    renderField();
    renderTrucks();
  }

  function renderInventory(container, mapName, selectable) {
    container.innerHTML = "";
    data.crops.forEach((crop) => {
      const count = state[mapName][crop.id] || 0;
      if (count <= 0) return;
      const item = document.createElement(selectable ? "button" : "div");
      item.className = `kayo-farm-inventory-item${selectable && state.selectedSeedId === crop.id ? " is-selected" : ""}`;
      if (selectable) item.type = "button";
      item.innerHTML = `
        <img src="${selectable ? crop.seedImage : crop.cropImage}" alt="">
        <span>${selectable ? crop.seedName : crop.cropName}</span>
        <strong>${count}</strong>
      `;
      if (selectable) {
        item.addEventListener("click", () => {
          state.selectedSeedId = state.selectedSeedId === crop.id ? "" : crop.id;
          saveState();
          render();
        });
      }
      container.appendChild(item);
    });
    if (!container.children.length) {
      const empty = document.createElement("div");
      empty.className = "kayo-farm-empty";
      empty.textContent = "なし";
      container.appendChild(empty);
    }
  }

  function renderSelectedSeed() {
    const selected = state.selectedSeedId ? cropById[state.selectedSeedId] : null;
    if (!selected) {
      shell.selected.innerHTML = `<span class="kayo-farm-selected-empty">種を選ぶと育つ作物を確認できます</span>`;
      return;
    }
    shell.selected.innerHTML = `
      <span class="kayo-farm-selected-label">装備中</span>
      <span class="kayo-farm-selected-item">
        <img src="${selected.seedImage}" alt="">
        <strong>${selected.seedName}の種</strong>
      </span>
      <span class="kayo-farm-selected-arrow">→</span>
      <span class="kayo-farm-selected-item">
        <img src="${selected.cropImage}" alt="">
        <strong>${selected.cropName}</strong>
      </span>
    `;
  }

  function renderSpikes() {
    shell.spikes.innerHTML = `
      <h3>拡張スパイク</h3>
      <div class="kayo-farm-spike-count">
        <img src="${data.imagePaths.spike}" alt="">
        <div><strong>${state.spikes}</strong><span>拡張スパイク</span></div>
      </div>
    `;
  }

  function renderField() {
    shell.field.innerHTML = "";
    for (let block = 0; block < 4; block += 1) {
      const blockEl = document.createElement("div");
      blockEl.className = "kayo-farm-pot-block";
      for (let i = 0; i < data.farm.potsPerBlock; i += 1) {
        const index = block * data.farm.potsPerBlock + i;
        if (index < state.unlockedPots || index === state.unlockedPots) {
          blockEl.appendChild(renderPot(index));
        }
      }
      if (blockEl.children.length) shell.field.appendChild(blockEl);
    }
  }

  function renderPot(index) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "kayo-farm-pot";
    button.dataset.potIndex = String(index);
    if (index >= state.unlockedPots) {
      button.classList.add("is-next");
      button.disabled = state.spikes < data.farm.potUnlockSpikeCost || state.unlockedPots >= data.farm.maxPots;
      button.innerHTML = `
        <img class="kayo-farm-pot-base" src="${data.imagePaths.pot}" alt="">
        <span class="kayo-farm-unlock-label">解放する</span>
      `;
      button.addEventListener("click", unlockNextPot);
      return button;
    }
    const pot = state.pots[index];
    button.innerHTML = `<img class="kayo-farm-pot-base" src="${data.imagePaths.pot}" alt="">`;
    if (!pot) {
      button.classList.add("is-empty");
      button.addEventListener("click", () => plantSeed(index));
      return button;
    }
    const progress = getGrowthProgress(pot);
    const plantImage = progress >= 1 ? data.imagePaths.grownSprout : data.imagePaths.sprout;
    button.classList.add(progress >= 1 ? "is-ready" : "is-growing");
    button.insertAdjacentHTML("beforeend", `
      <img class="kayo-farm-plant" src="${plantImage}" alt="">
      <div class="kayo-farm-grow-bar"><span style="width:${Math.round(progress * 100)}%"></span></div>
      ${progress >= 1 ? '<span class="kayo-farm-ready-sparkle"><i></i><i></i><i></i><i></i><i></i><i></i></span>' : ""}
    `);
    button.addEventListener("click", () => {
      if (getGrowthProgress(pot) >= 1) harvestPot(index, true);
    });
    return button;
  }

  function getGrowthProgress(pot) {
    return Math.max(0, Math.min(1, (Date.now() - pot.plantedAt) / data.timings.cropGrowthMs));
  }

  function plantSeed(index) {
    const seedId = state.selectedSeedId;
    if (!seedId || (state.seeds[seedId] || 0) <= 0 || state.pots[index]) return;
    state.seeds[seedId] -= 1;
    state.pots[index] = { seedId, plantedAt: Date.now() };
    rememberSeed(seedId);
    saveState();
    render();
  }

  async function unlockNextPot() {
    if (state.unlockedPots >= data.farm.maxPots) return;
    if (state.spikes < data.farm.potUnlockSpikeCost) return;
    const committed = await commitSpikeChange("unlock-pot", -data.farm.potUnlockSpikeCost, state.unlockedPots + 1);
    if (!committed?.ok) return;
    state.unlockedPots += 1;
    completeSpikeOperation(committed.operationKey);
    saveState();
    render();
  }

  async function harvestPot(index, showResult) {
    const pot = state.pots[index];
    if (!pot || getGrowthProgress(pot) < 1) return [];
    const operationKey = `harvest:${index}:${pot.plantedAt}`;
    const pending = state.pendingSpikeOperations?.[operationKey];
    const results = Array.isArray(pending?.harvestResults) ? pending.harvestResults : buildHarvestResults(pot.seedId);
    const spikeReward = results.filter((item) => item.kind === "spike").reduce((sum, item) => sum + Math.max(0, Number(item.count) || 0), 0);
    let spikeCommit = null;
    if (spikeReward > 0) {
      spikeCommit = await commitSpikeChange("harvest", spikeReward, `${index}:${pot.plantedAt}`, { harvestResults: results });
      if (!spikeCommit?.ok) return [];
    }
    applyHarvestResults(results);
    state.pots[index] = null;
    if (spikeCommit?.operationKey) completeSpikeOperation(spikeCommit.operationKey);
    saveState();
    if (showResult) showResults("収穫結果", results);
    render();
    return results;
  }

  async function harvestReadyAll() {
    const results = [];
    for (let index = 0; index < state.pots.length; index += 1) {
      const pot = state.pots[index];
      if (pot && getGrowthProgress(pot) >= 1) {
        results.push(...await harvestPot(index, false));
      }
    }
    if (results.length) showResults("まとめて収穫", mergeResults(results));
    render();
  }

  function buildHarvestResults(seedId) {
    const crop = cropById[seedId];
    const results = [{ kind: "crop", id: seedId, name: crop.cropName, image: crop.cropImage, count: 1 }];
    const rules = seedId === "chamber" ? data.harvestRules.chamber : data.harvestRules.normal;
    let roll = Math.random();
    const rule = rules.find((item) => {
      roll -= item.chance;
      return roll <= 0;
    }) || rules[rules.length - 1];
    if (rule.sameSeed) results.push({ kind: "seed", id: seedId, name: `${crop.seedName}の種`, image: crop.seedImage, count: rule.sameSeed });
    if (rule.nextSeed && data.crops[crop.index + 1]) {
      const next = data.crops[crop.index + 1];
      results.push({ kind: "seed", id: next.id, name: `${next.seedName}の種`, image: next.seedImage, count: rule.nextSeed });
    }
    if (rule.spike) results.push({ kind: "spike", id: "spike", name: data.expansion.spikeName, image: data.imagePaths.spike, count: rule.spike });
    return results;
  }

  function applyHarvestResults(results) {
    results.forEach((item) => {
      if (item.kind === "crop") state.crops[item.id] = (state.crops[item.id] || 0) + item.count;
      if (item.kind === "seed") {
        state.seeds[item.id] = (state.seeds[item.id] || 0) + item.count;
        rememberSeed(item.id);
      }
      // Spike rewards are committed remotely before local farm rewards are applied.
    });
  }

  function mergeResults(results) {
    const map = new Map();
    results.forEach((item) => {
      const key = `${item.kind}:${item.id}`;
      if (!map.has(key)) map.set(key, Object.assign({}, item));
      else map.get(key).count += item.count;
    });
    return [...map.values()];
  }

  function rememberSeed(seedId) {
    if (isCropId(seedId) && !state.knownSeedIds.includes(seedId)) state.knownSeedIds.push(seedId);
  }

  function renderTrucks() {
    shell.trucks.innerHTML = "<h3>トラック</h3>";
    const list = document.createElement("div");
    list.className = "kayo-farm-truck-list";
    for (let i = 1; i <= data.truck.maxTrucks; i += 1) {
      if (i <= state.unlockedTrucks) {
        list.appendChild(renderTruck(state.trucks[i - 1]));
      } else if (i === state.unlockedTrucks + 1) {
        list.appendChild(renderTruckUnlock(i));
      } else {
        list.appendChild(renderTruckBay(i));
      }
    }
    shell.trucks.appendChild(list);
  }

  function renderTruckBay(truckNumber) {
    const card = document.createElement("div");
    card.className = "kayo-farm-truck is-empty-bay";
    card.dataset.truckId = String(truckNumber);
    card.innerHTML = `<div class="kayo-farm-bay-label">出発場 ${truckNumber}</div>`;
    return card;
  }

  function renderTruck(truck) {
    const card = document.createElement("div");
    const isDeparting = truck.departingUntil > Date.now();
    const isReturning = !isDeparting && truck.returningUntil > Date.now();
    card.className = `kayo-farm-truck${isDeparting ? " is-departing" : ""}${isReturning ? " is-returning" : ""}`;
    card.dataset.truckId = String(truck.id);
    const visual = `
      <div class="kayo-farm-truck-visual">
        <img class="kayo-farm-truck-image" src="${data.imagePaths.truck}" alt="">
        ${isDeparting ? `<img class="kayo-farm-box-image" src="${data.imagePaths.box}" alt="">` : ""}
      </div>
    `;
    if (!truck.order) {
      const remain = Math.max(0, Math.ceil((truck.restingUntil - Date.now()) / 1000));
      card.innerHTML = `${visual}<div class="kayo-farm-truck-info is-resting"><span class="kayo-farm-rest-remaining">運搬中　残り ${remain}秒</span></div>`;
      const info = card.querySelector(".kayo-farm-truck-info");
      if (truck.nextOrder) appendOrderPreview(info, truck.nextOrder, "次回注文", false);
      return card;
    }
    card.innerHTML = `${visual}<div class="kayo-farm-truck-info"></div>`;
    const info = card.querySelector(".kayo-farm-truck-info");
    appendOrderPreview(info, truck.order, "", true);
    const deliver = document.createElement("button");
    deliver.type = "button";
    deliver.className = "kayo-farm-deliver";
    deliver.textContent = "納品";
    deliver.disabled = !canDeliver(truck.order);
    deliver.addEventListener("click", () => deliverTruck(truck.id));
    info.appendChild(deliver);
    return card;
  }

  function appendOrderPreview(info, order, title, showOwned) {
    if (title) {
      const heading = document.createElement("strong");
      heading.textContent = title;
      info.appendChild(heading);
    }
    order.requirements.forEach((req) => {
      const crop = cropById[req.cropId];
      const owned = state.crops[req.cropId] || 0;
      const row = document.createElement("div");
      row.className = owned < req.count ? "kayo-farm-requirement is-missing" : "kayo-farm-requirement";
      row.textContent = showOwned ? `${crop.cropName} ${owned}/${req.count}` : `${crop.cropName} ×${req.count}`;
      info.appendChild(row);
    });
    const reward = document.createElement("div");
    reward.className = "kayo-farm-reward";
    reward.textContent = `報酬: ${formatReward(order.reward)}`;
    info.appendChild(reward);
  }

  function renderTruckUnlock(truckNumber) {
    const cost = data.truck.unlockSpikeCosts[truckNumber];
    const card = document.createElement("div");
    card.className = "kayo-farm-truck is-next";
    card.dataset.truckId = String(truckNumber);
    card.innerHTML = `
      <div class="kayo-farm-truck-visual">
        <img class="kayo-farm-truck-image" src="${data.imagePaths.truck}" alt="">
      </div>
      <div class="kayo-farm-truck-info">
        <strong>${truckNumber}台目</strong>
        <span>拡張スパイク ${cost}個</span>
      </div>
    `;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "kayo-farm-unlock-truck";
    button.textContent = "解放する";
    button.disabled = state.spikes < cost;
    button.addEventListener("click", () => unlockTruck(truckNumber));
    card.querySelector(".kayo-farm-truck-info").appendChild(button);
    return card;
  }

  async function unlockTruck(truckNumber) {
    const cost = data.truck.unlockSpikeCosts[truckNumber];
    if (!cost || truckNumber !== state.unlockedTrucks + 1 || state.spikes < cost) return;
    const committed = await commitSpikeChange("unlock-truck", -cost, truckNumber);
    if (!committed?.ok) return;
    state.unlockedTrucks = truckNumber;
    completeSpikeOperation(committed.operationKey);
    state.trucks[truckNumber - 1] = createTruck(truckNumber);
    saveState();
    render();
  }

  function canDeliver(order) {
    return order.requirements.every((req) => (state.crops[req.cropId] || 0) >= req.count);
  }

  function deliverTruck(truckId) {
    const truck = state.trucks[truckId - 1];
    if (!truck?.order || !canDeliver(truck.order)) return;
    truck.order.requirements.forEach((req) => {
      state.crops[req.cropId] -= req.count;
    });
    const rewardResults = grantReward(truck.order.reward);
    truck.nextOrder = createOrder(state, truck.id);
    truck.order = null;
    truck.departingUntil = Date.now() + 900;
    truck.restingUntil = Date.now() + getTruckRestMs();
    saveState();
    render();
    showResults("納品報酬", rewardResults);
  }

  function grantReward(reward) {
    const amount = Math.max(0, Math.floor(Number(reward?.count) || 0));
    const results = [];
    if (amount) {
      results.push({ kind: "reward", id: "cookies", name: `クッキー ${amount}`, image: data.imagePaths.cookie || "img/その他/クッキー.png", count: 1 });
    }
    if (window.collectionGame?.addCookies) {
      window.collectionGame.addCookies(amount, "K/AYO畑 納品報酬");
    } else if (window.collectionGame?.addRewards) {
      window.collectionGame.addRewards({ cookies: amount }, "K/AYO畑 納品報酬");
    }
    return results;
  }

  function formatReward(reward) {
    return `クッキー ${reward.count}`;
  }

  function getTruckRestMs() {
    return window.collectionGame?.getKayoTruckRestMs ? window.collectionGame.getKayoTruckRestMs() : data.timings.truckRestMs;
  }

  function showResults(title, items) {
    if (!items.length) return;
    const overlay = document.createElement("div");
    overlay.className = "kayo-farm-result";
    overlay.innerHTML = `
      <div class="kayo-farm-result-box">
        <h3>${title}</h3>
        <div class="kayo-farm-result-list"></div>
        <button type="button" class="kayo-farm-result-close">閉じる</button>
      </div>
    `;
    const list = overlay.querySelector(".kayo-farm-result-list");
    items.forEach((item) => {
      const row = document.createElement("div");
      row.className = "kayo-farm-result-item";
      row.innerHTML = `${item.image ? `<img src="${item.image}" alt="">` : ""}<span>${item.name}${item.kind === "reward" ? "" : ` x${item.count}`}</span>`;
      list.appendChild(row);
    });
    overlay.querySelector(".kayo-farm-result-close").addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
  }

  function injectStyles() {
    if (document.getElementById("kayoFarmStyles")) return;
    const style = document.createElement("style");
    style.id = "kayoFarmStyles";
    style.textContent = `
      .kayo-farm-overlay{position:fixed;inset:0;z-index:2100;display:flex;align-items:center;justify-content:center;background:rgba(2,4,8,.72);padding:18px}
      .kayo-farm-panel{width:min(1180px,97vw);max-height:93vh;overflow:auto;color:#ece8e1;background:#0f1117;border:1px solid #ff4655;box-shadow:0 22px 70px rgba(0,0,0,.62),inset 0 0 0 1px rgba(255,255,255,.06);padding:16px;clip-path:polygon(0 0,calc(100% - 22px) 0,100% 22px,100% 100%,22px 100%,0 calc(100% - 22px))}
      .kayo-farm-header{display:flex;align-items:end;justify-content:space-between;gap:14px;margin-bottom:12px;border-bottom:1px solid rgba(255,70,85,.38);padding-bottom:10px}
      .kayo-farm-header-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}
      .kayo-farm-header h2{margin:0;font-size:24px;letter-spacing:0;color:#fff}
      .kayo-farm-kicker{font-size:11px;font-weight:800;color:#ff4655}
      .kayo-farm-layout{display:grid;grid-template-columns:210px minmax(360px,1fr) 210px;grid-template-areas:"seeds field crops" "spikes trucks trucks";gap:12px}
      .kayo-farm-card,.kayo-farm-field-card{background:#171a22;border:1px solid rgba(236,232,225,.18);box-shadow:inset 0 0 0 1px rgba(255,255,255,.03);padding:10px}
      .kayo-farm-card h3{margin:0 0 8px;font-size:14px;color:#ece8e1}
      .kayo-farm-seeds{grid-area:seeds}.kayo-farm-crops{grid-area:crops}.kayo-farm-spikes{grid-area:spikes}.kayo-farm-trucks{grid-area:trucks}.kayo-farm-field-card{grid-area:field}
      .kayo-farm-inventory-item{display:grid;grid-template-columns:30px 1fr auto;align-items:center;gap:8px;width:100%;margin:5px 0;padding:6px;border:1px solid rgba(236,232,225,.14);background:#20242e;color:#ece8e1;text-align:left;box-shadow:none}
      button.kayo-farm-inventory-item{cursor:pointer}.kayo-farm-seeds .kayo-farm-inventory-item{border-color:rgba(236,232,225,.14);background:#20242e;box-shadow:none}.kayo-farm-seeds .kayo-farm-inventory-item.is-selected{border-color:rgba(255,255,255,.86);background:#2a2f38;box-shadow:0 0 10px rgba(255,255,255,.18);color:#fff}.kayo-farm-seeds .kayo-farm-inventory-item.is-selected::after{content:"✓";display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border:1px solid rgba(255,255,255,.8);border-radius:50%;color:#fff;font-size:12px}.kayo-farm-inventory-item img,.kayo-farm-spike-count img{width:32px;height:32px;object-fit:contain}.kayo-farm-seeds .kayo-farm-inventory-item > img{width:18px!important;height:18px!important;max-width:18px!important;max-height:18px!important}
      .kayo-farm-empty{color:#8f95a3;font-size:13px}.kayo-farm-selected{min-height:50px;margin-bottom:8px;display:flex;align-items:center;justify-content:center;gap:9px;padding:7px 10px;border:1px solid rgba(236,232,225,.14);background:#171b23;color:#dce6f7}.kayo-farm-selected-label{color:#9ea7b5;font-size:11px;font-weight:800}.kayo-farm-selected-item{display:flex;align-items:center;gap:6px;min-width:0}.kayo-farm-selected-item img{width:34px;height:34px;object-fit:contain}.kayo-farm-selected-item strong{font-size:13px;white-space:nowrap}.kayo-farm-selected-arrow{color:#ffd166;font-size:20px;font-weight:900}.kayo-farm-selected-empty{color:#9ea7b5;font-size:13px}
      .kayo-farm-field{display:grid;grid-template-columns:repeat(4,minmax(78px,1fr));gap:10px;min-height:430px;padding:12px;background:#10131a url("asset://img/その他/床タイル.png") center/128px repeat;border:1px solid rgba(255,255,255,.08)}
      .kayo-farm-pot-block{display:grid;grid-template-columns:repeat(2,1fr);grid-template-rows:repeat(4,82px);gap:6px;align-content:start}
      .kayo-farm-pot{position:relative;min-width:0;border:1px solid rgba(236,232,225,.16);background:rgba(9,12,16,.62);color:#ece8e1;overflow:hidden;cursor:pointer;box-shadow:none}
      .kayo-farm-pot-base{position:absolute;inset:8px;width:calc(100% - 16px);height:calc(100% - 16px);object-fit:contain}
      .kayo-farm-plant{position:absolute;left:50%;top:43%;width:48px;height:48px;object-fit:contain;transform:translate(-50%,-50%);filter:drop-shadow(0 4px 8px rgba(0,0,0,.6))}
      .kayo-farm-pot.is-next{opacity:.46;border-style:dashed}.kayo-farm-pot.is-next:disabled{cursor:not-allowed}.kayo-farm-unlock-label{position:absolute;left:50%;bottom:8px;transform:translateX(-50%);padding:4px 7px;background:#303746;color:#fff;font-size:12px;font-weight:800;white-space:nowrap}
      .kayo-farm-pot.is-ready{border-color:rgba(255,255,255,.28);box-shadow:none}.kayo-farm-ready-sparkle{position:absolute;inset:0;pointer-events:none}.kayo-farm-ready-sparkle i{position:absolute;width:14px;height:14px;color:#fff;font-style:normal;font-size:14px;line-height:14px;text-shadow:0 0 8px rgba(255,255,255,.95);animation:kayoFarmDiamond 1.25s ease-in-out infinite}.kayo-farm-ready-sparkle i::before{content:"♦"}.kayo-farm-ready-sparkle i:nth-child(1){left:18%;top:18%;animation-delay:0s}.kayo-farm-ready-sparkle i:nth-child(2){right:18%;top:16%;animation-delay:.15s}.kayo-farm-ready-sparkle i:nth-child(3){left:12%;top:48%;animation-delay:.3s}.kayo-farm-ready-sparkle i:nth-child(4){right:12%;top:48%;animation-delay:.45s}.kayo-farm-ready-sparkle i:nth-child(5){left:25%;bottom:14%;animation-delay:.6s}.kayo-farm-ready-sparkle i:nth-child(6){right:25%;bottom:14%;animation-delay:.75s}.kayo-farm-grow-bar{position:absolute;left:8px;right:8px;bottom:6px;height:5px;background:#303642}.kayo-farm-grow-bar span{display:block;height:100%;background:#d8e3ef}@keyframes kayoFarmDiamond{50%{opacity:.35;transform:translateY(-3px) scale(.82)}}
      .kayo-farm-harvest-all,.kayo-farm-close,.kayo-farm-deliver,.kayo-farm-unlock-truck,.kayo-farm-result-close{border:1px solid #ff4655;background:#ff4655;color:#fff;font-weight:800;padding:7px 10px;cursor:pointer}
      .kayo-farm-close{background:#232833;border-color:rgba(236,232,225,.32)}
      .kayo-farm-harvest-all:disabled,.kayo-farm-deliver:disabled,.kayo-farm-unlock-truck:disabled{background:#454b55;border-color:#5d6470;color:#aeb4bd;cursor:not-allowed}
      .kayo-farm-spike-count{display:flex;align-items:center;gap:10px}.kayo-farm-spike-count strong{display:block;font-size:24px}.kayo-farm-spike-count span{font-size:12px;color:#aeb4bd}
      .kayo-farm-truck-list{display:grid;grid-template-columns:repeat(5,minmax(150px,1fr));grid-auto-rows:210px;align-items:stretch;gap:10px}.kayo-farm-truck{position:relative;height:210px;min-height:210px;max-height:210px;box-sizing:border-box;background:#20242e;border:1px solid rgba(236,232,225,.17);padding:8px;overflow:hidden;display:grid;grid-template-rows:82px minmax(0,1fr)}.kayo-farm-truck.is-next{opacity:.54}.kayo-farm-truck.is-empty-bay{background:rgba(32,36,46,.42);border-style:dashed}.kayo-farm-bay-label{height:100%;display:flex;align-items:center;justify-content:center;color:#6f7785;font-weight:800;grid-row:1 / -1}
      .kayo-farm-truck-visual{position:relative;height:78px;margin-bottom:4px;overflow:visible}.kayo-farm-truck-image{position:absolute;left:50%;top:0;width:124px;height:78px;object-fit:contain;transform:translateX(-50%) rotate(180deg)}.kayo-farm-box-image{position:absolute;left:50%;top:39px;width:38px;height:30px;object-fit:contain;transform:translateX(-50%)}
      .kayo-farm-truck.is-departing .kayo-farm-truck-visual{animation:kayoFarmDepartDown .9s ease-in forwards}.kayo-farm-truck.is-returning .kayo-farm-truck-visual{animation:kayoFarmReturnUp .42s ease-out both}@keyframes kayoFarmDepartDown{to{transform:translateY(145%);opacity:.1}}@keyframes kayoFarmReturnUp{from{transform:translateY(88%);opacity:.2}to{transform:translateY(0);opacity:1}}
      .kayo-farm-truck-info{display:flex;flex-direction:column;gap:3px;font-size:12px;min-height:0;overflow:hidden;padding-right:0}.kayo-farm-truck-info strong,.kayo-farm-truck-info span,.kayo-farm-requirement,.kayo-farm-reward{line-height:1.16}.kayo-farm-truck-info.is-resting{align-items:center;justify-content:center;text-align:center;color:#d8e3ef;font-weight:800}.kayo-farm-requirement{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.kayo-farm-requirement.is-missing{color:#ff8a92;font-weight:800}.kayo-farm-reward{color:#ffd166;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.kayo-farm-deliver,.kayo-farm-unlock-truck{margin-top:auto;padding:5px 8px}
      .kayo-farm-result{position:fixed;inset:0;z-index:2200;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.62);padding:16px}.kayo-farm-result-box{width:min(520px,92vw);background:#171a22;border:1px solid #ff4655;color:#ece8e1;padding:16px}.kayo-farm-result-box h3{margin:0 0 10px}.kayo-farm-result-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:12px}.kayo-farm-result-item{display:flex;align-items:center;gap:8px;background:#20242e;padding:8px}.kayo-farm-result-item img{width:34px;height:34px;object-fit:contain}
      @media (max-width:860px){.kayo-farm-layout{grid-template-columns:1fr;grid-template-areas:"field" "seeds" "crops" "spikes" "trucks"}.kayo-farm-field{grid-template-columns:1fr}.kayo-farm-pot-block{grid-template-columns:repeat(4,1fr);grid-template-rows:repeat(2,82px)}.kayo-farm-truck-list{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function bindButton() {
    const button = document.getElementById("kayoFarmButton");
    if (button) button.addEventListener("click", openFarm);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindButton);
  } else {
    bindButton();
  }

  window.kayoFarm = {
    open: openFarm,
    close: closeFarm,
    getState: () => loadState(),
    getSpikes: () => {
      loadState();
      return Math.max(0, Number(state.spikes) || 0);
    },
    applyCloudSpikeBalance,
    syncCloudSpikes: ensureCloudSpikes
  };
})();
