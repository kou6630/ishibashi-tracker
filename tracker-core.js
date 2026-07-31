const fs = require("fs");
const path = require("path");

const {
  GLZ_HOST,
  REGION,
  configureTrackerApi,
  getClientVersion,
  getCurrentGameContext,
  getHenrikCompetitiveMatchesByPuuid,
  getMatchByContext,
  getNamesByPuuid,
  getRiotCompetitiveMatchesByContext,
  readLockfileData,
  requestHenrik,
  requestLocalApi
} = require("./tracker-api");

const {
  getAgentImagePath,
  getAgentName,
  getCompetitiveAgentImagePath,
  getMapName,
  getRankImagePath,
  getRankNameFromTier,
  normalizeRankName
} = require("./tracker-data");

const {
  calculateFetchRate,
  getBiasRank,
  getMatchResultText,
  getPlayerStat,
  getStoredMatchStats,
  isMeaningfulValue,
  normalizeDisplayName,
  pickStableRankValue,
  pickStableValue,
  splitRiotId
} = require("./tracker-stats");

let userDataPath = process.cwd();
let sendPlayersProgressCallback = () => {};
let sendAutoStatusCallback = () => {};
let checkAccountAccessCallback = async () => ({ ok: true });

let autoWatchTimer = null;
let lastAutoMatchId = "";
let lastAutoMode = "";
let stopFetchRequested = false;
let activeFetchSession = null;
let fetchSessionSeq = 0;
let lastAutoPlayerCount = 0;
let lastShownPlayers = [];
let lastShownMatchId = "";
let lastShownMapName = "-";
let lastShownMode = "";

const AUTO_WATCH_INTERVAL_MS = 3000;
const PREGAME_FETCH_ROUNDS = 10;
const INGAME_FETCH_ROUNDS = 100;
const COMPETITIVE_KP_MATCH_LIMIT = 5;
const COMPETITIVE_KP_CACHE_MS = 15000;
const COMPETITIVE_KP_CACHE_FILE = "competitive-kp-cache.json";
const COMPETITIVE_KP_DIAGNOSTICS_FILE = "competitive-kp-diagnostics.json";
let competitiveKpMatchesCache = { puuid: "", matches: [], fetchedAt: 0 };
let competitiveKpMatchesInFlight = null;

function configureTrackerCore(options = {}) {
  userDataPath = options.userDataPath || userDataPath;
  configureTrackerApi({ riotClientPath: options.riotClientPath || "" });
  sendPlayersProgressCallback = typeof options.sendPlayersProgress === "function" ? options.sendPlayersProgress : sendPlayersProgressCallback;
  sendAutoStatusCallback = typeof options.sendAutoStatus === "function" ? options.sendAutoStatus : sendAutoStatusCallback;
  checkAccountAccessCallback = typeof options.checkAccountAccess === "function" ? options.checkAccountAccess : checkAccountAccessCallback;
}

function readJson(fileName, fallback) {
  try {
    const filePath = path.join(userDataPath, fileName);
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return fallback;
  }
}

function writeJson(fileName, value) {
  try {
    fs.writeFileSync(path.join(userDataPath, fileName), JSON.stringify(value, null, 2), "utf8");
  } catch (error) {}
}

function normalizeCompetitiveKpMatchId(matchId) {
  return String(matchId || "").trim();
}

function getClaimedCompetitiveKpMatchIds() {
  return readJson("claimed-competitive-kp-matches.json", []).map(normalizeCompetitiveKpMatchId).filter(Boolean);
}

function hasClaimedCompetitiveKp(matchId) {
  const normalizedMatchId = normalizeCompetitiveKpMatchId(matchId);
  if (!normalizedMatchId) return false;
  return getClaimedCompetitiveKpMatchIds().includes(normalizedMatchId);
}

function markClaimedCompetitiveKp(matchId) {
  const normalizedMatchId = normalizeCompetitiveKpMatchId(matchId);
  if (!normalizedMatchId) return;
  const matchIds = getClaimedCompetitiveKpMatchIds();
  if (matchIds.includes(normalizedMatchId)) return;
  matchIds.push(normalizedMatchId);
  writeJson("claimed-competitive-kp-matches.json", matchIds.slice(-200));
}

function normalizeCompetitiveKpMatch(match) {
  const normalizedMatchId = normalizeCompetitiveKpMatchId(match?.matchId);
  const agentName = match?.agentName || getAgentName(match?.characterId || "");
  return {
    ...match,
    matchId: normalizedMatchId,
    mapName: getMapName(match?.mapName || match?.mapId || ""),
    agentName,
    agentImage: getCompetitiveAgentImagePath(agentName, match?.agentImage || ""),
    kills: Math.max(0, Number(match?.kills) || 0),
    assists: Math.max(0, Number(match?.assists) || 0),
    isClaimed: hasClaimedCompetitiveKp(normalizedMatchId),
    displayDate: formatCompetitiveMatchDate(match?.startedAt)
  };
}

function isRateLimitError(error) {
  return Number(error?.statusCode) === 429 || String(error?.message || "").includes("429");
}

function getCompetitiveKpDiskCache(puuid) {
  const saved = readJson(COMPETITIVE_KP_CACHE_FILE, { entries: {} });
  const entry = saved?.entries?.[puuid];
  if (!entry || !Array.isArray(entry.matches)) return null;
  return {
    puuid,
    matches: entry.matches,
    fetchedAt: Number(entry.fetchedAt) || 0
  };
}

function getCachedCompetitiveKpMatches(puuid, { allowStale = false } = {}) {
  let entry = competitiveKpMatchesCache.puuid === puuid ? competitiveKpMatchesCache : null;
  if (!entry?.matches?.length) entry = getCompetitiveKpDiskCache(puuid);
  if (!entry?.matches?.length) return null;
  const isFresh = Date.now() - entry.fetchedAt < COMPETITIVE_KP_CACHE_MS;
  return allowStale || isFresh ? entry : null;
}

