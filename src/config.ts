// 所有可调的数值都放这里，规则和场景都从这里读。加字段时直接加，类型会自动跟着变。
//
// 调手感先改 forge.windows / forge.speed：
//   windows 是判定窗口，数字是“指针离中心多远还能算完美/命中”，1 表示整条槽的端点。
//   speed 是指针每秒往返几次，越大越难。
export const CONFIG = {
  view: { width: 1280, height: 720 },
  saveKey: 'laozhou-forge-v1',

  game: {
    startCoins: 0,
    startReputation: 50,
    maxReputation: 100,
    /** 三天结束时口碑达到这个数，老周才传手艺。 */
    winReputation: 60,
  },

  forge: {
    /** 每件器物要敲几锤。 */
    strikes: 3,
    /** 三个阶段各占品质分的比重，和为 1。 */
    weight: { heat: 0.3, hits: 0.45, quench: 0.25 },
    /** 品质分达到多少算哪一档。 */
    grade: { legend: 0.87, fine: 0.66, common: 0.4 },
    /** 一次判定值多少分：完美 / 命中 / 落空。 */
    value: { perfect: 1, good: 0.6, miss: 0.15 },
    /** 三天的判定难度：第 n 天用第 n 个，宽 1 是起点。 */
    difficulty: [
      { heat: { perfect: 0.24, good: 0.48 }, hit: { perfect: 0.2, good: 0.4 }, quench: { perfect: 0.16, good: 0.34 } },
      { heat: { perfect: 0.21, good: 0.42 }, hit: { perfect: 0.175, good: 0.35 }, quench: { perfect: 0.14, good: 0.3 } },
      { heat: { perfect: 0.18, good: 0.36 }, hit: { perfect: 0.15, good: 0.3 }, quench: { perfect: 0.12, good: 0.26 } },
    ],
    /** 指针速度：每秒往返次数。 */
    speed: { heat: 0.85, hit: 1.05, quench: 1.55 },
    /** 每阶段指针起点的随机相位，0 表示每次都从中间开始。 */
    phaseOffset: 0.35,
  },

  pay: {
    /** 按成色给钱，基数是订单报价。 */
    multiplier: { scrap: 0.2, common: 1, fine: 1.4, legend: 2 },
    /** 超出顾客要求时的额外加成。 */
    bonusAboveWant: 1.2,
    /** 口碑变化：达标 / 未达标 / 出废品 / 顾客等太久。 */
    rep: { gain: 8, loss: 8, scrap: 12, timeout: 10 },
  },

  /** 三种玩法各自的数值。判定阈值在 forge 里，这里放节奏和火候。 */
  modes: {
    rhythm: {
      lanes: 3,
      hitLineY: 566,
      spawnY: 150,
      laneGap: 132,
      /** 一单打多久（秒），谱面按这个长度生成 */
      duration: 30,
      /** 判定窗口，单位秒 */
      window: { perfect: 0.085, good: 0.17 },
      /** 按天调：落线时间越短越快；gap 是两个音符之间隔多久；chord 是和弦（多键同时）的概率 */
      days: [
        { approach: 1.9, gap: 0.5, chord2: 0.1, chord3: 0 },
        { approach: 1.55, gap: 0.44, chord2: 0.22, chord3: 0.06 },
        { approach: 1.25, gap: 0.38, chord2: 0.32, chord3: 0.14 },
      ],
      /** 平均判定分到成色的分界线，和时机玩法不同，单独定 */
      score: { legend: 0.8, fine: 0.55, common: 0.32 },
    },
    heat: {
      lanes: 5,
      laneGap: 118,
      /** 一炉火烧多久（秒） */
      duration: 30,
      /** 每隔几秒落一样东西（还会上下浮动），越小越密 */
      spawnEvery: 0.32,
      /** 同一次掉落里再塞一个 / 再塞两个的概率 */
      multiChance: { two: 0.18, three: 0.05 },
      fallSpeed: 300,
      /** 大小 1~5：宽度 = base + per × 大小；落速倍率同理 */
      sizeWidth: { base: 42, per: 10 },
      sizeSpeed: { base: 0.9, per: 0.045 },
      /** 炉温：初始、每秒自然衰减、被砸掉多少、接住回多少（都乘大小） */
      heat0: 70,
      decay: 0.6,
      badHeat: 1.15,
      goodHeat: 0.35,
      /** 干柴 +1~+5、木炭 +6~+10；水珠 -1~-5、蒸汽 -6~-10。full 是拿满分的分 */
      score: { legend: 0.55, fine: 0.33, common: 0.16, full: 200 },
    },
  },

  /** 六张订单：三天，每天两单。改这里就是改关卡。 */
  orders: [
    {
      day: 1,
      customer: 'char_woodcutter',
      customerName: '樵夫',
      item: 'item_knife',
      itemName: '柴刀',
      want: 'common',
      price: 12,
      patience: 50,
      line: '上山用的柴刀，刃口别崩就行。',
    },
    {
      day: 1,
      customer: 'char_auntie',
      customerName: '王婶',
      item: 'item_hoe',
      itemName: '锄头',
      want: 'common',
      price: 14,
      patience: 50,
      line: '菜园子翻土，轻省些的锄头。',
    },
    {
      day: 2,
      customer: 'char_merchant',
      customerName: '货郎',
      item: 'item_horseshoe',
      itemName: '马蹄铁',
      want: 'fine',
      price: 20,
      patience: 46,
      line: '跑远路的骡子，马蹄铁要经得住磨。',
    },
    {
      day: 2,
      customer: 'char_cook',
      customerName: '厨娘',
      item: 'item_sickle',
      itemName: '镰刀',
      want: 'fine',
      price: 18,
      patience: 46,
      line: '后园割菜用，要快、要顺手。',
    },
    {
      day: 3,
      customer: 'char_guard',
      customerName: '镖师',
      item: 'item_sword',
      itemName: '长剑',
      want: 'fine',
      price: 30,
      patience: 42,
      line: '走镖的家伙，成色差了要出人命。',
    },
    {
      day: 3,
      customer: 'char_laozhou',
      customerName: '老周',
      item: 'item_dagger',
      itemName: '匕首',
      want: 'legend',
      price: 40,
      patience: 42,
      line: '……我这把老骨头，想看看你打的东西。',
    },
  ] as const,
};

export type Config = typeof CONFIG;
