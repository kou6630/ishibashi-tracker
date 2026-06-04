const {
  BIAS_RANK_LABELS,
  PEAK_RANK_SCORE,
  normalizeRankName
} = require("./tracker-data");

function isOnlyEmptyMarks(text) {
  return Array.from(text).every((char) => char === "-" || char === "?" || char.trim() === "");
}

function isMeaningfulValue(value) {
  if (!value) return false;
  const text = String(value).trim();
  if (!text) return false;
  if (isOnlyEmptyMarks(text)) return false;
  if (text === "不明") return false;
  if (text === "取得失敗") return false;
  if (text === "ランク不明") return false;
  if (text === "名前非公開") return false;
  if (text === "名前取得失敗") return false;
  if (text === "非公開") return false;
  return true;
}

function isMeaningfulRankValue(value) {
  const rank = normalizeRankName(value);
  return isMeaningfulValue(rank) && rank !== "未ランク" && rank !== "Unrated";
}

function pickStableValue(newValue, cachedValue, fallback = "-") {
  if (isMeaningfulValue(newValue)) return newValue;
  if (isMeaningfulValue(cachedValue)) return cachedValue;
  return fallback;
}

function pickStableRankValue(newValue, cachedValue, fallback = "-") {
  const normalizedNew = normalizeRankName(newValue);
  const normalizedCached = normalizeRankName(cachedValue);

  if (isMeaningfulRankValue(normalizedNew)) return normalizedNew;
  if (isMeaningfulRankValue(normalizedCached)) return normalizedCached;
  if (normalizedNew === "未ランク" && !isMeaningfulValue(normalizedCached)) return "未ランク";
  return fallback;
}

function normalizeDisplayName(riotId) {
  const text = String(riotId || "").trim();
  if (!text) return "非公開";
  if (text === "Unknown#----") return "非公開";
  if (text.startsWith("Unknown#")) return "非公開";
  if (text === "名前非公開" || text === "名前取得失敗") return "非公開";
  return text;
}

function splitRiotId(riotId) {
  const text = String(riotId || "").trim();
  const hashIndex = text.lastIndexOf("#");
  if (hashIndex <= 0) return null;

  const gameName = text.slice(0, hashIndex);
  const tagLine = text.slice(hashIndex + 1);
  if (!gameName || !tagLine || gameName === "Unknown" || tagLine === "----") return null;

  return { gameName, tagLine };
}

function scorePeakRank(peakRank) {
  const rank = normalizeRankName(peakRank);
  return PEAK_RANK_SCORE[rank] || 0;
}

function scoreHsRate(hsRate) {
  const value = Number(String(hsRate || "").replace("%", ""));
  if (!Number.isFinite(value)) return 0;
  if (value >= 50) return 34;
  if (value >= 45) return 32;
  if (value >= 40) return 30;
  if (value >= 35) return 26;
  if (value >= 30) return 22;
  if (value >= 25) return 18;
  if (value >= 20) return 14;
  if (value >= 15) return 10;
  if (value >= 10) return 6;
  if (value >= 5) return 3;
  return 0;
}

function scoreKd(kd) {
  const value = Number(kd);
  if (!Number.isFinite(value)) return 0;
  if (value >= 3.5) return 33;
  if (value >= 2.8) return 32;
  if (value >= 2.2) return 30;
  if (value >= 1.9) return 27;
  if (value >= 1.6) return 24;
  if (value >= 1.4) return 21;
  if (value >= 1.2) return 18;
  if (value >= 1.1) return 15;
  if (value >= 1.0) return 12;
  if (value >= 0.9) return 9;
  if (value >= 0.7) return 6;
  if (value >= 0.5) return 3;
  return 0;
}

function getBiasRank(peakRank, hsRate, kd) {
  if (!isMeaningfulValue(peakRank) && !isMeaningfulValue(hsRate) && !isMeaningfulValue(kd)) {
    return "-";
  }

  const total = scorePeakRank(peakRank) + scoreHsRate(hsRate) + scoreKd(kd);
  const index = Math.max(0, Math.min(9, Math.floor(total / 10)));
  return BIAS_RANK_LABELS[index];
}

function getTeamName(value) {
  if (!value) return "";
  if (typeof value === "string") return value.toLowerCase();
  return String(value.name || value.TeamID || value.teamId || value.team_id || value.team || "").toLowerCase();
}

function getTeamWinState(match, teamName) {
  const team = getTeamName(teamName);
  const teams = match?.teams || match?.Teams || {};
  const redTeam = Array.isArray(teams) ? teams.find((item) => getTeamName(item).includes("red")) : teams.red || teams.Red;
  const blueTeam = Array.isArray(teams) ? teams.find((item) => getTeamName(item).includes("blue")) : teams.blue || teams.Blue;

  function readTeamWon(teamData) {
    const won = teamData?.has_won ?? teamData?.hasWon ?? teamData?.won ?? teamData?.HasWon;
    if (won === true) return true;
    if (won === false) return false;

    const roundsWon = Number(teamData?.rounds?.won ?? teamData?.rounds_won ?? teamData?.roundsWon ?? teamData?.RoundsWon ?? 0);
    const roundsLost = Number(teamData?.rounds?.lost ?? teamData?.rounds_lost ?? teamData?.roundsLost ?? teamData?.RoundsLost ?? 0);
    if (roundsWon > 0 || roundsLost > 0) return roundsWon > roundsLost;

    return null;
  }

  if (team.includes("red")) return readTeamWon(redTeam);
  if (team.includes("blue")) return readTeamWon(blueTeam);
  return null;
}