function saveCompetitiveKpMatches(puuid, matches, source) {
  const fetchedAt = Date.now();
  competitiveKpMatchesCache = { puuid, matches, fetchedAt, source };
  const saved = readJson(COMPETITIVE_KP_CACHE_FILE, { version: 1, entries: {} });
  const entries = saved?.entries && typeof saved.entries === "object" ? saved.entries : {};
  entries[puuid] = { matches, fetchedAt, source };
  const newestEntries = Object.fromEntries(
    Object.entries(entries)
      .sort((a, b) => Number(b[1]?.fetchedAt || 0) - Number(a[1]?.fetchedAt || 0))
      .slice(0, 4)
  );
  writeJson(COMPETITIVE_KP_CACHE_FILE, { version: 1, entries: newestEntries });
}

function recordCompetitiveKpDiagnostic(payload) {
  const rows = readJson(COMPETITIVE_KP_DIAGNOSTICS_FILE, []);
  rows.push({
    at: new Date().toISOString(),
    source: payload.source || "",
    ok: Boolean(payload.ok),
    statusCode: Number(payload.statusCode) || 0,
    durationMs: Math.max(0, Number(payload.durationMs) || 0),
    category: payload.category || "",
    message: String(payload.message || "").slice(0, 300)
  });
  writeJson(COMPETITIVE_KP_DIAGNOSTICS_FILE, rows.slice(-100));
}

function isTransientCompetitiveError(error) {
  const status = Number(error?.statusCode) || 0;
  return status === 408
    || status === 429
    || status >= 500
    || /timeout|timed out|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket/i.test(String(error?.message || ""));
}

async function retryCompetitiveRequest(task, attempts = 3) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await task(attempt);
    } catch (error) {
      lastError = error;
      const status = Number(error?.statusCode) || 0;
      const canRefreshAuthentication = status === 401 || status === 403;
      if (attempt >= attempts - 1 || (!isTransientCompetitiveError(error) && !canRefreshAuthentication)) throw error;
      const delay = Math.round(400 * (2 ** attempt) + Math.random() * 250);
      await sleep(delay);
    }
  }
  throw lastError;
}

async function createCompetitiveRiotContext() {
  const lockfileResult = readLockfileData();
  if (!lockfileResult.ok) {
    const error = new Error(lockfileResult.message || "VALORANT待機中");
    error.category = "lockfile";
    throw error;
  }
  const token = await requestLocalApi(lockfileResult.data, "/entitlements/v1/token");
  const puuid = String(token?.subject || "");
  if (!puuid) {
    const error = new Error("現在のVALORANTアカウントを確認できませんでした。");
    error.category = "account";
    throw error;
  }
  return {
    ok: true,
    lockfile: lockfileResult.data,
    token,
    puuid,
    host: GLZ_HOST,
    clientVersion: await getClientVersion()
  };
}

async function fetchCompetitiveKpMatches(context, { useCache = true } = {}) {
  const puuid = context.puuid;
  const cached = getCachedCompetitiveKpMatches(puuid);
  if (useCache && cached) return { ...cached, cached: true };
  if (competitiveKpMatchesInFlight?.puuid === puuid) return competitiveKpMatchesInFlight.promise;

  const promise = (async () => {
    const startedAt = Date.now();
    let riotError = null;
    try {
      const matches = await retryCompetitiveRequest(async () => {
        const freshContext = await createCompetitiveRiotContext();
        return getRiotCompetitiveMatchesByContext(freshContext, COMPETITIVE_KP_MATCH_LIMIT);
      });
      if (matches.length) {
        saveCompetitiveKpMatches(puuid, matches, "riot");
        recordCompetitiveKpDiagnostic({ source: "riot", ok: true, durationMs: Date.now() - startedAt });
        return { puuid, matches, fetchedAt: Date.now(), source: "riot", cached: false };
      }
      riotError = new Error("Riot側の試合履歴が空でした。");
    } catch (error) {
      riotError = error;
      recordCompetitiveKpDiagnostic({
        source: "riot",
        ok: false,
        statusCode: error?.statusCode,
        durationMs: Date.now() - startedAt,
        category: error?.category || "request",
        message: error?.message
      });
    }

    const henrikStartedAt = Date.now();
    try {
      const matches = await retryCompetitiveRequest(
        () => getHenrikCompetitiveMatchesByPuuid(puuid, COMPETITIVE_KP_MATCH_LIMIT),
        3
      );
      if (matches.length) {
        saveCompetitiveKpMatches(puuid, matches, "henrik");
        recordCompetitiveKpDiagnostic({ source: "henrik", ok: true, durationMs: Date.now() - henrikStartedAt });
        return { puuid, matches, fetchedAt: Date.now(), source: "henrik", cached: false };
      }
      if (!riotError) return { puuid, matches: [], fetchedAt: Date.now(), source: "henrik", cached: false };
    } catch (error) {
      recordCompetitiveKpDiagnostic({
        source: "henrik",
        ok: false,
        statusCode: error?.statusCode,
        durationMs: Date.now() - henrikStartedAt,
        category: isRateLimitError(error) ? "rate-limit" : "request",
        message: error?.message
      });
      if (!riotError) riotError = error;
      else riotError.fallbackError = error;
    }

    const stale = getCachedCompetitiveKpMatches(puuid, { allowStale: true });
    if (stale) return { ...stale, source: stale.source || "local-cache", cached: true, stale: true, error: riotError };
    throw riotError || new Error("試合履歴を取得できませんでした。");
  })();

  competitiveKpMatchesInFlight = { puuid, promise };
  try {
    return await promise;
  } finally {
    if (competitiveKpMatchesInFlight?.promise === promise) competitiveKpMatchesInFlight = null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(promise, ms, fallback) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms))
  ]);
}

function sendPlayersProgress(payload) {
  sendPlayersProgressCallback(payload);
}

function isFetchingPlayers() {
  return Boolean(activeFetchSession && !activeFetchSession.cancelled);
}

function cancelActiveFetch(reason = "cancelled") {
  if (!activeFetchSession) return;
  activeFetchSession.cancelled = true;
  activeFetchSession.cancelReason = reason;
}

function isSessionActive(session) {
  return Boolean(session && activeFetchSession === session && !session.cancelled);
}

function sendPlayersProgressForSession(session, payload) {
  if (isSessionActive(session)) sendPlayersProgress(payload);
}

function sendAutoStatus(status, fetchRate = "") {
  sendAutoStatusCallback({ status, fetchRate });
}

