import { describe, expect, test } from 'vitest';
import { CONFIG } from '../src/config';
import {
  GRADE_NAME,
  coinsFor,
  gradeOf,
  judge,
  meets,
  qualityOf,
  reputationDelta,
  type ForgeResult,
  type Verdict,
} from '../src/core/forge';
import {
  currentOrder,
  isFinished,
  newGame,
  nextScene,
  settle,
  summarize,
  type Delivery,
  type GameState,
  type Outcome,
} from '../src/core/game';
import { buildChart } from '../src/core/chart';
import { MODES, heatScore, modeInfo, rhythmScore } from '../src/core/modes';
import { createSave } from '../src/engine/save';

function fakeStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

/** 一次全中的打造结果（时机玩法）。 */
function perfectResult(): ForgeResult {
  return {
    heat: 'perfect',
    hits: Array.from({ length: CONFIG.forge.strikes }, () => 'perfect' as Verdict),
    quench: 'perfect',
    finished: true,
  };
}

/** 一次全歪的打造结果（时机玩法）。 */
function sloppyResult(): ForgeResult {
  return {
    heat: 'miss',
    hits: Array.from({ length: CONFIG.forge.strikes }, () => 'miss' as Verdict),
    quench: 'miss',
    finished: true,
  };
}

/** 交付用的结果：三种玩法最终都折算成一个 0~1 的分数。 */
const great = (): Outcome => ({ score: 1, finished: true });
const poor = (): Outcome => ({ score: 0.05, finished: true });

function playAll(state: GameState, make: () => Outcome): GameState {
  while (!isFinished(state)) settle(state, CONFIG, make());
  return state;
}

describe('订单表', () => {
  test('三天六单，每天两单', () => {
    const state = newGame(CONFIG);
    expect(state.orders).toHaveLength(6);
    const days = new Set(state.orders.map((o) => o.day));
    expect([...days].sort()).toEqual([1, 2, 3]);
    expect(state.orders.filter((o) => o.day === 2)).toHaveLength(2);
  });

  test('器型至少有三种', () => {
    const items = new Set(newGame(CONFIG).orders.map((o) => o.item));
    expect(items.size).toBeGreaterThanOrEqual(3);
  });

  test('第一单是柴刀，最后一单是老周要的匕首', () => {
    const state = newGame(CONFIG);
    expect(currentOrder(state)?.itemName).toBe('柴刀');
    const last = state.orders.at(-1);
    expect(last?.customerName).toBe('老周');
    expect(GRADE_NAME[last!.want]).toBe('传世');
  });
});

describe('判定（时机玩法）', () => {
  const windows = { perfect: 0.2, good: 0.4 };

  test('越靠近中间判定越好', () => {
    expect(judge(0, windows)).toBe('perfect');
    expect(judge(-0.19, windows)).toBe('perfect');
    expect(judge(0.3, windows)).toBe('good');
    expect(judge(0.9, windows)).toBe('miss');
  });

  test('判定窗口的边界是闭区间', () => {
    expect(judge(0.2, windows)).toBe('perfect');
    expect(judge(0.4, windows)).toBe('good');
    expect(judge(0.4001, windows)).toBe('miss');
  });
});

describe('品质折算', () => {
  test('全中就是传世，分数满', () => {
    const { score, grade } = qualityOf(CONFIG, perfectResult());
    expect(score).toBeCloseTo(1);
    expect(grade).toBe('legend');
  });

  test('全歪是废品', () => {
    const { grade } = qualityOf(CONFIG, sloppyResult());
    expect(grade).toBe('scrap');
  });

  test('顾客等太久，不管打得多好都是废品', () => {
    const { grade } = qualityOf(CONFIG, { ...perfectResult(), finished: false });
    expect(grade).toBe('scrap');
  });

  test('品质分越高成色越好', () => {
    const { legend, fine, common } = CONFIG.forge.grade;
    expect(gradeOf(CONFIG, legend)).toBe('legend');
    expect(gradeOf(CONFIG, legend - 0.01)).toBe('fine');
    expect(gradeOf(CONFIG, fine - 0.01)).toBe('common');
    expect(gradeOf(CONFIG, common - 0.01)).toBe('scrap');
  });

  test('三锤里有一锤偏了，还够得上传世', () => {
    const result: ForgeResult = {
      heat: 'perfect',
      hits: ['perfect', 'perfect', 'good'],
      quench: 'perfect',
      finished: true,
    };
    expect(qualityOf(CONFIG, result).grade).toBe('legend');
  });

  test('成色高低能和顾客要求比较', () => {
    expect(meets('legend', 'fine')).toBe(true);
    expect(meets('fine', 'legend')).toBe(false);
    expect(meets('common', 'common')).toBe(true);
  });
});

