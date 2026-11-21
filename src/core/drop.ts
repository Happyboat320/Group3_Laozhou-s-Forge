// 装备品质的纯逻辑：五档品质、按难度和分数修正的掉落概率分布。
// 概率机制：每高一档，权重再乘一次 f（f = 难度系数 × 分数系数），
// f > 1 时高品质概率大幅上升，f < 1 时几乎只出凡品/良品。
// 基准分布（普通难度、60~80% 准确率）：凡品 52% / 良品 28% / 珍品 13% / 极品 5% / 传说 2%。
import type { Config } from '../config';

/** 五档品质，从低到高。 */
export type Quality = 'common' | 'fine' | 'rare' | 'epic' | 'legend';

export const QUALITIES: Quality[] = ['common', 'fine', 'rare', 'epic', 'legend'];

export const QUALITY_NAME: Record<Quality, string> = {
  common: '凡品',
  fine: '良品',
  rare: '珍品',
  epic: '极品',
  legend: '传说',
};

/** 品质对应的颜色（文字、光效用）。 */
export const QUALITY_COLOR: Record<Quality, string> = {
  common: '#9a8a78',
  fine: '#3d6b54',
  rare: '#3f6fb5',
  epic: '#8a4fb5',
  legend: '#c8862f',
};

/** 品质的高低，1~5 星。 */
export function qualityRank(quality: Quality): number {
  return QUALITIES.indexOf(quality) + 1;
}

/** 难度 + 准确率（0~1）合成修正系数 f。 */
export function dropFactor(config: Config, difficulty: keyof Config['drop']['difficultyFactor'], accuracy: number): number {
  const scoreFactor = config.drop.scoreFactor.reduce((f, band) => (accuracy >= band.min ? band.f : f), 1);
  return config.drop.difficultyFactor[difficulty] * scoreFactor;
}

/** 各档品质的权重（未归一化）。index 0 是凡品。 */
export function qualityWeights(config: Config, difficulty: keyof Config['drop']['difficultyFactor'], accuracy: number): number[] {
  const f = dropFactor(config, difficulty, accuracy);
  return config.drop.base.map((weight, index) => weight * f ** index);
}

/**
 * 掷一次装备品质。rng 返回 [0, 1)，方便测试注入固定序列。
 * 传 difficulty / accuracy 就按当前局修正，不传就用基准分布。
 */
export function rollQuality(
  rng: () => number,
  config: Config,
  difficulty?: keyof Config['drop']['difficultyFactor'],
  accuracy = 0.7,
): Quality {
  const weights = qualityWeights(config, difficulty ?? 'normal', accuracy);
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = rng() * total;
  for (let i = 0; i < weights.length; i += 1) {
    roll -= weights[i];
    if (roll < 0) return QUALITIES[i];
  }
  return QUALITIES[QUALITIES.length - 1];
}

/** 这档品质能卖多少钱（文）。 */
export function sellValue(config: Config, quality: Quality): number {
  return config.drop.sell[quality];
}