function getAutoDisplayStatusFromContext(context) {
  if (!autoWatchTimer) return "停止中";
  if (context?.mode === "pregame" || context?.modeLabel === "キャラピック") return "キャラピック中";
  if (context?.mode === "core" || context?.modeLabel === "試合中") return "試合中";
  return "試合待機中";
}

function getAllPlayersFromMatch(match) {
  const rawPlayers = [
    ...(Array.isArray(match?.Players) ? match.Players.map((player) => ({ ...player })) : []),
    ...(Array.isArray(match?.players) ? match.players.map((player) => ({ ...player })) : []),
    ...(Array.isArray(match?.AllyTeam?.Players) ? match.AllyTeam.Players.map((player) => ({ ...player, __teamHint: match?.AllyTeam?.TeamID || match?.AllyTeam?.TeamId || "Blue" })) : []),
    ...(Array.isArray(match?.EnemyTeam?.Players) ? match.EnemyTeam.Players.map((player) => ({ ...player, __teamHint: match?.EnemyTeam?.TeamID || match?.EnemyTeam?.TeamId || "Red" })) : []),
    ...(Array.isArray(match?.teams?.red?.players) ? match.teams.red.players.map((player) => ({ ...player, __teamHint: "Red" })) : []),
    ...(Array.isArray(match?.teams?.blue?.players) ? match.teams.blue.players.map((player) => ({ ...player, __teamHint: "Blue" })) : []),
    ...(Array.isArray(match?.players?.all_players) ? match.players.all_players.map((player) => ({ ...player })) : []),
    ...(Array.isArray(match?.players?.red) ? match.players.red.map((player) => ({ ...player, __teamHint: "Red" })) : []),
    ...(Array.isArray(match?.players?.blue) ? match.players.blue.map((player) => ({ ...player, __teamHint: "Blue" })) : [])
  ];

  const playerMap = new Map();
  for (const player of rawPlayers) {
    const puuid = player?.Subject || player?.subject || player?.puuid || player?.PUUID || "";
    if (!puuid) continue;

    const existing = playerMap.get(puuid);
    if (!existing) {
      playerMap.set(puuid, player);
      continue;
    }

    const existingTeam = existing?.TeamID || existing?.TeamId || existing?.teamId || existing?.team_id || existing?.team || existing?.__teamHint || "";
    const nextTeam = player?.TeamID || player?.TeamId || player?.teamId || player?.team_id || player?.team || player?.__teamHint || "";
    const existingCharacter = existing?.CharacterID || existing?.CharacterId || existing?.characterId || existing?.characterID || existing?.SelectedCharacterID || existing?.SelectedCharacterId || existing?.selectedCharacterId || existing?.selectedCharacterID || existing?.PlayerIdentity?.CharacterID || existing?.PlayerIdentity?.CharacterId || existing?.PlayerIdentity?.SelectedCharacterID || existing?.PlayerIdentity?.SelectedCharacterId || existing?.playerIdentity?.characterId || existing?.playerIdentity?.characterID || existing?.playerIdentity?.selectedCharacterId || existing?.playerIdentity?.selectedCharacterID || "";
    const nextCharacter = player?.CharacterID || player?.CharacterId || player?.characterId || player?.characterID || player?.SelectedCharacterID || player?.SelectedCharacterId || player?.selectedCharacterId || player?.selectedCharacterID || player?.PlayerIdentity?.CharacterID || player?.PlayerIdentity?.CharacterId || player?.PlayerIdentity?.SelectedCharacterID || player?.PlayerIdentity?.SelectedCharacterId || player?.playerIdentity?.characterId || player?.playerIdentity?.characterID || player?.playerIdentity?.selectedCharacterId || player?.playerIdentity?.selectedCharacterID || "";

    if ((!existingTeam && nextTeam) || (!existingCharacter && nextCharacter)) {
      playerMap.set(puuid, { ...existing, ...player, __teamHint: player.__teamHint || existing.__teamHint || "" });
    }
  }

  return Array.from(playerMap.values());
}

function findPlayerInHenrikMatch(match, puuid) {
  return getAllPlayersFromMatch(match).find((player) => {
    const playerPuuid = player?.puuid || player?.PUUID || player?.Subject || player?.stats?.puuid;
    return playerPuuid === puuid;
  });
}

function getPlayerNameFromHenrik(player) {
  const name = player?.name || player?.gameName || player?.game_name || player?.player?.name || player?.account?.name;
  const tag = player?.tag || player?.tagLine || player?.tag_line || player?.player?.tag || player?.account?.tag;
  if (name && tag) return normalizeDisplayName(`${name}#${tag}`);
  return normalizeDisplayName(name || "");
}

function pickPeakRankFromHenrikMmr(mmr) {
  const peak = mmr?.data?.highest_rank;
  if (peak?.patched_tier) return peak.patched_tier;
  if (peak?.tier) return getRankNameFromTier(peak.tier);
  return "-";
}

async function getHenrikRankInfoByPuuid(puuid) {
  const result = await requestHenrik(`/valorant/v2/by-puuid/mmr/${REGION}/${puuid}`);
  return {
    rank: normalizeRankName(result?.data?.current_data?.currenttierpatched || "-"),
    peakRank: normalizeRankName(pickPeakRankFromHenrikMmr(result))
  };
}

async function getHenrikRank(riotId) {
  const parsed = splitRiotId(riotId);
  if (!parsed) return "-";
  const name = encodeURIComponent(parsed.gameName);
  const tag = encodeURIComponent(parsed.tagLine);
  const result = await requestHenrik(`/valorant/v2/mmr/${REGION}/${name}/${tag}`);
  return normalizeRankName(result?.data?.current_data?.currenttierpatched || "-");
}

async function getHenrikRecentStats(puuid, riotId = "") {
  const parsedRiotId = splitRiotId(riotId);
  const fetchers = [
    async () => requestHenrik(`/valorant/v4/by-puuid/matches/${REGION}/pc/${puuid}?size=5`).then((result) => ({ matches: result?.data || [], stored: false })),
    async () => {
      if (!parsedRiotId) return { matches: [], stored: false };
      const name = encodeURIComponent(parsedRiotId.gameName);
      const tag = encodeURIComponent(parsedRiotId.tagLine);
      return requestHenrik(`/valorant/v4/matches/${REGION}/pc/${name}/${tag}?size=5`).then((result) => ({ matches: result?.data || [], stored: false }));
    },
    async () => requestHenrik(`/valorant/v1/by-puuid/stored-matches/${REGION}/${puuid}`).then((result) => ({ matches: (result?.data || []).slice(0, 5), stored: true }))
  ];

  for (const fetcher of fetchers) {
    try {
      const { matches, stored } = await fetcher();
      const stats = calculateRecentStats(matches, puuid, stored);
      if (stats.isUseful) return stats;
    } catch (error) {}
  }

  return { hsRate: "-", kd: "-", matches: 0, recentResults: "-", rankHint: "-", partyHistory: [], isUseful: false };
}

