const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const { autoUpdater } = require("electron-updater");
const { session } = require("electron");
const { protocol } = require("electron");
const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const { AssetManager } = require("./asset-manager");

protocol.registerSchemesAsPrivileged([{
  scheme: "asset",
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true }
}]);

const {
  claimCompetitiveKp,
  configureTrackerCore,
  getCompetitiveKpMatches,
  getCurrentAccountInfo,
  getCurrentGameContext,
  getCurrentPlayersData,
  markClaimedCompetitiveKp,
  readLockfileData,
  startAutoWatch,
  stopAutoWatch
} = require("./tracker-core");

const firebaseAdmin = require("./firebase");
const packageInfo = require("./package.json");

let mainWindow = null;
const accountAccessCache = new Map();
let googleSession = null;
let ateamLaunchAuthorized = false;
let updateFlowStarted = false;
let pendingUpdateNotice = null;
const cameraAccessScopes = new Map();
let assetManager = null;

const DEFAULT_SETTINGS = { opacity: 1, riotClientPath: "" };

function mimeTypeForAsset(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".png": return "image/png";
    case ".jpg": case ".jpeg": return "image/jpeg";
    case ".webp": return "image/webp";
    case ".gif": return "image/gif";
    case ".svg": return "image/svg+xml";
    default: return "application/octet-stream";
  }
}

function assetRequestPath(requestUrl) {
  try {
    const url = new URL(requestUrl);
    if (url.protocol !== "asset:" || url.hostname !== "img") return "";
    return `img/${decodeURIComponent(url.pathname).replace(/^\/+/, "")}`;
  } catch (error) {
    return "";
  }
}

function configureAssetProtocol() {
  protocol.handle("asset", async (request) => {
    const filePath = assetManager?.getAssetPath(assetRequestPath(request.url));
    try {
      const body = await fs.promises.readFile(filePath);
      return new Response(body, { headers: { "content-type": mimeTypeForAsset(filePath), "cache-control": "no-store" } });
    } catch (error) {
      return new Response("素材を読み込めませんでした。", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
    }
  });
}

function getUpdateRestartGrantPath() {
  return path.join(app.getPath("userData"), "update-restart-grant.json");
}

function saveUpdateRestartGrant(version, releaseNotes = "") {
  try {
    fs.writeFileSync(getUpdateRestartGrantPath(), JSON.stringify({
      version: String(version || ""),
      releaseNotes: String(releaseNotes || "").slice(0, 5000),
      expiresAt: Date.now() + 5 * 60 * 1000
    }), "utf8");
  } catch (error) {}
}

function consumeUpdateRestartGrant() {
  const grantPath = getUpdateRestartGrantPath();
  try {
    if (!fs.existsSync(grantPath)) return false;
    const grant = JSON.parse(fs.readFileSync(grantPath, "utf8"));
    fs.unlinkSync(grantPath);
    if (Number(grant?.expiresAt) < Date.now() || String(grant?.version || "") !== app.getVersion()) return false;
    pendingUpdateNotice = {
      version: app.getVersion(),
      releaseNotes: String(grant?.releaseNotes || "")
    };
    return true;
  } catch (error) {
    try { if (fs.existsSync(grantPath)) fs.unlinkSync(grantPath); } catch {}
    return false;
  }
}

function sendUpdateStatus(payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("update-status", payload);
}

function getUpdateReleaseNotes(info = {}) {
  if (Array.isArray(info.releaseNotes)) {
    return info.releaseNotes.map((item) => item?.note || item?.version || "").filter(Boolean).join("\n");
  }
  return String(info.releaseNotes || "");
}

function getUpdateErrorMessage(error) {
  const message = String(error?.message || "");
  if (/ENOSPC|not enough space|disk full|no space left/i.test(message)) {
    return "パソコンの空き容量が不足しているため、アップデートできませんでした";
  }
  return "アップデートに失敗しました。通信環境、セキュリティソフト、権限設定などが原因の可能性があります";
}

function initializeAutoUpdater() {
  if (!app.isPackaged || updateFlowStarted) return;
  updateFlowStarted = true;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on("update-available", async (info) => {
    sendUpdateStatus({ state: "available", version: info?.version || "" });
    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      sendUpdateStatus({ state: "error", message: getUpdateErrorMessage(error) });
    }
  });
  autoUpdater.on("download-progress", (progress) => {
    sendUpdateStatus({
      state: "downloading",
      percent: Math.max(0, Math.min(100, Number(progress?.percent) || 0)),
      transferred: Number(progress?.transferred) || 0,
      total: Number(progress?.total) || 0
    });
  });
  autoUpdater.on("update-downloaded", (info) => {
    saveUpdateRestartGrant(info?.version, getUpdateReleaseNotes(info));
    sendUpdateStatus({ state: "downloaded", version: info?.version || "" });
  });
  autoUpdater.on("error", (error) => {
    sendUpdateStatus({ state: "error", message: getUpdateErrorMessage(error) });
  });

  autoUpdater.checkForUpdates().catch((error) => {
    sendUpdateStatus({ state: "error", message: getUpdateErrorMessage(error) });
  });
}

