(() => {
  const LEGACY_STORAGE_KEY = "valorant_collection_game_v2";
  const ACCOUNT_STORAGE_PREFIX = "valorant_collection_game_v3:";
  const ACTIVE_ACCOUNT_KEY = "valorant_collection_active_uid_v1";
  const PENDING_OPERATION_PREFIX = "valorant_collection_pending_operation_v1:";
  const EGG_COST = 10;
  const HATCH_COST = 15;
  const TRACKER_MAX_LEVEL = 21;
  const SERIES2_UNLOCK_LEVEL = 12;
  const SERIES3_UNLOCK_LEVEL = 21;
  let rewardEffectQueue = Promise.resolve();

  const TRACKER_UNLOCK_LABELS = {
    0: "基本機能",
    1: "実績解放",
    2: "K/AYO畑解放",
    3: "孵化場解放",
    4: "コレクション解放",
    5: "ゴールド卵解放",
    6: "プラチナ卵解放",
    7: "ダイヤ卵解放",
    8: "アセンダント卵解放",
    9: "イモータル卵解放",
    10: "レディアント卵解放",
    11: "ブリムガチャ解放",
    12: "シリーズ2解放",
    13: "スキルUP解放",
    14: "おまけKP確率解放",
    15: "おまけAP確率解放",
    16: "おまけKP量UP解放",
    17: "おまけAP量UP解放",
    18: "卵召喚KP減少解放",
    19: "孵化KP減少解放",
    20: "石橋ルーレット発生率解放",
    21: "シリーズ3解放"
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
    level6: [5, 10, 15, 20, 25, 30],
    level8: [5, 10, 15, 25, 35, 40, 45, 50],
    level16: [5, 7, 9, 11, 13, 15, 18, 21, 24, 28, 32, 36, 40, 44, 47, 50]
  };

  const SKILL_DEFS = [
    { id: "truckRestDiscount", name: "トラック運搬時間短縮", unlockLevel: 13, maxLevel: 6, costs: SKILL_COSTS.level6, type: "truck-rest" },
    { id: "shopSlot2", name: "ショップ出品枠2 解放", unlockLevel: 13, maxLevel: 1, costs: [10], type: "shop-slot", slot: 2 },
    { id: "shopSlot3", name: "ショップ出品枠3 解放", unlockLevel: 13, maxLevel: 1, costs: [20], type: "shop-slot", slot: 3 },
    { id: "bonusKpChance", name: "おまけKP獲得確率", unlockLevel: 14, maxLevel: 16, costs: SKILL_COSTS.level16, type: "chance" },
    { id: "bonusApChance", name: "おまけAP獲得確率", unlockLevel: 15, maxLevel: 16, costs: SKILL_COSTS.level16, type: "chance" },
    { id: "bonusKpAmount", name: "おまけKP獲得量", unlockLevel: 16, maxLevel: 5, costs: SKILL_COSTS.level5, type: "amount" },
    { id: "bonusApAmount", name: "おまけAP獲得量", unlockLevel: 17, maxLevel: 5, costs: SKILL_COSTS.level5, type: "amount" },
    { id: "summonDiscount", name: "卵召喚必要KP量減少", unlockLevel: 18, maxLevel: 5, costs: SKILL_COSTS.level5, type: "discount" },
    { id: "hatchDiscount", name: "孵化必要KP量減少", unlockLevel: 19, maxLevel: 5, costs: SKILL_COSTS.level5, type: "discount" },
    { id: "rouletteChance", name: "石橋ルーレット発生率", unlockLevel: 20, maxLevel: 8, costs: SKILL_COSTS.level8, type: "chance" }
  ];

  const ACHIEVEMENT_DEFS = [
    { id: "ach_01", name: "初めてのKP", conditionText: "初めてポイント獲得でKPを獲得", rewardText: "KP 3", reward: { kp: 3 }, type: "stat", stat: "hasPointKp" },
    { id: "ach_02", name: "初めてのAP", conditionText: "初めてポイント獲得でAPを獲得", rewardText: "AP 3", reward: { ap: 3 }, type: "stat", stat: "hasPointAp" },
    { id: "ach_03", name: "頑張ったで賞", conditionText: "ポイント獲得1回でKPが6以上", rewardText: "KP 5", reward: { kp: 5 }, type: "stat-at-least", stat: "maxBaseKp", value: 6 },
    { id: "ach_04", name: "支えたで賞", conditionText: "ポイント獲得1回でAPが4以上", rewardText: "AP 5", reward: { ap: 5 }, type: "stat-at-least", stat: "maxBaseAp", value: 4 },
    { id: "ach_05", name: "強いで賞", conditionText: "ポイント獲得1回でKP10獲得", rewardText: "KP 8", reward: { kp: 8 }, type: "stat-at-least", stat: "maxBaseKp", value: 10 },
    { id: "ach_06", name: "助けたで賞", conditionText: "ポイント獲得1回でAP5獲得", rewardText: "AP 8", reward: { ap: 8 }, type: "stat-at-least", stat: "maxBaseAp", value: 5 },
    { id: "ach_07", name: "最強で賞", conditionText: "ポイント獲得1回でKP20獲得", rewardText: "1.5倍チケット 1枚", reward: { ticket15: 1 }, type: "stat-at-least", stat: "maxBaseKp", value: 20 },
    { id: "ach_08", name: "裏番長で賞", conditionText: "ポイント獲得1回でAP10獲得", rewardText: "1.5倍チケット 1枚", reward: { ticket15: 1 }, type: "stat-at-least", stat: "maxBaseAp", value: 10 },
    { id: "ach_09", name: "やり過ぎてるで賞", conditionText: "ポイント獲得1回でKP30獲得", rewardText: "2倍チケット 1枚", reward: { ticket2: 1 }, type: "stat-at-least", stat: "maxBaseKp", value: 30 },
    { id: "ach_10", name: "もうお前が主役で賞", conditionText: "ポイント獲得1回でAP20獲得", rewardText: "2倍チケット 1枚", reward: { ticket2: 1 }, type: "stat-at-least", stat: "maxBaseAp", value: 20 },
    { id: "ach_11", name: "アイアン卵たん", conditionText: "初めてアイアンの卵を召喚", rewardText: "KP 2", reward: { kp: 2 }, type: "egg", eggType: "iron" },
    { id: "ach_12", name: "ブロンズ卵たん", conditionText: "初めてブロンズの卵を召喚", rewardText: "KP 3", reward: { kp: 3 }, type: "egg", eggType: "bronze" },
    { id: "ach_13", name: "シルバー卵ちゃん", conditionText: "初めてシルバーの卵を召喚", rewardText: "KP 4", reward: { kp: 4 }, type: "egg", eggType: "silver" },
    { id: "ach_14", name: "ゴールド卵くん", conditionText: "初めてゴールドの卵を召喚", rewardText: "AP 8", reward: { ap: 8 }, type: "egg", eggType: "gold" },
    { id: "ach_15", name: "プラチナ卵さん", conditionText: "初めてプラチナの卵を召喚", rewardText: "AP 10", reward: { ap: 10 }, type: "egg", eggType: "platinum" },
    { id: "ach_16", name: "ダイヤ卵さん", conditionText: "初めてダイヤの卵を召喚", rewardText: "1.5倍チケット 1枚", reward: { ticket15: 1 }, type: "egg", eggType: "diamond" },
    { id: "ach_17", name: "アセンダント卵殿", conditionText: "初めてアセンダントの卵を召喚", rewardText: "1.5倍チケット 1枚", reward: { ticket15: 1 }, type: "egg", eggType: "ascendant" },
    { id: "ach_18", name: "イモータル卵様", conditionText: "初めてイモータルの卵を召喚", rewardText: "2倍チケット 1枚", reward: { ticket2: 1 }, type: "egg", eggType: "immortal" },
    { id: "ach_19", name: "レディアント卵様", conditionText: "初めてレディアントの卵を召喚", rewardText: "2倍チケット 2枚", reward: { ticket2: 2 }, type: "egg", eggType: "radiant" },
    { id: "ach_20", name: "駆け出しコレクター1", conditionText: "シリーズ1収集率20%以上", rewardText: "KP 10", reward: { kp: 10 }, type: "collection", series: 1, percent: 20 },
    { id: "ach_21", name: "駆け出しコレクター2", conditionText: "シリーズ2収集率20%以上", rewardText: "AP 10", reward: { ap: 10 }, type: "collection", series: 2, percent: 20 },
    { id: "ach_22", name: "駆け出しコレクター3", conditionText: "シリーズ3収集率20%以上", rewardText: "KP 10", reward: { kp: 10 }, type: "collection", series: 3, percent: 20 },
    { id: "ach_23", name: "やる気コレクター1", conditionText: "シリーズ1収集率40%以上", rewardText: "KP 15", reward: { kp: 15 }, type: "collection", series: 1, percent: 40 },
    { id: "ach_24", name: "やる気コレクター2", conditionText: "シリーズ2収集率40%以上", rewardText: "AP 15", reward: { ap: 15 }, type: "collection", series: 2, percent: 40 },
    { id: "ach_25", name: "やる気コレクター3", conditionText: "シリーズ3収集率40%以上", rewardText: "KP 15", reward: { kp: 15 }, type: "collection", series: 3, percent: 40 },
    { id: "ach_26", name: "中堅コレクター1", conditionText: "シリーズ1収集率60%以上", rewardText: "1.5倍チケット 1枚", reward: { ticket15: 1 }, type: "collection", series: 1, percent: 60 },
    { id: "ach_27", name: "中堅コレクター2", conditionText: "シリーズ2収集率60%以上", rewardText: "1.5倍チケット 1枚", reward: { ticket15: 1 }, type: "collection", series: 2, percent: 60 },
    { id: "ach_28", name: "中堅コレクター3", conditionText: "シリーズ3収集率60%以上", rewardText: "1.5倍チケット 1枚", reward: { ticket15: 1 }, type: "collection", series: 3, percent: 60 },
    { id: "ach_29", name: "ベテランコレクター1", conditionText: "シリーズ1収集率80%以上", rewardText: "AP 20", reward: { ap: 20 }, type: "collection", series: 1, percent: 80 },
    { id: "ach_30", name: "ベテランコレクター2", conditionText: "シリーズ2収集率80%以上", rewardText: "AP 20", reward: { ap: 20 }, type: "collection", series: 2, percent: 80 },
    { id: "ach_31", name: "ベテランコレクター3", conditionText: "シリーズ3収集率80%以上", rewardText: "AP 20", reward: { ap: 20 }, type: "collection", series: 3, percent: 80 },
    { id: "ach_32", name: "仙人コレクター1", conditionText: "シリーズ1をコンプリート", rewardText: "2倍チケット 1枚", reward: { ticket2: 1 }, type: "collection", series: 1, percent: 100 },
    { id: "ach_33", name: "仙人コレクター2", conditionText: "シリーズ2をコンプリート", rewardText: "2倍チケット 1枚", reward: { ticket2: 1 }, type: "collection", series: 2, percent: 100 },
    { id: "ach_34", name: "仙人コレクター3", conditionText: "シリーズ3をコンプリート", rewardText: "2倍チケット 1枚", reward: { ticket2: 1 }, type: "collection", series: 3, percent: 100 },
    { id: "ach_35", name: "歯車は設定", conditionText: "設定画面を初めて開く", rewardText: "KP 3", reward: { kp: 3 }, type: "stat", stat: "openedSettings" },
    { id: "ach_36", name: "見た目も大事", conditionText: "トラッカーレベル5到達", rewardText: "KP 5", reward: { kp: 5 }, type: "level", value: 5 },
    { id: "ach_37", name: "KPすぐ無くなる", conditionText: "トラッカーレベル10到達", rewardText: "AP 10", reward: { ap: 10 }, type: "level", value: 10 },
    { id: "ach_38", name: "トラッカープロ", conditionText: "トラッカーレベル20到達", rewardText: "1.5倍チケット 1枚", reward: { ticket15: 1 }, type: "level", value: 20 },
    { id: "ach_39", name: "これがAPの力", conditionText: "初めてスキルUP画面を開く", rewardText: "AP 5", reward: { ap: 5 }, type: "stat", stat: "openedSkillUp" },
    { id: "ach_40", name: "おまけKP見てみたい", conditionText: "おまけKP獲得率が5%以上", rewardText: "KP 10", reward: { kp: 10 }, type: "bonus", bonus: "kpChance", value: 5 },
    { id: "ach_41", name: "おまけAP見てみたい", conditionText: "おまけAP獲得率が5%以上", rewardText: "AP 10", reward: { ap: 10 }, type: "bonus", bonus: "apChance", value: 5 },
    { id: "ach_42", name: "おまけKPそろそろ出るだろ", conditionText: "おまけKP獲得率が15%以上", rewardText: "1.5倍チケット 1枚", reward: { ticket15: 1 }, type: "bonus", bonus: "kpChance", value: 15 },
    { id: "ach_43", name: "おまけAPそろそろ出るだろ", conditionText: "おまけAP獲得率が15%以上", rewardText: "1.5倍チケット 1枚", reward: { ticket15: 1 }, type: "bonus", bonus: "apChance", value: 15 },
    { id: "ach_44", name: "おまけKP常連", conditionText: "おまけKP獲得率が30%以上", rewardText: "2倍チケット 1枚", reward: { ticket2: 1 }, type: "bonus", bonus: "kpChance", value: 30 },
    { id: "ach_45", name: "おまけAP常連", conditionText: "おまけAP獲得率が30%以上", rewardText: "2倍チケット 1枚", reward: { ticket2: 1 }, type: "bonus", bonus: "apChance", value: 30 },
    { id: "ach_46", name: "石橋キャラみぃつけた", conditionText: "石橋キャラを手に入れシリーズ4を解放", rewardText: "KP 30", reward: { kp: 30 }, type: "series4-unlocked" },
    { id: "ach_47", name: "石橋を知りすぎた", conditionText: "シリーズ4を3体揃える", rewardText: "2倍チケット 5枚", reward: { ticket2: 5 }, type: "series4-count", value: 3 },
    { id: "ach_48", name: "もはやチーター", conditionText: "1回の試合でKP40獲得（おまけ無し）", rewardText: "KP 40", reward: { kp: 40 }, type: "stat-at-least", stat: "maxBaseKp", value: 40 },
    { id: "ach_49", name: "ほぼコンプ", conditionText: "シリーズ1〜4をコンプリート", rewardText: "2倍チケット 5枚", reward: { ticket2: 5 }, type: "all-series-complete" },
    { id: "ach_50", name: "神", conditionText: "この実績以外を49個達成", rewardText: "KP 50 / AP 50 / 2倍チケット 5枚", reward: { kp: 50, ap: 50, ticket2: 5 }, type: "achievement-count", value: 49 }
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
  const eggTypeMap = new Map(Object.entries(window.collectionOperations?.EGG_LABELS || {}).map(([id, label]) => [id, { id, label }]));

  function normalizeEgg(value) {
    const normalized = window.collectionOperations?.normalizeEgg?.(value);
    if (!normalized) return null;
    const eggType = eggTypeMap.get(normalized.type);
    return eggType ? { type: eggType.id, label: eggType.label, createdAt: normalized.createdAt } : null;
  }

  function getDefaultState() {
    return {
      kp: 0,
      ap: 0,
      cookies: 0,
      tickets: { multiplier15: 0, multiplier2: 0 },
      selectedTicket: "",
      skills: {},
      egg: null,
      ownedCharacterIds: [],
      characterCounts: {},
      activeCharacterId: "",
      trackerLevel: 0,
      series4Unlocked: false,
      achievements: {
        achievedIds: [],
        claimedIds: [],
        selectedId: "ach_01",
        stats: {
          hasPointKp: false,
          hasPointAp: false,
          maxBaseKp: 0,
          maxBaseAp: 0,
          summonedEggTypes: [],
          openedSettings: false,
          openedSkillUp: false
        }
      }
    };
  }

  function normalizeState(parsed = {}) {
    const base = getDefaultState();
    return {
      ...base,
      ...parsed,
      kp: Math.max(0, Number(parsed?.kp) || 0),
      ap: Math.max(0, Number(parsed?.ap) || 0),
      cookies: Math.max(0, Number(parsed?.cookies) || 0),
      tickets: {
        multiplier15: Math.max(0, Number(parsed?.tickets?.multiplier15) || 0),
        multiplier2: Math.max(0, Number(parsed?.tickets?.multiplier2) || 0)
      },
      selectedTicket: parsed?.selectedTicket || "",
      skills: normalizeSkills(parsed?.skills),
      egg: normalizeEgg(parsed?.egg),
      ownedCharacterIds: Array.isArray(parsed?.ownedCharacterIds) ? parsed.ownedCharacterIds : [],
      characterCounts: normalizeCharacterCounts(parsed?.characterCounts),
      trackerLevel: Math.max(0, Math.min(TRACKER_MAX_LEVEL, Number(parsed?.trackerLevel) || 0)),
      series4Unlocked: Boolean(parsed?.series4Unlocked),
      achievements: normalizeAchievements(parsed?.achievements)
    };
  }

  function loadState(storageKey = activeStorageKey) {
    try {
      if (!storageKey) return getDefaultState();
      const saved = localStorage.getItem(storageKey);
      if (!saved) return getDefaultState();
      return normalizeState(JSON.parse(saved));
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

  function normalizeAchievements(value = {}) {
    const validIds = new Set(ACHIEVEMENT_DEFS.map((achievement) => achievement.id));
    const stats = value?.stats || {};
    return {
      achievedIds: Array.isArray(value?.achievedIds) ? value.achievedIds.filter((id) => validIds.has(id)) : [],
      claimedIds: Array.isArray(value?.claimedIds) ? value.claimedIds.filter((id) => validIds.has(id)) : [],
      selectedId: validIds.has(value?.selectedId) ? value.selectedId : "ach_01",
      stats: {
        hasPointKp: Boolean(stats.hasPointKp),
        hasPointAp: Boolean(stats.hasPointAp),
        maxBaseKp: Math.max(0, Number(stats.maxBaseKp) || 0),
        maxBaseAp: Math.max(0, Number(stats.maxBaseAp) || 0),
        summonedEggTypes: Array.isArray(stats.summonedEggTypes) ? [...new Set(stats.summonedEggTypes)] : [],
        openedSettings: Boolean(stats.openedSettings),
        openedSkillUp: Boolean(stats.openedSkillUp)
      }
    };
  }

  function normalizeCharacterCounts(value = {}) {
    return Object.entries(value || {}).reduce((counts, [characterId, count]) => {
      if (characterMap.has(characterId)) counts[characterId] = Math.max(0, Math.min(3, Number(count) || 0));
      return counts;
    }, {});
  }

  function saveState() {
    state.ownedCharacterIds = Object.keys(state.characterCounts).filter((characterId) => getCharacterStage(characterId) > 0);
    if (activeStorageKey) localStorage.setItem(activeStorageKey, JSON.stringify(state));
  }

  function requestFirebaseSync(reason = "") {
    if (!activeGoogleUid) return;
    window.dispatchEvent(new CustomEvent("collection:firebase-sync", { detail: { reason } }));
  }

  let activeGoogleUid = "";
  let activeStorageKey = "";
  let state = getDefaultState();
  let currentCollectionSeries = 1;
  let collectionOperationInFlight = false;
  let remoteProgressOperationInFlight = false;
  let deferredProgressMutations = [];

  function isProgressMutationLocked() {
    return collectionOperationInFlight || remoteProgressOperationInFlight;
  }

  function beginRemoteProgressOperation() {
    if (isProgressMutationLocked()) return false;
    remoteProgressOperationInFlight = true;
    renderAll();
    return true;
  }

  function endRemoteProgressOperation() {
    remoteProgressOperationInFlight = false;
    renderAll();
    runDeferredProgressMutations();
  }

  function queueDeferredProgressMutation(callback) {
    deferredProgressMutations.push(callback);
    return { ok: true, queued: true };
  }

  function runDeferredProgressMutations() {
    if (isProgressMutationLocked() || !deferredProgressMutations.length) return;
    const queued = deferredProgressMutations;
    deferredProgressMutations = [];
    queued.forEach((callback) => callback());
  }

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
    return window.collectionOperations?.summonCost?.(state) || Math.max(1, EGG_COST - getSkillLevel("summonDiscount"));
  }

  function getHatchCost() {
    return window.collectionOperations?.hatchCost?.(state) || Math.max(1, HATCH_COST - getSkillLevel("hatchDiscount"));
  }

  function getKayoTruckRestMs() {
    const level = Math.max(0, Math.min(6, getSkillLevel("truckRestDiscount")));
    return Math.max(30, 60 - level * 5) * 60 * 1000;
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
    const ids = window.collectionOperations?.availableCharacters?.(state, eggTypeId);
    return Array.isArray(ids) ? ids.map((id) => characterMap.get(id)).filter(Boolean) : [];
  }

  function getUnlockedEggTypes() {
    const eggs = window.collectionOperations?.availableEggTypes?.(state) || [];
    return eggs.map((egg) => ({ ...egg, image: EGG_IMAGE_PATHS[egg.id] || "" }));
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
    const cookieText = getElement("collectionCookieText");
    const ticket15Text = getElement("ticket15CountText");
    const ticket2Text = getElement("ticket2CountText");
    const useTicket15 = getElement("useTicket15");
    const useTicket2 = getElement("useTicket2");
    const ticket15Option = useTicket15?.closest(".ticket-use-option");
    const ticket2Option = useTicket2?.closest(".ticket-use-option");

    if (kpText) kpText.innerHTML = `<img class="item-count-icon" src="img/その他/KP.png" alt="">KP: ${state.kp}`;
    if (apText) apText.innerHTML = `<img class="item-count-icon" src="img/その他/AP.png" alt="">AP: ${state.ap || 0}`;
    if (cookieText) cookieText.innerHTML = `<img class="item-count-icon" src="img/その他/クッキー.png" alt="">クッキー: ${state.cookies || 0}`;
    if (ticket15Text) ticket15Text.innerHTML = `<img class="item-count-icon" src="img/その他/1.5倍チケット.png" alt="">1.5倍チケット ×${state.tickets?.multiplier15 || 0}`;
    if (ticket2Text) ticket2Text.innerHTML = `<img class="item-count-icon" src="img/その他/2倍チケット.png" alt="">2倍チケット ×${state.tickets?.multiplier2 || 0}`;

    if (ticket15Option) ticket15Option.style.display = state.tickets.multiplier15 > 0 ? "" : "none";
    if (ticket2Option) ticket2Option.style.display = state.tickets.multiplier2 > 0 ? "" : "none";
    if (useTicket15) useTicket15.checked = state.selectedTicket === "multiplier15" && state.tickets.multiplier15 > 0;
    if (useTicket2) useTicket2.checked = state.selectedTicket === "multiplier2" && state.tickets.multiplier2 > 0;
    if (useTicket15) useTicket15.disabled = isProgressMutationLocked();
    if (useTicket2) useTicket2.disabled = isProgressMutationLocked();
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
    const achievementButton = getElement("achievementButton");
    const settingsButton = getElement("settingsButton");
    const settingsPanel = getElement("settingsPanel");
    const hatcheryButton = getElement("collectionHatcheryButton");
    const skillUpButton = getElement("skillUpButton");
    const kayoFarmButton = getElement("kayoFarmButton");
    const brimGachaButton = getElement("brimGachaButton");
    const isMax = state.trackerLevel >= TRACKER_MAX_LEVEL;
    const cost = getTrackerUpgradeCost();

    if (achievementButton) {
      achievementButton.disabled = state.trackerLevel < 1 || isProgressMutationLocked();
      achievementButton.title = state.trackerLevel < 1 ? "トラッカーレベル1から解放されます" : "実績";
    }
    if (settingsButton) {
      settingsButton.disabled = false;
      settingsButton.title = "設定";
    }
    if (kayoFarmButton) {
      kayoFarmButton.disabled = state.trackerLevel < 2;
      kayoFarmButton.title = state.trackerLevel < 2 ? "トラッカーLv2から解放" : "K/AYO畑";
    }
    if (hatcheryButton) {
      hatcheryButton.disabled = state.trackerLevel < 3;
      hatcheryButton.title = state.trackerLevel < 3 ? "トラッカーレベル3から解放されます" : "孵化場";
    }
    const collectionDisplayButton = getElement("collectionDisplayButton");
    if (collectionDisplayButton) {
      collectionDisplayButton.disabled = state.trackerLevel < 4;
      collectionDisplayButton.title = state.trackerLevel < 4 ? "トラッカーレベル4から解放されます" : "コレクション";
    }
    if (skillUpButton) {
      skillUpButton.disabled = state.trackerLevel < 13 || isProgressMutationLocked();
      skillUpButton.title = state.trackerLevel < 13 ? "トラッカーLv13から解放" : "スキルUP";
    }
    if (brimGachaButton) {
      brimGachaButton.disabled = state.trackerLevel < 11;
      brimGachaButton.title = state.trackerLevel < 11 ? "トラッカーLv11から解放" : "ブリムガチャ";
    }

    if (levelText) levelText.textContent = `Lv.${state.trackerLevel}`;
    if (nextText) nextText.textContent = isMax ? "最大レベルです。" : `次：${getTrackerUnlockLabel(state.trackerLevel + 1)} / 必要KP：${cost}`;
    if (upgradeButton) upgradeButton.disabled = isProgressMutationLocked() || isMax || state.kp < cost;
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
    if (skill.type === "truck-rest") return `${Math.max(30, 60 - level * 5)}分`;
    if (skill.type === "shop-slot") return level > 0 ? "解放済み" : "未解放";
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
      const blockedBySlotOrder = skill.id === "shopSlot3" && getSkillLevel("shopSlot2") <= 0;
      const canUpgrade = !isProgressMutationLocked() && unlocked && !isMax && !blockedBySlotOrder && state.ap >= cost;
      const levelText = unlocked
        ? `Lv.${level} / ${skill.maxLevel}　現在：${getSkillValueText(skill, level)}`
        : `トラッカーLv${skill.unlockLevel}から解放`;
      const buttonText = !unlocked ? "未解放" : isMax ? (skill.type === "shop-slot" ? "解放済み" : "最大") : blockedBySlotOrder ? "2枠目が先" : `${cost}AP`;

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

  function getCollectionPercent(series) {
    const characters = getSeriesCharacters(series);
    if (!characters.length) return 0;
    const ownedCount = characters.filter((character) => getCharacterStage(character.id) > 0).length;
    return Math.floor((ownedCount / characters.length) * 100);
  }

  function getSeriesOwnedCount(series) {
    return getSeriesCharacters(series).filter((character) => getCharacterStage(character.id) > 0).length;
  }

  function markAchievementAction(action) {
    if (isProgressMutationLocked()) return false;
    state.achievements = normalizeAchievements(state.achievements);
    if (action === "open-settings") state.achievements.stats.openedSettings = true;
    if (action === "open-skill-up") state.achievements.stats.openedSkillUp = true;
    evaluateAchievements();
    saveState();
    renderAll();
    requestFirebaseSync(`achievement-${action}`);
    return true;
  }

  function recordPointAchievementStats(baseKp, baseAp) {
    state.achievements = normalizeAchievements(state.achievements);
    const stats = state.achievements.stats;
    if (baseKp > 0) stats.hasPointKp = true;
    if (baseAp > 0) stats.hasPointAp = true;
    stats.maxBaseKp = Math.max(stats.maxBaseKp, baseKp);
    stats.maxBaseAp = Math.max(stats.maxBaseAp, baseAp);
  }

  function recordSummonedEggType(eggTypeId) {
    state.achievements = normalizeAchievements(state.achievements);
    const types = new Set(state.achievements.stats.summonedEggTypes);
    if (eggTypeId) types.add(eggTypeId);
    state.achievements.stats.summonedEggTypes = [...types];
  }

  function isAchievementMet(achievement) {
    const stats = state.achievements?.stats || {};
    const bonusSummary = getPointBonusSummary();
    if (achievement.type === "stat") return Boolean(stats[achievement.stat]);
    if (achievement.type === "stat-at-least") return Number(stats[achievement.stat]) >= achievement.value;
    if (achievement.type === "egg") return Array.isArray(stats.summonedEggTypes) && stats.summonedEggTypes.includes(achievement.eggType);
    if (achievement.type === "collection") return getCollectionPercent(achievement.series) >= achievement.percent;
    if (achievement.type === "level") return state.trackerLevel >= achievement.value;
    if (achievement.type === "bonus") return Number(bonusSummary[achievement.bonus]) >= achievement.value;
    if (achievement.type === "series4-unlocked") return Boolean(state.series4Unlocked);
    if (achievement.type === "series4-count") return getSeriesOwnedCount(4) >= achievement.value;
    if (achievement.type === "all-series-complete") return [1, 2, 3, 4].every((series) => isSeriesComplete(series));
    if (achievement.type === "achievement-count") {
      return ACHIEVEMENT_DEFS
        .filter((item) => item.id !== achievement.id)
        .every((item) => state.achievements.achievedIds.includes(item.id));
    }
    return false;
  }

  function evaluateAchievements() {
    state.achievements = normalizeAchievements(state.achievements);
    let changed = false;
    for (const achievement of ACHIEVEMENT_DEFS) {
      if (state.achievements.achievedIds.includes(achievement.id)) continue;
      if (!isAchievementMet(achievement)) continue;
      state.achievements.achievedIds.push(achievement.id);
      changed = true;
    }
    const finalAchievement = ACHIEVEMENT_DEFS.find((achievement) => achievement.id === "ach_50");
    if (finalAchievement && !state.achievements.achievedIds.includes(finalAchievement.id) && isAchievementMet(finalAchievement)) {
      state.achievements.achievedIds.push(finalAchievement.id);
      changed = true;
    }
    return changed;
  }

  function renderAchievements() {
    evaluateAchievements();
    const grid = getElement("achievementGrid");
    const detail = getElement("achievementDetail");
    const selectedId = state.achievements?.selectedId || "ach_01";
    const selected = ACHIEVEMENT_DEFS.find((achievement) => achievement.id === selectedId) || ACHIEVEMENT_DEFS[0];
    const isHiddenAchievement = (achievement) => Number(String(achievement?.id || "").replace("ach_", "")) >= 46;
    if (grid) {
      grid.innerHTML = ACHIEVEMENT_DEFS.map((achievement, index) => {
        const achieved = state.achievements.achievedIds.includes(achievement.id);
        const claimed = state.achievements.claimedIds.includes(achievement.id);
        const active = achievement.id === selected.id ? "is-selected" : "";
        const number = index + 1;
        const hidden = isHiddenAchievement(achievement) && !achieved;
        const title = hidden ? "\uFF1F\uFF1F\uFF1F" : achievement.name;
        const content = hidden ? "\uFF1F" : String(number);
        return `<button type="button" class="achievement-tile ${active} ${achieved ? "is-achieved" : ""} ${claimed ? "is-claimed" : ""}" data-achievement-id="${achievement.id}" title="${escapeHtml(title)}">${content}</button>`;
      }).join("");
    }
    if (detail && selected) {
      const achieved = state.achievements.achievedIds.includes(selected.id);
      const claimed = state.achievements.claimedIds.includes(selected.id);
      const buttonText = claimed ? "\u53d7\u53d6\u6e08\u307f" : achieved ? "\u53d7\u3051\u53d6\u308a" : "\u672a\u9054\u6210";
      const hideDetail = isHiddenAchievement(selected) && !achieved;
      const detailName = hideDetail ? "\uFF1F\uFF1F\uFF1F" : selected.name;
      const detailCondition = hideDetail ? "\uFF1F\uFF1F\uFF1F" : selected.conditionText;
      const detailReward = hideDetail ? "\uFF1F\uFF1F\uFF1F" : selected.rewardText;
      const selectedNumber = ACHIEVEMENT_DEFS.indexOf(selected) + 1;
      detail.innerHTML = `
        <img class="achievement-detail-image" src="img/\u5b9f\u7e3e/${selectedNumber}.png" alt="${escapeHtml(detailName)}" onerror="this.style.display='none'">
        <div class="achievement-detail-main">
          <div class="achievement-detail-name">${escapeHtml(detailName)}</div>
          <div>\u9054\u6210\u6761\u4ef6\uff1a${escapeHtml(detailCondition)}</div>
          <div>\u5831\u916c\u5185\u5bb9\uff1a${escapeHtml(detailReward)}</div>
        </div>
        <button type="button" class="achievement-claim-button ${!achieved ? "is-disabled" : ""} ${claimed ? "is-claimed" : ""}" data-achievement-id="${selected.id}" ${achieved && !claimed ? "" : "disabled"}>${buttonText}</button>
      `;
    }
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
    const discardButton = getElement("collectionDiscardEggButton");
    const unlockedEggTypes = getUnlockedEggTypes();
    const totalRate = unlockedEggTypes.reduce((sum, eggType) => sum + eggType.rate, 0);
    const summonCost = getSummonCost();
    const hatchCost = getHatchCost();
    const recoveryPending = Boolean(loadPendingCollectionOperation());
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

    const eggExhausted = Boolean(state.egg && !getAvailableCharactersForEgg(state.egg.type).length);
    if (eggInfo) eggInfo.textContent = eggExhausted ? "この卵から出るキャラは全員3段階目です。卵を破棄できます。" : (state.egg ? `孵化必要KP：${hatchCost}` : `卵召喚必要KP：${summonCost}`);

    if (summonButton) {
      const hasAvailableEgg = unlockedEggTypes.length > 0;
      summonButton.textContent = `卵召喚 -${summonCost}KP`;
      summonButton.disabled = isProgressMutationLocked() || recoveryPending || state.kp < summonCost || Boolean(state.egg) || !hasAvailableEgg;
      summonButton.title = !hasAvailableEgg ? "出せる卵がありません" : "";
    }

    if (hatchButton) {
      hatchButton.textContent = `孵化する -${hatchCost}KP`;
      hatchButton.style.display = state.egg ? "" : "none";
      hatchButton.disabled = isProgressMutationLocked() || recoveryPending || !state.egg || eggExhausted || state.kp < hatchCost;
    }
    if (discardButton) {
      discardButton.hidden = !eggExhausted;
      discardButton.disabled = isProgressMutationLocked() || recoveryPending;
    }
  }

  function renderAll() {
    renderWindow();
    renderHatchery();
    renderSkillPanel();
    renderAchievements();
  }

  function addKp(amount, reason = "") {
    if (isProgressMutationLocked()) return queueDeferredProgressMutation(() => addKp(amount, reason));
    const value = Math.max(0, Number(amount) || 0);
    if (value <= 0) return;

    state.kp += value;
    saveState();
    renderAll();
    setStatus(reason ? `${reason}：${value}KP` : `+${value}KP`);
    requestFirebaseSync("add-kp");
  }

  function addAp(amount, reason = "") {
    if (isProgressMutationLocked()) return false;
    const value = Math.max(0, Number(amount) || 0);
    if (value <= 0) return;

    state.ap += value;
    saveState();
    renderAll();
    setStatus(reason ? `${reason}：${value}AP` : `+${value}AP`);
    requestFirebaseSync("add-ap");
  }

  function addRewards(rewards = {}, reason = "") {
    if (isProgressMutationLocked()) return false;
    const kp = Math.max(0, Number(rewards.kp) || 0);
    const ap = Math.max(0, Number(rewards.ap) || 0);
    const cookies = Math.max(0, Number(rewards.cookies) || 0);
    const ticket15 = Math.max(0, Number(rewards.ticket15) || 0);
    const ticket2 = Math.max(0, Number(rewards.ticket2) || 0);
    if (!kp && !ap && !cookies && !ticket15 && !ticket2) return;

    state.kp += kp;
    state.ap += ap;
    state.cookies += cookies;
    state.tickets.multiplier15 += ticket15;
    state.tickets.multiplier2 += ticket2;
    saveState();
    renderAll();
    setStatus(reason || "管理者からアイテムを受け取りました");
    requestFirebaseSync("add-rewards");
  }

  function addCookies(amount = 0, reason = "") {
    if (isProgressMutationLocked()) return false;
    const value = Math.max(0, Math.floor(Number(amount) || 0));
    if (!value) return false;
    state.cookies += value;
    saveState();
    renderAll();
    setStatus(reason ? `${reason}：クッキー ${value}` : `クッキー ${value}獲得`);
    requestFirebaseSync("add-cookies");
    return true;
  }

  function spendCookies(amount = 0, reason = "") {
    if (isProgressMutationLocked()) return false;
    const value = Math.max(0, Math.floor(Number(amount) || 0));
    if (!value || state.cookies < value) return false;
    state.cookies -= value;
    saveState();
    renderAll();
    if (reason) setStatus(reason);
    requestFirebaseSync("spend-cookies");
    return true;
  }

  function claimAchievementReward(achievementId) {
    if (isProgressMutationLocked()) return;
    const achievement = ACHIEVEMENT_DEFS.find((item) => item.id === achievementId);
    if (!achievement) return;
    evaluateAchievements();
    if (!state.achievements.achievedIds.includes(achievement.id)) return;
    if (state.achievements.claimedIds.includes(achievement.id)) return;

    state.kp += Math.max(0, Number(achievement.reward?.kp) || 0);
    state.ap += Math.max(0, Number(achievement.reward?.ap) || 0);
    state.tickets.multiplier15 += Math.max(0, Number(achievement.reward?.ticket15) || 0);
    state.tickets.multiplier2 += Math.max(0, Number(achievement.reward?.ticket2) || 0);
    state.achievements.claimedIds.push(achievement.id);
    saveState();
    renderAll();
    setStatus(`${achievement.name}の報酬を受け取りました`);
    requestFirebaseSync("claim-achievement");
  }

  function confiscateRewards(rewards = {}, reason = "") {
    if (isProgressMutationLocked()) return false;
    const kp = Math.max(0, Number(rewards.kp) || 0);
    const ap = Math.max(0, Number(rewards.ap) || 0);
    const cookies = Math.max(0, Number(rewards.cookies) || 0);
    const ticket15 = Math.max(0, Number(rewards.ticket15) || 0);
    const ticket2 = Math.max(0, Number(rewards.ticket2) || 0);
    if (!kp && !ap && !cookies && !ticket15 && !ticket2) return;

    state.kp = Math.max(0, state.kp - kp);
    state.ap = Math.max(0, state.ap - ap);
    state.cookies = Math.max(0, state.cookies - cookies);
    state.tickets.multiplier15 = Math.max(0, state.tickets.multiplier15 - ticket15);
    state.tickets.multiplier2 = Math.max(0, state.tickets.multiplier2 - ticket2);
    if (state.selectedTicket && !state.tickets[state.selectedTicket]) state.selectedTicket = "";
    saveState();
    renderAll();
    setStatus(reason || "管理者によりアイテムが没収されました");
    requestFirebaseSync("confiscate-rewards");
  }

  function rollChance(percent, random = Math.random) {
    return percent > 0 && random() * 100 < percent;
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

  function claimMatchReward(payload = {}, random = Math.random) {
    if (isProgressMutationLocked()) return { ok: false, message: "サーバー処理中です。" };
    const baseKp = Math.max(0, Number(payload.kpEarned) || 0);
    const baseAp = Math.max(0, Number(payload.apEarned) || 0);
    const multiplied = applySelectedTicket(baseKp, baseAp);
    const summary = getPointBonusSummary();
    const bonusKp = getSkillLevel("bonusKpAmount") > 0 && rollChance(summary.kpChance, random) ? getSkillLevel("bonusKpAmount") : 0;
    const bonusAp = getSkillLevel("bonusApAmount") > 0 && rollChance(summary.apChance, random) ? getSkillLevel("bonusApAmount") : 0;
    const rouletteReward = rollChance(summary.rouletteChance, random) ? rollRoulette(random) : null;

    state.kp += multiplied.kp + bonusKp + (rouletteReward?.kp || 0);
    state.ap += multiplied.ap + bonusAp + (rouletteReward?.ap || 0);
    if (rouletteReward?.ticket15) state.tickets.multiplier15 += rouletteReward.ticket15;
    if (rouletteReward?.ticket2) state.tickets.multiplier2 += rouletteReward.ticket2;
    if (rouletteReward?.unlockSeries4) {
      state.series4Unlocked = true;
      const characterId = rouletteReward.characterId || "series4_ishibashi1";
      state.characterCounts[characterId] = Math.min(3, getCharacterStage(characterId) + 1);
      state.activeCharacterId = characterId;
    }
    if (state.selectedTicket && !state.tickets[state.selectedTicket]) state.selectedTicket = "";
    recordPointAchievementStats(baseKp, baseAp);
    evaluateAchievements();

    saveState();
    renderAll();

    showCommittedMatchReward({ kp: multiplied.kp, ap: multiplied.ap, bonusKp, bonusAp, ticketUsed: multiplied.ticketUsed, roulette: rouletteReward });
    requestFirebaseSync("claim-match-reward");

    return { kp: multiplied.kp, ap: multiplied.ap, bonusKp, bonusAp, roulette: rouletteReward };
  }

  function showCommittedMatchReward(reward = {}) {
    const parts = [`${Number(reward.kp || 0)}KP`, `${Number(reward.ap || 0)}AP`];
    if (reward.ticketUsed) parts.push(`${reward.ticketUsed}使用`);
    setStatus(parts.join(" / "));
    rewardEffectQueue = rewardEffectQueue.catch(() => {}).then(async () => {
      if ((Number(reward.bonusKp) > 0 || Number(reward.bonusAp) > 0) && window.trackerEffects?.showBonusReveal) {
        await window.trackerEffects.showBonusReveal(reward);
      }
      if (reward.roulette && window.trackerEffects?.showRoulette) {
        await window.trackerEffects.showRoulette(reward.roulette);
      }
    });
    return rewardEffectQueue;
  }

  function rollRoulette(random = Math.random) {
    const roll = random() * 100;
    if (roll < 35) return { key: "kp5", kp: 5, label: "KP 5獲得", confirmText: "KP 5獲得確定！" };
    if (roll < 70) return { key: "ap10", ap: 10, label: "AP 10獲得", confirmText: "AP 10獲得確定！" };
    if (roll < 90) return { key: "ticket15", ticket15: 1, label: "1.5倍チケット獲得", confirmText: "1.5倍チケット獲得確定！" };
    if (roll < 98) return { key: "ticket2", ticket2: 1, label: "2倍チケット獲得", confirmText: "2倍チケット獲得確定！" };
    const characterId = "series4_ishibashi1";
    if (getCharacterStage(characterId) >= 3) {
      return { key: "hit-duplicate", ticket2: 1, label: "石橋キャラは最大段階のため2倍チケット獲得" };
    }
    return {
      key: "hit",
      unlockSeries4: true,
      characterId,
      characterName: "石橋キャラ",
      characterImage: "img/キャラ4/ChatGPT Image 2026年6月2日 21_37_41-1.png",
      label: "当たり！石橋キャラ獲得！"
    };
  }

  function createCollectionOperationId() {
    return typeof crypto?.randomUUID === "function" ? crypto.randomUUID().replace(/-/g, "") : `${Date.now()}${Math.random().toString(36).slice(2)}`;
  }

  function pendingOperationKey() {
    return activeGoogleUid ? `${PENDING_OPERATION_PREFIX}${activeGoogleUid}` : "";
  }

  function loadPendingCollectionOperation() {
    try {
      const key = pendingOperationKey();
      const pending = key ? JSON.parse(localStorage.getItem(key) || "null") : null;
      return pending && /^[A-Za-z0-9_-]{16,128}$/.test(String(pending.id || "")) && ["summonEgg", "hatchEgg", "discardEgg", "brimGacha"].includes(pending.type) ? { id: pending.id, type: pending.type } : null;
    } catch { return null; }
  }

  function savePendingCollectionOperation(operation) {
    const key = pendingOperationKey();
    if (key) localStorage.setItem(key, JSON.stringify(operation));
  }

  function clearPendingCollectionOperation() {
    const key = pendingOperationKey();
    if (key) localStorage.removeItem(key);
  }

  function presentCollectionOperationResult(operation = {}) {
    const characterId = operation.characterId || (operation.prize?.ishibashi ? "series4_ishibashi1" : "");
    if (!characterId) return;
    const character = characterMap.get(characterId);
    if (character) showHatchResult(character, Number(operation.stage || getCharacterStage(characterId)) || 1);
  }

  async function applyCollectionOperation(type, options = {}) {
    if (isProgressMutationLocked()) return { ok: false, message: "処理中です。" };
    if (!activeGoogleUid || !window.trackerValorantApi?.applyGoogleCollectionOperation) {
      const result = { ok: false, message: "Google進捗を保存できません。ログインと通信を確認してください。" };
      setStatus(result.message);
      return result;
    }
    const pending = loadPendingCollectionOperation();
    if (pending && pending.type !== type) {
      const result = { ok: false, code: "pending-operation", message: "前回の操作を復旧中です。完了するまで別の操作はできません。" };
      setStatus(result.message);
      void retryPendingCollectionOperation();
      renderAll();
      return result;
    }
    collectionOperationInFlight = true;
    renderAll();
    try {
      const flushed = await window.onboardingAccount?.flushPendingProgress?.();
      if (flushed && !flushed.ok) {
        const result = { ok: false, code: flushed.code || "save-failed", message: flushed.message || "進捗の保存を完了できませんでした。接続を確認して、もう一度お試しください。" };
        setStatus(result.message);
        return result;
      }
      const operation = pending || { id: createCollectionOperationId(), type };
      savePendingCollectionOperation(operation);
      const result = await window.trackerValorantApi.applyGoogleCollectionOperation(operation);
      if (!result?.ok) {
        if (result?.state) window.collectionGame.applyCommittedCloudState(result.state, result.revision || "");
        if (result?.code) clearPendingCollectionOperation();
        setStatus(result?.message || "進捗を保存できませんでした。もう一度お試しください。");
        return result || { ok: false };
      }
      clearPendingCollectionOperation();
      window.collectionGame.applyCommittedCloudState(result.state || {}, result.revision || "");
      const operationResult = result.result || {};
      if (!options.deferPresentation) presentCollectionOperationResult(operationResult);
      if (type === "summonEgg") setStatus(operationResult.cookieBonus ? `クッキーボーナス発生！クッキー${operationResult.cookieBonus}個を獲得しました` : `${operationResult.egg?.label || "卵"}を召喚しました`);
      else if (type === "hatchEgg") setStatus("孵化結果を保存しました");
      else if (type === "discardEgg") setStatus("卵を破棄しました");
      return result;
    } catch (error) {
      const result = { ok: false, message: error?.message || "進捗を保存できませんでした。もう一度お試しください。" };
      setStatus(result.message);
      return result;
    } finally {
      collectionOperationInFlight = false;
      renderAll();
      runDeferredProgressMutations();
    }
  }

  async function retryPendingCollectionOperation() {
    const pending = loadPendingCollectionOperation();
    if (pending) await applyCollectionOperation(pending.type);
  }

  async function summonEgg() {
    return applyCollectionOperation("summonEgg");
  }

  async function hatchEgg() {
    return applyCollectionOperation("hatchEgg");
  }

  function getBrimIshibashiStage() {
    return getCharacterStage("series4_ishibashi1");
  }

  function awardBrimIshibashiCharacter() {
    if (isProgressMutationLocked()) return null;
    const character = characterMap.get("series4_ishibashi1");
    if (!character) return null;
    const currentStage = getCharacterStage(character.id);
    if (currentStage >= 3) return null;
    const nextStage = currentStage + 1;
    state.series4Unlocked = true;
    state.characterCounts[character.id] = nextStage;
    state.activeCharacterId = character.id;
    evaluateAchievements();
    saveState();
    renderAll();
    showHatchResult(character, nextStage);
    setStatus(`石橋キャラ 第${nextStage}段階`);
    requestFirebaseSync("brim-gacha-ishibashi");
    return { character, stage: nextStage };
  }

  function getShopSlotsUnlocked() {
    return 1 + (getSkillLevel("shopSlot2") > 0 ? 1 : 0) + (getSkillLevel("shopSlot3") > 0 ? 1 : 0);
  }

  function getShopCharacters() {
    return allCharacters.map((character) => ({
      id: character.id,
      series: character.series,
      rank: character.rank,
      rarity: character.eggType,
      rarityLabel: character.rank,
      name: character.name,
      image: character.image,
      stage: getCharacterStage(character.id),
      completed: getCharacterStage(character.id) >= 3
    }));
  }

  function getShopBuyerState() {
    return {
      kp: Math.max(0, Number(state.kp) || 0),
      characterCounts: { ...state.characterCounts },
      ownedCharacterIds: [...state.ownedCharacterIds]
    };
  }

  function applyShopPurchase(characterId, price) {
    return applyShopPurchaseInternal(characterId, price, false);
  }

  function applyCommittedShopPurchase(characterId, price) {
    return applyShopPurchaseInternal(characterId, price, true);
  }

  function applyShopPurchaseInternal(characterId, price, allowDuringLock) {
    if (isProgressMutationLocked() && !allowDuringLock) return { ok: false, message: "サーバー処理中です。完了後にもう一度お試しください。" };
    const id = String(characterId || "");
    const value = Math.max(0, Number(price) || 0);
    const character = characterMap.get(id);
    if (!character) return { ok: false, message: "キャラが見つかりません" };
    if (state.kp < value) return { ok: false, message: "KPが足りません" };
    const currentStage = getCharacterStage(id);
    if (currentStage >= 3) return { ok: false, message: "完成済み" };

    state.kp -= value;
    state.characterCounts[id] = Math.min(3, currentStage + 1);
    if (character.series === 4) state.series4Unlocked = true;
    state.activeCharacterId = id;
    evaluateAchievements();
    saveState();
    renderAll();
    setStatus(`${character.name}を購入しました`);
    requestFirebaseSync("shop-purchase");
    return { ok: true, character, stage: state.characterCounts[id] };
  }

  function spendKp(amount, reason = "") {
    return spendKpInternal(amount, reason, false);
  }

  function spendCommittedKp(amount, reason = "") {
    return spendKpInternal(amount, reason, true);
  }

  function spendKpInternal(amount, reason, allowDuringLock) {
    if (isProgressMutationLocked() && !allowDuringLock) return { ok: false, message: "サーバー処理中です。完了後にもう一度お試しください。" };
    const value = Math.max(0, Math.floor(Number(amount) || 0));
    if (!value) return { ok: true, kp: state.kp };
    if (state.kp < value) return { ok: false, message: "KPが足りません" };
    state.kp -= value;
    saveState();
    renderAll();
    if (reason) setStatus(reason);
    requestFirebaseSync("shop-spend-kp");
    return { ok: true, kp: state.kp };
  }

  function upgradeTracker() {
    if (isProgressMutationLocked()) return;
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
    evaluateAchievements();
    saveState();
    renderAll();
    setStatus(`トラッカーLv.${state.trackerLevel}に上がりました`);
    requestFirebaseSync("upgrade-tracker");
  }

  function upgradeSkill(skillId) {
    if (isProgressMutationLocked()) return;
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
    if (skill.id === "shopSlot3" && getSkillLevel("shopSlot2") <= 0) {
      setStatus("ショップ出品枠2を先に解放してください");
      return;
    }

    const cost = skill.costs[level] || 0;
    if (state.ap < cost) {
      setStatus("APが足りません");
      return;
    }

    state.ap -= cost;
    state.skills[skillId] = level + 1;
    evaluateAchievements();
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
      cookies: state.cookies,
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
      cookies: Math.max(0, Number(saved.cookies) || 0),
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
    state.cookies = 0;
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
    const achievementButton = getElement("achievementButton");
    const collectionDisplayButton = getElement("collectionDisplayButton");
    const hatcheryButton = getElement("collectionHatcheryButton");
    const skillUpButton = getElement("skillUpButton");
    const achievementOverlay = getElement("achievementOverlay");
    const collectionDisplayOverlay = getElement("collectionDisplayOverlay");
    const hatcheryOverlay = getElement("collectionHatcheryOverlay");
    const skillUpOverlay = getElement("skillUpOverlay");
    const summonButton = getElement("collectionSummonEggButton");
    const hatchButton = getElement("collectionHatchEggButton");
    const discardButton = getElement("collectionDiscardEggButton");
    const upgradeButton = getElement("trackerUpgradeButton");
    const seriesPrevButton = getElement("collectionSeriesPrevButton");
    const seriesNextButton = getElement("collectionSeriesNextButton");
    const kpText = getElement("collectionKpText");
    const useTicket15 = getElement("useTicket15");
    const useTicket2 = getElement("useTicket2");
    const skillUpList = getElement("skillUpList");
    const achievementGrid = getElement("achievementGrid");
    const achievementDetail = getElement("achievementDetail");

    if (achievementButton) {
      achievementButton.addEventListener("click", () => {
        if (isProgressMutationLocked()) return;
        evaluateAchievements();
        saveState();
        renderAchievements();
        requestFirebaseSync("open-achievement");
        openPanel("achievementOverlay");
      });
    }
    if (collectionDisplayButton) {
      collectionDisplayButton.addEventListener("click", () => {
        openPanel("collectionDisplayOverlay");
        requestFirebaseSync("open-collection");
      });
    }
    if (hatcheryButton) hatcheryButton.addEventListener("click", () => openPanel("collectionHatcheryOverlay"));
    if (skillUpButton) {
      skillUpButton.addEventListener("click", () => {
        openPanel("skillUpOverlay");
        markAchievementAction("open-skill-up");
      });
    }
    if (achievementOverlay) {
      achievementOverlay.addEventListener("click", (event) => {
        if (event.target === achievementOverlay) closePanel("achievementOverlay");
      });
    }
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
    if (discardButton) discardButton.addEventListener("click", async () => {
      if (!window.confirm("この卵を無料で破棄しますか？")) return;
      await applyCollectionOperation("discardEgg");
    });
    if (upgradeButton) upgradeButton.addEventListener("click", upgradeTracker);
    if (useTicket15) {
      useTicket15.addEventListener("change", () => {
        if (isProgressMutationLocked()) { renderAll(); return; }
        state.selectedTicket = useTicket15.checked ? "multiplier15" : "";
        saveState();
        renderAll();
        requestFirebaseSync("select-ticket");
      });
    }
    if (useTicket2) {
      useTicket2.addEventListener("change", () => {
        if (isProgressMutationLocked()) { renderAll(); return; }
        state.selectedTicket = useTicket2.checked ? "multiplier2" : "";
        saveState();
        renderAll();
        requestFirebaseSync("select-ticket");
      });
    }
    if (skillUpList) {
      skillUpList.addEventListener("click", (event) => {
        const button = event.target.closest(".skill-up-level-button");
        if (!button || button.disabled) return;
        upgradeSkill(button.dataset.skillId);
      });
    }
    if (achievementGrid) {
      achievementGrid.addEventListener("click", (event) => {
        if (isProgressMutationLocked()) return;
        const button = event.target.closest("[data-achievement-id]");
        if (!button) return;
        state.achievements.selectedId = button.dataset.achievementId;
        saveState();
        renderAchievements();
        requestFirebaseSync("select-achievement");
      });
    }
    if (achievementDetail) {
      achievementDetail.addEventListener("click", (event) => {
        const button = event.target.closest(".achievement-claim-button");
        if (!button || button.disabled) return;
        claimAchievementReward(button.dataset.achievementId);
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
    addCookies,
    spendCookies,
    confiscateRewards,
    claimMatchReward,
    showCommittedMatchReward,
    getPointBonusSummary,
    getKayoTruckRestMs,
    upgradeTracker,
    getImplementationTestState,
    restoreImplementationTestState,
    resetTrackerLevelOnly,
    resetItemsOnly,
    resetCollectionOnly,
    getBrimIshibashiStage,
    hasPendingCollectionOperation: () => Boolean(loadPendingCollectionOperation()),
    beginRemoteProgressOperation,
    endRemoteProgressOperation,
    applyCommittedShopPurchase,
    spendCommittedKp,
    applyCollectionOperation,
    presentCollectionOperationResult,
    awardBrimIshibashiCharacter,
    getShopSlotsUnlocked,
    getShopCharacters,
    getShopBuyerState,
    applyShopPurchase,
    spendKp,
    getState: () => ({ ...state, characterCounts: { ...state.characterCounts }, ownedCharacterIds: [...state.ownedCharacterIds] }),
    getCloudState: () => JSON.parse(JSON.stringify(state)),
    getActiveGoogleUid: () => activeGoogleUid,
    activateGoogleAccount: (uid, nextState) => {
      const normalizedUid = String(uid || "").trim();
      if (!normalizedUid) return false;
      activeGoogleUid = normalizedUid;
      activeStorageKey = ACCOUNT_STORAGE_PREFIX + normalizedUid;
      localStorage.setItem(ACTIVE_ACCOUNT_KEY, normalizedUid);
      state = nextState && typeof nextState === "object"
        ? normalizeState(nextState)
        : loadState(activeStorageKey);
      evaluateAchievements();
      saveState();
      renderAll();
      void retryPendingCollectionOperation();
      return true;
    },
    deactivateGoogleAccount: () => {
      activeGoogleUid = "";
      activeStorageKey = "";
      localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
      state = getDefaultState();
      renderAll();
    },
    hasLegacyProgress: () => {
      try { return Boolean(localStorage.getItem(LEGACY_STORAGE_KEY)); } catch { return false; }
    },
    getLegacyCloudState: () => loadState(LEGACY_STORAGE_KEY),
    importLegacyProgress: () => {
      if (!activeStorageKey) return null;
      state = loadState(LEGACY_STORAGE_KEY);
      evaluateAchievements();
      saveState();
      renderAll();
      return JSON.parse(JSON.stringify(state));
    },
    replaceCloudState: (nextState = {}, options = {}) => {
      try {
        if (!activeStorageKey) return;
        state = normalizeState(nextState);
        evaluateAchievements();
        saveState();
        renderAll();
        if (options.sync !== false) requestFirebaseSync("replace-cloud-state");
      } catch (error) {}
    },
    applyCommittedCloudState: (nextState = {}, revision = "") => {
      try {
        if (!activeStorageKey) return;
        state = normalizeState(nextState);
        evaluateAchievements();
        saveState();
        renderAll();
        if (revision) window.dispatchEvent(new CustomEvent("collection:cloud-revision", { detail: { revision } }));
      } catch (error) {}
    },
    setCloudRevision: (revision = "") => {
      if (revision) window.dispatchEvent(new CustomEvent("collection:cloud-revision", { detail: { revision } }));
    },
    render: renderAll
  };

  window.addEventListener("collection:add-kp", (event) => {
    addKp(event.detail?.amount || 0, event.detail?.reason || "");
  });

  window.addEventListener("collection:achievement-action", (event) => {
    markAchievementAction(event.detail?.action || "");
  });

  window.addEventListener("collection:sync-error", (event) => {
    setStatus(event.detail?.message || "進捗を保存できませんでした。自動再試行します。");
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