function calculateRecentStats(matches, puuid, useStoredStats) {
  let kills = 0;
  let deaths = 0;
  let headshots = 0;
  let bodyshots = 0;
  let legshots = 0;
  let usedMatches = 0;
  const results = [];
  const rankHints = [];
  const partyHistory = [];

  for (const match of matches) {
    const stats = useStoredStats ? getStoredMatchStats(match) : null;
    const player = stats ? null : findPlayerInHenrikMatch(match, puuid);
    if (!stats && !player) continue;

    kills += stats ? stats.kills : getPlayerStat(player, ["kills"]);
    deaths += stats ? stats.deaths : getPlayerStat(player, ["deaths"]);
    headshots += stats ? stats.headshots : getPlayerStat(player, ["headshots", "headshots_count"]);
    bodyshots += stats ? stats.bodyshots : getPlayerStat(player, ["bodyshots", "bodyshots_count"]);
    legshots += stats ? stats.legshots : getPlayerStat(player, ["legshots", "legshots_count"]);
    usedMatches += 1;

    const matchTier = stats ? stats.rankHint : player?.tier?.name || player?.tier?.patched_tier || "-";
    const partyId = stats ? stats.partyId : player?.party_id || player?.partyId || "";
    const matchId = stats ? stats.matchId : match?.metadata?.match_id || match?.match_id || "";
    const teamId = stats ? stats.teamId : player?.team_id || player?.team || "";

    if (isMeaningfulValue(matchTier)) rankHints.push(matchTier);
    if (partyId && matchId && teamId) partyHistory.push({ matchId, partyId, teamId });
    results.push(stats ? stats.result : getMatchResultText(match, player));
  }

  const shots = headshots + bodyshots + legshots;
  const hsRate = shots > 0 ? `${Math.round((headshots / shots) * 100)}%` : "-";
  const kd = usedMatches > 0 && deaths > 0 ? (kills / deaths).toFixed(2) : usedMatches > 0 ? String(kills) : "-";
  const recentResults = results.filter((result) => result === "○" || result === "×").slice(0, 5).join(" ") || "-";

  return {
    hsRate,
    kd,
    matches: usedMatches,
    recentResults,
    rankHint: normalizeRankName(rankHints.find((value) => isMeaningfulValue(value)) || "-"),
    partyHistory,
    isUseful: usedMatches > 0 && (shots > 0 || kills > 0 || deaths > 0 || recentResults !== "-")
  };
}

function buildEstimatedPartyLabels(players, isLoading = false) {
  const labels = ["A", "B"];
  players.forEach((player) => { player.estimatedPartyLabel = isLoading ? "-" : " "; });

  for (const team of ["Blue", "Red"]) {
    const teamPlayers = players.filter((player) => player.team === team);
    const groups = [];

    for (let i = 0; i < teamPlayers.length; i += 1) {
      for (let j = i + 1; j < teamPlayers.length; j += 1) {
        const a = teamPlayers[i];
        const b = teamPlayers[j];
        const matched = (a.partyHistory || []).some((ap) =>
          (b.partyHistory || []).some((bp) => ap.matchId === bp.matchId && ap.partyId === bp.partyId && ap.teamId === bp.teamId)
        );
        if (matched) groups.push([a.puuid, b.puuid]);
      }
    }

    const mergedGroups = [];
    for (const pair of groups) {
      let target = mergedGroups.find((group) => pair.some((puuid) => group.has(puuid)));
      if (!target) {
        target = new Set();
        mergedGroups.push(target);
      }
      pair.forEach((puuid) => target.add(puuid));
    }

    mergedGroups.slice(0, 2).forEach((group, index) => {
      players.forEach((player) => {
        if (group.has(player.puuid)) player.estimatedPartyLabel = labels[index];
      });
    });
  }

  return players;
}

function getSideStatus(match, myTeam) {
  const teams = match?.Teams || match?.teams || [];
  const myTeamData = Array.isArray(teams) ? teams.find((team) => team.TeamID === myTeam || team.teamId === myTeam || team.team_id === myTeam) : null;
  const side = myTeamData?.Side || myTeamData?.side || myTeamData?.CurrentSide || myTeamData?.currentSide;
  if (!side) return "不明";
  const sideText = String(side).toLowerCase();
  if (sideText.includes("attack")) return "攻め";
  if (sideText.includes("defend")) return "守り";
  return String(side);
}

function getQueueTexts(match) {
  return [
    match?.metadata?.queue,
    match?.metadata?.queue_id,
    match?.metadata?.mode_id,
    match?.metadata?.mode,
    match?.metadata?.playlist,
    match?.metadata?.game_mode,
    match?.metadata?.gameMode,
    match?.matchInfo?.queueID,
    match?.matchInfo?.queueId,
    match?.matchInfo?.queue,
    match?.MatchInfo?.QueueID,
    match?.MatchInfo?.QueueId,
    match?.MatchInfo?.Queue,
    match?.MatchmakingData?.QueueID,
    match?.matchmakingData?.queueId,
    match?.QueueID,
    match?.queueId,
    match?.queue,
    match?.ModeID,
    match?.modeId
  ].map((value) => String(value || "").toLowerCase()).filter(Boolean);
}

function isDeathmatchMatch(match) {
  const queueTexts = getQueueTexts(match);
  return queueTexts.some((text) => text === "deathmatch" || text === "dm" || text.includes("deathmatch"));
}

function isCompetitiveMatch(match) {
  const queueTexts = getQueueTexts(match);
  return queueTexts.some((text) => text === "competitive" || text === "コンペティティブ");
}

