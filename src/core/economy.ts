// 进度与经济的纯逻辑：金币、解锁曲目、装备库、排行榜。state 能转成 JSON，存档直接存它。
import type { Config } from '../config';
import { sellValue, type Quality } from './drop';
import type { Difficulty } from './rhythm';

/** 装备库里的装备。type 就是素材图 id（config.songs[].equipment）。 */
export interface Equipment {
  id: number;
  type: string;
  name: string;
  quality: Quality;
  /** 从哪首歌锻出来的 */
  songId: string;
}

/** 排行榜一行：挑战总分、打了哪三首、日期。 */
export interface ChallengeEntry {
  score: number;
  songs: string[];
  date: string;
}

export interface Progress {
  coins: number;
  /** 已解锁的曲目 id（config.songs[].id） */
  unlocked: string[];
  inventory: Equipment[];
  /** 每首歌每个难度的最好成绩（points） */
  best: Record<string, Partial<Record<Difficulty, number>>>;
  leaderboard: ChallengeEntry[];
  seenHint: boolean;
  nextId: number;
}

export function newProgress(config: Config): Progress {
  return {
    coins: 0,
    unlocked: config.songs.filter((s) => s.price <= 0).map((s) => s.id),
    inventory: [],
    best: {},
    leaderboard: [],
    seenHint: false,
    nextId: 1,
  };
}

export function isUnlocked(progress: Progress, songId: string): boolean {
  return progress.unlocked.includes(songId);
}

/** 解锁一首歌。钱不够或已解锁返回 false。 */
export function unlockSong(progress: Progress, config: Config, songId: string): boolean {
  const song = config.songs.find((s) => s.id === songId);
  if (!song || isUnlocked(progress, songId) || progress.coins < song.price) return false;
  progress.coins -= song.price;
  progress.unlocked.push(songId);
  return true;
}

/** 装备入库，返回带 id 的装备。 */
export function addEquipment(progress: Progress, equipment: Omit<Equipment, 'id'>): Equipment {
  const item: Equipment = { ...equipment, id: progress.nextId };
  progress.nextId += 1;
  progress.inventory.push(item);
  return item;
}

/** 卖掉一件装备，返回卖了多少文（没有这件就返回 0）。 */
export function sellEquipment(progress: Progress, config: Config, id: number): number {
  const index = progress.inventory.findIndex((e) => e.id === id);
  if (index < 0) return 0;
  const [item] = progress.inventory.splice(index, 1);
  const coins = sellValue(config, item.quality);
  progress.coins += coins;
  return coins;
}

/** 记录单曲最好成绩，破纪录返回 true。 */
export function recordBest(progress: Progress, songId: string, difficulty: Difficulty, points: number): boolean {
  const old = progress.best[songId]?.[difficulty] ?? 0;
  if (points <= old) return false;
  progress.best[songId] = { ...progress.best[songId], [difficulty]: points };
  return true;
}

/** 挑战成绩上榜，返回名次（1 起；超出榜单长度返回 0）。 */
export function submitChallenge(progress: Progress, config: Config, entry: ChallengeEntry): number {
  progress.leaderboard.push(entry);
  progress.leaderboard.sort((a, b) => b.score - a.score);
  progress.leaderboard = progress.leaderboard.slice(0, config.challenge.top);
  const index = progress.leaderboard.indexOf(entry);
  return index >= 0 ? index + 1 : 0;
}