describe('三种玩法', () => {
  test('开局记下选的玩法，默认是时机判定', () => {
    expect(newGame(CONFIG).mode).toBe('timing');
    expect(newGame(CONFIG, 'rhythm').mode).toBe('rhythm');
    expect(newGame(CONFIG, 'heat').mode).toBe('heat');
  });

  test('三种玩法各有自己的打造场景和说明', () => {
    expect(new Set(MODES.map((m) => m.scene))).toEqual(new Set(['forge', 'rhythm', 'heat']));
    expect(modeInfo('heat').name).toContain('火候');
    expect(modeInfo('rhythm').how.length).toBeGreaterThan(2);
    expect(modeInfo('nope' as never)).toBe(MODES[0]);
  });

  test('节奏分是所有判定的平均分', () => {
    expect(rhythmScore(CONFIG, ['perfect', 'perfect', 'perfect'])).toBeCloseTo(1);
    expect(rhythmScore(CONFIG, ['perfect', 'good', 'miss'])).toBeCloseTo((1 + 0.6 + 0.15) / 3);
    expect(rhythmScore(CONFIG, [])).toBe(0);
  });

  test('火候分把净得分压到 0~1', () => {
    const { full } = CONFIG.modes.heat.score;
    expect(heatScore(CONFIG, 0)).toBe(0);
    expect(heatScore(CONFIG, -40)).toBe(0);
    expect(heatScore(CONFIG, full)).toBe(1);
    expect(heatScore(CONFIG, full / 2)).toBeCloseTo(0.5);
    expect(heatScore(CONFIG, full * 2)).toBe(1);
  });

  test('每种玩法有自己的分数线', () => {
    // 0.75 分：节奏够精良、火候够传世、时机判定只到精良
    expect(gradeOf(CONFIG, 0.75, 'rhythm')).toBe('fine');
    expect(gradeOf(CONFIG, 0.75, 'heat')).toBe('legend');
    expect(gradeOf(CONFIG, 0.75, 'timing')).toBe('fine');
    expect(gradeOf(CONFIG, 0.75)).toBe('fine');
  });

  test('同样的分数在三种玩法里换来同样的成色', () => {
    const state = newGame(CONFIG, 'heat');
    const delivery = settle(state, CONFIG, { score: 0.9, finished: true });
    expect(delivery.grade).toBe('legend');
  });
});

