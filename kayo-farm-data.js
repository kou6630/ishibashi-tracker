(function () {
  "use strict";

  const crops = [
    { id: "jett", agent: "ジェット", seedName: "ジェット", cropName: "風切りネギ", rewardType: "kp", unitValue: 0.2 },
    { id: "raze", agent: "レイズ", seedName: "レイズ", cropName: "爆弾トマト", rewardType: "ap", unitValue: 0.2 },
    { id: "sage", agent: "セージ", seedName: "セージ", cropName: "回復アロエ", rewardType: "kp", unitValue: 0.5 },
    { id: "omen", agent: "オーメン", seedName: "オーメン", cropName: "闇きのこ", rewardType: "ap", unitValue: 0.5 },
    { id: "sova", agent: "ソーヴァ", seedName: "ソーヴァ", cropName: "偵察ブルーベリー", rewardType: "kp", unitValue: 0.8 },
    { id: "cypher", agent: "サイファー", seedName: "サイファー", cropName: "監視かぼちゃ", rewardType: "ap", unitValue: 0.8 },
    { id: "viper", agent: "ヴァイパー", seedName: "ヴァイパー", cropName: "毒ナス", rewardType: "kp", unitValue: 1.2 },
    { id: "killjoy", agent: "キルジョイ", seedName: "キルジョイ", cropName: "タレットじゃがいも", rewardType: "ap", unitValue: 1.2 },
    { id: "skye", agent: "スカイ", seedName: "スカイ", cropName: "野生キャベツ", rewardType: "kp", unitValue: 1.8 },
    { id: "astra", agent: "アストラ", seedName: "アストラ", cropName: "宇宙ぶどう", rewardType: "ap", unitValue: 1.8 },
    { id: "chamber", agent: "チェンバー", seedName: "チェンバー", cropName: "高級にんじん", rewardType: "ticket", unitValue: 0.2 }
  ];

  crops.forEach((crop, index) => {
    crop.index = index;
    crop.seedImage = `img/種/${crop.agent}.png`;
    crop.cropImage = `img/作物/${crop.cropName}.png`;
  });

  window.kayoFarmData = {
    crops,
    cropById: Object.fromEntries(crops.map((crop) => [crop.id, crop])),
    seeds: crops.map((crop) => ({
      id: crop.id,
      name: crop.seedName,
      image: crop.seedImage,
      cropId: crop.id
    })),
    imagePaths: {
      grownSprout: "img/その他/育った苗.png",
      sprout: "img/その他/若芽.png",
      box: "img/その他/ダンボール.png",
      truck: "img/その他/トラック.png",
      pot: "img/その他/植木鉢.png",
      floorTile: "img/その他/床タイル.png",
      spike: "img/その他/拡張スパイク.png",
      cookie: "img/その他/クッキー.png"
    },
    timings: {
      cropGrowthMs: 30 * 60 * 1000,
      truckRestMs: 60 * 60 * 1000,
      productionCropGrowthMs: 30 * 60 * 1000,
      productionTruckRestMs: 60 * 60 * 1000
    },
    harvestRules: {
      normal: [
        { chance: 0.5, sameSeed: 1, nextSeed: 0, spike: 0 },
        { chance: 0.3, sameSeed: 2, nextSeed: 0, spike: 0 },
        { chance: 0.15, sameSeed: 1, nextSeed: 1, spike: 0 },
        { chance: 0.05, sameSeed: 1, nextSeed: 0, spike: 1 }
      ],
      chamber: [
        { chance: 0.65, sameSeed: 1, nextSeed: 0, spike: 0 },
        { chance: 0.3, sameSeed: 2, nextSeed: 0, spike: 0 },
        { chance: 0.05, sameSeed: 1, nextSeed: 0, spike: 1 }
      ]
    },
    farm: {
      maxPots: 32,
      potsPerBlock: 8,
      initialUnlockedPots: 2,
      initialSeedId: "jett",
      potUnlockSpikeCost: 1
    },
    truck: {
      initialTrucks: 1,
      maxTrucks: 5,
      cookieRewardsByLevel: {
        1: { min: 30, max: 80 },
        2: { min: 80, max: 120 },
        3: { min: 120, max: 150 },
        4: { min: 150, max: 200 },
        5: { min: 200, max: 300 }
      },
      unlockSpikeCosts: { 2: 2, 3: 3, 4: 4, 5: 5 },
      orderTotalCapsByBlock: { 1: 5, 2: 8, 3: 10, 4: 13 },
      ticketOdds: { ticket15: 0.8, ticket2: 0.2 }
    },
    expansion: {
      spikeName: "拡張スパイク"
    }
  };
})();
