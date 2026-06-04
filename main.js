const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("fs");
const path = require("path");

const {
  claimCompetitiveKp,
  configureTrackerCore,
  getCompetitiveKpMatches,
  getCurrentAccountInfo,
  getCurrentGameContext,
  getCurrentPlayersData,
  readLockfileData,
  startAutoWatch,
  stopAutoWatch
} = require("./tracker-core");

const firebaseAdmin = require("./firebase");
const packageInfo = require("./package.json");

let autoUpdater = null;
try {
  autoUpdater = require("electron-updater").autoUpdater;
} catch (error) {
  autoUpdater = null;
}

app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-gpu-compositing");
app.commandLine.appendSwitch("in-process-gpu");

let mainWindow = null;
const accountAccessCache = new Map();

const DEFAULT_SETTINGS = { opacity: 1 };

function getSettingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function loadSettings() {
  try {
    const settingsPath = getSettingsPath();
    if (!fs.existsSync(settingsPath)) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(settingsPath, "utf8")) };
  } catch (error) {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2), "utf8");
  } catch (error) {}
}

function normalizeOpacity(value) {
  const opacity = Number(value);
  if (!Number.isFinite(opacity)) return 1;
  return Math.max(0.3, Math.min(1, opacity));
}

function applyWindowOpacity(value) {
  const opacity = normalizeOpacity(value);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setOpacity(opacity);
  }
  saveSettings({ ...loadSettings(), opacity });
  return opacity;
}

function normalizeInventory(inventory = {}) {
  return {
    kp: Math.max(0, Number(inventory.kp) || 0),
    ap: Math.max(0, Number(inventory.ap) || 0),
    ticket15: Math.max(0, Number(inventory.ticket15) || 0),
    ticket2: Math.max(0, Number(inventory.ticket2) || 0),
    trackerLevel: Math.max(0, Number(inventory.trackerLevel) || 0),
    ownedCharacterCount: Math.max(0, Number(inventory.ownedCharacterCount) || 0),
    series4Unlocked: Boolean(inventory.series4Unlocked),
    skillsJson: String(inventory.skillsJson || "{}"),
    eggJson: String(inventory.eggJson || "null"),
    ownedCharacterIdsJson: String(inventory.ownedCharacterIdsJson || "[]"),
    characterCountsJson: String(inventory.characterCountsJson || "{}"),
    appVersion: String(packageInfo.version || "")
  };
}

async function checkAccountAccess(account = {}) {
  if (!account.puuid) return { ok: true };
  const status = accountAccessCache.get(account.puuid);
  return status === "blocked"
    ? { ok: false, blocked: true, message: "このアカウントは利用停止中です。" }
    : { ok: true };
}

function sendPlayersProgress(payload) {
  const win = mainWindow || BrowserWindow.getAllWindows()[0];
  if (!win || win.isDestroyed()) return;
  win.webContents.send("players-progress", payload);
}

function sendAutoStatus(payload) {
  const win = mainWindow || BrowserWindow.getAllWindows()[0];
  if (!win || win.isDestroyed()) return;
  win.webContents.send("auto-status", payload);
}

function setupAutoUpdater() {
  if (!autoUpdater || !app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("error", () => {});
  autoUpdater.on("update-downloaded", () => {
    setTimeout(() => {
      try {
        autoUpdater.quitAndInstall(false, true);
      } catch (error) {}
    }, 1200);
  });

  setTimeout(() => {
    try {
      autoUpdater.checkForUpdatesAndNotify();
    } catch (error) {}
  }, 3000);
}

function createWindow() {
  const settings = loadSettings();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 760,
    minHeight: 430,
    backgroundColor: "#080b12",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  configureTrackerCore({
    userDataPath: app.getPath("userData"),
    sendPlayersProgress,
    sendAutoStatus,
    checkAccountAccess
  });

  mainWindow.loadFile("index.html");
  applyWindowOpacity(settings.opacity);
  setupAutoUpdater();
}

ipcMain.handle("read-lockfile", async () => readLockfileData());

ipcMain.handle("get-session", async () => {
  const context = await getCurrentGameContext();
  return context.ok ? { ok: true, puuid: context.puuid, mode: context.modeLabel } : context;
});

ipcMain.handle("get-current-game", async () => getCurrentGameContext());
ipcMain.handle("get-current-players", async () => getCurrentPlayersData({ auto: false }));
ipcMain.handle("get-competitive-kp-matches", async () => getCompetitiveKpMatches());
ipcMain.handle("claim-competitive-kp", async (_event, matchId) => claimCompetitiveKp(matchId));
ipcMain.handle("refresh-competitive-kp-window", async () => {
  const result = await getCompetitiveKpMatches();
  sendCompetitiveKpPayload(result);
  return result;
});
ipcMain.handle("start-auto-watch", async (_event, inventory = {}) => {
  return startAutoWatch();
});
ipcMain.handle("stop-auto-watch", async () => stopAutoWatch());
ipcMain.handle("set-window-opacity", async (_event, opacity) => ({ ok: true, opacity: applyWindowOpacity(opacity) }));
ipcMain.handle("get-current-account-info", async () => getCurrentAccountInfo());
ipcMain.handle("firebase-check-admin-pin", async (_event, pin) => ({ ok: String(pin || "") === firebaseAdmin.ADMIN_PIN }));
ipcMain.handle("firebase-sync-account", async (_event, inventory = {}) => {
  try {
    const account = await getCurrentAccountInfo();
    if (!account?.ok) return { ...account, skipped: true, inbox: [] };
    const usage = await firebaseAdmin.upsertUsage(account, normalizeInventory(inventory));
    if (account.puuid && usage.user?.status) {
      accountAccessCache.set(account.puuid, usage.user.status);
    }
    const inbox = await firebaseAdmin.getInbox(account.puuid);
    return {
      ok: true,
      account,
      user: usage.user,
      inbox: inbox.inbox || [],
      blocked: usage.user?.status === "blocked",
      message: usage.user?.status === "blocked" ? "このアカウントは利用停止中です。" : ""
    };
  } catch (error) {
    return {
      ok: false,
      skipped: true,
      inbox: [],
      message: error.message || "アカウント情報を取得できませんでした。"
    };
  }
});
ipcMain.handle("firebase-list-users", async () => firebaseAdmin.listUsers());
ipcMain.handle("firebase-grant-user", async (_event, puuid, rewards) => firebaseAdmin.grantUser(puuid, rewards));
ipcMain.handle("firebase-confiscate-user-items", async (_event, puuid, rewards) => firebaseAdmin.confiscateUserItems(puuid, rewards));
ipcMain.handle("firebase-ban-user", async (_event, puuid) => firebaseAdmin.setUserStatus(puuid, "blocked"));
ipcMain.handle("firebase-allow-user", async (_event, puuid) => firebaseAdmin.setUserStatus(puuid, "allowed"));
ipcMain.handle("firebase-send-message", async (_event, puuid, message) => firebaseAdmin.sendMessage(puuid, message));
ipcMain.handle("firebase-send-item", async (_event, puuid, rewards) => firebaseAdmin.sendItem(puuid, rewards));
ipcMain.handle("firebase-bulk-message", async (_event, title, message) => firebaseAdmin.sendBulkMessage(title, message));
ipcMain.handle("firebase-bulk-item", async (_event, rewards) => firebaseAdmin.sendBulkItem(rewards));
ipcMain.handle("firebase-delete-inbox-item", async (_event, documentName) => firebaseAdmin.deleteInboxItem(documentName));

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  stopAutoWatch();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});




