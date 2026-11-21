// 节奏玩法的判定与计分：纯逻辑。场景只报「按下的时刻」，判定和分数都算在这里。
import type { Config } from '../config';

export type Verdict = 'perfect' | 'good' | 'miss';

/** 三档难度。 */
export type Difficulty = 'easy' | 'normal' | 'hard';

export const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];

export const DIFFICULTY_NAME: Record<Difficulty, string> = {
  easy: '简单',
  normal: '普通',
  hard: '困难',
};

export interface JudgeWindow {
  perfect: number;
  good: number;
}

/** 按下时刻离音符时刻差多少（秒），落在哪个判定窗口。 */
export function judgeHit(dt: number, window: JudgeWindow): Verdict {
  const d = Math.abs(dt);
  if (d <= window.perfect) return 'perfect';
  if (d <= window.good) return 'good';
  return 'miss';
}

export interface SongCounts {
  perfect: number;
  good: number;
  miss: number;
}

export interface SongScore {
  counts: SongCounts;
  /** 最高连击 */
  combo: number;
  /** 0~1 的准确率，掉落概率看它 */
  accuracy: number;
  /** 展示用的分数：准确率 × 10000 */
  points: number;
}

/**
 * 一整首打完的分数。verdicts 按时间顺序传进来（漏按也算 miss），
 * 准确率 = 各判定分值的平均（完美 1 / 不错 0.6 / 落空 0）。
 */
export function scoreSong(config: Config, verdicts: Verdict[]): SongScore {
  const counts: SongCounts = { perfect: 0, good: 0, miss: 0 };
  let combo = 0;
  let best = 0;
  for (const verdict of verdicts) {
    counts[verdict] += 1;
    if (verdict === 'miss') combo = 0;
    else {
      combo += 1;
      best = Math.max(best, combo);
    }
  }
  const value = config.rhythm.value;
  const total = verdicts.length || 1;
  const accuracy = verdicts.reduce((sum, v) => sum + value[v], 0) / total;
  return { counts, combo: best, accuracy, points: Math.round(accuracy * 10000) };
}

/**
 * 彩蛋：维护「最近敲了几个键」，敲出配好的数字串就算触发。
 * 只看按下的方向键序列，其他键忽略；出错就从头再来。
 */
export class KeySequence {
  private buffer: string[] = [];

  constructor(private readonly code: readonly string[]) {}

  /**
   * 喂一个 KeyboardEvent.code，返回是否刚好凑齐。
   * 缓冲区里可能攒着多个字符：每次都从「当前已匹配长度」往后比，
   * 对不上就退回去重新找开头（这样 1 2 1 2 1 2 里能识别到第二个 1 2 1 2）。
   */
  push(keyCode: string): boolean {
    this.buffer.push(keyCode);
    // 只要缓冲区的末尾是不是目标串的前缀；是就继续，不是就丢到最长公共后缀
    let matched = 0;
    for (let len = Math.min(this.buffer.length, this.code.length); len > 0; len -= 1) {
      const tail = this.buffer.slice(this.buffer.length - len);
      if (tail.every((k, i) => k === this.code[i])) {
        matched = len;
        break;
      }
    }
    if (matched === this.code.length) {
      this.buffer = [];
      return true;
    }
    // 只留下最长匹配的那一段，其余丢掉
    this.buffer = this.buffer.slice(this.buffer.length - matched);
    return false;
  }

  reset() {
    this.buffer = [];
  }
}

/** 彩蛋跳过后的成绩：按满分的 ratio 折算，判定全当作「不错」、连击不断。 */
export function shortcutScore(total: number, ratio: number): SongScore {
  return {
    counts: { perfect: 0, good: total, miss: 0 },
    combo: total,
    accuracy: ratio,
    points: Math.round(ratio * 10000),
  };
}
