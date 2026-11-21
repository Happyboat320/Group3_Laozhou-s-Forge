// 曲库数据：曲目表（config.songs）+ 谱面读取（assets/charts/<id>.sm）。
// .sm 文本用 Vite 的 ?raw 引入，解析在 core/sm.ts（纯逻辑、有测试）。
import { CONFIG } from '../config';
import { chartDuration, chartNotes, parseSm, type ChartNote } from '../core/sm';
import type { Quality } from '../core/drop';
import type { Difficulty } from '../core/rhythm';

const CHART_FILES = import.meta.glob('/assets/charts/*.sm', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

/** 游戏难度名 → .sm 里写的难度名。 */
export const SM_DIFFICULTY: Record<Difficulty, string> = {
  easy: 'Easy',
  normal: 'Medium',
  hard: 'Hard',
};

export type SongInfo = (typeof CONFIG.songs)[number];

export const SONGS: SongInfo[] = CONFIG.songs;

export function songById(id: string): SongInfo {
  const song = SONGS.find((s) => s.id === id);
  if (!song) throw new Error(`没有这首曲目：${id}`);
  return song;
}

const cache = new Map<string, ChartNote[]>();

/** 这首歌这个难度的谱面音符（秒）。没有谱就返回空数组。 */
export function chartFor(songId: string, difficulty: Difficulty): ChartNote[] {
  const key = `${songId}:${difficulty}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const raw = CHART_FILES[`/assets/charts/${songId}.sm`];
  const notes = raw ? chartNotes(parseSm(raw), SM_DIFFICULTY[difficulty]) : [];
  cache.set(key, notes);
  return notes;
}

/** 这首歌有没有谱面文件。 */
export function chartExists(songId: string): boolean {
  return `/assets/charts/${songId}.sm` in CHART_FILES;
}

/** 谱面打完要多少秒（最后一个音符 + 余量）。 */
export function chartLength(songId: string, difficulty: Difficulty): number {
  const raw = CHART_FILES[`/assets/charts/${songId}.sm`];
  return raw ? chartDuration(parseSm(raw), SM_DIFFICULTY[difficulty]) : 0;
}

/** 某件器物在某个品质下的素材 ID：item_iron_<器物>_<品质>。 */
export function equipmentArt(art: string, quality: Quality): string {
  return `item_iron_${art}_${quality}`;
}

/** 器物 id → 中文名。 */
export function equipmentName(equipmentId: string): string {
  return CONFIG.equipments.find((e) => e.id === equipmentId)?.name ?? equipmentId;
}

/** 随机挑一件器物（挑战模式的保底传说用它）。 */
export function randomEquipment(rng: () => number = Math.random) {
  return CONFIG.equipments[Math.floor(rng() * CONFIG.equipments.length)];
}
