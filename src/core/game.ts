// 游戏状态和流程规则：只放纯逻辑，不碰画面、键盘、声音，所以能直接写测试。
// 一个 GameState = 长期进度（金币/解锁/装备库/排行榜）+ 当前这一局的会话（单曲或挑战）。
import type { Config } from '../config';
import { newProgress, type ChallengeEntry, type Progress } from './economy';
import type { Difficulty, SongScore } from './rhythm';

export type { ChallengeEntry, Equipment, Progress } from './economy';
export type { Difficulty, SongScore, Verdict } from './rhythm';
export type { Quality } from './drop';

/** 当前这一局：单曲打一首，挑战连打三首。 */
export interface Session {
  kind: 'single' | 'challenge';
  /** 这一首打的歌 */
  songId: string;
  difficulty: Difficulty;
  /** 挑战模式抽到的三首歌 */
  songs: string[];
  /** 挑战模式打到第几首，0 起 */
  index: number;
  /** 挑战模式打完的每首成绩（points） */
  scores: number[];
  /** 刚打完那首的成绩，结算页要用 */
  last: SongScore | null;
}

export interface GameState {
  progress: Progress;
  session: Session | null;
}

export function newGame(config: Config): GameState {
  return { progress: newProgress(config), session: null };
}

/** 开一局单曲。 */
export function startSingle(songId: string, difficulty: Difficulty): Session {
  return { kind: 'single', songId, difficulty, songs: [songId], index: 0, scores: [], last: null };
}

/**
 * 开一局挑战：从全部曲目（含未解锁，相当于系统带你试玩）随机抽 N 首、不重复，
 * 统一用 config.challenge.difficulty。rng 可注入方便测试。
 */
export function startChallenge(config: Config, rng: () => number): Session {
  // 洗牌后取前 N 首：每首等概率且不重复，也不会因为 rng 恰好重复而卡住
  const pool = config.songs.map((s) => s.id);
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picked = pool.slice(0, Math.min(config.challenge.songs, pool.length));
  return {
    kind: 'challenge',
    songId: picked[0],
    difficulty: config.challenge.difficulty,
    songs: picked,
    index: 0,
    scores: [],
    last: null,
  };
}

/** 打完一首歌后的推进：挑战还有下一首就换歌返回 'next'，否则返回 'done'。 */
export function advanceSession(session: Session, points: number): 'next' | 'done' {
  session.scores.push(points);
  session.index += 1;
  if (session.kind === 'challenge' && session.index < session.songs.length) {
    session.songId = session.songs[session.index];
    return 'next';
  }
  return 'done';
}

/** 挑战总分。 */
export function challengeTotal(session: Session): number {
  return session.scores.reduce((sum, p) => sum + p, 0);
}

/** 一条排行榜记录（挑战打完时用）。 */
export function challengeEntry(session: Session, date = new Date().toISOString().slice(0, 10)): ChallengeEntry {
  return { score: challengeTotal(session), songs: [...session.songs], date };
}
