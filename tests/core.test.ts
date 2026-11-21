// core 规则测试：掉落概率、节奏判定计分、进度与经济。
import { describe, expect, test } from 'vitest';
import { CONFIG } from '../src/config';
import { qualityWeights, qualityRank, rollQuality, sellValue, QUALITIES, dropFactor } from '../src/core/drop';
import { judgeHit, KeySequence, scoreSong, shortcutScore, type Verdict } from '../src/core/rhythm';
import {
  addEquipment,
  isUnlocked,
  newProgress,
  recordBest,
  sellEquipment,
  submitChallenge,
  unlockSong,
} from '../src/core/economy';
import { advanceSession, challengeTotal, newGame, startChallenge, startSingle } from '../src/core/game';
import { createSave } from '../src/engine/save';

function fakeStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

/** 固定序列的 rng，方便断言落点。 */
function fixedRng(...values: number[]) {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('掉落概率', () => {
  test('基准分布：普通难度、中等准确率', () => {
    const weights = qualityWeights(CONFIG, 'normal', 0.7);
    const total = weights.reduce((a, b) => a + b, 0);
    const pct = weights.map((w) => Math.round((w / total) * 100));
    expect(pct).toEqual([52, 28, 13, 5, 2]);
  });

  test('困难 + 高分明显提升高品质概率', () => {
    const base = qualityWeights(CONFIG, 'normal', 0.7);
    const hard = qualityWeights(CONFIG, 'hard', 0.95);
    const legendBase = base[4] / base.reduce((a, b) => a + b, 0);
    const legendHard = hard[4] / hard.reduce((a, b) => a + b, 0);
    expect(legendHard).toBeGreaterThan(legendBase * 5);
    expect(legendHard).toBeGreaterThan(0.12);
  });

  test('简单 + 低分几乎只出凡品和良品', () => {
    const weights = qualityWeights(CONFIG, 'easy', 0.3);
    const total = weights.reduce((a, b) => a + b, 0);
    const top2 = (weights[0] + weights[1]) / total;
    expect(top2).toBeGreaterThan(0.85);
    expect(dropFactor(CONFIG, 'easy', 0.3)).toBeLessThan(1);
  });

  test('权重随品质单调不增', () => {
    const weights = qualityWeights(CONFIG, 'normal', 0.7);
    for (let i = 1; i < weights.length; i += 1) expect(weights[i]).toBeLessThanOrEqual(weights[i - 1]);
  });

  test('掷品质：固定 rng 落在对应档位', () => {
    expect(rollQuality(fixedRng(0.0), CONFIG, 'normal', 0.7)).toBe('common');
    expect(rollQuality(fixedRng(0.99), CONFIG, 'normal', 0.7)).toBe('legend');
  });

  test('品质高低和卖价一致', () => {
    const ranks = QUALITIES.map((q) => qualityRank(q));
    expect(ranks).toEqual([1, 2, 3, 4, 5]);
    const sells = QUALITIES.map((q) => sellValue(CONFIG, q));
    for (let i = 1; i < sells.length; i += 1) expect(sells[i]).toBeGreaterThan(sells[i - 1]);
  });
});

describe('节奏判定和计分', () => {
  const window = CONFIG.rhythm.window;

  test('判定窗口边界', () => {
    expect(judgeHit(0, window)).toBe('perfect');
    expect(judgeHit(window.perfect, window)).toBe('perfect');
    expect(judgeHit(window.perfect + 0.01, window)).toBe('good');
    expect(judgeHit(-window.good, window)).toBe('good');
    expect(judgeHit(window.good + 0.01, window)).toBe('miss');
  });

  test('全完美 = 10000 分、准确率 1', () => {
    const score = scoreSong(CONFIG, Array<Verdict>(10).fill('perfect'));
    expect(score.accuracy).toBeCloseTo(1);
    expect(score.points).toBe(10000);
    expect(score.combo).toBe(10);
  });

  test('全落空 = 0 分', () => {
    const score = scoreSong(CONFIG, Array<Verdict>(10).fill('miss'));
    expect(score.points).toBe(0);
    expect(score.combo).toBe(0);
    expect(score.counts.miss).toBe(10);
  });

  test('最高连击会被 miss 打断', () => {
    const score = scoreSong(CONFIG, ['perfect', 'perfect', 'miss', 'perfect', 'perfect', 'perfect']);
    expect(score.combo).toBe(3);
  });

  test('彩蛋：按 1 2 1 2 触发，中途错一下从头再来', () => {
    const seq = new KeySequence(CONFIG.egg.code);
    expect(seq.push('Digit1')).toBe(false);
    expect(seq.push('Digit2')).toBe(false);
    expect(seq.push('Digit1')).toBe(false);
    expect(seq.push('Digit2')).toBe(true);
    // 触发以后再敲一遍还能触发
    expect(seq.push('Digit1')).toBe(false);
    expect(seq.push('Digit2')).toBe(false);
    expect(seq.push('Digit1')).toBe(false);
    expect(seq.push('Digit2')).toBe(true);
    // 中途按错不会凑巧触发
    const seq2 = new KeySequence(CONFIG.egg.code);
    expect(seq2.push('Digit1')).toBe(false);
    expect(seq2.push('Digit1')).toBe(false);
    expect(seq2.push('Digit2')).toBe(false);
    expect(seq2.push('Digit2')).toBe(false);
  });

  test('彩蛋跳过按 80% 计分', () => {
    const score = shortcutScore(200, CONFIG.egg.score);
    expect(score.points).toBe(8000);
    expect(score.accuracy).toBeCloseTo(0.8);
    expect(score.combo).toBe(200);
    expect(score.counts.miss).toBe(0);
  });

  test('空谱不除以零', () => {
    const score = scoreSong(CONFIG, []);
    expect(score.points).toBe(0);
  });
});

describe('进度与经济', () => {
  test('新进度只解锁免费的歌', () => {
    const progress = newProgress(CONFIG);
    const free = CONFIG.songs.filter((s) => s.price <= 0).map((s) => s.id);
    expect(progress.unlocked).toEqual(free);
    expect(progress.coins).toBe(0);
  });

  test('金币够才能解锁，解锁后扣钱', () => {
    const progress = newProgress(CONFIG);
    const paid = CONFIG.songs.find((s) => s.price > 0)!;
    expect(unlockSong(progress, CONFIG, paid.id)).toBe(false);
    progress.coins = paid.price + 10;
    expect(unlockSong(progress, CONFIG, paid.id)).toBe(true);
    expect(progress.coins).toBe(10);
    expect(isUnlocked(progress, paid.id)).toBe(true);
    // 已解锁再解锁不扣钱
    expect(unlockSong(progress, CONFIG, paid.id)).toBe(false);
    expect(progress.coins).toBe(10);
  });

  test('装备入库、卖出换金币', () => {
    const progress = newProgress(CONFIG);
    const item = addEquipment(progress, { type: 'item_sword', name: '长剑', quality: 'rare', songId: 'inspiration' });
    expect(item.id).toBe(1);
    expect(progress.inventory).toHaveLength(1);
    const gained = sellEquipment(progress, CONFIG, item.id);
    expect(gained).toBe(CONFIG.drop.sell.rare);
    expect(progress.coins).toBe(gained);
    expect(progress.inventory).toHaveLength(0);
    // 卖不存在的不给钱
    expect(sellEquipment(progress, CONFIG, 999)).toBe(0);
  });

  test('最好成绩只增不减', () => {
    const progress = newProgress(CONFIG);
    expect(recordBest(progress, 'inspiration', 'normal', 8000)).toBe(true);
    expect(recordBest(progress, 'inspiration', 'normal', 7000)).toBe(false);
    expect(progress.best.inspiration?.normal).toBe(8000);
  });

  test('排行榜按分数排序并截断', () => {
    const progress = newProgress(CONFIG);
    submitChallenge(progress, CONFIG, { score: 100, songs: [], date: 'x' });
    const rank = submitChallenge(progress, CONFIG, { score: 300, songs: [], date: 'x' });
    expect(rank).toBe(1);
    submitChallenge(progress, CONFIG, { score: 200, songs: [], date: 'x' });
    expect(progress.leaderboard.map((e) => e.score)).toEqual([300, 200, 100]);
    for (let i = 0; i < 20; i += 1) submitChallenge(progress, CONFIG, { score: 1000 + i, songs: [], date: 'x' });
    expect(progress.leaderboard).toHaveLength(CONFIG.challenge.top);
  });
});

describe('对局流程', () => {
  test('新游戏没有进行中的对局', () => {
    const game = newGame(CONFIG);
    expect(game.session).toBeNull();
    expect(game.progress.coins).toBe(0);
  });

  test('单曲：一首打完即结束', () => {
    const session = startSingle('inspiration', 'normal');
    expect(advanceSession(session, 8000)).toBe('done');
    expect(session.scores).toEqual([8000]);
  });

  test('挑战：随机抽三首不重复，打完一首进下一首', () => {
    const session = startChallenge(CONFIG, fixedRng(0.1, 0.5, 0.9));
    expect(session.songs).toHaveLength(CONFIG.challenge.songs);
    expect(new Set(session.songs).size).toBe(session.songs.length);
    expect(session.difficulty).toBe(CONFIG.challenge.difficulty);

    expect(advanceSession(session, 5000)).toBe('next');
    expect(session.songId).toBe(session.songs[1]);
    expect(advanceSession(session, 6000)).toBe('next');
    expect(advanceSession(session, 7000)).toBe('done');
    expect(challengeTotal(session)).toBe(18000);
  });

  test('状态能 JSON 往返（存档要用）', () => {
    const game = newGame(CONFIG);
    game.session = startChallenge(CONFIG, Math.random);
    game.progress.coins = 33;
    expect(JSON.parse(JSON.stringify(game))).toEqual(game);
  });

  test('存档：写进去能读回来', () => {
    const save = createSave('test', fakeStorage());
    const game = newGame(CONFIG);
    game.progress.coins = 88;
    save.writeRun(game);
    expect(save.run?.progress.coins).toBe(88);
  });
});