function consumeAteamLaunchGrant() {
  const token = String(process.env.ATEAM_LAUNCH_TOKEN || "");
  const port = Number(process.env.ATEAM_LAUNCH_PORT);
  const appId = String(process.env.ATEAM_LAUNCH_APP_ID || "");
  delete process.env.ATEAM_LAUNCH_TOKEN;
  delete process.env.ATEAM_LAUNCH_PORT;
  delete process.env.ATEAM_LAUNCH_APP_ID;

  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token) || !Number.isInteger(port) || port < 1 || port > 65535 || appId !== "ishibashi-tracker") {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    const payload = Buffer.from(JSON.stringify({ token, appId }), "utf8");
    const request = http.request({
      hostname: "127.0.0.1",
      port,
      path: "/consume",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": payload.length
      },
      timeout: 4000
    }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { if (body.length < 1024) body += chunk; });
      response.on("end", () => {
        try {
          resolve(response.statusCode === 200 && JSON.parse(body).ok === true);
        } catch {
          resolve(false);
        }
      });
    });
    request.on("timeout", () => request.destroy());
    request.on("error", () => resolve(false));
    request.end(payload);
  });
}

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

function getGoogleSessionPath() {
  return path.join(app.getPath("userData"), "google-session.json");
}

function normalizeGoogleSession(session = {}) {
  const user = session.user && typeof session.user === "object" ? session.user : null;
  const idToken = String(session.idToken || "");
  const refreshToken = String(session.refreshToken || "");
  if (!user?.uid || !idToken) return null;
  return {
    user: {
      uid: String(user.uid || ""),
      email: String(user.email || ""),
      displayName: String(user.displayName || ""),
      photoURL: String(user.photoURL || ""),
      puuids: Array.isArray(user.puuids) ? user.puuids : []
    },
    idToken,
    refreshToken,
    savedAt: Number(session.savedAt) || Date.now()
  };
}

function loadGoogleSession() {
  try {
    const sessionPath = getGoogleSessionPath();
    if (!fs.existsSync(sessionPath)) return null;
    return normalizeGoogleSession(JSON.parse(fs.readFileSync(sessionPath, "utf8")));
  } catch (error) {
    return null;
  }
}

function saveGoogleSession(session) {
  try {
    const normalized = normalizeGoogleSession({ ...session, savedAt: Date.now() });
    if (!normalized) return null;
    fs.writeFileSync(getGoogleSessionPath(), JSON.stringify(normalized, null, 2), "utf8");
    return normalized;
  } catch (error) {
    return null;
  }
}

function clearGoogleSession() {
  try {
    const sessionPath = getGoogleSessionPath();
    if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath);
  } catch (error) {}
}

function getCurrentGoogleSession() {
  if (!googleSession) googleSession = loadGoogleSession();
  return googleSession;
}