function getMatchResultText(match, player = null) {
  const directValues = [
    match?.metadata?.result,
    match?.metadata?.match_result,
    match?.result,
    player?.result,
    player?.stats?.result,
    player?.won,
    player?.has_won
  ];

  for (const value of directValues) {
    const text = String(value || "").toLowerCase();
    if (["win", "won", "victory", "w", "true"].includes(text)) return "○";
    if (["loss", "lost", "defeat", "l", "false"].includes(text)) return "×";
  }

  const playerTeam = player?.team?.name || player?.team || player?.TeamID || player?.teamId || player?.team_id || match?.stats?.team;
  const teamWon = getTeamWinState(match, playerTeam);
  if (teamWon === true) return "○";
  if (teamWon === false) return "×";

  return "-";
}

function getPlayerStat(player, names) {
  for (const name of names) {
    const directValue = player?.[name];
    const statsValue = player?.stats?.[name];
    if (typeof directValue === "number") return directValue;
    if (typeof statsValue === "number") return statsValue;
  }
  return 0;
}

function getPlayerMatchStats(player) {
  const kills = getPlayerStat(player, ["kills"]);
  const deaths = getPlayerStat(player, ["deaths"]);
  const assists = getPlayerStat(player, ["assists"]);
  const headshots = getPlayerStat(player, ["headshots", "headshots_count"]);
  const bodyshots = getPlayerStat(player, ["bodyshots", "bodyshots_count"]);
  const legshots = getPlayerStat(player, ["legshots", "legshots_count"]);
  const shots = headshots + bodyshots + legshots;

  return {
    kills,
    deaths,
    assists,
    kd: deaths > 0 ? Number((kills / deaths).toFixed(2)) : kills,
    hsRate: shots > 0 ? Math.round((headshots / shots) * 100) : 0
  };
}

function getStoredMatchStats(match) {
  const stats = match?.stats || match?.player_stats || null;
  if (!stats) return null;

  return {
    kills: Number(stats.kills || 0),
    deaths: Number(stats.deaths || 0),
    headshots: Number(stats.shots?.head || stats.headshots || 0),
    bodyshots: Number(stats.shots?.body || stats.bodyshots || 0),
    legshots: Number(stats.shots?.leg || stats.legshots || 0),
    result: getMatchResultText(match),
    rankHint: "-",
    partyId: match?.party_id || match?.partyId || "",
    matchId: match?.metadata?.match_id || match?.match_id || "",
    teamId: match?.team_id || match?.teamId || ""
  };
}

function readNumberFromKeys(value, keys) {
  for (const key of keys) {
    const current = value?.[key];
    if (typeof current === "number") return current;
    if (typeof current === "string" && current.trim() !== "" && Number.isFinite(Number(current))) return Number(current);
  }
  return 0;
}

function getLiveScoreStats(liveScore, puuid) {
  if (!liveScore || !puuid) {
    return {
      currentKills: null,
      currentDeaths: null,
      currentAssists: null,
      currentKd: "-",
      currentHsRate: "-",
      debugLog: "キル数探索: liveScoreまたはpuuidなし"
    };
  }

  const statsList = [];
  let matchedPuuidCount = 0;
  let objectCount = 0;

  function walk(value, depth = 0) {
    if (!value || depth > 9) return;
    if (Array.isArray(value)) {
      value.forEach((item) => walk(item, depth + 1));
      return;
    }
    if (typeof value !== "object") return;
    objectCount += 1;

    const playerPuuid =
      value?.puuid ||
      value?.PUUID ||
      value?.Subject ||
      value?.subject ||
      value?.player?.puuid ||
      value?.player?.PUUID ||
      value?.player?.Subject ||
      value?.player?.subject ||
      value?.Player?.Subject ||
      value?.Player?.subject;

    if (playerPuuid === puuid) {
      matchedPuuidCount += 1;
      statsList.push(value?.stats || value?.Stats || value?.playerStats || value?.PlayerStats || value);
    }

    Object.values(value).forEach((child) => walk(child, depth + 1));
  }

  walk(liveScore?.data || liveScore);

  if (!statsList.length) {
    return {
      currentKills: null,
      currentDeaths: null,
      currentAssists: null,
      currentKd: "-",
      currentHsRate: "-",
      debugLog: `キル数探索: PUUID一致なし / objects:${objectCount}`
    };
  }

  let kills = 0;
  let deaths = 0;
  let assists = 0;
  let headshots = 0;
  let bodyshots = 0;
  let legshots = 0;

  let killKeyHits = 0;

  for (const stats of statsList) {
    const foundKills = readNumberFromKeys(stats, ["kills", "Kills", "killCount", "KillCount", "scoreKills", "ScoreKills"]);
    if (Number.isFinite(Number(foundKills)) && Number(foundKills) > 0) killKeyHits += 1;
    kills += foundKills;
    deaths += readNumberFromKeys(stats, ["deaths", "Deaths", "deathCount", "DeathCount", "scoreDeaths", "ScoreDeaths"]);
    assists += readNumberFromKeys(stats, ["assists", "Assists", "assistCount", "AssistCount", "scoreAssists", "ScoreAssists"]);
    headshots += readNumberFromKeys(stats, ["headshots", "Headshots", "headShots", "HeadShots", "headshots_count"]);
    bodyshots += readNumberFromKeys(stats, ["bodyshots", "Bodyshots", "bodyShots", "BodyShots", "bodyshots_count"]);
    legshots += readNumberFromKeys(stats, ["legshots", "Legshots", "legShots", "LegShots", "legshots_count"]);
  }

  const shots = headshots + bodyshots + legshots;

  return {
    currentKills: kills,
    currentDeaths: deaths,
    currentAssists: assists,
    currentKd: deaths > 0 ? (kills / deaths).toFixed(2) : kills > 0 ? String(kills) : "-",
    currentHsRate: shots > 0 ? `${Math.round((headshots / shots) * 100)}%` : "-",
    debugLog: `キル数探索: PUUID一致${matchedPuuidCount}件 / stats${statsList.length}件 / killsキー${killKeyHits > 0 ? "あり" : "未検出"} / ${kills}K`
  };
}

