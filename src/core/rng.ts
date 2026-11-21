// 可复现的伪随机：同一个种子每次都出同一张地窟，方便测试和"重开同一局"。
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 闭区间 [min, max] 的整数。 */
export function randInt(rnd: () => number, min: number, max: number): number {
  return min + Math.floor(rnd() * (max - min + 1));
}

/** 从数组里随机取一个（不改原数组）。 */
export function pick<T>(rnd: () => number, list: readonly T[]): T {
  return list[Math.min(list.length - 1, Math.floor(rnd() * list.length))];
}

/** 原地洗牌。 */
export function shuffle<T>(rnd: () => number, list: T[]): T[] {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