function getModeLabel(match) {
  const queueTexts = getQueueTexts(match);
  if (isCompetitiveMatch(match)) return "コンペ";
  if (isDeathmatchMatch(match)) return "デスマッチ";
  if (queueTexts.some((text) => text === "unrated" || text.includes("unrated"))) return "アンレート";
  if (queueTexts.some((text) => text === "swiftplay" || text.includes("swiftplay"))) return "スイフト";
  if (queueTexts.some((text) => text === "spikerush" || text.includes("spikerush"))) return "スパイクラッシュ";
  if (queueTexts.some((text) => text === "teamdeathmatch" || text.includes("teamdeathmatch"))) return "チームデスマッチ";
  return queueTexts[0] || "不明";
}

function makePlayerFromMatchPlayer(player) {
  const characterId =
    player?.CharacterID ||
    player?.CharacterId ||
    player?.characterId ||
    player?.characterID ||
    player?.SelectedCharacterID ||
    player?.SelectedCharacterId ||
    player?.selectedCharacterId ||
    player?.selectedCharacterID ||
    player?.PlayerIdentity?.CharacterID ||
    player?.PlayerIdentity?.CharacterId ||
    player?.PlayerIdentity?.SelectedCharacterID ||
    player?.PlayerIdentity?.SelectedCharacterId ||
    player?.playerIdentity?.characterId ||
    player?.playerIdentity?.characterID ||
    player?.playerIdentity?.selectedCharacterId ||
    player?.playerIdentity?.selectedCharacterID ||
    "未選択";

  const teamId =
    player?.TeamID ||
    player?.TeamId ||
    player?.teamId ||
    player?.team_id ||
    player?.team ||
    player?.__teamHint ||
    "未判定";

  const puuid =
    player?.Subject ||
    player?.subject ||
    player?.puuid ||
    player?.PUUID ||
    "";

  const characterName = getAgentName(characterId);
  return {
    puuid,
    team: teamId,
    sideLabel: "",
    characterId,
    characterName,
    characterImage: getAgentImagePath(characterName),
    matchRank: getRankNameFromTier(player?.SeasonalBadgeInfo?.Rank),
    currentKd: "-",
    currentHsRate: "-"
  };
}

function createBasicPlayerInfo(player, namesByPuuid) {
  const rawName = namesByPuuid.get(player.puuid);
  const name = normalizeDisplayName(rawName && rawName !== "-" ? rawName : "名前取得失敗");
  const rank = pickStableRankValue(player.matchRank, "-");
  const peakRank = "-";
  const hsRate = "-";
  const kd = "-";

  return {
    ...player,
    name,
    rank,
    rankImage: getRankImagePath(rank),
    peakRank,
    peakRankImage: getRankImagePath(peakRank),
    hsRate,
    kd,
    biasRank: getBiasRank(peakRank, hsRate, kd),
    recentResults: "-",
    recentMatches: 0,
    partyHistory: [],
    currentKd: player.currentKd || "-",
    currentHsRate: player.currentHsRate || "-"
  };
}

async function fetchPlayerInfo(player, namesByPuuid, isDeathmatch, lockedInfo = null) {
  const lockedName = lockedInfo?.name;
  const lockedRank = lockedInfo?.rank;
  const lockedPeakRank = lockedInfo?.peakRank;
  const lockedHsRate = lockedInfo?.hsRate;
  const lockedKd = lockedInfo?.kd;
  const lockedRecentResults = lockedInfo?.recentResults;
  const lockedPartyHistory = lockedInfo?.partyHistory || [];

  const rawName = namesByPuuid.get(player.puuid) || lockedName;
  const name = normalizeDisplayName(rawName && rawName !== "-" ? rawName : "名前取得失敗");
  let rank = normalizeRankName(lockedRank || player.matchRank || "-");
  let peakRank = normalizeRankName(lockedPeakRank || "-");
  let hsRate = lockedHsRate || "-";
  let kd = lockedKd || "-";
  let recentResults = lockedRecentResults || "-";
  let recentMatches = lockedInfo?.recentMatches || 0;
  let partyHistory = lockedPartyHistory.length > 0 ? lockedPartyHistory : [];
  let partyHistoryChecked = Boolean(lockedInfo?.partyHistoryChecked);

  const needsRank = !isMeaningfulValue(rank) || !isMeaningfulValue(peakRank);
  const needsRecent = isDeathmatch
    ? !isMeaningfulValue(hsRate)
    : (!isMeaningfulValue(hsRate) || !isMeaningfulValue(kd) || !isMeaningfulValue(recentResults));

  if (needsRank) {
    try {
      const rankInfo = await getHenrikRankInfoByPuuid(player.puuid);
      if (!isMeaningfulValue(rank)) rank = pickStableRankValue(rankInfo.rank, rank);
      if (!isMeaningfulValue(peakRank)) peakRank = pickStableRankValue(rankInfo.peakRank, peakRank);
    } catch (error) {
      try {
        if (!isMeaningfulValue(rank)) rank = pickStableRankValue(await getHenrikRank(name), rank);
      } catch (nameError) {
        rank = pickStableRankValue(player.matchRank, "-");
      }
    }
  }

  if (needsRecent) {
    try {
      const recentStats = await getHenrikRecentStats(player.puuid, name);
      if (!isMeaningfulValue(hsRate)) hsRate = pickStableValue(recentStats.hsRate, "-");
      if (!isMeaningfulValue(kd)) kd = pickStableValue(recentStats.kd, "-");
      if (!isMeaningfulValue(recentResults)) recentResults = pickStableValue(recentStats.recentResults, "-");
      recentMatches = recentStats.matches > 0 ? recentStats.matches : recentMatches;
      if (!isMeaningfulValue(rank)) rank = pickStableRankValue(recentStats.rankHint, rank);
      partyHistory = partyHistory.length > 0 ? partyHistory : recentStats.partyHistory;
      partyHistoryChecked = true;
    } catch (error) {
      partyHistoryChecked = true;
    }
  }

  return {
    ...player,
    name,
    rank,
    rankImage: getRankImagePath(rank),
    peakRank,
    peakRankImage: getRankImagePath(peakRank),
    hsRate,
    kd,
    biasRank: getBiasRank(peakRank, hsRate, kd),
    recentResults,
    recentMatches,
    partyHistory,
    partyHistoryChecked
  };
}

