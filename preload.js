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
  setWindowOpacity: (opacity) => ipcRenderer.invoke("set-window-opacity", opacity),
  getCurrentAccountInfo: () => ipcRenderer.invoke("get-current-account-info"),
  checkAdminPin: (pin) => ipcRenderer.invoke("firebase-check-admin-pin", pin),
  syncFirebaseAccount: (inventory) => ipcRenderer.invoke("firebase-sync-account", inventory),
  listFirebaseUsers: () => ipcRenderer.invoke("firebase-list-users"),
  grantFirebaseUser: (puuid, rewards) => ipcRenderer.invoke("firebase-grant-user", puuid, rewards),
  confiscateFirebaseUserItems: (puuid, rewards) => ipcRenderer.invoke("firebase-confiscate-user-items", puuid, rewards),
  banFirebaseUser: (puuid) => ipcRenderer.invoke("firebase-ban-user", puuid),
  allowFirebaseUser: (puuid) => ipcRenderer.invoke("firebase-allow-user", puuid),
  sendFirebaseMessage: (puuid, message) => ipcRenderer.invoke("firebase-send-message", puuid, message),
  sendFirebaseItem: (puuid, rewards) => ipcRenderer.invoke("firebase-send-item", puuid, rewards),
  sendFirebaseBulkMessage: (title, message) => ipcRenderer.invoke("firebase-bulk-message", title, message),
  sendFirebaseBulkItem: (rewards) => ipcRenderer.invoke("firebase-bulk-item", rewards),
  deleteFirebaseInboxItem: (documentName) => ipcRenderer.invoke("firebase-delete-inbox-item", documentName),
  onPlayersProgress: (callback) => {
    ipcRenderer.removeAllListeners("players-progress");
    ipcRenderer.on("players-progress", (_event, payload) => callback(payload));
  },
  onAutoStatus: (callback) => {
    ipcRenderer.removeAllListeners("auto-status");
    ipcRenderer.on("auto-status", (_event, payload) => callback(payload));
  },
});