describe('节奏谱面', () => {
  const seed = 12345;
  const day1 = buildChart(CONFIG, seed, 1);
  const day3 = buildChart(CONFIG, seed, 3);
  const chordAt = (notes: typeof day1, time: number) => notes.filter((n) => Math.abs(n.time - time) < 1e-6).length;

  test('越往后音符越多', () => {
    expect(day3.length).toBeGreaterThan(day1.length);
  });

  test('一单大约三十秒', () => {
    const span = day3.at(-1)!.time - day3[0].time;
    expect(span).toBeGreaterThan(24);
    expect(span).toBeLessThan(36);
  });

  test('最后一天有同时按三个键的和弦，第一天最多两个', () => {
    const maxDay3 = Math.max(...day3.map((n) => chordAt(day3, n.time)));
    const maxDay1 = Math.max(...day1.map((n) => chordAt(day1, n.time)));
    expect(maxDay3).toBe(3);
    expect(maxDay1).toBeLessThanOrEqual(2);
  });

  test('同一颗种子出同一张谱', () => {
    expect(buildChart(CONFIG, seed, 2)).toEqual(buildChart(CONFIG, seed, 2));
  });

  test('音符按时间升序排好', () => {
    const times = day3.map((n) => n.time);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
});

describe('报酬和口碑', () => {
  test('达到要求拿原价，超出要求有加成', () => {
    expect(coinsFor(CONFIG, 20, 'fine', 'fine')).toBe(28);
    expect(coinsFor(CONFIG, 20, 'legend', 'fine')).toBe(48);
  });

  test('废品几乎不值钱', () => {
    expect(coinsFor(CONFIG, 20, 'scrap', 'common')).toBe(4);
  });

  test('口碑：达标加，未达标减，废品扣更多，跑单扣最多', () => {
    const { gain, loss, scrap, timeout } = CONFIG.pay.rep;
    expect(reputationDelta(CONFIG, 'fine', 'fine', false)).toBe(gain);
    expect(reputationDelta(CONFIG, 'common', 'fine', false)).toBe(-loss);
    expect(reputationDelta(CONFIG, 'scrap', 'common', false)).toBe(-scrap);
    expect(reputationDelta(CONFIG, 'scrap', 'common', true)).toBe(-timeout);
  });
});

describe('交付与推进', () => {
  test('交一单就前进一单，金币和口碑都记上', () => {
    const state = newGame(CONFIG);
    const before = state.reputation;
    const delivery = settle(state, CONFIG, great());
    expect(delivery.grade).toBe('legend');
    expect(delivery.coins).toBeGreaterThan(0);
    expect(state.orderIndex).toBe(1);
    expect(state.coins).toBe(delivery.coins);
    expect(state.reputation).toBe(before + CONFIG.pay.rep.gain);
    expect(currentOrder(state)?.itemName).toBe('锄头');
  });

  test('顾客等太久：不给钱，扣口碑，但照样往下走', () => {
    const state = newGame(CONFIG);
    const delivery = settle(state, CONFIG, { score: 1, finished: false });
    expect(delivery.timedOut).toBe(true);
    expect(delivery.coins).toBe(0);
    expect(state.coins).toBe(0);
    expect(state.reputation).toBe(CONFIG.game.startReputation - CONFIG.pay.rep.timeout);
    expect(state.orderIndex).toBe(1);
  });

  test('六单交完就结束，打得准会赢', () => {
    const state = playAll(newGame(CONFIG), great);
    expect(state.orderIndex).toBe(6);
    expect(state.history).toHaveLength(6);
    expect(state.endReason).toBe('win');
    expect(summarize(state, CONFIG).win).toBe(true);
  });

  test('全打废品，口碑掉光提前收摊', () => {
    const state = playAll(newGame(CONFIG), poor);
    expect(state.endReason).toBe('lose');
    expect(state.reputation).toBe(0);
    expect(state.history.length).toBeLessThan(6);
    expect(isFinished(state)).toBe(true);
  });

  test('口碑只在 0 到上限之间', () => {
    const state = newGame(CONFIG);
    state.reputation = CONFIG.game.maxReputation;
    settle(state, CONFIG, great());
    expect(state.reputation).toBe(CONFIG.game.maxReputation);
  });
});

describe('三关的走法', () => {
  test('每单记下是第几天交的', () => {
    const state = newGame(CONFIG);
    const delivery = settle(state, CONFIG, great());
    expect(delivery.day).toBe(1);
  });

  test('当天两单交完，进关卡结算', () => {
    const state = newGame(CONFIG);
    const first = settle(state, CONFIG, great());
    expect(nextScene(state, first)).toBe('shop');
    const second = settle(state, CONFIG, great());
    expect(nextScene(state, second)).toBe('dayend');
  });

  test('最后一单交完直接去总结算', () => {
    const state = newGame(CONFIG);
    let last: Delivery | undefined;
    while (!isFinished(state)) last = settle(state, CONFIG, great());
    expect(nextScene(state, last!)).toBe('result');
  });

  test('提前收摊也直接去结算', () => {
    const state = playAll(newGame(CONFIG), poor);
    const last = state.history.at(-1)!;
    expect(nextScene(state, last)).toBe('result');
  });
});

describe('机器人对打', () => {
  test('打得准的明显比乱按的赚得多，也走得更远', () => {
    const good = playAll(newGame(CONFIG), great);
    const bad = playAll(newGame(CONFIG), poor);
    expect(good.coins).toBeGreaterThan(bad.coins);
    expect(good.history.length).toBeGreaterThanOrEqual(bad.history.length);
    expect(good.endReason).toBe('win');
    expect(bad.endReason).toBe('lose');
  });

  test('中规中矩也能玩到结算，但成色上不去', () => {
    const state = playAll(newGame(CONFIG, 'rhythm'), () => ({ score: 0.6, finished: true }));
    expect(isFinished(state)).toBe(true);
    expect(state.history.every((d) => d.grade === 'fine' || d.grade === 'common')).toBe(true);
    expect(summarize(state, CONFIG).legend).toBe(0);
  });
});

describe('存档', () => {
  test('打到一半存下来，读回来能接着打', () => {
    const save = createSave('test', fakeStorage());
    const state = newGame(CONFIG, 'rhythm');
    settle(state, CONFIG, great());
    settle(state, CONFIG, great());
    save.writeRun(state);

    const restored = save.run!;
    expect(restored.orderIndex).toBe(2);
    expect(restored.mode).toBe('rhythm');
    expect(restored.coins).toBe(state.coins);
    expect(currentOrder(restored)?.id).toBe(currentOrder(state)?.id);

    settle(restored, CONFIG, great());
    expect(restored.orderIndex).toBe(3);
  });

  test('存档损坏时不崩溃，最高分只升不降', () => {
    const storage = fakeStorage();
    storage.setItem('test', '{坏数据');
    const save = createSave('test', storage);
    expect(save.run).toBeNull();
    save.recordScore(50);
    save.recordScore(20);
    expect(save.best).toBe(50);
  });
});
