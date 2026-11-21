// 三种玩法：同一间铺子、同一套接单交付，只换「打造」怎么打。
// 这里放模式的元信息和每种模式的计分，纯逻辑，能直接测。
import type { Config } from '../config';
import { verdictValue, type Verdict } from './forge';

export type Mode = 'timing' | 'rhythm' | 'heat';

export interface ModeInfo {
  id: Mode;
  name: string;
  /** 选模式卡片上的一句话 */
  tagline: string;
  /** 新手提示里的三条 */
  how: string[];
  icon: string;
  key: string;
  scene: string;
}

export const MODES: ModeInfo[] = [
  {
    id: 'timing',
    name: '时机判定',
    tagline: '三次出手定成色',
    how: [
      '火候：把铁烧到火色正好',
      '锻打：连敲三锤，每锤都落在绿区',
      '淬火：最后一口气入水',
    ],
    icon: 'anvil',
    key: 'Digit1',
    scene: 'forge',
  },
  {
    id: 'rhythm',
    name: '节奏打铁',
    tagline: '音符落向铁砧，踩着节奏落锤',
    how: [
      '铁块从左中右三条道落下来',
      '落到砧口那条线时，按对应的 ← ↓ →',
      '连上的越多、越准，成色越好',
    ],
    icon: 'item_hammer',
    key: 'Digit2',
    scene: 'rhythm',
  },
  {
    id: 'heat',
    name: '火候控制',
    tagline: '五条道上左右躲闪，别让炉火灭了',
    how: [
      '你是一团炉火，在五条道之间切换',
      '躲开水珠和蒸汽，接住干柴和炭',
      '扛住 14 秒，剩多少火算多少成色',
    ],
    icon: 'tool_furnace_hot',
    key: 'Digit3',
    scene: 'heat',
  },
];

export function modeInfo(id: Mode): ModeInfo {
  return MODES.find((m) => m.id === id) ?? MODES[0];
}

export function isMode(value: unknown): value is Mode {
  return value === 'timing' || value === 'rhythm' || value === 'heat';
}

/** 节奏模式：一串判定的平均分，和时机模式用的是同一套「完美/不错/偏了」分值。 */
export function rhythmScore(config: Config, verdicts: Verdict[]): number {
  if (!verdicts.length) return 0;
  const total = verdicts.reduce((sum, v) => sum + verdictValue(config, v), 0);
  return total / verdicts.length;
}

/**
 * 火候模式：这一炉接住/躲开来的净得分，折算成 0~1。
 * full 分是满分线，超过就按 1 算，负分按 0 算。
 */
export function heatScore(config: Config, points: number): number {
  return Math.max(0, Math.min(1, points / config.modes.heat.score.full));
}
