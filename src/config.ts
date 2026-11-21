// 所有可调的数字都放这里，规则和场景都从这里读。
// 调手感先看 dungeon（地窟大小、房间数）和 combat（伤害），再调 forge 的判定窗口。
export const CONFIG = {
  view: { width: 1280, height: 720 },
  saveKey: 'forge-rogue-v1',

  game: {
    /** 三天，每天两单 */
    days: 3,
    ordersPerDay: 2,
    startReputation: 50,
    maxReputation: 100,
    winReputation: 60,
    /** 开局血量，地窟里被打空就算本局失败 */
    playerHp: 100,
    /** 每天的单子至少要投几份料（第 1 天 1 份、第 2/3 天 2 份） */
    needCountByDay: [1, 2, 3],
    /** 每交一单回铺子歇口气，回多少血 */
    healPerOrder: 22,
  },

  dungeon: {
    /** 16×9 格，每格 80px，正好铺满 1280×720 */
    cols: 16,
    rows: 8,
    tile: 76,
    /** 房间数、房间最小/最大边长（格） */
    rooms: 6,
    roomMin: 3,
    roomMax: 5,
    /** 火把照亮的半径（格） */
    torchRadius: 4,
    /** 一张图里放多少东西 */
    oreNodes: 3,
    chests: 1,
    mobs: 3,
    /** 地图上摆多少箱桶（会挡路，能砸掉） */
    props: 10,
  },

  combat: {
    /** 连续移动的速度：像素/秒 */
    playerSpeed: 215,
    mobSpeed: 96,
    /** 挥锤：伤害、范围、冷却（秒） */
    playerAtk: [11, 15] as [number, number],
    attackRange: 84,
    attackCooldown: 0.4,
    /** 怪物：血量、接触伤害、同一只怪的咬人冷却 */
    mobHp: 26,
    mobAtk: [6, 10] as [number, number],
    mobHitCooldown: 0.85,
    /** 怪物能看多远（格）：超出这个距离或直线被墙挡住，它就瞎转 */
    mobSight: 9,
    /** 隔多久在远处刷一只怪（秒），以及场上最多几只 */
    mobSpawnEvery: 5,
    maxMobs: 5,
    /** 刷怪时至少要离玩家几格远 */
    spawnMinDistance: 3,
    /** 碰撞半径 */
    playerRadius: 17,
    mobRadius: 19,
    /** 挖矿：站在矿边多久挖出来（秒），以及离多近算站在旁边 */
    mineTime: 2,
    mineRadius: 56,
    chestRadius: 48,
    stairsRadius: 42,
  },

  /** 挖矿出料的概率（百分比）；开了「识矿眼」就换下面那组 */
  /** 配料时最多能在"需要的份数"之外再加几份 */
  maxExtraPieces: 2,

  dropRates: {
    base: { iron: 50, copper: 35, star: 15 },
    withEye: { iron: 40, copper: 40, star: 20 },
  },

  /** 三种材料：品质上限（0~1）和挖到时给的数量 */
  materials: [
    { id: 'iron', name: '生铁', icon: 'mat_iron_ore', cap: 0.6, amount: 1 },
    { id: 'copper', name: '铜精', icon: 'mat_copper_ore', cap: 0.8, amount: 1 },
    { id: 'star', name: '陨铁', icon: 'mat_gold_ore', cap: 1, amount: 1 },
  ] as const,

  /** 词条：宝箱里随机出一条，本局生效 */
  relics: [
    { id: 'pick', name: '矿工的镐', desc: '挖矿少花 1 回合', icon: 'item_pickaxe' },
    { id: 'apron', name: '厚皮围裙', desc: '受到的伤害 −2', icon: 'mat_leather' },
    { id: 'lamp', name: '长明灯', desc: '火把范围 +2 格', icon: 'item_thermometer' },
    { id: 'eye', name: '识矿眼', desc: '出好料的概率更高（铜精 +5%、陨铁 +5%）', icon: 'mat_gem_blue' },
    { id: 'herb', name: '止血草', desc: '每走 5 步回 2 血', icon: 'mat_leather' },
  ],

  /** 打造判定（沿用上一版） */
  forge: {
    strikes: 3,
    weight: { heat: 0.3, hits: 0.45, quench: 0.25 },
    value: { perfect: 1, good: 0.6, miss: 0.15 },
    grade: { legend: 0.87, fine: 0.66, common: 0.4 },
    /** 判断难度按天收紧 */
    difficulty: [
      { heat: { perfect: 0.24, good: 0.48 }, hit: { perfect: 0.2, good: 0.4 }, quench: { perfect: 0.16, good: 0.34 } },
      { heat: { perfect: 0.21, good: 0.42 }, hit: { perfect: 0.175, good: 0.35 }, quench: { perfect: 0.14, good: 0.3 } },
      { heat: { perfect: 0.18, good: 0.36 }, hit: { perfect: 0.15, good: 0.3 }, quench: { perfect: 0.12, good: 0.26 } },
    ],
    speed: { heat: 0.85, hit: 1.05, quench: 1.55 },
    phaseOffset: 0.35,
  },

  /** 顾客和器型：订单从这两张表里随机拼 */
  catalog: {
    customers: [
      { id: 'char_woodcutter', name: '樵夫' },
      { id: 'char_auntie', name: '王婶' },
      { id: 'char_merchant', name: '货郎' },
      { id: 'char_cook', name: '厨娘' },
      { id: 'char_guard', name: '镖师' },
      { id: 'char_kid', name: '小石头' },
      { id: 'char_scholar', name: '账房先生' },
      { id: 'char_heroine', name: '女侠' },
    ],
    items: [
      { id: 'item_knife', name: '柴刀', price: 12 },
      { id: 'item_hoe', name: '锄头', price: 14 },
      { id: 'item_sickle', name: '镰刀', price: 15 },
      { id: 'item_axe', name: '斧头', price: 18 },
      { id: 'item_horseshoe', name: '马蹄铁', price: 20 },
      { id: 'item_dagger', name: '匕首', price: 26 },
      { id: 'item_sword', name: '长剑', price: 34 },
      { id: 'item_pickaxe', name: '镐', price: 22 },
    ],
  },

  pay: {
    multiplier: { scrap: 0.2, common: 1, fine: 1.4, legend: 2 },
    bonusAboveWant: 1.2,
    rep: { gain: 8, loss: 8, scrap: 12, timeout: 10 },
  },
};

export type Config = typeof CONFIG;