function refreshGoogleIdToken(refreshToken) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken
    }).toString();
    const req = https.request({
      hostname: "securetoken.googleapis.com",
      port: 443,
      path: `/v1/token?key=${encodeURIComponent(firebaseAdmin.FIREBASE_CONFIG.apiKey)}`,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(body)
      }
    }, (res) => {
      let responseBody = "";
      res.on("data", (chunk) => { responseBody += chunk; });
      res.on("end", () => {
        let parsed = {};
        try {
          parsed = responseBody ? JSON.parse(responseBody) : {};
        } catch (error) {
          reject(error);
          return;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(parsed?.error?.message || "Googleログインの更新に失敗しました。"));
          return;
        }
        resolve(parsed);
      });
    });
    req.setTimeout(8000, () => {
      req.destroy(new Error("Googleログイン更新がタイムアウトしました。"));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function getFreshGoogleSession(force = false) {
  const session = getCurrentGoogleSession();
  if (!session?.user || !session?.idToken) return null;
  const ageMs = Date.now() - Number(session.savedAt || 0);
  if (!force && ageMs < 45 * 60 * 1000) return session;
  if (!session.refreshToken) return session;

  const refreshed = await refreshGoogleIdToken(session.refreshToken);
  const nextSession = saveGoogleSession({
    user: session.user,
    idToken: refreshed.id_token || session.idToken,
    refreshToken: refreshed.refresh_token || session.refreshToken
  });
  googleSession = nextSession || session;
  return googleSession;
}

function getTrustedJstDate() {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "www.google.com",
      port: 443,
      path: "/generate_204",
      method: "HEAD",
      headers: { "User-Agent": "IshibashiTracker/1.0" },
      timeout: 8000
    }, (response) => {
      response.resume();
      const serverTime = new Date(String(response.headers.date || ""));
      if (Number.isNaN(serverTime.getTime())) return reject(new Error("Googleサーバー時刻を取得できませんでした。"));
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).formatToParts(serverTime);
      const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
      if (!values.year || !values.month || !values.day) return reject(new Error("日本時間の日付を取得できませんでした。"));
      resolve(`${values.year}-${values.month}-${values.day}`);
    });
    req.on("timeout", () => req.destroy(new Error("Googleサーバー時刻の取得がタイムアウトしました。")));
    req.on("error", reject);
    req.end();
  });
}

async function runGoogleFirebaseAction(action) {
  let session = null;
  try {
    session = await getFreshGoogleSession(false);
  } catch (error) {
    return { ok: false, message: "Googleログインの期限が切れています。設定からGoogleログインをやり直してください。" };
  }
  if (!session?.user || !session?.idToken) {
    return { ok: false, message: "Googleログインが必要です。" };
  }
  try {
    return await action(session);
  } catch (error) {
    if (error?.statusCode === 401 || error?.response?.error?.status === "UNAUTHENTICATED") {
      try {
        const refreshed = await getFreshGoogleSession(true);
        if (refreshed?.idToken && refreshed.idToken !== session.idToken) {
          return await action(refreshed);
        }
      } catch (refreshError) {}
      return { ok: false, message: "Googleログインの期限が切れています。設定からGoogleログインをやり直してください。" };
    }
    return { ok: false, message: error.message || "Firebase通信に失敗しました。" };
  }
}

async function runActiveGoogleAction(action) {
  return runGoogleFirebaseAction(async (session) => {
    const status = await firebaseAdmin.getGoogleAccountStatus(session.user, session.idToken);
    if (!status?.ok) return { ok: false, message: status?.message || "利用状態を確認できませんでした。" };
    if (status.accountStatus === "blocked") {
      stopAutoWatch();
      return { ok: false, blocked: true, message: "このGoogleアカウントは利用停止中です。" };
    }
    return action(session);
  });
}

