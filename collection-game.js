(() => {
  const STORAGE_KEY = "valorant_collection_game_v2";
  const EGG_COST = 10;
  const HATCH_COST = 15;
  const TRACKER_MAX_LEVEL = 18;
  const SERIES2_UNLOCK_LEVEL = 9;
  const SERIES3_UNLOCK_LEVEL = 18;

  const TRACKER_UNLOCK_LABELS = {
    0: "基本機能",
    1: "孵化場解放",
    2: "コレクション解放",
    3: "ゴールド卵解放",
    4: "プラチナ卵解放",
    5: "ダイヤ卵解放",
    6: "アセンダント卵解放",
    7: "イモータル卵解放",
    8: "レディアント卵解放",
    9: "シリーズ2解放",
    10: "スキルUP解放",
    11: "おまけKP確率解放",
    12: "おまけAP確率解放",
    13: "おまけKP量UP解放",
    14: "おまけAP量UP解放",
    15: "卵召喚KP減少解放",
    16: "孵化KP減少解放",
    17: "石橋ルーレット発生率解放",
    18: "シリーズ3解放"
  };

  const EGG_TYPES = [
    { id: "iron", label: "アイアン色", rate: 35 },
    { id: "bronze", label: "ブロンズ色", rate: 25 },
    { id: "silver", label: "シルバー色", rate: 17 },
    { id: "gold", label: "ゴールド色", rate: 10 },
    { id: "platinum", label: "プラチナ色", rate: 5 },
    { id: "diamond", label: "ダイヤ色", rate: 4 },
    { id: "ascendant", label: "アセンダント色", rate: 3 },
    { id: "immortal", label: "イモータル色", rate: 1.5 },
    { id: "radiant", label: "レディアント色", rate: 0.1 }
  ];

  const EGG_UNLOCK_LEVEL_BY_ID = {
    iron: 0,
    bronze: 0,
    silver: 0,
    gold: 3,
    platinum: 4,
    diamond: 5,
    ascendant: 6,
    immortal: 7,
    radiant: 8
  };

  const EGG_RATE_TABLE_BY_LEVEL = {
    0: { iron: 45, bronze: 35, silver: 20 },
    3: { iron: 40, bronze: 30, silver: 20, gold: 10 },
    4: { iron: 36, bronze: 28, silver: 20, gold: 10, platinum: 6 },
    5: { iron: 33, bronze: 26, silver: 20, gold: 10, platinum: 7, diamond: 4 },
    6: { iron: 30, bronze: 24, silver: 20, gold: 10, platinum: 8, diamond: 5, ascendant: 3 },
    7: { iron: 28, bronze: 22, silver: 20, gold: 10, platinum: 8, diamond: 6, ascendant: 4, immortal: 2 },
    8: { iron: 27, bronze: 21, silver: 19, gold: 10, platinum: 8, diamond: 6, ascendant: 5, immortal: 3, radiant: 0.1 }
  };

  const EGG_IMAGE_PATHS = {
    iron: "img/egg/アイアンの卵.png",
    bronze: "img/egg/ブロンズの卵.png",
    silver: "img/egg/シルバーの卵.png",
    gold: "img/egg/ゴールドの卵.png",
    platinum: "img/egg/プラチナの卵.png",
    diamond: "img/egg/ダイヤの卵.png",
    ascendant: "img/egg/アセンダントの卵.png",
    immortal: "img/egg/イモータルの卵.png",
    radiant: "img/egg/レディアントの卵.png"
  };

  const SERIES_META = {
    1: { title: "シリーズ1", unlockLevel: 0, effect: "おまけKP確率5%" },
    2: { title: "シリーズ2", unlockLevel: SERIES2_UNLOCK_LEVEL, effect: "おまけAP確率5%" },
    3: { title: "シリーズ3", unlockLevel: SERIES3_UNLOCK_LEVEL, effect: "ルーレット発生率5%" },
    4: { title: "シリーズ4", unlockLevel: Infinity, effect: "隠しコレクション" }
  };

  const SKILL_COSTS = {
    level5: [5, 15, 25, 40, 50],
    level8: [5, 10, 15, 25, 35, 40, 45, 50],
    level16: [5, 7, 9, 11, 13, 15, 18, 21, 24, 28, 32, 36, 40, 44, 47, 50]
  };

  const SKILL_DEFS = [
    { id: "bonusKpChance", name: "おまけKP獲得確率", unlockLevel: 11, maxLevel: 16, costs: SKILL_COSTS.level16, type: "chance" },
    { id: "bonusApChance", name: "おまけAP獲得確率", unlockLevel: 12, maxLevel: 16, costs: SKILL_COSTS.level16, type: "chance" },
    { id: "bonusKpAmount", name: "おまけKP獲得量", unlockLevel: 13, maxLevel: 5, costs: SKILL_COSTS.level5, type: "amount" },
    { id: "bonusApAmount", name: "おまけAP獲得量", unlockLevel: 14, maxLevel: 5, costs: SKILL_COSTS.level5, type: "amount" },
    { id: "summonDiscount", name: "卵召喚必要KP量減少", unlockLevel: 15, maxLevel: 5, costs: SKILL_COSTS.level5, type: "discount" },
    { id: "hatchDiscount", name: "孵化必要KP量減少", unlockLevel: 16, maxLevel: 5, costs: SKILL_COSTS.level5, type: "discount" },
    { id: "rouletteChance", name: "石橋ルーレット発生率", unlockLevel: 17, maxLevel: 8, costs: SKILL_COSTS.level8, type: "chance" }
  ];

  const SERIES_CHARACTERS = {
    1: [
      createCharacter(1, "iron1", "アイアン1", "iron", "キルジョイの帽子", "img/キャラ/キルジョイの帽子.png"),
      createCharacter(1, "iron2", "アイアン2", "iron", "サイファーの帽子", "img/キャラ/サイファーの帽子.png"),
      createCharacter(1, "iron3", "アイアン3", "iron", "ブリムストーンの帽子", "img/キャラ/ブリムストーンの帽子.png"),
      createCharacter(1, "bronze1", "ブロンズ1", "bronze", "デブヴァイパー", "img/キャラ/デブヴァイパー.png"),
      createCharacter(1, "bronze2", "ブロンズ2", "bronze", "デブヨル", "img/キャラ/デブヨル.png"),
      createCharacter(1, "bronze3", "ブロンズ3", "bronze", "デブセージ", "img/キャラ/デブセージ.png"),
      createCharacter(1, "silver1", "シルバー1", "silver", "キルジョイタレット", "img/キャラ/キルジョイタレット.png"),
      createCharacter(1, "silver2", "シルバー2", "silver", "ドローン", "img/キャラ/ドローン.png"),
      createCharacter(1, "silver3", "シルバー3", "silver", "ウィングマン", "img/キャラ/ウィングマン.png"),
      createCharacter(1, "gold1", "ゴールド", "gold", "ニセジェット", "img/キャラ/ニセジェット.png"),
      createCharacter(1, "gold2", "ゴールド", "gold", "ニセオーメン", "img/キャラ/ニセオーメン.png"),
      createCharacter(1, "gold3", "ゴールド", "gold", "ニセレイズ", "img/キャラ/ニセレイズ.png"),
      createCharacter(1, "platinum1", "プラチナ1", "platinum", "コスプレヴィトー", "img/キャラ/コスプレヴィトー.png"),
      createCharacter(1, "platinum2", "プラチナ2", "platinum", "コスプレフェニックス", "img/キャラ/コスプレフェニックス.png"),
      createCharacter(1, "platinum3", "プラチナ3", "platinum", "コスプレレイナ", "img/キャラ/コスプレレイナ.png"),
      createCharacter(1, "diamond1", "ダイヤ1", "diamond", "筋肉ムキムキのヨル", "img/キャラ/筋肉ムキムキのヨル.png"),
      createCharacter(1, "diamond2", "ダイヤ2", "diamond", "筋肉ムキムキのアイソ", "img/キャラ/筋肉ムキムキのアイソ.png"),
      createCharacter(1, "diamond3", "ダイヤ3", "diamond", "筋肉ムキムキのソーヴァ", "img/キャラ/筋肉ムキムキのソーヴァ.png"),
      createCharacter(1, "ascendant1", "アセンダント", "ascendant", "金のジェット", "img/キャラ/金のジェット.png"),
      createCharacter(1, "ascendant2", "アセンダント", "ascendant", "金のオーメン", "img/キャラ/金のオーメン.png"),
      createCharacter(1, "ascendant3", "アセンダント", "ascendant", "金のセージ", "img/キャラ/金のセージ.png"),
      createCharacter(1, "immortal1", "イモータル1", "immortal", "神のウェイレイ", "img/キャラ/神のウェイレイ.png"),
      createCharacter(1, "immortal2", "イモータル2", "immortal", "神のネオン", "img/キャラ/神のネオン.png"),
      createCharacter(1, "immortal3", "イモータル3", "immortal", "神のキルジョイ", "img/キャラ/神のキルジョイ.png"),
      createCharacter(1, "radiant", "レディアント", "radiant", "ゴリさん", "img/キャラ/ゴリさん.png")
    ],
    2: [
      createCharacter(2, "series2_iron1", "アイアン", "iron", "レイズの帽子", "img/キャラ2/レイズの帽子.png"),
      createCharacter(2, "series2_iron2", "アイアン", "iron", "チェンバーの眼鏡", "img/キャラ2/チェンバーの眼鏡.png"),
      createCharacter(2, "series2_iron3", "アイアン", "iron", "ソーヴァのカツラ", "img/キャラ2/ソーヴァのカツラ.png"),
      createCharacter(2, "series2_bronze1", "ブロンズ", "bronze", "ぬいぐるみフェイド", "img/キャラ2/ぬいぐるみフェイド.png"),
      createCharacter(2, "series2_bronze2", "ブロンズ", "bronze", "ぬいぐるみアストラ", "img/キャラ2/ぬいぐるみアストラ.png"),
      createCharacter(2, "series2_bronze3", "ブロンズ", "bronze", "ぬいぐるみブリーチ", "img/キャラ2/ぬいぐるみブリーチ.png"),
      createCharacter(2, "series2_silver1", "シルバー", "silver", "ケイオーの頭", "img/キャラ2/ケイオーの頭.png"),
      createCharacter(2, "series2_silver2", "シルバー", "silver", "ケイオーの上半身", "img/キャラ2/ケイオーの上半身.png"),
      createCharacter(2, "series2_silver3", "シルバー", "silver", "ケイオーの下半身", "img/キャラ2/ケイオーの下半身.png"),
      createCharacter(2, "series2_gold1", "ゴールド", "gold", "石像テホ", "img/キャラ2/石像テホ.png"),
      createCharacter(2, "series2_gold2", "ゴールド", "gold", "石像ヴァイパー", "img/キャラ2/石像ヴァイパー.png"),
      createCharacter(2, "series2_gold3", "ゴールド", "gold", "石像スカイ", "img/キャラ2/石像スカイ.png"),
      createCharacter(2, "series2_platinum1", "プラチナ", "platinum", "激痩せクローヴ", "img/キャラ2/激痩せクローヴ.png"),
      createCharacter(2, "series2_platinum2", "プラチナ", "platinum", "激痩せミクス", "img/キャラ2/激痩せミクス.png"),
      createCharacter(2, "series2_platinum3", "プラチナ", "platinum", "激痩せフェニックス", "img/キャラ2/激痩せフェニックス.png"),
      createCharacter(2, "series2_diamond1", "ダイヤ", "diamond", "黒ギャルキルジョイ", "img/キャラ2/黒ギャルキルジョイ.png"),
      createCharacter(2, "series2_diamond2", "ダイヤ", "diamond", "黒ギャルジェット", "img/キャラ2/黒ギャルジェット.png"),
      createCharacter(2, "series2_diamond3", "ダイヤ", "diamond", "黒ギャルソーヴァ", "img/キャラ2/黒ギャルソーヴァ.png"),
      createCharacter(2, "series2_ascendant1", "アセンダント", "ascendant", "三点倒立セージ", "img/キャラ2/三点倒立セージ.png"),
      createCharacter(2, "series2_ascendant2", "アセンダント", "ascendant", "三点倒立ネオン", "img/キャラ2/三点倒立ネオン.png"),
      createCharacter(2, "series2_ascendant3", "アセンダント", "ascendant", "三点倒立レイナ", "img/キャラ2/三点倒立レイナ.png"),
      createCharacter(2, "series2_immortal1", "イモータル", "immortal", "魔王ブリムストーン", "img/キャラ2/魔王ブリムストーン.png"),
      createCharacter(2, "series2_immortal2", "イモータル", "immortal", "魔王オーメン", "img/キャラ2/魔王オーメン.png"),
      createCharacter(2, "series2_immortal3", "イモータル", "immortal", "魔王ヨル", "img/キャラ2/魔王ヨル.png"),
      createCharacter(2, "series2_radiant", "レディアント", "radiant", "リナさん", "img/キャラ2/リナさん.png")
    ],
    3: [
      createCharacter(3, "series3_iron1", "アイアン", "iron", "初期スキンのクラシック", "img/キャラ3/初期スキンのクラシック.png"),
      createCharacter(3, "series3_iron2", "アイアン", "iron", "初期スキンのショーティー", "img/キャラ3/初期スキンのショーティー.png"),
      createCharacter(3, "series3_iron3", "アイアン", "iron", "初期スキンのスペクター", "img/キャラ3/初期スキンのスペクター.png"),
      createCharacter(3, "series3_bronze1", "ブロンズ", "bronze", "赤の折り紙フレンジー", "img/キャラ3/赤の折り紙フレンジー.png"),
      createCharacter(3, "series3_bronze2", "ブロンズ", "bronze", "青の折り紙バッキー", "img/キャラ3/青の折り紙バッキー.png"),
      createCharacter(3, "series3_bronze3", "ブロンズ", "bronze", "緑の折り紙マーシャル", "img/キャラ3/緑の折り紙マーシャル.png"),
      createCharacter(3, "series3_silver1", "シルバー", "silver", "奇跡的にゴーストの形した大根", "img/キャラ3/奇跡的にゴーストの形した大根.png"),
      createCharacter(3, "series3_silver2", "シルバー", "silver", "奇跡的にスティンガーの形した人参", "img/キャラ3/奇跡的にスティンガーの形した人参.png"),
      createCharacter(3, "series3_silver3", "シルバー", "silver", "奇跡的にブルドッグの形したピーマン", "img/キャラ3/奇跡的にブルドッグの形したピーマン.png"),
      createCharacter(3, "series3_gold1", "ゴールド", "gold", "虎柄シェリフ", "img/キャラ3/虎柄シェリフ.png"),
      createCharacter(3, "series3_gold2", "ゴールド", "gold", "虎柄ジャッジ", "img/キャラ3/虎柄ジャッジ.png"),
      createCharacter(3, "series3_gold3", "ゴールド", "gold", "虎柄ガーディアン", "img/キャラ3/虎柄ガーディアン.png"),
      createCharacter(3, "series3_platinum1", "プラチナ", "platinum", "キリンナイフ", "img/キャラ3/キリンナイフ.png"),
      createCharacter(3, "series3_platinum2", "プラチナ", "platinum", "象ナイフ", "img/キャラ3/象ナイフ.png"),
      createCharacter(3, "series3_platinum3", "プラチナ", "platinum", "ライオンナイフ", "img/キャラ3/ライオンナイフ.png"),
      createCharacter(3, "series3_diamond1", "ダイヤ", "diamond", "水のアレス", "img/キャラ3/水のアレス.png"),
      createCharacter(3, "series3_diamond2", "ダイヤ", "diamond", "水のオーディン", "img/キャラ3/水のオーディン.png"),
      createCharacter(3, "series3_diamond3", "ダイヤ", "diamond", "水のアウトロー", "img/キャラ3/水のアウトロー.png"),
      createCharacter(3, "series3_ascendant1", "アセンダント", "ascendant", "ぬいぐるみバッキー", "img/キャラ3/ぬいぐるみバッキー.png"),
      createCharacter(3, "series3_ascendant2", "アセンダント", "ascendant", "ぬいぐるみジャッジ", "img/キャラ3/ぬいぐるみジャッジ.png"),
      createCharacter(3, "series3_ascendant3", "アセンダント", "ascendant", "ぬいぐるみショーティー", "img/キャラ3/ぬいぐるみショーティー.png"),
      createCharacter(3, "series3_immortal1", "イモータル", "immortal", "呪いのヴァンダル", "img/キャラ3/呪いのヴァンダル.png"),
      createCharacter(3, "series3_immortal2", "イモータル", "immortal", "呪いのファントム", "img/キャラ3/呪いのファントム.png"),
      createCharacter(3, "series3_immortal3", "イモータル", "immortal", "呪いのオペレーター", "img/キャラ3/呪いのオペレーター.png"),
      createCharacter(3, "series3_radiant", "レディアント", "radiant", "スパイク弁当箱", "img/キャラ3/スパイク弁当箱.png")
    ],
    4: [
      createCharacter(4, "series4_ishibashi1", "当たり", "hidden", "石橋キャラ", "img/キャラ4/ChatGPT Image 2026年6月2日 21_37_41-1.png"),
      createCharacter(4, "series4_ishibashi2", "当たり", "hidden", "石橋キャラ", ""),
      createCharacter(4, "series4_ishibashi3", "当たり", "hidden", "石橋キャラ", "")
    ]
  };

  function createCharacter(series, id, rank, eggType, name, image) {
    return { series, id, rank, eggType, name, image, lines: ["-", "-", "-"] };
  }

  const allCharacters = Object.values(SERIES_CHARACTERS).flat();
  const characterMap = new Map(allCharacters.map((character) => [character.id, character]));
  const eggTypeMap = new Map(EGG_TYPES.map((eggType) => [eggType.id, eggType]));

  function getDefaultState() {
    return {
      kp: 0,
      ap: 0,
      tickets: { multiplier15: 0, multiplier2: 0 },
      selectedTicket: "",
      skills: {},
      egg: null,
      ownedCharacterIds: [],
      characterCounts: {},
      activeCharacterId: "",
      trackerLevel: 0,
      series4Unlocked: false
    };
  }

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return getDefaultState();

      const parsed = JSON.parse(saved);
      const base = getDefaultState();
      return {
        ...base,
        ...parsed,
        kp: Math.max(0, Number(parsed?.kp) || 0),
        ap: Math.max(0, Number(parsed?.ap) || 0),
        tickets: {
          multiplier15: Math.max(0, Number(parsed?.tickets?.multiplier15) || 0),
          multiplier2: Math.max(0, Number(parsed?.tickets?.multiplier2) || 0)
        },
        selectedTicket: parsed?.selectedTicket || "",
        skills: normalizeSkills(parsed?.skills),
        ownedCharacterIds: Array.isArray(parsed?.ownedCharacterIds) ? parsed.ownedCharacterIds : [],
        characterCounts: normalizeCharacterCounts(parsed?.characterCounts),
        trackerLevel: Math.max(0, Math.min(TRACKER_MAX_LEVEL, Number(parsed?.trackerLevel) || 0)),
        series4Unlocked: Boolean(parsed?.series4Unlocked)
      };
    } catch (error) {
      return getDefaultState();
    }
  }

  function normalizeSkills(value = {}) {
    return SKILL_DEFS.reduce((skills, skill) => {
      skills[skill.id] = Math.max(0, Math.min(skill.maxLevel, Number(value?.[skill.id]) || 0));
      return skills;
    }, {});
  }

  function normalizeCharacterCounts(value = {}) {
    return Object.entries(value || {}).reduce((counts, [characterId, count]) => {
      if (characterMap.has(characterId)) counts[characterId] = Math.max(0, Math.min(3, Number(count) || 0));
      return counts;
    }, {});
  }

  function saveState() {
    state.ownedCharacterIds = Object.keys(state.characterCounts).filter((characterId) => getCharacterStage(characterId) > 0);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function requestFirebaseSync(reason = "") {
    window.dispatchEvent(new CustomEvent("collection:firebase-sync", { detail: { reason } }));
  }

  let state = loadState();
  let currentCollectionSeries = 1;

  function getElement(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getTrackerUpgradeCost() {
    const nextLevel = state.trackerLevel + 1;
    return Math.min(25, 4 + nextLevel);
  }

  function getTrackerUnlockLabel(level) {
    return TRACKER_UNLOCK_LABELS[level] || "基本機能";
  }

  function getSkillLevel(skillId) {
    return Math.max(0, Number(state.skills?.[skillId]) || 0);
  }

  function getSummonCost() {
    return Math.max(1, EGG_COST - getSkillLevel("summonDiscount"));
  }

  function getHatchCost() {
    return Math.max(1, HATCH_COST - getSkillLevel("hatchDiscount"));
  }

  function isSeriesAvailable(series) {
    if (series === 1) return true;
    if (series === 2) return state.trackerLevel >= SERIES2_UNLOCK_LEVEL;
    if (series === 3) return state.trackerLevel >= SERIES3_UNLOCK_LEVEL;
    if (series === 4) return state.series4Unlocked;
    return false;
  }

  function getVisibleSeriesNumbers() {
    return state.series4Unlocked ? [1, 2, 3, 4] : [1, 2, 3];
  }

  function getSeriesCharacters(series) {
    return SERIES_CHARACTERS[series] || [];
  }

  function getUnlockedEggSeries() {
    const series = [1];
    if (state.trackerLevel >= SERIES2_UNLOCK_LEVEL) series.push(2);
    if (state.trackerLevel >= SERIES3_UNLOCK_LEVEL) series.push(3);
    return series;
  }

  function getAvailableCharactersForEgg(eggTypeId) {
    const unlockedSeries = new Set(getUnlockedEggSeries());
    return allCharacters.filter((character) => {
      return unlockedSeries.has(character.series)
        && character.eggType === eggTypeId
        && getCharacterStage(character.id) < 3;
    });
  }

  function getEggRateTable() {
    const unlockedLevels = Object.keys(EGG_RATE_TABLE_BY_LEVEL)
      .map(Number)
      .filter((level) => state.trackerLevel >= level)
      .sort((a, b) => b - a);
    return EGG_RATE_TABLE_BY_LEVEL[unlockedLevels[0] || 0];
  }

  function hasAvailableCharacterInEgg(eggType) {
    return getAvailableCharactersForEgg(eggType.id).length > 0;
  }

  function getUnlockedEggTypes() {
    const rateTable = getEggRateTable();
    return EGG_TYPES
      .filter((eggType) => state.trackerLevel >= (EGG_UNLOCK_LEVEL_BY_ID[eggType.id] || 0))
      .filter((eggType) => hasAvailableCharacterInEgg(eggType))
      .map((eggType) => ({ ...eggType, rate: rateTable[eggType.id] || 0 }))
      .filter((eggType) => eggType.rate > 0);
  }

  function pickEggType() {
    const unlockedEggTypes = getUnlockedEggTypes();
    const total = unlockedEggTypes.reduce((sum, eggType) => sum + eggType.rate, 0);
    let roll = Math.random() * total;

    for (const eggType of unlockedEggTypes) {
      roll -= eggType.rate;
      if (roll <= 0) return eggTypeMap.get(eggType.id) || eggType;
    }

    return eggTypeMap.get(unlockedEggTypes[0]?.id) || null;
  }

  function pickCharacterFromEgg(eggTypeId) {
    const availableCharacters = getAvailableCharactersForEgg(eggTypeId);
    if (!availableCharacters.length) return null;
    return availableCharacters[Math.floor(Math.random() * availableCharacters.length)];
  }

  function getCharacterStage(characterId) {
    return Math.max(0, Math.min(3, Number(state.characterCounts[characterId]) || 0));
  }

  function getActiveCharacter() {
    return characterMap.get(state.activeCharacterId) || null;
  }

  function isSeriesComplete(series) {
    const characters = getSeriesCharacters(series);
    return characters.length > 0 && characters.every((character) => getCharacterStage(character.id) > 0);
  }

  function getPointBonusSummary() {
    return {
      kpChance: getSkillLevel("bonusKpChance") * 2.5 + (isSeriesComplete(1) ? 5 : 0),
      apChance: getSkillLevel("bonusApChance") * 2.5 + (isSeriesComplete(2) ? 5 : 0),
      rouletteChance: getSkillLevel("rouletteChance") * 2.5 + (isSeriesComplete(3) ? 5 : 0)
    };
  }

  function setStatus(message) {
    const status = getElement("collectionStatus");
    if (status) status.textContent = message || "";
  }

  function renderKp() {
    const kpText = getElement("collectionKpText");
    const apText = getElement("collectionApText");
    const ticket15Text = getElement("ticket15CountText");
    const ticket2Text = getElement("ticket2CountText");
    const useTicket15 = getElement("useTicket15");
    const useTicket2 = getElement("useTicket2");
    const ticket15Option = useTicket15?.closest(".ticket-use-option");
    const ticket2Option = useTicket2?.closest(".ticket-use-option");

    if (kpText) kpText.textContent = `KP: ${state.kp}`;
    if (apText) apText.textContent = `AP: ${state.ap || 0}`;
    if (ticket15Text) ticket15Text.textContent = `1.5倍チケット ×${state.tickets?.multiplier15 || 0}`;
    if (ticket2Text) ticket2Text.textContent = `2倍チケット ×${state.tickets?.multiplier2 || 0}`;

    if (ticket15Option) ticket15Option.style.display = state.tickets.multiplier15 > 0 ? "" : "none";
    if (ticket2Option) ticket2Option.style.display = state.tickets.multiplier2 > 0 ? "" : "none";
    if (useTicket15) useTicket15.checked = state.selectedTicket === "multiplier15" && state.tickets.multiplier15 > 0;
    if (useTicket2) useTicket2.checked = state.selectedTicket === "multiplier2" && state.tickets.multiplier2 > 0;
    if (state.selectedTicket === "multiplier15" && state.tickets.multiplier15 <= 0) state.selectedTicket = "";
    if (state.selectedTicket === "multiplier2" && state.tickets.multiplier2 <= 0) state.selectedTicket = "";
  }

  function renderTrackerLevel() {
    document.body.className = document.body.className
      .split(" ")
      .filter((className) => !className.startsWith("tracker-level-"))
      .join(" ");

    const levelText = getElement("trackerLevelText");
    const nextText = getElement("trackerNextUnlockText");
    const upgradeButton = getElement("trackerUpgradeButton");
    const settingsButton = getElement("settingsButton");
    const settingsPanel = getElement("settingsPanel");
    const hatcheryButton = getElement("collectionHatcheryButton");
    const skillUpButton = getElement("skillUpButton");
    const isMax = state.trackerLevel >= TRACKER_MAX_LEVEL;
    const cost = getTrackerUpgradeCost();

    if (settingsButton) {
      settingsButton.disabled = false;
      settingsButton.title = "設定";
    }
    if (hatcheryButton) {
      hatcheryButton.disabled = state.trackerLevel < 1;
      hatcheryButton.title = state.trackerLevel < 1 ? "トラッカーレベル1から解放されます" : "孵化場";
    }
    const collectionDisplayButton = getElement("collectionDisplayButton");
    if (collectionDisplayButton) {
      collectionDisplayButton.disabled = state.trackerLevel < 2;
      collectionDisplayButton.title = state.trackerLevel < 2 ? "トラッカーレベル2から解放されます" : "コレクション";
    }
    if (skillUpButton) {
      skillUpButton.disabled = state.trackerLevel < 10;
      skillUpButton.title = state.trackerLevel < 10 ? "トラッカーレベル10から解放されます" : "スキルUP";
    }

    if (levelText) levelText.textContent = `Lv.${state.trackerLevel}`;
    if (nextText) nextText.textContent = isMax ? "最大レベルです。" : `次：${getTrackerUnlockLabel(state.trackerLevel + 1)} / 必要KP：${cost}`;
    if (upgradeButton) upgradeButton.disabled = isMax || state.kp < cost;
  }

  function renderPedestals() {
    const stage = getElement("collectionPedestalStage");
    if (!stage) return;

    const title = getElement("collectionDisplayTitle");
    const summary = getElement("collectionSeriesSummary");
    const seriesMeta = SERIES_META[currentCollectionSeries] || SERIES_META[1];
    const isUnlocked = isSeriesAvailable(currentCollectionSeries);
    const characters = getSeriesCharacters(currentCollectionSeries);

    if (title) title.textContent = `コレクション ${seriesMeta.title}`;
    if (summary) {
      const ownedCount = characters.filter((character) => getCharacterStage(character.id) > 0).length;
      const percent = characters.length ? Math.round((ownedCount / characters.length) * 100) : 0;
      summary.innerHTML = isUnlocked
        ? `<span>収集率${percent}%</span><span>全部集めると「${seriesMeta.effect}」</span>`
        : `<span>未解放</span><span>トラッカーLv${seriesMeta.unlockLevel}で解放</span>`;
    }

    if (!isUnlocked) {
      stage.innerHTML = `<div class="collection-series-locked">トラッカーLv${seriesMeta.unlockLevel}で解放</div>`;
      return;
    }

    const makePedestal = (character, rowName) => {
      const stageLevel = getCharacterStage(character.id);
      const imageHtml = character.image
        ? `<img class="collection-pedestal-character-image" src="${character.image}" alt="${character.name}">`
        : `<div class="collection-pedestal-character-placeholder">${stageLevel > 0 ? character.rank : ""}</div>`;

      return `
        <div class="collection-pedestal-item ${rowName}-item stage-${stageLevel}">
          <div class="collection-pedestal-character" data-character-id="${character.id}">${stageLevel > 0 ? imageHtml : ""}</div>
          <img class="collection-pedestal-image" src="img/その他/台座.png" alt="台座">
        </div>
      `;
    };

    const rowSizes = currentCollectionSeries === 4 ? [3] : [6, 6, 6, 7];
    let start = 0;
    const rows = rowSizes.map((size, index) => {
      const items = characters.slice(start, start + size)
        .map((character) => makePedestal(character, `collection-row-${index + 1}`))
        .join("");
      start += size;
      return `<div class="collection-pedestal-row collection-grid-row">${items}</div>`;
    }).join("");
    stage.innerHTML = rows;
  }

  function changeCollectionSeries(direction) {
    const visibleSeries = getVisibleSeriesNumbers();
    const currentIndex = visibleSeries.indexOf(currentCollectionSeries);
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + direction + visibleSeries.length) % visibleSeries.length;
    currentCollectionSeries = visibleSeries[nextIndex];
    renderAll();
  }

  function getSkillValueText(skill, level) {
    if (skill.type === "chance") return `${level * 2.5}%`;
    if (skill.type === "discount") return `-${level}KP`;
    return `+${level}`;
  }

  function renderSkillPanel() {
    const list = getElement("skillUpList");
    if (!list) return;

    list.innerHTML = SKILL_DEFS.map((skill) => {
      const level = getSkillLevel(skill.id);
      const unlocked = state.trackerLevel >= skill.unlockLevel;
      const isMax = level >= skill.maxLevel;
      const cost = skill.costs[level] || 0;
      const canUpgrade = unlocked && !isMax && state.ap >= cost;
      const levelText = unlocked
        ? `Lv.${level} / ${skill.maxLevel}　現在：${getSkillValueText(skill, level)}`
        : `トラッカーLv${skill.unlockLevel}から解放`;
      const buttonText = !unlocked ? "未解放" : isMax ? "最大" : `${cost}AP`;

      return `
        <div class="skill-up-item ${unlocked ? "" : "is-locked"}">
          <div>
            <div class="skill-up-name">${skill.name}</div>
            <div class="skill-up-level">${levelText}</div>
          </div>
          <button type="button" class="skill-up-level-button" data-skill-id="${skill.id}" ${canUpgrade ? "" : "disabled"}>${buttonText}</button>
        </div>
      `;
    }).join("");
  }

  function renderWindow() {
    renderKp();
    renderTrackerLevel();
    renderPedestals();
  }

  function renderHatchery() {
    const eggVisual = getElement("collectionEggVisual");
    const eggInfo = getElement("collectionEggInfo");
    const summonButton = getElement("collectionSummonEggButton");
    const hatchButton = getElement("collectionHatchEggButton");
    const unlockedEggTypes = getUnlockedEggTypes();
    const totalRate = unlockedEggTypes.reduce((sum, eggType) => sum + eggType.rate, 0);
    const summonCost = getSummonCost();
    const hatchCost = getHatchCost();
    const rateHtml = unlockedEggTypes.map((eggType) => {
      const percent = totalRate > 0 ? ((eggType.rate / totalRate) * 100).toFixed(1).replace(".0", "") : "0";
      return `
        <div class="collection-egg-rate-item">
          <img class="collection-egg-rate-image" src="${EGG_IMAGE_PATHS[eggType.id] || ""}" alt="${eggType.label}の卵">
          <span>${eggType.label}：${percent}%</span>
        </div>
      `;
    }).join("");

    if (eggVisual) {
      eggVisual.innerHTML = `
        <div class="collection-egg-current">
          ${state.egg ? `<img class="collection-egg-image" src="${EGG_IMAGE_PATHS[state.egg.type] || ""}" alt="${state.egg.label}の卵">` : ""}
        </div>
        <div class="collection-egg-rate-list">${rateHtml}</div>
      `;
    }

    if (eggInfo) eggInfo.textContent = state.egg ? `孵化必要KP：${hatchCost}` : `卵召喚必要KP：${summonCost}`;

    if (summonButton) {
      const hasAvailableEgg = unlockedEggTypes.length > 0;
      summonButton.disabled = state.kp < summonCost || Boolean(state.egg) || !hasAvailableEgg;
      summonButton.title = !hasAvailableEgg ? "出せる卵がありません" : "";
    }

    if (hatchButton) {
      hatchButton.style.display = state.egg ? "" : "none";
      hatchButton.disabled = !state.egg || state.kp < hatchCost;
    }
  }

  function renderAll() {
    renderWindow();
    renderHatchery();
    renderSkillPanel();
  }

  function addKp(amount, reason = "") {
    const value = Math.max(0, Number(amount) || 0);
    if (value <= 0) return;

    state.kp += value;
    saveState();
    renderAll();
    setStatus(reason ? `${reason}：${value}KP` : `+${value}KP`);
    requestFirebaseSync("add-kp");
  }

  function addAp(amount, reason = "") {
    const value = Math.max(0, Number(amount) || 0);
    if (value <= 0) return;

    state.ap += value;
    saveState();
    renderAll();
    setStatus(reason ? `${reason}：${value}AP` : `+${value}AP`);
    requestFirebaseSync("add-ap");
  }

  function addRewards(rewards = {}, reason = "") {
    const kp = Math.max(0, Number(rewards.kp) || 0);
    const ap = Math.max(0, Number(rewards.ap) || 0);
    const ticket15 = Math.max(0, Number(rewards.ticket15) || 0);
    const ticket2 = Math.max(0, Number(rewards.ticket2) || 0);
    if (!kp && !ap && !ticket15 && !ticket2) return;

    state.kp += kp;
    state.ap += ap;
    state.tickets.multiplier15 += ticket15;
    state.tickets.multiplier2 += ticket2;
    saveState();
    renderAll();
    setStatus(reason || "管理者からアイテムを受け取りました");
    requestFirebaseSync("add-rewards");
  }

  function confiscateRewards(rewards = {}, reason = "") {
    const kp = Math.max(0, Number(rewards.kp) || 0);
    const ap = Math.max(0, Number(rewards.ap) || 0);
    const ticket15 = Math.max(0, Number(rewards.ticket15) || 0);
    const ticket2 = Math.max(0, Number(rewards.ticket2) || 0);
    if (!kp && !ap && !ticket15 && !ticket2) return;

    state.kp = Math.max(0, state.kp - kp);
    state.ap = Math.max(0, state.ap - ap);
    state.tickets.multiplier15 = Math.max(0, state.tickets.multiplier15 - ticket15);
    state.tickets.multiplier2 = Math.max(0, state.tickets.multiplier2 - ticket2);
    if (state.selectedTicket && !state.tickets[state.selectedTicket]) state.selectedTicket = "";
    saveState();
    renderAll();
    setStatus(reason || "管理者によりアイテムが没収されました");
    requestFirebaseSync("confiscate-rewards");
  }

  function rollChance(percent) {
    return percent > 0 && Math.random() * 100 < percent;
  }

  function applySelectedTicket(kp, ap) {
    if (state.selectedTicket === "multiplier15" && state.tickets.multiplier15 > 0) {
      state.tickets.multiplier15 -= 1;
      return { kp: Math.ceil(kp * 1.5), ap: Math.ceil(ap * 1.5), ticketUsed: "1.5倍チケット" };
    }
    if (state.selectedTicket === "multiplier2" && state.tickets.multiplier2 > 0) {
      state.tickets.multiplier2 -= 1;
      return { kp: kp * 2, ap: ap * 2, ticketUsed: "2倍チケット" };
    }
    return { kp, ap, ticketUsed: "" };
  }

  function claimMatchReward(payload = {}) {
    const baseKp = Math.max(0, Number(payload.kpEarned) || 0);
    const baseAp = Math.max(0, Number(payload.apEarned) || 0);
    const multiplied = applySelectedTicket(baseKp, baseAp);
    const summary = getPointBonusSummary();
    const bonusKp = rollChance(summary.kpChance) ? getSkillLevel("bonusKpAmount") : 0;
    const bonusAp = rollChance(summary.apChance) ? getSkillLevel("bonusApAmount") : 0;
    const rouletteReward = rollChance(summary.rouletteChance) ? rollRoulette() : null;

    state.kp += multiplied.kp + bonusKp + (rouletteReward?.kp || 0);
    state.ap += multiplied.ap + bonusAp + (rouletteReward?.ap || 0);
    if (rouletteReward?.ticket15) state.tickets.multiplier15 += rouletteReward.ticket15;
    if (rouletteReward?.ticket2) state.tickets.multiplier2 += rouletteReward.ticket2;
    if (rouletteReward?.unlockSeries4) {
      state.series4Unlocked = true;
      const characterId = rouletteReward.characterId || "series4_ishibashi1";
      state.characterCounts[characterId] = Math.max(1, getCharacterStage(characterId));
      state.activeCharacterId = characterId;
    }
    if (state.selectedTicket && !state.tickets[state.selectedTicket]) state.selectedTicket = "";

    saveState();
    renderAll();

    const parts = [`${multiplied.kp}KP`, `${multiplied.ap}AP`];
    if (multiplied.ticketUsed) parts.push(`${multiplied.ticketUsed}使用`);
    if (bonusKp) parts.push(`おまけKP ${bonusKp}獲得！`);
    if (bonusAp) parts.push(`おまけAP ${bonusAp}獲得！`);
    if (rouletteReward?.label) parts.push(rouletteReward.label);
    setStatus(parts.join(" / "));
    if (rouletteReward && window.trackerEffects?.showRoulette) {
      window.trackerEffects.showRoulette(rouletteReward);
    }
    requestFirebaseSync("claim-match-reward");

    return { kp: multiplied.kp, ap: multiplied.ap, bonusKp, bonusAp, roulette: rouletteReward };
  }

  function rollRoulette() {
    const roll = Math.random() * 100;
    if (roll < 35) return { key: "kp5", kp: 5, label: "KP 5獲得", confirmText: "KP 5獲得確定！" };
    if (roll < 70) return { key: "ap10", ap: 10, label: "AP 10獲得", confirmText: "AP 10獲得確定！" };
    if (roll < 90) return { key: "ticket15", ticket15: 1, label: "1.5倍チケット獲得", confirmText: "1.5倍チケット獲得確定！" };
    if (roll < 98) return { key: "ticket2", ticket2: 1, label: "2倍チケット獲得", confirmText: "2倍チケット獲得確定！" };
    return {
      key: "hit",
      unlockSeries4: true,
      characterId: "series4_ishibashi1",
      characterName: "石橋キャラ",
      characterImage: "img/キャラ4/ChatGPT Image 2026年6月2日 21_37_41-1.png",
      label: "当たり！石橋キャラ獲得！"
    };
  }

  function summonEgg() {
    const summonCost = getSummonCost();
    if (state.egg) {
      setStatus("卵は1個までです");
      return;
    }

    if (state.kp < summonCost) {
      setStatus("KPが足りません");
      return;
    }

    const eggType = pickEggType();
    if (!eggType) {
      setStatus("出せる卵がありません");
      return;
    }

    state.kp -= summonCost;
    state.egg = { type: eggType.id, label: eggType.label, createdAt: Date.now() };
    saveState();
    renderAll();
    setStatus(`${eggType.label}の卵を召喚しました`);
    requestFirebaseSync("summon-egg");
  }

  function hatchEgg() {
    const hatchCost = getHatchCost();
    if (!state.egg) {
      setStatus("卵がありません");
      return;
    }

    if (state.kp < hatchCost) {
      setStatus("KPが足りません");
      return;
    }

    const character = pickCharacterFromEgg(state.egg.type);
    if (!character) {
      setStatus("この卵から出るキャラは全員3段階目です");
      return;
    }

    state.kp -= hatchCost;
    state.egg = null;

    const currentStage = getCharacterStage(character.id);
    const nextStage = Math.min(3, currentStage + 1);
    state.characterCounts[character.id] = nextStage;
    state.activeCharacterId = character.id;

    saveState();
    renderAll();
    showHatchResult(character, nextStage);
    setStatus(`${character.rank}：${nextStage}段階目`);
    requestFirebaseSync("hatch-egg");
  }

  function upgradeTracker() {
    if (state.trackerLevel >= TRACKER_MAX_LEVEL) {
      setStatus("トラッカーは最大レベルです");
      return;
    }

    const cost = getTrackerUpgradeCost();
    if (state.kp < cost) {
      setStatus("KPが足りません");
      return;
    }

    state.kp -= cost;
    state.trackerLevel += 1;
    saveState();
    renderAll();
    setStatus(`トラッカーLv.${state.trackerLevel}に上がりました`);
    requestFirebaseSync("upgrade-tracker");
  }

  function upgradeSkill(skillId) {
    const skill = SKILL_DEFS.find((item) => item.id === skillId);
    if (!skill) return;
    const level = getSkillLevel(skillId);
    if (state.trackerLevel < skill.unlockLevel) {
      setStatus(`トラッカーLv${skill.unlockLevel}から解放`);
      return;
    }
    if (level >= skill.maxLevel) {
      setStatus("最大レベルです");
      return;
    }

    const cost = skill.costs[level] || 0;
    if (state.ap < cost) {
      setStatus("APが足りません");
      return;
    }

    state.ap -= cost;
    state.skills[skillId] = level + 1;
    saveState();
    renderAll();
    setStatus(`${skill.name} Lv.${level + 1}`);
    requestFirebaseSync("upgrade-skill");
  }

  function resetCollectionProgress() {
    state = getDefaultState();
    saveState();
    renderAll();
    setStatus("レベルとコレクションをリセットしました");
  }

  function getImplementationTestState() {
    return {
      trackerLevel: state.trackerLevel,
      kp: state.kp,
      ap: state.ap,
      tickets: { ...state.tickets },
      selectedTicket: state.selectedTicket,
      skills: { ...state.skills },
      egg: state.egg ? { ...state.egg } : null,
      ownedCharacterIds: [...state.ownedCharacterIds],
      characterCounts: { ...state.characterCounts },
      activeCharacterId: state.activeCharacterId,
      series4Unlocked: state.series4Unlocked
    };
  }

  function restoreImplementationTestState(saved = {}) {
    state = {
      ...state,
      trackerLevel: Math.max(0, Math.min(TRACKER_MAX_LEVEL, Number(saved.trackerLevel) || 0)),
      kp: Math.max(0, Number(saved.kp) || 0),
      ap: Math.max(0, Number(saved.ap) || 0),
      tickets: {
        multiplier15: Math.max(0, Number(saved.tickets?.multiplier15) || 0),
        multiplier2: Math.max(0, Number(saved.tickets?.multiplier2) || 0)
      },
      selectedTicket: saved.selectedTicket || "",
      skills: normalizeSkills(saved.skills),
      egg: saved.egg ? { ...saved.egg } : null,
      characterCounts: normalizeCharacterCounts(saved.characterCounts),
      activeCharacterId: characterMap.has(saved.activeCharacterId) ? saved.activeCharacterId : "",
      series4Unlocked: Boolean(saved.series4Unlocked)
    };
    saveState();
    renderAll();
    setStatus("実装テストの保存状態を呼び出しました");
  }

  function resetTrackerLevelOnly() {
    state.trackerLevel = 0;
    saveState();
    renderAll();
    setStatus("トラッカーレベルを初期化しました");
  }

  function resetItemsOnly() {
    state.kp = 0;
    state.ap = 0;
    state.tickets = { multiplier15: 0, multiplier2: 0 };
    state.selectedTicket = "";
    saveState();
    renderAll();
    setStatus("アイテムを初期化しました");
  }

  function resetCollectionOnly() {
    state.egg = null;
    state.ownedCharacterIds = [];
    state.characterCounts = {};
    state.activeCharacterId = "";
    state.series4Unlocked = false;
    saveState();
    renderAll();
    setStatus("コレクションを初期化しました");
  }

  function showCharacterPreview(characterId) {
    const character = characterMap.get(characterId);
    if (!character || !character.image || getCharacterStage(characterId) <= 0) return;
    const comment = window.collectionComments?.getComment ? window.collectionComments.getComment(characterId) : "";
    const commentHtml = comment
      ? `<div class="collection-character-preview-comment">${escapeHtml(comment).replace(/\n/g, "<br>")}</div>`
      : "";

    let preview = getElement("collectionCharacterPreview");
    if (!preview) {
      preview = document.createElement("div");
      preview.id = "collectionCharacterPreview";
      preview.className = "collection-character-preview";
      document.body.appendChild(preview);
    }

    preview.innerHTML = `
      <div class="collection-character-preview-name">${character.name}</div>
      <img class="collection-character-preview-image" src="${character.image}" alt="${character.name}">
      ${commentHtml}
    `;
    preview.classList.add("is-open");
  }

  function showHatchResult(character, stageLevel) {
    if (!character) return;

    let preview = getElement("collectionCharacterPreview");
    if (!preview) {
      preview = document.createElement("div");
      preview.id = "collectionCharacterPreview";
      preview.className = "collection-character-preview";
      document.body.appendChild(preview);
    }

    const imageHtml = character.image
      ? `<img class="collection-character-preview-image hatch-result-image" src="${character.image}" alt="${character.name}">`
      : "";

    preview.innerHTML = `
      <div class="hatch-result-card">
        <div class="hatch-result-label">孵化結果</div>
        <div class="hatch-result-rank">${character.rank}</div>
        <div class="collection-character-preview-name">${character.name}</div>
        ${imageHtml}
        <div class="hatch-result-stage">${stageLevel}段階目</div>
      </div>
    `;
    preview.classList.add("is-open", "is-hatch-result");
  }

  function closeCharacterPreview() {
    const preview = getElement("collectionCharacterPreview");
    if (preview) preview.classList.remove("is-open", "is-hatch-result");
  }

  function openPanel(panelId) {
    const panel = getElement(panelId);
    if (panel) {
      panel.classList.add("is-open");
      panel.style.display = "flex";
    }
    renderAll();
  }

  function closePanel(panelId) {
    const panel = getElement(panelId);
    if (panel) {
      panel.classList.remove("is-open");
      panel.style.display = "";
    }
  }

  function bindEvents() {
    const collectionDisplayButton = getElement("collectionDisplayButton");
    const hatcheryButton = getElement("collectionHatcheryButton");
    const skillUpButton = getElement("skillUpButton");
    const collectionDisplayOverlay = getElement("collectionDisplayOverlay");
    const hatcheryOverlay = getElement("collectionHatcheryOverlay");
    const skillUpOverlay = getElement("skillUpOverlay");
    const summonButton = getElement("collectionSummonEggButton");
    const hatchButton = getElement("collectionHatchEggButton");
    const upgradeButton = getElement("trackerUpgradeButton");
    const seriesPrevButton = getElement("collectionSeriesPrevButton");
    const seriesNextButton = getElement("collectionSeriesNextButton");
    const kpText = getElement("collectionKpText");
    const useTicket15 = getElement("useTicket15");
    const useTicket2 = getElement("useTicket2");
    const skillUpList = getElement("skillUpList");

    if (collectionDisplayButton) {
      collectionDisplayButton.addEventListener("click", () => {
        openPanel("collectionDisplayOverlay");
        requestFirebaseSync("open-collection");
      });
    }
    if (hatcheryButton) hatcheryButton.addEventListener("click", () => openPanel("collectionHatcheryOverlay"));
    if (skillUpButton) skillUpButton.addEventListener("click", () => openPanel("skillUpOverlay"));
    if (collectionDisplayOverlay) {
      collectionDisplayOverlay.addEventListener("click", (event) => {
        if (event.target === collectionDisplayOverlay) closePanel("collectionDisplayOverlay");
      });
    }
    if (hatcheryOverlay) {
      hatcheryOverlay.addEventListener("click", (event) => {
        if (event.target === hatcheryOverlay) closePanel("collectionHatcheryOverlay");
      });
    }
    if (skillUpOverlay) {
      skillUpOverlay.addEventListener("click", (event) => {
        if (event.target === skillUpOverlay) closePanel("skillUpOverlay");
      });
    }
    if (seriesPrevButton) seriesPrevButton.addEventListener("click", () => changeCollectionSeries(-1));
    if (seriesNextButton) seriesNextButton.addEventListener("click", () => changeCollectionSeries(1));
    if (summonButton) summonButton.addEventListener("click", summonEgg);
    if (hatchButton) {
      hatchButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        hatchEgg();
      });
    }
    if (upgradeButton) upgradeButton.addEventListener("click", upgradeTracker);
    if (useTicket15) {
      useTicket15.addEventListener("change", () => {
        state.selectedTicket = useTicket15.checked ? "multiplier15" : "";
        saveState();
        renderAll();
      });
    }
    if (useTicket2) {
      useTicket2.addEventListener("change", () => {
        state.selectedTicket = useTicket2.checked ? "multiplier2" : "";
        saveState();
        renderAll();
      });
    }
    if (skillUpList) {
      skillUpList.addEventListener("click", (event) => {
        const button = event.target.closest(".skill-up-level-button");
        if (!button || button.disabled) return;
        upgradeSkill(button.dataset.skillId);
      });
    }

    document.addEventListener("click", (event) => {
      const characterElement = event.target.closest(".collection-pedestal-character");
      if (characterElement) {
        const characterId = characterElement.dataset.characterId;
        if (!characterId) return;
        event.preventDefault();
        event.stopPropagation();
        showCharacterPreview(characterId);
        return;
      }

      const preview = getElement("collectionCharacterPreview");
      if (preview && preview.classList.contains("is-open")) {
        closeCharacterPreview();
      }
    });
  }

  function init() {
    bindEvents();
    renderAll();
  }

  window.collectionGame = {
    addKp,
    addAp,
    addRewards,
    confiscateRewards,
    claimMatchReward,
    getPointBonusSummary,
    upgradeTracker,
    getImplementationTestState,
    restoreImplementationTestState,
    resetTrackerLevelOnly,
    resetItemsOnly,
    resetCollectionOnly,
    getState: () => ({ ...state }),
    render: renderAll
  };

  window.addEventListener("collection:add-kp", (event) => {
    addKp(event.detail?.amount || 0, event.detail?.reason || "");
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
