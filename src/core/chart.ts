// 节奏玩法的谱面：纯逻辑，给定种子和天数就能算出这一单所有的音符。
// 天数越高：音符越密（gap 越小）、和弦（同一时刻多个键）越多。
import type { Config } from '../config';

export interface ChartNote {
  lane: number;
  /** 该落锤的时刻（秒） */
  time: number;
}

/** 可复现的伪随机。 */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 生成一单的谱面。dayIndex 从 1 开始，超出范围就用最难的一天。
 * 同一份种子每次都出同一张谱，玩家反复练同一单不会变。
 */
export function buildChart(config: Config, seed: number, dayIndex: number): ChartNote[] {
  const cfg = config.modes.rhythm;
  const day = cfg.days[Math.min(Math.max(dayIndex, 1), cfg.days.length) - 1];
  const rnd = mulberry32(seed);
  const notes: ChartNote[] = [];

  let time = day.approach + 0.9;
  const end = time + cfg.duration;

  while (time < end) {
    const roll = rnd();
    let lanes: number[];

    if (roll < day.chord3) {
      lanes = Array.from({ length: cfg.lanes }, (_, i) => i);
    } else if (roll < day.chord3 + day.chord2) {
      const a = Math.floor(rnd() * cfg.lanes);
      const b = (a + 1 + Math.floor(rnd() * (cfg.lanes - 1))) % cfg.lanes;
      lanes = [a, b];
    } else {
      lanes = [Math.floor(rnd() * cfg.lanes)];
    }

    for (const lane of lanes) notes.push({ lane, time });
    time += day.gap * (0.85 + rnd() * 0.3);
  }

  return notes;
}