async function runExpectedGoogleAction(expectedUid, action) {
  const expected = String(expectedUid || "").trim();
  return runActiveGoogleAction((session) => {
    if (!expected || session.user?.uid !== expected) return { ok: false, code: "account-changed", message: "Googleアカウントが切り替わりました。" };
    return action(session);
  });
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

function createGoogleLoginPage(port) {
  const config = JSON.stringify(firebaseAdmin.FIREBASE_CONFIG);
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Googleログイン</title>
  <style>
    body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f1117;color:#ece8e1;font-family:system-ui,sans-serif}
    main{width:min(420px,calc(100vw - 32px));padding:22px;border:1px solid #ff4655;background:#171a22;box-shadow:0 22px 60px rgba(0,0,0,.45)}
    h1{margin:0 0 10px;font-size:22px}
    p{line-height:1.55;color:#c7d0df}
    button{width:100%;padding:12px;border:1px solid #ff4655;background:#ff4655;color:#fff;font-weight:800;cursor:pointer}
    #status{margin-top:12px;font-size:13px;color:#ffd166;overflow-wrap:anywhere}
  </style>
</head>
<body>
  <main>
    <h1>Googleログイン</h1>
    <p>ログインが終わると、石橋ぶりぶりトラッカーに自動で反映されます。</p>
    <button id="loginButton" type="button">Googleでログイン</button>
    <div id="status">待機中</div>
  </main>
  <script type="module">
    import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
    import { getAuth, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
    const app = initializeApp(${config});
    const auth = getAuth(app);
    const provider = new GoogleAuthProvider();
    const status = document.getElementById("status");
    document.getElementById("loginButton").addEventListener("click", async () => {
      try {
        status.textContent = "Googleログインを開いています...";
        const result = await signInWithPopup(auth, provider);
        const idToken = await result.user.getIdToken();
        const refreshToken = result.user.refreshToken || "";
        const user = {
          uid: result.user.uid,
          email: result.user.email || "",
          displayName: result.user.displayName || "",
          photoURL: result.user.photoURL || ""
        };
        const response = await fetch("http://localhost:${port}/callback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken, refreshToken, user })
        });
        const data = await response.json();
        if (!data.ok) throw new Error(data.message || "ログイン反映に失敗しました。");
        status.textContent = "ログイン完了。アプリに戻ってください。";
        setTimeout(() => window.close(), 900);
      } catch (error) {
        status.textContent = "Googleログイン失敗: " + (error.message || error);
      }
    });
  </script>
</body>
</html>`;
}

function startGoogleBrowserLogin() {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result, server) => {
      if (settled) return;
      settled = true;
      try { server.close(); } catch (error) {}
      resolve(result);
    };
    const server = http.createServer((req, res) => {
      if (req.method === "GET" && req.url === "/") {
        const page = createGoogleLoginPage(server.address().port);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(page);
        return;
      }
      if (req.method === "POST" && req.url === "/callback") {
        let body = "";
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", async () => {
          try {
            const payload = JSON.parse(body || "{}");
            const user = payload.user || {};
            const idToken = String(payload.idToken || "");
            const refreshToken = String(payload.refreshToken || "");
            if (!user.uid || !idToken) throw new Error("Googleログイン情報を受け取れませんでした。");
            googleSession = { user, idToken, refreshToken };
            const saved = await firebaseAdmin.saveGoogleUserSession(user, idToken);
            googleSession = saveGoogleSession({ user: saved.user || user, idToken, refreshToken }) || googleSession;
            res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ ok: true }));
            finish({ ok: true, user: saved.user || user, origin: "http://localhost" }, server);
          } catch (error) {
            res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ ok: false, message: error.message || String(error) }));
            finish({ ok: false, message: error.message || String(error), origin: "http://localhost" }, server);
          }
        });
        return;
      }
      res.writeHead(404);
      res.end("not found");
    });
    server.listen(0, "localhost", () => {
      const url = `http://localhost:${server.address().port}/`;
      shell.openExternal(url);
    });
    server.on("error", (error) => {
      finish({ ok: false, message: error.message || String(error), origin: "http://localhost" }, server);
    });
    setTimeout(() => {
      finish({ ok: false, message: "Googleログインが時間切れになりました。もう一度試してください。", origin: "http://localhost" }, server);
    }, 5 * 60 * 1000);
  });
}

