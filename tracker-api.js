const fs = require("fs");
const path = require("path");
const https = require("https");

const HENRIK_API_KEY = process.env.HENRIK_API_KEY || "HDEV-466bb4c5-fcbb-4857-9868-78456158e354";
const REGION = "ap";
const GLZ_HOST = "glz-ap-1.ap.a.pvp.net";
const PD_HOST = "pd.ap.a.pvp.net";
const LOCAL_API_TIMEOUT_MS = 3000;
const RIOT_API_TIMEOUT_MS = 3000;
const HENRIK_API_TIMEOUT_MS = 10000;
let customRiotClientPath = "";

function configureTrackerApi(options = {}) {
  customRiotClientPath = String(options.riotClientPath || "").trim();
}

function getDefaultRiotClientConfigPath() {
  const localAppData = process.env.LOCALAPPDATA;
  return localAppData ? path.join(localAppData, "Riot Games", "Riot Client", "Config") : "";
}

function getLockfilePathCandidates() {
  const candidates = [];
  const configured = customRiotClientPath;

  if (configured) {
    candidates.push(
      path.join(configured, "lockfile"),
      path.join(configured, "Config", "lockfile"),
      path.join(configured, "Riot Client", "Config", "lockfile"),
      path.join(configured, "Riot Games", "Riot Client", "Config", "lockfile")
    );
  }

  const defaultConfigPath = getDefaultRiotClientConfigPath();
  if (defaultConfigPath) candidates.push(path.join(defaultConfigPath, "lockfile"));

  return [...new Set(candidates)];
}

function readLockfileData() {
  const candidates = getLockfilePathCandidates();
  if (!candidates.length) {
    return { ok: false, message: "LOCALAPPDATAが見つかりません。設定からRiot Clientのフォルダを指定してください。" };
  }

  const lockfilePath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!lockfilePath) {
    return {
      ok: false,
      message: "lockfileが見つかりません。VALORANTを起動するか、設定でRiot Clientのフォルダを指定してください。",
      searchedPaths: candidates
    };
  }

  try {
    const text = fs.readFileSync(lockfilePath, "utf8").trim();
    const parts = text.split(":");
    if (parts.length < 5) {
      return { ok: false, message: "lockfileの形式が不正です。Riot Clientを再起動してください。", path: lockfilePath };
    }

    const [name, pid, port, password, protocol] = parts;
    return { ok: true, message: "lockfile取得成功", path: lockfilePath, data: { name, pid, port, password, protocol } };
  } catch (error) {
    return {
      ok: false,
      message: "lockfileを読み取れません。権限やセキュリティ設定を確認してください。" + (error?.message ? " (" + error.message + ")" : ""),
      path: lockfilePath
    };
  }
}

function requestLocalApi(lockfile, endpoint) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`riot:${lockfile.password}`).toString("base64");
    const options = {
      hostname: "127.0.0.1",
      port: Number(lockfile.port),
      path: endpoint,
      method: "GET",
      rejectUnauthorized: false,
      headers: { Authorization: `Basic ${auth}` }
    };

    const req = https.request(options, (res) => {
      let responseBody = "";
      res.on("data", (chunk) => { responseBody += chunk; });
      res.on("end", () => {
        try {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`ローカルAPIエラー: ${res.statusCode}`));
            return;
          }
          resolve(JSON.parse(responseBody));
        } catch (error) {
          reject(error);
        }
      });
    });

    req.setTimeout(LOCAL_API_TIMEOUT_MS, () => {
      req.destroy(new Error("ローカルAPIタイムアウト"));
    });
    req.on("error", reject);
    req.end();
  });
}