function getCurrentMatchStats(match, puuid) {
  const statsList = [];

  function walk(value, depth = 0) {
    if (!value || depth > 7) return;
    if (Array.isArray(value)) {
      value.forEach((item) => walk(item, depth + 1));
      return;
    }
    if (typeof value !== "object") return;

    const playerPuuid = value?.player?.puuid || value?.player?.Subject || value?.puuid || value?.Subject;
    const stats = value?.stats || value?.playerStats || value?.PlayerStats;
    if (playerPuuid === puuid && stats) statsList.push(stats);

    Object.values(value).forEach((child) => walk(child, depth + 1));
  }

  walk(match);

  let kills = 0;
  let deaths = 0;
  let assists = 0;
  let headshots = 0;
  let bodyshots = 0;
  let legshots = 0;

  for (const stats of statsList) {
    kills += Number(stats.kills || stats.Kills || 0);
    deaths += Number(stats.deaths || stats.Deaths || 0);
    assists += Number(stats.assists || stats.Assists || 0);
    headshots += Number(stats.headshots || stats.Headshots || 0);
    bodyshots += Number(stats.bodyshots || stats.Bodyshots || 0);
    legshots += Number(stats.legshots || stats.Legshots || 0);
  }

  const shots = headshots + bodyshots + legshots;

  return {
    currentKills: kills,
    currentDeaths: deaths,
    currentAssists: assists,
    currentKd: deaths > 0 ? (kills / deaths).toFixed(2) : kills > 0 ? String(kills) : "-",
    currentHsRate: shots > 0 ? `${Math.round((headshots / shots) * 100)}%` : "-"
  };
}

function calculateFetchRate(players, isDeathmatch) {
  const fields = isDeathmatch ? ["rank", "peakRank"] : ["rank", "kd", "hsRate", "recentResults", "peakRank"];
  const total = players.length * fields.length;
  const done = players.reduce((count, player) => count + fields.filter((field) => isMeaningfulValue(player[field])).length, 0);
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return `${percent}% / ${done}/${total}`;
}

function buildGrowthItems(currentStats, previousStats) {
  if (!currentStats) return [];

  const items = [];
  if (previousStats) {
    if (currentStats.kills > Number(previousStats.kills || 0)) items.push(`キル +${currentStats.kills - Number(previousStats.kills || 0)}`);
    if (currentStats.deaths < Number(previousStats.deaths || 0)) items.push(`デス -${Number(previousStats.deaths || 0) - currentStats.deaths}`);
    if (currentStats.hsRate > Number(previousStats.hsRate || 0)) items.push(`HS率 +${currentStats.hsRate - Number(previousStats.hsRate || 0)}%`);
    if (currentStats.kd > Number(previousStats.kd || 0)) items.push(`KD +${(currentStats.kd - Number(previousStats.kd || 0)).toFixed(2)}`);
  }

  return items.length ? items : ["前試合から大きな上昇なし"];
}

module.exports = {
  buildGrowthItems,
  calculateFetchRate,
  getBiasRank,
  getCurrentMatchStats,
  getLiveScoreStats,
  getMatchResultText,
  getPlayerMatchStats,
  getPlayerStat,
  getStoredMatchStats,
  isMeaningfulRankValue,
  isMeaningfulValue,
  normalizeDisplayName,
  pickStableRankValue,
  pickStableValue,
  splitRiotId
};