function normalizeInventory(inventory = {}) {
  return {
    kp: Math.max(0, Number(inventory.kp) || 0),
    ap: Math.max(0, Number(inventory.ap) || 0),
    cookies: Math.max(0, Number(inventory.cookies) || 0),
    ticket15: Math.max(0, Number(inventory.ticket15) || 0),
    ticket2: Math.max(0, Number(inventory.ticket2) || 0),
    trackerLevel: Math.max(0, Number(inventory.trackerLevel) || 0),
    ownedCharacterCount: Math.max(0, Number(inventory.ownedCharacterCount) || 0),
    series4Unlocked: Boolean(inventory.series4Unlocked),
    skillsJson: String(inventory.skillsJson || "{}"),
    eggJson: String(inventory.eggJson || "null"),
    ownedCharacterIdsJson: String(inventory.ownedCharacterIdsJson || "[]"),
    characterCountsJson: String(inventory.characterCountsJson || "{}"),
    achievementsJson: String(inventory.achievementsJson || "{}"),
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

function createWindow() {
  const settings = loadSettings();
  googleSession = loadGoogleSession();

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
    riotClientPath: settings.riotClientPath,
    sendPlayersProgress,
    sendAutoStatus,
    checkAccountAccess
  });

  mainWindow.loadFile("index.html");
  mainWindow.webContents.once("did-finish-load", () => {
    setTimeout(initializeAutoUpdater, 2500);
    setTimeout(() => {
      runActiveGoogleAction((session) => firebaseAdmin.recordGoogleLastLogin(session.user, session.idToken)).catch(() => {});
    }, 1200);
  });
  applyWindowOpacity(settings.opacity);
}

ipcMain.handle("read-lockfile", async () => readLockfileData());

ipcMain.handle("get-session", async () => {
  const context = await getCurrentGameContext();
  return context.ok ? { ok: true, puuid: context.puuid, mode: context.modeLabel } : context;
});