function requestHttpsJson(host, endpoint, options = {}) {
  return new Promise((resolve, reject) => {
    const timeoutMs = options.timeoutMs || RIOT_API_TIMEOUT_MS;
    const reqOptions = {
      hostname: host,
      port: 443,
      path: endpoint,
      method: options.method || "GET",
      headers: options.headers || {}
    };

    const req = https.request(reqOptions, (res) => {
      let responseBody = "";
      res.on("data", (chunk) => { responseBody += chunk; });
      res.on("end", () => {
        try {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const error = new Error(`APIエラー: ${res.statusCode} / ${host}${endpoint} / ${responseBody}`);
            error.statusCode = res.statusCode;
            error.host = host;
            error.endpoint = endpoint;
            error.responseBody = responseBody;
            reject(error);
            return;
          }
          resolve(JSON.parse(responseBody || "{}"));
        } catch (error) {
          reject(error);
        }
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`APIタイムアウト: ${host}${endpoint}`));
    });
    req.on("error", reject);
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

function requestValorantApi({ host, endpoint, accessToken, entitlementToken, clientVersion, method = "GET", body = null, timeoutMs = RIOT_API_TIMEOUT_MS }) {
  return requestHttpsJson(host, endpoint, {
    method,
    body,
    timeoutMs,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Riot-Entitlements-JWT": entitlementToken,
      "X-Riot-ClientVersion": clientVersion,
      "X-Riot-ClientPlatform": "ewogICJwbGF0Zm9ybVR5cGUiOiAiUEMiLAogICJwbGF0Zm9ybU9TIjogIldpbmRvd3MiLAogICJwbGF0Zm9ybU9TVmVyc2lvbiI6ICIxMC4wLjE5MDQyLjEiLAogICJwbGF0Zm9ybUNoaXBzZXQiOiAidW5rbm93biIKfQ==",
      "Content-Type": "application/json"
    }
  });
}

function requestHenrik(endpoint) {
  return requestHttpsJson("api.henrikdev.xyz", endpoint, {
    timeoutMs: HENRIK_API_TIMEOUT_MS,
    headers: {
      "User-Agent": "valorant-tracker-local",
      ...(HENRIK_API_KEY ? { Authorization: HENRIK_API_KEY } : {})
    }
  });
}

async function getClientVersion() {
  try {
    const result = await requestHttpsJson("valorant-api.com", "/v1/version");
    return result?.data?.riotClientVersion || result?.data?.manifestId || "";
  } catch (error) {
    return "release-12.09-shipping-25-4697179";
  }
}

async function getCurrentGameContext() {
  const lockfileResult = readLockfileData();
  if (!lockfileResult.ok) {
    return { ok: false, waiting: true, message: lockfileResult.message || "VALORANT待機中" };
  }

  const lockfile = lockfileResult.data;
  const token = await requestLocalApi(lockfile, "/entitlements/v1/token");
  const puuid = token.subject;
  const clientVersion = await getClientVersion();
  const base = { ok: true, lockfile, token, puuid, host: GLZ_HOST, clientVersion };

  try {
    const currentGame = await requestValorantApi({
      host: GLZ_HOST,
      endpoint: "/core-game/v1/players/" + puuid,
      accessToken: token.accessToken,
      entitlementToken: token.token,
      clientVersion
    });

    return { ...base, mode: "core", modeLabel: "試合中", matchId: currentGame.MatchID || currentGame.matchId };
  } catch (coreError) {
    try {
      const pregame = await requestValorantApi({
        host: GLZ_HOST,
        endpoint: "/pregame/v1/players/" + puuid,
        accessToken: token.accessToken,
        entitlementToken: token.token,
        clientVersion
      });

      return { ...base, mode: "pregame", modeLabel: "キャラピック", matchId: pregame.MatchID || pregame.matchId };
    } catch (pregameError) {
      return { ok: false, waiting: true, message: "試合待機中" };
    }
  }
}

async function getNamesByPuuid(context, puuids) {
  try {
    const names = await requestValorantApi({
      host: PD_HOST,
      endpoint: "/name-service/v2/players",
      method: "PUT",
      body: puuids,
      accessToken: context.token.accessToken,
      entitlementToken: context.token.token,
      clientVersion: context.clientVersion
    });

    const map = new Map();
    for (const item of names || []) {
      map.set(item.Subject, `${item.GameName || "Unknown"}#${item.TagLine || "----"}`);
    }
    return map;
  } catch (error) {
    return new Map();
  }
}

async function getMatchByContext(context) {
  const endpoint = context.mode === "pregame" ? `/pregame/v1/matches/${context.matchId}` : `/core-game/v1/matches/${context.matchId}`;
  return requestValorantApi({
    host: GLZ_HOST,
    endpoint,
    accessToken: context.token.accessToken,
    entitlementToken: context.token.token,
    clientVersion: context.clientVersion
  });
}

async function getMatchDetailsByContext(context, matchId) {
  return requestValorantApi({
    host: PD_HOST,
    endpoint: `/match-details/v1/matches/${matchId}`,
    accessToken: context.token.accessToken,
    entitlementToken: context.token.token,
    clientVersion: context.clientVersion,
    timeoutMs: 10000
  });
}

function getRiotHistoryEntries(history) {
  if (Array.isArray(history?.History)) return history.History;
  if (Array.isArray(history?.history)) return history.history;
  if (Array.isArray(history)) return history;
  return [];
}

function getRiotQueueId(value) {
  return String(
    value?.QueueID
    || value?.QueueId
    || value?.queueID
    || value?.queueId
    || value?.MatchInfo?.QueueID
    || value?.MatchInfo?.QueueId
    || value?.matchInfo?.queueID
    || value?.matchInfo?.queueId
    || ""
  ).toLowerCase();
}

function getRiotMatchId(value) {
  return String(
    value?.MatchID
    || value?.MatchId
    || value?.matchID
    || value?.matchId
    || value?.MatchInfo?.MatchID
    || value?.matchInfo?.matchId
    || ""
  );
}

function normalizeRiotCompetitiveMatch(match, puuid, fallback = {}) {
  const matchInfo = match?.MatchInfo || match?.matchInfo || {};
  const players = Array.isArray(match?.Players) ? match.Players : (Array.isArray(match?.players) ? match.players : []);
  const selfPlayer = players.find((player) => String(player?.Subject || player?.subject || player?.puuid || "") === puuid);
  const stats = selfPlayer?.Stats || selfPlayer?.stats || {};
  const gameStart = Number(
    matchInfo.GameStartMillis
    || matchInfo.gameStartMillis
    || matchInfo.GameStartTime
    || matchInfo.gameStartTime
    || fallback.GameStartTime
    || fallback.gameStartTime
    || 0
  );

  return {
    matchId: getRiotMatchId(match) || getRiotMatchId(fallback),
    startedAt: gameStart > 0 ? new Date(gameStart).toISOString() : "",
    mapName: matchInfo.MapID || matchInfo.MapId || matchInfo.mapId || fallback.MapID || fallback.mapId || "-",
    characterId: selfPlayer?.CharacterID || selfPlayer?.CharacterId || selfPlayer?.characterId || "",
    agentName: "",
    agentImage: "",
    kills: Math.max(0, Number(stats.Kills ?? stats.kills ?? 0) || 0),
    assists: Math.max(0, Number(stats.Assists ?? stats.assists ?? 0) || 0)
  };
}

async function getRiotCompetitiveMatchesByContext(context, size = 5) {
  const safeSize = Math.max(1, Math.min(10, Number(size) || 5));
  const history = await requestValorantApi({
    host: PD_HOST,
    endpoint: `/match-history/v1/history/${context.puuid}?startIndex=0&endIndex=20`,
    accessToken: context.token.accessToken,
    entitlementToken: context.token.token,
    clientVersion: context.clientVersion,
    timeoutMs: 10000
  });
  const entries = getRiotHistoryEntries(history);
  const matches = [];

  for (const entry of entries) {
    if (matches.length >= safeSize) break;
    const queueId = getRiotQueueId(entry);
    if (queueId && queueId !== "competitive") continue;
    const matchId = getRiotMatchId(entry);
    if (!matchId) continue;

    try {
      const details = await getMatchDetailsByContext(context, matchId);
      const detailQueueId = getRiotQueueId(details);
      if ((queueId || detailQueueId) !== "competitive") continue;
      matches.push(normalizeRiotCompetitiveMatch(details, context.puuid, entry));
    } catch (error) {
      if ([401, 403, 429].includes(Number(error?.statusCode))) throw error;
    }
  }

  return matches;
}

function findHenrikSelfPlayer(match, puuid) {
  const players = Array.isArray(match?.players)
    ? match.players
    : match?.players?.all_players || [];
  return players.find((player) => player?.puuid === puuid) || null;
}

function normalizeHenrikCompetitiveMatch(match, puuid) {
  const selfPlayer = findHenrikSelfPlayer(match, puuid);
  const metadata = match?.metadata || {};
  const mapName = metadata?.map?.name || metadata?.map || "-";
  const startedAt = metadata?.started_at || metadata?.game_start_patched || metadata?.game_start || "";
  const agent = selfPlayer?.agent || {};
  const agentName = agent?.name || selfPlayer?.character || "-";
  const agentImage = selfPlayer?.assets?.agent?.small || selfPlayer?.assets?.agent?.full || agent?.assets?.display_icon || "";
  const kills = Number(selfPlayer?.stats?.kills ?? selfPlayer?.stats?.kills_count ?? 0);
  const assists = Number(selfPlayer?.stats?.assists ?? selfPlayer?.stats?.assists_count ?? 0);

  return {
    matchId: metadata?.match_id || metadata?.matchid || "",
    startedAt,
    mapName,
    agentName,
    agentImage,
    kills: Number.isFinite(kills) ? kills : 0,
    assists: Number.isFinite(assists) ? assists : 0
  };
}

async function getHenrikCompetitiveMatchesByPuuid(puuid, size = 5) {
  if (!puuid) return [];
  const safeSize = Math.max(1, Math.min(10, Number(size) || 5));
  const result = await requestHenrik(`/valorant/v4/by-puuid/matches/${REGION}/pc/${puuid}?mode=competitive&size=${safeSize}`);
  const matches = Array.isArray(result?.data) ? result.data : [];
  return matches.slice(0, safeSize).map((match) => normalizeHenrikCompetitiveMatch(match, puuid));
}


module.exports = {
  GLZ_HOST,
  HENRIK_API_KEY,
  PD_HOST,
  REGION,
  configureTrackerApi,
  getClientVersion,
  getCurrentGameContext,
  getHenrikCompetitiveMatchesByPuuid,
  getRiotCompetitiveMatchesByContext,
  getMatchByContext,
  getMatchDetailsByContext,
  getNamesByPuuid,
  readLockfileData,
  requestHenrik,
  requestHttpsJson,
  requestLocalApi,
  requestValorantApi
};


