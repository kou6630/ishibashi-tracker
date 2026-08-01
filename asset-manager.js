const { EventEmitter } = require("events");
const crypto = require("crypto");
const fs = require("fs");
const fsp = fs.promises;
const http = require("http");
const https = require("https");
const path = require("path");

const MAX_PARALLEL_DOWNLOADS = 4;
const MANIFEST_FILE = "active-manifest.json";

function safeRelativeAssetPath(value) {
  const source = String(value || "").replace(/\\/g, "/");
  if (!source.startsWith("img/") || source.includes("\0")) return null;
  const normalized = path.posix.normalize(source);
  return normalized.startsWith("img/") && !normalized.includes("../") ? normalized : null;
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function extensionFor(entry) {
  const extension = path.extname(String(entry?.path || "")).toLowerCase();
  return /^[.][a-z0-9]{1,8}$/.test(extension) ? extension : "";
}

function isValidEntry(entry) {
  return Boolean(
    entry &&
    safeRelativeAssetPath(entry.path) &&
    Number.isSafeInteger(entry.size) && entry.size >= 0 &&
    /^[a-f0-9]{64}$/i.test(String(entry.sha256 || "")) &&
    /^[a-f0-9]{64}(?:\.[a-z0-9]{1,8})?$/i.test(String(entry.assetName || "")) &&
    String(entry.version || "").trim()
  );
}

function normalizeManifest(candidate) {
  if (!candidate || Number(candidate.schemaVersion) !== 1 || !String(candidate.version || "").trim() || !Array.isArray(candidate.assets)) return null;
  const paths = new Set();
  const assets = [];
  for (const entry of candidate.assets) {
    if (!isValidEntry(entry)) return null;
    const normalizedPath = safeRelativeAssetPath(entry.path);
    const assetName = String(entry.assetName);
    if (paths.has(normalizedPath)) return null;
    paths.add(normalizedPath);
    assets.push({ path: normalizedPath, assetName, size: Number(entry.size), sha256: String(entry.sha256).toLowerCase(), version: String(entry.version) });
  }
  return { schemaVersion: 1, version: String(candidate.version), assets };
}

function requestBuffer(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    const client = String(url).startsWith("https:") ? https : http;
    const request = client.get(url, { headers: { "User-Agent": "valorant-tracker-asset-manager" } }, (response) => {
      const status = Number(response.statusCode || 0);
      if (status >= 300 && status < 400 && response.headers.location && redirects < 5) {
        response.resume();
        resolve(requestBuffer(new URL(response.headers.location, url).toString(), redirects + 1));
        return;
      }
      if (status !== 200) {
        response.resume();
        reject(new Error(`素材の取得に失敗しました (${status})`));
        return;
      }
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve(Buffer.concat(chunks)));
      response.on("error", reject);
    });
    request.setTimeout(30000, () => request.destroy(new Error("素材の取得がタイムアウトしました。")));
    request.on("error", reject);
  });
}

async function atomicWrite(filePath, content) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(temporaryPath, content);
  await fsp.rename(temporaryPath, filePath);
}

class AssetManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.appPath = options.appPath || process.cwd();
    this.cacheDir = options.cacheDir || path.join(options.userDataPath || this.appPath, "asset-cache");
    this.manifestUrl = options.manifestUrl || "https://github.com/kou6630/ishibashi-tracker/releases/download/assets-v1/manifest.json";
    this.isPackaged = Boolean(options.isPackaged);
    this.fetchBuffer = options.fetchBuffer || requestBuffer;
    this.activeManifest = null;
    this.syncPromise = null;
    this.lastError = "";
    this.totalAssets = 0;
    this.downloadedAssets = 0;
  }

  get manifestPath() { return path.join(this.cacheDir, MANIFEST_FILE); }
  get filesDir() { return path.join(this.cacheDir, "files"); }
  get bootstrapPlaceholderPath() { return path.join(this.appPath, "img", "bootstrap", "image-placeholder.svg"); }

  async initialize() {
    try {
      const parsed = JSON.parse(await fsp.readFile(this.manifestPath, "utf8"));
      this.activeManifest = normalizeManifest(parsed);
    } catch (error) {
      this.activeManifest = null;
    }
    return this.getStatus();
  }

  getStatus() {
    return {
      ready: Boolean(this.activeManifest),
      syncing: Boolean(this.syncPromise),
      version: this.activeManifest?.version || "",
      cachedAssets: this.activeManifest?.assets.length || 0,
      totalAssets: this.totalAssets,
      downloadedAssets: this.downloadedAssets,
      error: this.lastError
    };
  }

  filePathFor(entry) {
    return path.join(this.filesDir, `${entry.sha256}${extensionFor(entry)}`);
  }

  async hasVerifiedFile(entry) {
    try {
      const stat = await fsp.stat(this.filePathFor(entry));
      return stat.isFile() && stat.size === entry.size;
    } catch (error) {
      return false;
    }
  }

  async downloadEntry(entry) {
    if (await this.hasVerifiedFile(entry)) return false;
    const buffer = await this.fetchBuffer(new URL(`./${entry.assetName}`, this.manifestUrl).toString());
    if (buffer.length !== entry.size || sha256(buffer) !== entry.sha256) throw new Error(`素材の検証に失敗しました: ${entry.path}`);
    await atomicWrite(this.filePathFor(entry), buffer);
    return true;
  }

  async downloadEntries(entries) {
    let cursor = 0;
    const workers = Array.from({ length: Math.min(MAX_PARALLEL_DOWNLOADS, entries.length) }, async () => {
      while (cursor < entries.length) {
        const entry = entries[cursor++];
        await this.downloadEntry(entry);
        this.downloadedAssets += 1;
        this.emit("progress", this.getStatus());
      }
    });
    await Promise.all(workers);
  }

  async sync() {
    if (this.syncPromise) return this.syncPromise;
    this.syncPromise = (async () => {
      try {
        const manifest = normalizeManifest(JSON.parse((await this.fetchBuffer(this.manifestUrl)).toString("utf8")));
        if (!manifest) throw new Error("素材manifestの形式が正しくありません。");
        const currentByPath = new Map((this.activeManifest?.assets || []).map((entry) => [entry.path, entry]));
        const changed = [];
        for (const entry of manifest.assets) {
          const current = currentByPath.get(entry.path);
          if (!current || current.sha256 !== entry.sha256 || current.size !== entry.size || !(await this.hasVerifiedFile(entry))) changed.push(entry);
        }
        const uniqueDownloads = [...new Map(changed.map((entry) => [this.filePathFor(entry), entry])).values()];
        this.totalAssets = uniqueDownloads.length;
        this.downloadedAssets = 0;
        this.emit("progress", this.getStatus());
        await this.downloadEntries(uniqueDownloads);
        await atomicWrite(this.manifestPath, JSON.stringify(manifest));
        this.activeManifest = manifest;
        this.lastError = "";
        const status = this.getStatus();
        this.emit("updated", status);
        return { ok: true, changed: changed.length, status };
      } catch (error) {
        this.lastError = error?.message || "素材を同期できませんでした。";
        return { ok: false, error: this.lastError, status: this.getStatus() };
      } finally {
        this.syncPromise = null;
        this.emit("progress", this.getStatus());
      }
    })();
    return this.syncPromise;
  }

  getAssetPath(requestedPath) {
    const relativePath = safeRelativeAssetPath(requestedPath);
    if (!relativePath) return this.bootstrapPlaceholderPath;
    const entry = this.activeManifest?.assets.find((asset) => asset.path === relativePath);
    if (entry) {
      const candidate = this.filePathFor(entry);
      try {
        const stat = fs.statSync(candidate);
        if (stat.isFile() && stat.size === entry.size) return candidate;
      } catch (error) {}
    }
    if (!this.isPackaged) {
      const developmentPath = path.join(this.appPath, ...relativePath.split("/"));
      try {
        if (fs.statSync(developmentPath).isFile()) return developmentPath;
      } catch (error) {}
    }
    return this.bootstrapPlaceholderPath;
  }
}

module.exports = { AssetManager, normalizeManifest, safeRelativeAssetPath, sha256 };