ipcMain.handle("get-current-game", async () => getCurrentGameContext());
ipcMain.handle("get-current-players", async () => runActiveGoogleAction(() => getCurrentPlayersData({ auto: false })));
ipcMain.handle("get-competitive-kp-matches", async () => runActiveGoogleAction(() => getCompetitiveKpMatches()));
ipcMain.handle("claim-competitive-kp", async (_event, matchId) => runActiveGoogleAction(() => claimCompetitiveKp(matchId)));
ipcMain.handle("refresh-competitive-kp-window", async () => {
  const result = await getCompetitiveKpMatches();
  return result;
});
ipcMain.handle("start-auto-watch", async (_event, inventory = {}) => {
  return runActiveGoogleAction(() => startAutoWatch());
});
ipcMain.handle("stop-auto-watch", async () => stopAutoWatch());
ipcMain.handle("get-app-settings", async () => loadSettings());
ipcMain.handle("get-app-release-info", async () => ({
  ok: true,
  version: app.getVersion(),
  pendingUpdateNotice
}));
ipcMain.handle("google-get-session", async () => ({
  ok: true,
  user: getCurrentGoogleSession()?.user || null,
  origin: mainWindow?.webContents?.getURL?.() || ""
}));
ipcMain.handle("google-start-login", async () => startGoogleBrowserLogin());
ipcMain.handle("google-sign-out", async () => {
  googleSession = null;
  clearGoogleSession();
  return { ok: true };
});
ipcMain.handle("google-link-current-puuid", async () => {
  const account = await getCurrentAccountInfo();
  const puuid = String(account?.puuid || "").trim();
  if (!puuid) return { ok: false, message: "現在のVALORANTアカウントのPUUIDを取得できませんでした。" };
  return runGoogleFirebaseAction(async (session) => {
    const result = await firebaseAdmin.linkGooglePuuid(session.user, session.idToken, puuid);
    if (result?.ok) {
      googleSession = saveGoogleSession({
        user: result.user || { ...session.user, puuids: result.puuids || session.user.puuids },
        idToken: session.idToken,
        refreshToken: session.refreshToken
      }) || session;
    }
    return result;
  });
});
ipcMain.handle("google-get-progress", async () => runActiveGoogleAction((session) => firebaseAdmin.getGoogleProgress(session.user, session.idToken)));
ipcMain.handle("google-check-account-status", async () => runGoogleFirebaseAction((session) => firebaseAdmin.getGoogleAccountStatus(session.user, session.idToken)));
ipcMain.handle("google-migrate-progress", async (_event, state = {}) => runActiveGoogleAction((session) => firebaseAdmin.migrateGoogleProgress(session.user, session.idToken, state)));
ipcMain.handle("google-save-progress", async (_event, state = {}, expectedRevision = "") => runActiveGoogleAction((session) => firebaseAdmin.saveGoogleProgress(session.user, session.idToken, state, expectedRevision)));
ipcMain.handle("google-apply-collection-operation", async (_event, operation = {}) => runActiveGoogleAction((session) => firebaseAdmin.applyGoogleCollectionOperation(session.user, session.idToken, operation)));
ipcMain.handle("google-claim-match-reward", async (_event, payload = {}) => {
  try {
    const weekDate = await getTrustedJstDate();
    return runActiveGoogleAction((session) => firebaseAdmin.claimGoogleMatchReward(session.user, session.idToken, { ...payload, weekDate }));
  } catch (error) {
    return { ok: false, message: "時刻確認に失敗しました。接続を確認して、もう一度お試しください。" };
  }
});
ipcMain.handle("mark-competitive-kp-claimed", async (_event, matchId) => {
  markClaimedCompetitiveKp(String(matchId || ""));
  return { ok: true };
});
ipcMain.handle("google-register-nickname", async (_event, nickname, change = false) => runActiveGoogleAction((session) => firebaseAdmin.registerNickname(session.user, session.idToken, nickname, Boolean(change))));
ipcMain.handle("google-complete-onboarding", async (_event, consent = {}) => runActiveGoogleAction((session) => firebaseAdmin.completeGoogleOnboarding(session.user, session.idToken, consent)));
ipcMain.handle("google-save-avatar-photo", async (_event, photoDataUrl, deviceLabel) => runActiveGoogleAction((session) => firebaseAdmin.saveGoogleAvatarTestPhoto(session.user, session.idToken, photoDataUrl, deviceLabel)));
ipcMain.handle("set-camera-access-scope", (event, scope) => {
  if (event.sender !== mainWindow?.webContents || !["startup", "none"].includes(scope)) return { ok: false };
  if (scope === "none") cameraAccessScopes.delete(event.sender.id);
  else cameraAccessScopes.set(event.sender.id, scope);
  return { ok: true };
});
ipcMain.handle("install-downloaded-update", async () => {
  if (!app.isPackaged) return { ok: false, message: "インストール版でのみ更新できます。" };
  try {
    autoUpdater.quitAndInstall(false, true);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: "更新の再起動に失敗しました。" };
  }
});
ipcMain.handle("choose-riot-client-folder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Riot Clientのフォルダを選択",
    properties: ["openDirectory"]
  });
  if (result.canceled || !result.filePaths?.[0]) return { ok: false, canceled: true };

  const riotClientPath = result.filePaths[0];
  const settings = { ...loadSettings(), riotClientPath };
  saveSettings(settings);
  configureTrackerCore({ riotClientPath });
  return { ok: true, riotClientPath };
});
ipcMain.handle("clear-riot-client-folder", async () => {
  const settings = { ...loadSettings(), riotClientPath: "" };
  saveSettings(settings);
  configureTrackerCore({ riotClientPath: "" });
  return { ok: true, riotClientPath: "" };
});
ipcMain.handle("set-window-opacity", async (_event, opacity) => ({ ok: true, opacity: applyWindowOpacity(opacity) }));
ipcMain.handle("get-current-account-info", async () => getCurrentAccountInfo());
ipcMain.handle("firebase-sync-account", async (_event, inventory = {}) => {
  try {
    const session = await getFreshGoogleSession();
    if (!session?.user || !session?.idToken) return { ok: false, skipped: true, inbox: [], message: "Googleログインが必要です。" };
    const accountStatus = await firebaseAdmin.getGoogleAccountStatus(session.user, session.idToken);
    if (!accountStatus.ok) return { ok: false, skipped: true, inbox: [], message: accountStatus.message || "利用状態を確認できませんでした。" };
    if (accountStatus.accountStatus === "blocked") {
      stopAutoWatch();
      return { ok: false, blocked: true, skipped: true, inbox: [], message: "このGoogleアカウントは利用停止中です。" };
    }
    let serverDate = "";
    let rankingError = "";
    let loginBonusError = "";
    try {
      serverDate = await getTrustedJstDate();
    } catch (error) {
      const message = error?.message || "サーバー時刻を取得できませんでした。";
      rankingError = `サーバー時刻を取得できないため、週間ランキングを確定できませんでした。${message}`;
      loginBonusError = `サーバー時刻を取得できないため、ログインボーナスメールを作成できませんでした。${message}`;
    }
    if (serverDate) {
      try {
        const ranking = await firebaseAdmin.finalizePreviousWeeklyCompetitiveRanking(session.user, session.idToken, serverDate);
        if (ranking?.ok === false) rankingError = ranking.message || "週間ランキングを確定できませんでした。";
      } catch (error) {
        rankingError = error?.message || "週間ランキングを確定できませんでした。";
      }
      try {
        const loginBonus = await firebaseAdmin.ensureLoginBonusInboxMail(session.user, session.idToken, serverDate);
        if (loginBonus?.ok === false) loginBonusError = loginBonus.message || "ログインボーナスメールを作成できませんでした。";
      } catch (error) {
        loginBonusError = error?.message || "ログインボーナスメールを作成できませんでした。";
      }
    }
    let inbox = { ok: false, inbox: [], message: "受信箱を取得できませんでした。" };
    try {
      inbox = await firebaseAdmin.getGoogleInbox(session.user, session.idToken);
    } catch (error) {
      inbox = { ok: false, inbox: [], message: error?.message || "受信箱を取得できませんでした。" };
    }
    let account;
    try {
      account = await getCurrentAccountInfo();
    } catch (error) {
      account = { ok: false, message: error?.message || "VALORANT情報を取得できませんでした。" };
    }
    let usage = { ok: true, user: null };
    let valorantMessage = "";
    if (account?.ok) {
      try {
        usage = await firebaseAdmin.upsertUsage(account, normalizeInventory(inventory));
      } catch (error) {
        valorantMessage = "VALORANT利用履歴を保存できませんでした。";
      }
    } else {
      valorantMessage = account?.message || "VALORANTは起動していません。";
    }
    return {
      ok: true,
      account,
      user: usage.user,
      inbox: inbox.inbox || [],
      inboxNextPageToken: inbox.nextPageToken || "",
      inboxError: inbox.ok ? "" : (inbox.message || "受信箱を取得できませんでした。"),
      rankingError,
      loginBonusError,
      valorantMessage,
      blocked: false,
      message: ""
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
ipcMain.handle("google-get-inbox-page", async (_event, pageToken) => runActiveGoogleAction((session) => firebaseAdmin.getGoogleInbox(session.user, session.idToken, String(pageToken || ""))));
ipcMain.handle("quit-app", () => {
  app.quit();
  return { ok: true };
});
ipcMain.handle("google-get-weekly-ranking", async () => {
  try {
    const serverDate = await getTrustedJstDate();
    return runActiveGoogleAction((session) => firebaseAdmin.getWeeklyCompetitiveRanking(session.user, session.idToken, serverDate));
  } catch (error) {
    return { ok: false, message: "時刻確認に失敗しました。接続を確認して、もう一度お試しください。", entries: [] };
  }
});
ipcMain.handle("google-mark-inbox-read", async (_event, name) => runActiveGoogleAction((session) => firebaseAdmin.markGoogleInboxRead(session.user, session.idToken, String(name || ""))));
ipcMain.handle("google-claim-inbox-item", async (_event, name) => runActiveGoogleAction((session) => firebaseAdmin.claimGoogleInboxItem(session.user, session.idToken, String(name || ""))));
ipcMain.handle("google-prepare-inbox-delete", async (_event, name) => runActiveGoogleAction((session) => firebaseAdmin.prepareGoogleInboxDelete(session.user, session.idToken, String(name || ""))));
ipcMain.handle("google-delete-inbox-item", async (_event, name, updateTime) => runActiveGoogleAction((session) => firebaseAdmin.deleteGoogleInboxItem(session.user, session.idToken, String(name || ""), String(updateTime || ""))));
ipcMain.handle("shop-get-profile", async () => {
  return runActiveGoogleAction((session) => firebaseAdmin.getShopProfile(session.user, session.idToken));
});
ipcMain.handle("shop-list-listings", async () => runActiveGoogleAction(() => firebaseAdmin.listShopListings()));
ipcMain.handle("shop-create-listing", async (_event, listing, operationId, expectedUid) => {
  return runExpectedGoogleAction(expectedUid, (session) => firebaseAdmin.createShopListing(session.user, session.idToken, listing, String(operationId || "")));
});
ipcMain.handle("shop-cancel-listing", async (_event, listingId, operationId, expectedUid) => {
  return runExpectedGoogleAction(expectedUid, (session) => firebaseAdmin.cancelShopListing(session.user, session.idToken, listingId, String(operationId || "")));
});
ipcMain.handle("shop-buy-listing", async (_event, listingId, buyerState, operationId, expectedUid) => {
  return runExpectedGoogleAction(expectedUid, (session) => firebaseAdmin.buyShopListing(session.user, session.idToken, listingId, buyerState, String(operationId || "")));
});
ipcMain.handle("shop-claim-pending-kp", async () => {
  return runActiveGoogleAction((session) => firebaseAdmin.claimShopPendingKp(session.user, session.idToken));
});
ipcMain.handle("shop-sync-slots-unlocked", async (_event, slots) => {
  return runActiveGoogleAction((session) => firebaseAdmin.syncShopSlotsUnlocked(session.user, session.idToken, slots));
});
ipcMain.handle("farm-sync-spikes", async (_event, localSpikes) => runActiveGoogleAction((session) => firebaseAdmin.syncGoogleFarmSpikes(session.user, session.idToken, localSpikes)));
ipcMain.handle("farm-apply-spike-operation", async (_event, operation) => runActiveGoogleAction((session) => firebaseAdmin.applyGoogleFarmSpikeOperation(session.user, session.idToken, operation)));
ipcMain.handle("get-asset-status", async () => assetManager?.getStatus() || { ready: false, syncing: false, version: "", cachedAssets: 0, totalAssets: 0, downloadedAssets: 0, error: "" });
app.whenReady().then(() => {
  consumeUpdateRestartGrant();
  assetManager = new AssetManager({ appPath: app.getAppPath(), userDataPath: app.getPath("userData"), isPackaged: app.isPackaged });
  assetManager.initialize().catch(() => {});
  configureAssetProtocol();
  assetManager.on("updated", (status) => mainWindow?.webContents?.send("assets-updated", status));
  assetManager.on("progress", (status) => mainWindow?.webContents?.send("assets-progress", status));
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => permission === "media" && Boolean(webContents && cameraAccessScopes.has(webContents.id)));
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => callback(permission === "media" && Boolean(webContents && cameraAccessScopes.has(webContents.id))));
  ateamLaunchAuthorized = true;
  createWindow();
  assetManager.sync().catch(() => {});
});

app.on("window-all-closed", () => {
  stopAutoWatch();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (ateamLaunchAuthorized && BrowserWindow.getAllWindows().length === 0) createWindow();
});





