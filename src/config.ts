// 所有可调的数值都放这里，规则和场景都从这里读。加字段时直接加，类型会自动跟着变。
//
// 调手感先改 rhythm.window（判定窗口）和 rhythm.approach（音符落下要几秒，越小越快）；
// 调掉落先看 drop 的注释；歌曲解锁价格在 songs[].price。
import type { Difficulty } from './core/rhythm';

export const CONFIG = {
  view: { width: 1280, height: 720 },
  saveKey: 'laozhou-forge-v1',

  /** 节奏玩法：四条轨道竖直下落，A S D F 对应左→右。 */
  rhythm: {
    lanes: 4,
    /** 判定线的 y（铁块上方这条线） */
    hitLineY: 552,
    /** 音符从多高开始落下 */
    spawnY: -60,
    laneGap: 118,
    /** 判定窗口，单位秒 */
    window: { perfect: 0.085, good: 0.17 },
    /** 一次判定值多少分：完美 / 不错 / 落空。准确率和掉落概率都按它算 */
    value: { perfect: 1, good: 0.6, miss: 0 },
    /** 音符从出现到落线要几秒，按难度分 */
    approach: { easy: 1.9, normal: 1.55, hard: 1.25 } satisfies Record<Difficulty, number>,
  },

  /**
   * 掉落概率分布：每高一档，权重再乘一次 f（f = 难度系数 × 分数系数）。
   * 基准（普通难度、60~80% 准确率，f = 1）：凡品 52% / 良品 28% / 珍品 13% / 极品 5% / 传说 2%。
   * 困难 + 90% 以上（f ≈ 2.19）：传说 ≈ 17%，极品 + 传说 ≈ 36%。
   * 简单 + 60% 以下（f ≈ 0.61）：凡品 ≈ 69%，几乎不出极品以上。
   */
  drop: {
    /** 五档品质的基准权重，从凡品到传说 */
    base: [52, 28, 13, 5, 2],
    /** 难度对 f 的乘数 */
    difficultyFactor: { easy: 0.72, normal: 1, hard: 1.62 },
    /** 准确率（0~1）对 f 的乘数，取第一个 min 以上的档 */
    scoreFactor: [
      { min: 0, f: 0.85 },
      { min: 0.6, f: 1 },
      { min: 0.8, f: 1.25 },
      { min: 0.9, f: 1.35 },
    ],
    /** 每档品质卖出的价钱（文） */
    sell: { common: 8, fine: 18, rare: 40, epic: 90, legend: 200 },
  },

  /** 挑战模式：系统随机抽三首连打，统一普通难度，总分上榜，保底一件随机传说装备。 */
  challenge: {
    songs: 3,
    difficulty: 'normal' as Difficulty,
    /** 排行榜留多少名 */
    top: 10,
  },

  /** 曲库：一首歌对应一件装备。file 放在 assets/music/ 下，谱面在 assets/charts/ 下同名 .sm。 */
  songs: [
    {
      id: 'inspiration',
      title: 'Inspiration',
      artist: 'FreePD',
      file: 'assets/music/Inspiration.mp3',
      equipment: 'item_sword',
      equipName: '长剑',
      /** 解锁价格（文），0 是默认解锁 */
      price: 0,
    },
    {
      id: 'funshine',
      title: 'Funshine',
      artist: 'FreePD',
      file: 'assets/music/Funshine.mp3',
      equipment: 'item_horseshoe',
      equipName: '马蹄铁',
      price: 120,
    },
    {
      id: 'beat-one',
      title: 'Beat One',
      artist: 'FreePD',
      file: 'assets/music/BeatOne.mp3',
      equipment: 'item_dagger',
      equipName: '匕首',
      price: 160,
    },
    {
      id: 'hit-n-smash',
      title: 'Hit n Smash',
      artist: 'FreePD',
      file: 'assets/music/HitnSmash.mp3',
      equipment: 'item_axe',
      equipName: '战斧',
      price: 220,
    },
  ],
};

export type Config = typeof CONFIG;
