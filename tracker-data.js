const AGENT_NAMES = {
  "5f8d3a7f-467b-97f3-062c-13acf203c006": "ブリーチ",
  "f94c3b30-42be-e959-889c-5aa313dba261": "レイズ",
  "6f2a04ca-43e0-be17-7f36-b3908627744d": "スカイ",
  "117ed9e3-49f3-6512-3ccf-0cada7e3823b": "サイファー",
  "320b2a48-4d9b-a075-30f1-1f93a9b638fa": "ソーヴァ",
  "569fdd95-4d10-43ab-ca70-79becc718b46": "セージ",
  "8e253930-4c05-31dd-1b6c-968525494517": "オーメン",
  "add6443a-41bd-e414-f6ad-e58d267f4e95": "ジェット",
  "a3bfb853-43b2-7238-a4f1-ad90e9e46bcc": "レイナ",
  "9f0d8ba9-4140-b941-57d3-a7ad57c6b417": "ブリムストーン",
  "707eab51-4836-f488-046a-cda6bf494859": "ヴァイパー",
  "eb93336a-449b-9c1b-0a54-a891f7921d69": "フェニックス",
  "41fb69c1-4189-7b37-f117-bcaf1e96f1bf": "アストラ",
  "bb2a4828-46eb-8cd1-e765-15848195d751": "ネオン",
  "601dbbe7-43ce-be57-2a40-4abd24953621": "KAY/O",
  "1e58de9c-4950-5125-93e9-a0aee9f98746": "キルジョイ",
  "1dbf2edd-4729-0984-3115-daa5eed44993": "クローヴ",
  "7c8a4701-4de6-9355-b254-e09bc2a34b72": "ミクス",
  "95b78ed7-4637-86d9-7e41-71ba8c293152": "ハーバー",
  "dade69b4-4f5a-8528-247b-219e5a1facd6": "フェイド",
  "cc8b64c8-4b25-4ff9-6e7f-37b4da43d235": "デッドロック",
  "0e38b510-41a8-5780-5e8f-568b2a4f2d6c": "アイソ",
  "efba5359-4016-a1e5-7626-b1ae76895940": "ヴァイス",
  "e370fa57-4757-3604-3648-499e1f642d3f": "ゲッコー",
  "b444168c-4e35-8076-db47-ef9bf368f384": "テホ",
  "df1cb487-4902-002e-5c17-d28e83e78588": "ウェイレイ",
  "7f94d92c-4234-0a36-9646-3a87eb8b5c89": "ヨル",
  "22697a3d-45bf-8dd7-4fec-84a9e28c69d7": "チェンバー",
  "92eeef5d-43b5-1d4a-8d03-b3927a09034b": "ヴィトー"
};

const RANK_NAMES = {
  0: "-",
  1: "未ランク",
  2: "未ランク",
  3: "アイアン1",
  4: "アイアン2",
  5: "アイアン3",
  6: "ブロンズ1",
  7: "ブロンズ2",
  8: "ブロンズ3",
  9: "シルバー1",
  10: "シルバー2",
  11: "シルバー3",
  12: "ゴールド1",
  13: "ゴールド2",
  14: "ゴールド3",
  15: "プラチナ1",
  16: "プラチナ2",
  17: "プラチナ3",
  18: "ダイヤ1",
  19: "ダイヤ2",
  20: "ダイヤ3",
  21: "アセンダント1",
  22: "アセンダント2",
  23: "アセンダント3",
  24: "イモータル1",
  25: "イモータル2",
  26: "イモータル3",
  27: "レディアント"
};

const MAP_NAMES = {
  ascent: "アセント",
  bind: "バインド",
  duality: "バインド",
  breeze: "ブリーズ",
  foxtrot: "ブリーズ",
  fracture: "フラクチャー",
  canyon: "フラクチャー",
  haven: "ヘイヴン",
  triad: "ヘイヴン",
  icebox: "アイスボックス",
  port: "アイスボックス",
  lotus: "ロータス",
  jam: "ロータス",
  pearl: "パール",
  pitt: "パール",
  split: "スプリット",
  bonsai: "スプリット",
  sunset: "サンセット",
  juliett: "サンセット",
  abyss: "アビス",
  infinity: "アビス",
  corrode: "カロード"
};

const BIAS_RANK_LABELS = [
  "ナメクジ",
  "濡れティッシュ",
  "迷子のヒヨコ",
  "反抗期の一般兵",
  "町内会エース",
  "部活の先輩",
  "エイムゴリラ",
  "妖怪ワンタップ",
  "機械",
  "真理"
];

