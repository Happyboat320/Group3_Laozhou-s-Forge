// 打造判定的纯逻辑：指针位置换算成判定，判定换算成品质分和成色。
// 这里不碰画面，场景只负责把指针停在哪儿、把结果画出来。
import type { Config } from '../config';
import type { Mode } from './modes';

export type Verdict = 'perfect' | 'good' | 'miss';
export type Grade = 'scrap' | 'common' | 'fine' | 'legend';

export interface VerdictWindows {
  perfect: number;
  good: number;
}

/** 一次打造的结果：火候、每锤、淬火，外加顾客有没有等到最后。 */
export interface ForgeResult {
  heat: Verdict;
  hits: Verdict[];
  quench: Verdict;
  finished: boolean;
}

export const GRADE_NAME: Record<Grade, string> = {
  scrap: '废品',
  common: '普通',
  fine: '精良',
  legend: '传世',
};

export const GRADE_BADGE: Record<Grade, string> = {
  scrap: 'badge_scrap',
  common: 'badge_common',
  fine: 'badge_fine',
  legend: 'badge_legend',
};

const GRADE_ORDER: Grade[] = ['scrap', 'common', 'fine', 'legend'];

/** 成色的高低，用来比较“有没有达到顾客要求”。 */
export function gradeRank(grade: Grade): number {
  return GRADE_ORDER.indexOf(grade);
}

/** 顾客要求 reached 了吗：成色不低于要求就算。 */
export function meets(grade: Grade, want: Grade): boolean {
  return gradeRank(grade) >= gradeRank(want);
}

/** 指针离中心多远（绝对值），落在哪个判定窗口里。 */
export function judge(distance: number, windows: VerdictWindows): Verdict {
  const d = Math.abs(distance);
  if (d <= windows.perfect) return 'perfect';
  if (d <= windows.good) return 'good';
  return 'miss';
}

/** 第 day 天用哪一档难度，天数是 1 起，超出范围就用最难的。 */
export function difficultyFor(config: Config, day: number) {
  const table = config.forge.difficulty;
  return table[Math.min(Math.max(day, 1), table.length) - 1];
}

export function verdictValue(config: Config, verdict: Verdict): number {
  return config.forge.value[verdict];
}

/**
 * 把三次判定折成一个 0~1 的品质分：
 * 火候 30%、每一锤平均 45%、淬火 25%。顾客等太久（没打完）直接算废品。
 */
export function qualityOf(config: Config, result: ForgeResult): { score: number; grade: Grade } {
  if (!result.finished) return { score: 0, grade: 'scrap' };
  const { heat, hits, quench } = config.forge.weight;
  const hitScore = result.hits.length
    ? result.hits.reduce((sum, v) => sum + verdictValue(config, v), 0) / result.hits.length
    : 0;
  const score =
    verdictValue(config, result.heat) * heat +
    hitScore * hits +
    verdictValue(config, result.quench) * quench;
  return { score, grade: gradeOf(config, score) };
}

/**
 * 品质分落在哪一档。三种玩法的分数尺度不一样，所以各自有一套分数线；
 * 不传 mode 时用时机玩法的那套（也就是全局默认）。
 */
export function gradeOf(config: Config, score: number, mode?: Mode): Grade {
  const table =
    mode === 'rhythm' ? config.modes.rhythm.score : mode === 'heat' ? config.modes.heat.score : config.forge.grade;
  if (score >= table.legend) return 'legend';
  if (score >= table.fine) return 'fine';
  if (score >= table.common) return 'common';
  return 'scrap';
}

/** 这一单按成色值多少钱；超出顾客要求时额外加成。 */
export function coinsFor(config: Config, price: number, grade: Grade, want: Grade): number {
  const base = price * config.pay.multiplier[grade];
  const bonus = gradeRank(grade) > gradeRank(want) ? config.pay.bonusAboveWant : 1;
  return Math.round(base * bonus);
}

/** 这一单口碑怎么变。 */
export function reputationDelta(config: Config, grade: Grade, want: Grade, timedOut: boolean): number {
  const { gain, loss, scrap, timeout } = config.pay.rep;
  if (timedOut) return -timeout;
  if (grade === 'scrap') return -scrap;
  return meets(grade, want) ? gain : -loss;
}
