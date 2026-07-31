const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("valorantApi", {
  readLockfile: () => ipcRenderer.invoke("read-lockfile"),
  getSession: () => ipcRenderer.invoke("get-session"),
  getCurrentGame: () => ipcRenderer.invoke("get-current-game"),
  getCurrentPlayers: () => ipcRenderer.invoke("get-current-players"),
  getCompetitiveKpMatches: () => ipcRenderer.invoke("get-competitive-kp-matches"),
  claimCompetitiveKp: (matchId) => ipcRenderer.invoke("claim-competitive-kp", matchId),

  startAutoWatch: (inventory) => ipcRenderer.invoke("start-auto-watch", inventory),
  stopAutoWatch: () => ipcRenderer.invoke("stop-auto-watch"),
  getAppSettings: () => ipcRenderer.invoke("get-app-settings"),
  getAppReleaseInfo: () => ipcRenderer.invoke("get-app-release-info"),
  chooseRiotClientFolder: () => ipcRenderer.invoke("choose-riot-client-folder"),
  clearRiotClientFolder: () => ipcRenderer.invoke("clear-riot-client-folder"),
  setWindowOpacity: (opacity) => ipcRenderer.invoke("set-window-opacity", opacity),
  getGoogleSession: () => ipcRenderer.invoke("google-get-session"),
  startGoogleLogin: () => ipcRenderer.invoke("google-start-login"),
  signOutGoogle: () => ipcRenderer.invoke("google-sign-out"),
  linkGoogleCurrentPuuid: () => ipcRenderer.invoke("google-link-current-puuid"),
  getGoogleProgress: () => ipcRenderer.invoke("google-get-progress"),
  checkGoogleAccountStatus: () => ipcRenderer.invoke("google-check-account-status"),
  migrateGoogleProgress: (state) => ipcRenderer.invoke("google-migrate-progress", state),
  saveGoogleProgress: (state, expectedRevision) => ipcRenderer.invoke("google-save-progress", state, expectedRevision),
  applyGoogleCollectionOperation: (operation) => ipcRenderer.invoke("google-apply-collection-operation", operation),
  claimGoogleMatchReward: (payload) => ipcRenderer.invoke("google-claim-match-reward", payload),
  markCompetitiveKpClaimed: (matchId) => ipcRenderer.invoke("mark-competitive-kp-claimed", matchId),
  registerGoogleNickname: (nickname, change) => ipcRenderer.invoke("google-register-nickname", nickname, change),
  completeGoogleOnboarding: (consent) => ipcRenderer.invoke("google-complete-onboarding", consent),
  saveGoogleAvatarPhoto: (photoDataUrl, deviceLabel) => ipcRenderer.invoke("google-save-avatar-photo", photoDataUrl, deviceLabel),
  setCameraAccessScope: (scope) => ipcRenderer.invoke("set-camera-access-scope", scope),
  installDownloadedUpdate: () => ipcRenderer.invoke("install-downloaded-update"),
  getCurrentAccountInfo: () => ipcRenderer.invoke("get-current-account-info"),
  quitApp: () => ipcRenderer.invoke("quit-app"),
  syncFirebaseAccount: (inventory) => ipcRenderer.invoke("firebase-sync-account", inventory),
  markGoogleInboxRead: (documentName) => ipcRenderer.invoke("google-mark-inbox-read", documentName),
  claimGoogleInboxItem: (documentName) => ipcRenderer.invoke("google-claim-inbox-item", documentName),
  prepareGoogleInboxDelete: (documentName) => ipcRenderer.invoke("google-prepare-inbox-delete", documentName),
  deleteGoogleInboxItem: (documentName, updateTime) => ipcRenderer.invoke("google-delete-inbox-item", documentName, updateTime),
  getGoogleInboxPage: (pageToken) => ipcRenderer.invoke("google-get-inbox-page", pageToken),
  getWeeklyRanking: () => ipcRenderer.invoke("google-get-weekly-ranking"),
  getShopProfile: () => ipcRenderer.invoke("shop-get-profile"),
  listShopListings: () => ipcRenderer.invoke("shop-list-listings"),
  createShopListing: (listing, operationId, expectedUid) => ipcRenderer.invoke("shop-create-listing", listing, operationId, expectedUid),
  cancelShopListing: (listingId, operationId, expectedUid) => ipcRenderer.invoke("shop-cancel-listing", listingId, operationId, expectedUid),
  buyShopListing: (listingId, buyerState, operationId, expectedUid) => ipcRenderer.invoke("shop-buy-listing", listingId, buyerState, operationId, expectedUid),
  claimShopPendingKp: () => ipcRenderer.invoke("shop-claim-pending-kp"),
  syncShopSlotsUnlocked: (slots) => ipcRenderer.invoke("shop-sync-slots-unlocked", slots),
  syncFarmSpikes: (localSpikes) => ipcRenderer.invoke("farm-sync-spikes", localSpikes),
  applyFarmSpikeOperation: (operation) => ipcRenderer.invoke("farm-apply-spike-operation", operation),
  getAssetStatus: () => ipcRenderer.invoke("get-asset-status"),
  assetUrl: (relativePath) => {
    const normalized = String(relativePath || "").replace(/^\.\//, "").replace(/\\/g, "/");
    return normalized.startsWith("img/") ? `asset://${encodeURI(normalized)}` : normalized;
  },
  onPlayersProgress: (callback) => {
    ipcRenderer.removeAllListeners("players-progress");
    ipcRenderer.on("players-progress", (_event, payload) => callback(payload));
  },
  onAutoStatus: (callback) => {
    ipcRenderer.removeAllListeners("auto-status");
    ipcRenderer.on("auto-status", (_event, payload) => callback(payload));
  },
  onUpdateStatus: (callback) => {
    ipcRenderer.removeAllListeners("update-status");
    ipcRenderer.on("update-status", (_event, payload) => callback(payload));
  },
  onAssetsUpdated: (callback) => {
    ipcRenderer.removeAllListeners("assets-updated");
    ipcRenderer.on("assets-updated", (_event, payload) => callback(payload));
  }
});