const PEAK_RANK_SCORE = {
  "アイアン1": 1,
  "アイアン2": 2,
  "アイアン3": 3,
  "ブロンズ1": 4,
  "ブロンズ2": 5,
  "ブロンズ3": 6,
  "シルバー1": 8,
  "シルバー2": 9,
  "シルバー3": 10,
  "ゴールド1": 12,
  "ゴールド2": 13,
  "ゴールド3": 14,
  "プラチナ1": 16,
  "プラチナ2": 17,
  "プラチナ3": 18,
  "ダイヤ1": 20,
  "ダイヤ2": 21,
  "ダイヤ3": 22,
  "アセンダント1": 24,
  "アセンダント2": 25,
  "アセンダント3": 26,
  "イモータル1": 29,
  "イモータル2": 31,
  "イモータル3": 32,
  "レディアント": 33
};

function normalizeRankName(rank) {
  const text = String(rank || "").trim();
  if (!text || text === "-") return "-";
  if (text === "未ランク") return "未ランク";

  const map = {
    Unrated: "未ランク",
    "Iron 1": "アイアン1",
    "Iron 2": "アイアン2",
    "Iron 3": "アイアン3",
    "Bronze 1": "ブロンズ1",
    "Bronze 2": "ブロンズ2",
    "Bronze 3": "ブロンズ3",
    "Silver 1": "シルバー1",
    "Silver 2": "シルバー2",
    "Silver 3": "シルバー3",
    "Gold 1": "ゴールド1",
    "Gold 2": "ゴールド2",
    "Gold 3": "ゴールド3",
    "Platinum 1": "プラチナ1",
    "Platinum 2": "プラチナ2",
    "Platinum 3": "プラチナ3",
    "Diamond 1": "ダイヤ1",
    "Diamond 2": "ダイヤ2",
    "Diamond 3": "ダイヤ3",
    "Ascendant 1": "アセンダント1",
    "Ascendant 2": "アセンダント2",
    "Ascendant 3": "アセンダント3",
    "Immortal 1": "イモータル1",
    "Immortal 2": "イモータル2",
    "Immortal 3": "イモータル3",
    Radiant: "レディアント"
  };

  return map[text] || text;
}

function getRankNameFromTier(tier) {
  return RANK_NAMES[Number(tier)] || "-";
}

function getRankImagePath(rank) {
  const normalizedRank = normalizeRankName(rank);
  if (!normalizedRank || normalizedRank === "-" || normalizedRank === "未ランク") return "";
  return `img/ranks/${normalizedRank}.png`;
}

function getAgentName(characterId) {
  if (!characterId || characterId === "未選択") return "未選択";
  return AGENT_NAMES[String(characterId).toLowerCase()] || "不明";
}

function normalizeAgentDisplayName(agentName) {
  const text = String(agentName || "").trim();
  if (!text) return "";

  const lowerText = text.toLowerCase();
  const map = {
    breach: "ブリーチ",
    raze: "レイズ",
    skye: "スカイ",
    cypher: "サイファー",
    sova: "ソーヴァ",
    sage: "セージ",
    omen: "オーメン",
    jett: "ジェット",
    reyna: "レイナ",
    brimstone: "ブリムストーン",
    viper: "ヴァイパー",
    phoenix: "フェニックス",
    astra: "アストラ",
    neon: "ネオン",
    "kay/o": "KAY/O",
    kayo: "KAY/O",
    killjoy: "キルジョイ",
    clove: "クローヴ",
    vyse: "ヴァイス",
    harbor: "ハーバー",
    fade: "フェイド",
    deadlock: "デッドロック",
    iso: "アイソ",
    gekko: "ゲッコー",
    tejo: "テホ",
    waylay: "ウェイレイ",
    yoru: "ヨル",
    chamber: "チェンバー"
  };

  return map[lowerText] || map[text] || text;
}

function getAgentImagePath(agentName) {
  const normalizedAgentName = normalizeAgentDisplayName(agentName);
  if (!normalizedAgentName || normalizedAgentName === "未選択" || normalizedAgentName === "不明") return "";
  const safeName = normalizedAgentName === "KAY/O" ? "KAYO" : normalizedAgentName;
  return `img/agents/${safeName}.png`;
}

function getCompetitiveAgentImagePath(agentName, externalImage = "") {
  const localImagePath = getAgentImagePath(agentName);
  return localImagePath || externalImage || "";
}

function getMapName(mapId) {
  const text = String(mapId || "").toLowerCase();
  for (const [key, value] of Object.entries(MAP_NAMES)) {
    if (text.includes(key)) return value;
  }
  return mapId ? "不明" : "-";
}

module.exports = {
  BIAS_RANK_LABELS,
  PEAK_RANK_SCORE,
  getAgentImagePath,
  getCompetitiveAgentImagePath,
  getAgentName,
  getMapName,
  getRankImagePath,
  getRankNameFromTier,
  normalizeRankName
};



