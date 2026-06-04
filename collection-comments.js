(() => {
  const COMMENTS = {
    iron1: "警察に落し物として届けられた物",
    iron2: "警察に落し物として届けられた物",
    iron3: "警察に落し物として届けられた物\n少しだけ漬け物の匂いがする",
    bronze1: "使われない環境時に\n家に引きこもっていた結果",
    bronze2: "使われない環境時に\n家に引きこもっていた結果",
    bronze3: "私太らない体質だからと周りに言っていたけど\n割と太る体質だった",
    silver1: "Amazonで3600円で買った\n(レビュー★3.2)",
    silver2: "よく学校で友達に\nお前ソーヴァのドローンに似てるよねと言われる\n今はコンプレックス",
    silver3: "昔ゲッコーの自転車を勝手に乗って壊した為\n今は反省の意を込めてゲッコーの奴隷をしている",
    gold1: "ジェットに憧れてコスプレをしたら\nバズったけどコメントが辛辣",
    gold2: "オーメンに憧れて金はないけど\n自作でコスプレ衣装を作った\n割とクオリティが高いが長さが足りなかった",
    gold3: "レイズに似てるねって言われるけど\nレイズが誰かわからない人",
    platinum1: "受け持つ患者は大体死ぬ",
    platinum2: "夜の店にこの格好で面接に言ったが\n警察を呼ばれた",
    platinum3: "毎朝化粧で6時間かかる",
    diamond1: "筋肉をつけたらモテると言われたので\n必死に筋トレしたがモテない",
    diamond2: "マッスルバーで働くのが夢だが\nマッスルバーが近所にない",
    diamond3: "ゲイバーの金髪ロン毛担当",
    ascendant1: "日本円で230万の価値がある",
    ascendant2: "日本円で260万の価値がある",
    ascendant3: "表面に金箔が貼られただけ\n日本円で3万の価値しかない",
    immortal1: "天界でヒュンヒュン動き回るため\n天界でのあだ名はハエ",
    immortal2: "天界に住んでるが\n足が早すぎてまだ目視できた者はいない",
    immortal3: "天界生まれ天界育ち\nお人好しは大体友達",
    radiant: "水虫に悩まされている\nでも水虫が良く似合う",
    series2_iron1: "所々焦げている",
    series2_iron2: "ヴィレバンで売ってた",
    series2_iron3: "まだカツラということに\nバレていないと思っている",
    series2_bronze1: "ラウンドワンのゲーセンにある",
    series2_bronze2: "楽市楽座のゲーセンにある",
    series2_bronze3: "ずっと置いてるが非常に人気がない",
    series2_silver1: "頭だけでもずっと喋る\n｢まっ、体無いけどなw｣\nが口癖",
    series2_silver2: "お腹の辺りを開けると\n中は冷蔵庫になってる",
    series2_silver3: "中国で作られた\nすぐ壊れた",
    series2_gold1: "有名な職人によって掘られた\n偶然似ただけ",
    series2_gold2: "体に石ペイントをして石のフリをしている",
    series2_gold3: "昔子供のキャッチボールで壊れたことがある\n今は2代目",
    series2_platinum1: "食事が喉を通らない",
    series2_platinum2: "新しくメンバーに入った緊張で\n食事が喉を通らない",
    series2_platinum3: "過労でここまできた",
    series2_diamond1: "口癖は｢まじナノスワームなんだけど｣",
    series2_diamond2: "中学でイジメられていた為\n高校で強烈なイメチェンを果たした",
    series2_diamond3: "舌でさくらんぼのヘタを結べる",
    series2_ascendant1: "ほんとの本当になんとなくやってみた",
    series2_ascendant2: "逆立ちできるよ！と啖呵切ったが\n腕が伸ばせない",
    series2_ascendant3: "人に謝る時は基本これでいく",
    series2_immortal1: "魔界の王\n子分にムカつくとすぐ火を投げる",
    series2_immortal2: "普通の人間になりたかったが\n成り行きで気づけば魔界の王",
    series2_immortal3: "裏で勇者と繋がっている",
    series2_radiant: "手先が器用で\n働くのとボールを殴るのが大好き"
  };

  function getComment(characterId) {
    return COMMENTS[characterId] || "";
  }

  window.collectionComments = {
    getComment,
    COMMENTS
  };
})();