function isPlayerInfoComplete(playerInfo, isDeathmatch) {
  if (isDeathmatch) {
    return isMeaningfulValue(playerInfo.rank)
      && isMeaningfulValue(playerInfo.hsRate)
      && isMeaningfulValue(playerInfo.peakRank);
  }
  return isMeaningfulValue(playerInfo.rank) && isMeaningfulValue(playerInfo.peakRank) && isMeaningfulValue(playerInfo.hsRate) && isMeaningfulValue(playerInfo.kd) && isMeaningfulValue(playerInfo.recentResults);
}

function getPlayerFetchScore(playerInfo, isDeathmatch) {
  const fields = isDeathmatch ? ["rank", "hsRate", "peakRank"] : ["rank", "peakRank", "hsRate", "kd", "recentResults"];
  return fields.filter((field) => isMeaningfulValue(playerInfo?.[field])).length;
}

function mergeLockedPlayerInfo(baseInfo, lockedInfo = null) {
  if (!lockedInfo) return baseInfo;
  if (!isMeaningfulValue(lockedInfo.rank) && !isMeaningfulValue(lockedInfo.peakRank)) return baseInfo;
  const rank = pickStableRankValue(lockedInfo.rank, baseInfo.rank);
  const peakRank = pickStableRankValue(lockedInfo.peakRank, baseInfo.peakRank);
  const hsRate = pickStableValue(lockedInfo.hsRate, baseInfo.hsRate);
  const kd = pickStableValue(lockedInfo.kd, baseInfo.kd);
  const recentResults = pickStableValue(lockedInfo.recentResults, baseInfo.recentResults);
  const partyHistory = Array.isArray(lockedInfo.partyHistory) && lockedInfo.partyHistory.length > 0 ? lockedInfo.partyHistory : baseInfo.partyHistory;
  const partyHistoryChecked = Boolean(lockedInfo.partyHistoryChecked || baseInfo.partyHistoryChecked);

  return {
    ...baseInfo,
    name: pickStableValue(lockedInfo.name, baseInfo.name),
    rank,
    rankImage: getRankImagePath(rank),
    peakRank,
    peakRankImage: getRankImagePath(peakRank),
    hsRate,
    kd,
    biasRank: getBiasRank(peakRank, hsRate, kd),
    recentResults,
    recentMatches: lockedInfo.recentMatches || baseInfo.recentMatches,
    partyHistory,
    partyHistoryChecked
  };
}

function updateLastAutoPlayerCount(result) {
  const count = result?.data?.count || result?.count || 0;
  if (count > 0) lastAutoPlayerCount = count;
}

function formatCompetitiveMatchDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

async function getCompetitiveKpMatches() {
  let context = null;
  try {
    context = await createCompetitiveRiotContext();
  } catch (error) {
    return {
      ok: false,
      category: error?.category || "account",
      message: error?.message || "VALORANTのアカウント情報を取得できませんでした。",
      matches: []
    };
  }

  const puuid = context.puuid;
  const access = await checkAccountAccessCallback({ puuid });
  if (access?.blocked) return { ok: false, blocked: true, message: "\u3053\u306e\u30a2\u30ab\u30a6\u30f3\u30c8\u306f\u5229\u7528\u505c\u6b62\u4e2d\u3067\u3059\u3002", matches: [] };

  try {
    const result = await fetchCompetitiveKpMatches(context, { useCache: true });
    return {
      ok: true,
      matches: result.matches.map(normalizeCompetitiveKpMatch),
      source: result.source,
      stale: Boolean(result.stale),
      fetchedAt: result.fetchedAt,
      message: result.stale
        ? "最新の試合履歴を取得できなかったため、前回取得した履歴を表示しています。"
        : ""
    };
  } catch (error) {
    const fallbackError = error?.fallbackError;
    if (isRateLimitError(error) || isRateLimitError(fallbackError)) {
      return {
        ok: false,
        rateLimited: true,
        message: "\u8a66\u5408\u5c65\u6b74API\u304c\u6df7\u307f\u5408\u3063\u3066\u3044\u307e\u3059\u3002\u5c11\u3057\u5f85\u3063\u3066\u304b\u3089\u3082\u3046\u4e00\u5ea6\u8a66\u3057\u3066\u304f\u3060\u3055\u3044\u3002",
        matches: []
      };
    }
    const status = Number(error?.statusCode || fallbackError?.statusCode) || 0;
    if (status === 401 || status === 403) {
      return {
        ok: false,
        category: "authentication",
        message: "VALORANTの認証情報を更新できませんでした。Riot Clientを再起動してから、もう一度お試しください。",
        matches: []
      };
    }
    if (/timeout|timed out/i.test(String(error?.message || ""))) {
      return {
        ok: false,
        category: "timeout",
        message: "試合履歴の応答に時間がかかっています。自動で再試行しましたが取得できませんでした。",
        matches: []
      };
    }
    return {
      ok: false,
      category: "network",
      message: "試合履歴に接続できませんでした。通信状態を確認して、もう一度お試しください。",
      matches: []
    };
  }
}

async function getCurrentAccountInfo() {
  const lockfileResult = readLockfileData();
  if (!lockfileResult.ok) return { ok: false, waiting: true, message: lockfileResult.message || "VALORANT\u5f85\u6a5f\u4e2d" };

  const lockfile = lockfileResult.data;
  let token = null;
  try {
    token = await requestLocalApi(lockfile, "/entitlements/v1/token");
  } catch (error) {
    return { ok: false, waiting: true, message: "\u30a2\u30ab\u30a6\u30f3\u30c8\u53d6\u5f97\u5931\u6557: " + (error?.message || "\u30ed\u30fc\u30ab\u30ebAPI\u306b\u63a5\u7d9a\u3067\u304d\u307e\u305b\u3093") };
  }

  const puuid = token?.subject || "";
  if (!puuid) return { ok: false, waiting: true, message: "\u30a2\u30ab\u30a6\u30f3\u30c8\u53d6\u5f97\u5931\u6557" };

  const clientVersion = await getClientVersion();
  const context = { ok: true, lockfile, token, puuid, host: GLZ_HOST, clientVersion };
  let riotId = "-";
  try {
    const names = await getNamesByPuuid(context, [puuid]);
    riotId = names.get(puuid) || "-";
  } catch (error) {}
  return { ok: true, puuid, riotId, mode: "VALORANT\u8d77\u52d5\u4e2d" };
}

async function claimCompetitiveKp(matchId) {
  if (!matchId) return { ok: false, message: "試合が不正です", kpEarned: 0 };
  if (hasClaimedCompetitiveKp(matchId)) {
    return { ok: false, message: "この試合は獲得済みです", kpEarned: 0, alreadyClaimed: true };
  }

  const matchesResult = await getCompetitiveKpMatches();
  if (!matchesResult.ok) return { ok: false, message: matchesResult.message || "取得失敗", kpEarned: 0 };

  const targetMatch = (matchesResult.matches || []).find((match) => match.matchId === matchId);
  if (!targetMatch) return { ok: false, message: "過去5試合にありません", kpEarned: 0 };

  if (targetMatch.isClaimed) {
    return { ok: false, message: "この試合は獲得済みです", kpEarned: 0, alreadyClaimed: true };
  }

  const kpEarned = Math.max(0, Number(targetMatch.kills) || 0);
  const apEarned = Math.max(0, Number(targetMatch.assists) || 0);
  return {
    ok: true,
    message: kpEarned > 0 ? String(kpEarned) + "KP獲得" : "0KP獲得",
    kpEarned,
    apEarned,
    claimedMatchId: matchId
  };
}

async function getCurrentPlayersData({ auto = false, maxRounds = null, expectedContext = null, forceNew = false } = {}) {
  if (isFetchingPlayers() && !forceNew) return { ok: false, message: "取得中です" };
  if (forceNew) cancelActiveFetch("new-match");
  const session = {
    id: ++fetchSessionSeq,
    matchId: expectedContext?.matchId || "",
    mode: expectedContext?.mode || "",
    auto: Boolean(auto),
    cancelled: false,
    cancelReason: ""
  };
  activeFetchSession = session;
  stopFetchRequested = false;

  try {
    const context = expectedContext || await getCurrentGameContext();
    if (!context.ok) return context;
    session.matchId = context.matchId || "";
    session.mode = context.mode || "";
    const access = await checkAccountAccessCallback({ puuid: context.puuid });
    if (access?.blocked) {
      return { ok: false, blocked: true, message: "このアカウントは利用停止中です。" };
    }

    const requestedMaxRounds = Number(maxRounds);
    const effectiveMaxRounds = Number.isFinite(requestedMaxRounds) && requestedMaxRounds > 0
      ? requestedMaxRounds
      : context.mode === "pregame"
        ? PREGAME_FETCH_ROUNDS
        : INGAME_FETCH_ROUNDS;
    if (!isSessionActive(session)) return { ok: false, cancelled: true, message: "中止しました" };
    const match = await getMatchByContext(context);
    if (!isSessionActive(session)) return { ok: false, cancelled: true, message: "中止しました" };
    const isDeathmatch = isDeathmatchMatch(match);
    const modeLabel = getModeLabel(match);
    const players = getAllPlayersFromMatch(match)
      .map((player) => makePlayerFromMatchPlayer(player))
      .filter((player) => player.puuid);

    const myTeam = players.find((player) => player.puuid === context.puuid)?.team || "";
    players.forEach((player) => { player.sideLabel = myTeam && player.team === myTeam ? "味方" : "敵"; });
    if (context.mode === "pregame") {
      players.forEach((player) => {
        if (player.sideLabel !== "味方") return;
        player.characterId = "未選択";
        player.characterName = "未選択";
        player.characterImage = "";
      });
    }
    const selfKills = null;

    const namesByPuuid = await getNamesByPuuid(context, players.map((player) => player.puuid));
    if (!isSessionActive(session)) return { ok: false, cancelled: true, message: "中止しました" };
    const fixedPlayers = new Map();
    const lockedPlayers = new Map();

    if (lastShownMatchId === context.matchId) {
      lastShownPlayers.forEach((player) => {
        if (!isMeaningfulValue(player.rank) && !isMeaningfulValue(player.peakRank)) return;
        lockedPlayers.set(player.puuid, player);
        if (lastShownMode === context.mode && isPlayerInfoComplete(player, isDeathmatch)) fixedPlayers.set(player.puuid, player);
      });
    }

    let pendingPlayers = players.filter((player) => !fixedPlayers.has(player.puuid));

    function makePayload(progressText) {
      const currentPlayers = buildEstimatedPartyLabels(
        players.map((player) => fixedPlayers.get(player.puuid) || mergeLockedPlayerInfo(createBasicPlayerInfo(player, namesByPuuid), lockedPlayers.get(player.puuid))),
        pendingPlayers.length > 0
      );

      return {
        mode: context.modeLabel,
        modeLabel,
        matchId: context.matchId,
        mapName: getMapName(match.MapID || match.mapId || match.Map || match.map),
        side: getSideStatus(match, players.find((player) => player.puuid === context.puuid)?.team),
        partyStatus: "PT",
        isDeathmatch,
        count: currentPlayers.length,
        fetchRate: calculateFetchRate(currentPlayers, isDeathmatch),
        autoStatus: getAutoDisplayStatusFromContext(context),
        roundStatus: match?.RoundNumber ?? match?.roundNumber ?? "-",
        progressText,
        selfKills,
        currentKills: selfKills,
        players: currentPlayers
      };
    }

    sendPlayersProgressForSession(session, makePayload(auto ? "自動取得開始" : "基本情報表示 / 詳細取得中"));

    for (let round = 1; round <= effectiveMaxRounds && pendingPlayers.length > 0 && !stopFetchRequested && isSessionActive(session); round += 1) {
      const playersThisRound = [...pendingPlayers];
      sendPlayersProgressForSession(session, makePayload("詳細取得中 " + round + "/" + effectiveMaxRounds));

      const roundResults = await Promise.all(playersThisRound.map(async (player) => {
        const fallback = mergeLockedPlayerInfo(createBasicPlayerInfo(player, namesByPuuid), lockedPlayers.get(player.puuid));
        try {
          return await withTimeout(
            fetchPlayerInfo(player, namesByPuuid, isDeathmatch, lockedPlayers.get(player.puuid)),
            8000,
            fallback
          );
        } catch (error) {
          return fallback;
        }
      }));

      if (!isSessionActive(session)) return { ok: false, cancelled: true, message: "中止しました" };
      pendingPlayers = [];
      roundResults.forEach((result) => {
        lockedPlayers.set(result.puuid, result);
        if (isPlayerInfoComplete(result, isDeathmatch)) fixedPlayers.set(result.puuid, result);
        else pendingPlayers.push(result);
      });

      sendPlayersProgressForSession(session, makePayload("詳細取得中 " + round + "/" + effectiveMaxRounds));
      if (pendingPlayers.length > 0) {
        await sleep(5000);
        if (!isSessionActive(session)) return { ok: false, cancelled: true, message: "中止しました" };
      }
    }

    if (!isSessionActive(session)) return { ok: false, cancelled: true, message: "中止しました" };

    const finalPlayers = buildEstimatedPartyLabels(
      players.map((player) => fixedPlayers.get(player.puuid) || mergeLockedPlayerInfo(createBasicPlayerInfo(player, namesByPuuid), lockedPlayers.get(player.puuid))),
      false
    );

    lastShownPlayers = finalPlayers;
    lastShownMatchId = context.matchId;
    lastShownMode = context.mode;
    lastShownMapName = getMapName(match.MapID || match.mapId || match.Map || match.map);
    writeJson("last-active-match.json", { matchId: context.matchId, mode: context.modeLabel, mapName: lastShownMapName, selfPuuid: context.puuid, updatedAt: Date.now() });

    return {
      ok: true,
      message: stopFetchRequested ? "停止しました" : pendingPlayers.length > 0 ? "一部取得完了" : "取得完了",
      data: {
        mode: context.modeLabel,
        modeLabel,
        matchId: context.matchId,
        mapName: lastShownMapName,
        side: getSideStatus(match, players.find((player) => player.puuid === context.puuid)?.team),
        partyStatus: "PT",
        isDeathmatch,
        count: finalPlayers.length,
        fetchRate: calculateFetchRate(finalPlayers, isDeathmatch),
        autoStatus: getAutoDisplayStatusFromContext(context),
        roundStatus: match?.RoundNumber ?? match?.roundNumber ?? "-",
        growthItems: [],
        selfKills,
        currentKills: selfKills,
        players: finalPlayers
      }
    };
  } catch (error) {
    const message = String(error?.message || "取得失敗");
    if (!isSessionActive(session)) return { ok: false, cancelled: true, message: "中止しました" };
    sendPlayersProgressForSession(session, {
      mode: "取得失敗",
      modeLabel: "取得失敗",
      matchId: lastShownMatchId || "-",
      mapName: lastShownMapName || "-",
      side: "-",
      partyStatus: "PT",
      isDeathmatch: false,
      count: lastShownPlayers.length,
      fetchRate: "取得失敗",
      autoStatus: autoWatchTimer ? "試合待機中" : "停止中",
      roundStatus: "-",
      progressText: "取得失敗 / " + message,
      selfKills: null,
      currentKills: null,
      players: lastShownPlayers
    });
    return { ok: false, message };
  } finally {
    if (activeFetchSession === session) activeFetchSession = null;
  }
}

async function runAutoWatchTick() {
  const lockfile = readLockfileData();
  if (!lockfile.ok) {
    if (isFetchingPlayers()) cancelActiveFetch("waiting");
    sendAutoStatus("試合待機中", lockfile.message || "lockfileを確認できません");
    return;
  }

  const context = await getCurrentGameContext();
  if (!context.ok) {
    if (lastAutoMode === "キャラピック") {
      lastAutoMatchId = "";
      lastAutoMode = "";
    }
    if (isFetchingPlayers()) cancelActiveFetch("waiting");
    sendAutoStatus("試合待機中", context.message || (lastAutoPlayerCount ? "前回人数:" + lastAutoPlayerCount : ""));
    return;
  }

  lastAutoMatchId = context.matchId || lastAutoMatchId;
  lastAutoMode = context.modeLabel || lastAutoMode;

  if (isFetchingPlayers()) {
    if (!activeFetchSession?.auto) {
      sendAutoStatus(getAutoDisplayStatusFromContext(context), "");
      return;
    }
    const isSameActiveMatch = activeFetchSession?.matchId === context.matchId && activeFetchSession?.mode === context.mode;
    if (!isSameActiveMatch) {
      cancelActiveFetch("match-changed");
      sendAutoStatus(getAutoDisplayStatusFromContext(context), "試合変更を検知");
    } else {
      sendAutoStatus(getAutoDisplayStatusFromContext(context), "");
      return;
    }
  }

  const result = await getCurrentPlayersData({ auto: true, expectedContext: context, forceNew: Boolean(activeFetchSession?.cancelled) });
  if (result?.cancelled) {
    return;
  }
  updateLastAutoPlayerCount(result);

  if (result?.ok && result?.data?.matchId) {
    lastAutoMatchId = result.data.matchId;
    lastAutoMode = result.data.mode || "";
    sendAutoStatus(getAutoDisplayStatusFromContext(context), result.data.fetchRate || "");
    return;
  }

  sendAutoStatus("試合待機中", result?.message || (lastAutoPlayerCount ? "前回人数:" + lastAutoPlayerCount : ""));
}

function startAutoWatch() {
  if (autoWatchTimer) return { ok: true, message: "すでに監視中" };

  stopFetchRequested = false;
  autoWatchTimer = setInterval(() => {
    runAutoWatchTick().catch((error) => sendAutoStatus("自動取得失敗", error.message));
  }, AUTO_WATCH_INTERVAL_MS);
  runAutoWatchTick().catch((error) => sendAutoStatus("自動取得失敗", error.message));

  return { ok: true, message: "監視開始" };
}

function stopAutoWatch() {
  stopFetchRequested = true;
  cancelActiveFetch("stopped");
  if (autoWatchTimer) {
    clearInterval(autoWatchTimer);
    autoWatchTimer = null;
  }
  return { ok: true, message: "監視停止" };
}

module.exports = {
  claimCompetitiveKp,
  configureTrackerCore,
  getCompetitiveKpMatches,
  getCurrentAccountInfo,
  markClaimedCompetitiveKp,
  getCurrentGameContext,
  getCurrentPlayersData,
  readLockfileData,
  startAutoWatch,
  stopAutoWatch
};
