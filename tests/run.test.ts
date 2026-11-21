import { describe, expect, test } from 'vitest';
import { CONFIG } from '../src/config';
import type { Dungeon } from '../src/core/dungeon';
import { lineOfSight, newDelve, updateRun, type DelveState, type InputState } from '../src/core/run';
import { mulberry32 } from '../src/core/rng';

const TILE = CONFIG.dungeon.tile;
const IDLE: InputState = { dx: 0, dy: 0, attack: false };

/** 手搓一张 6×3 全地板的小图，方便精确断言。 */
function smallDungeon(things: Dungeon['things'] = []): Dungeon {
  const cols = 6;
  const rows = 3;
  return {
    cols,
    rows,
    tiles: new Array(cols * rows).fill('floor'),
    rooms: [],
    start: { x: 1, y: 1 },
    stairs: { x: 5, y: 1 },
    things,
  };
}

function make(things: Dungeon['things'] = [], relics: string[] = []): DelveState {
  return newDelve(CONFIG, smallDungeon(things), 100, relics);
}

/** 跑 n 秒，返回最后一次的事件。 */
function run(state: DelveState, input: InputState, seconds: number, seed = 1) {
  const rnd = mulberry32(seed);
  const events: ReturnType<typeof updateRun> = [];
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) events.push(...updateRun(state, CONFIG, input, dt, rnd));
  return events;
}

describe('进洞', () => {
  test('站在起点格子中心，四周点亮', () => {
    const run1 = make();
    expect(run1.player.x).toBeGreaterThan(1 * TILE);
    expect(run1.player.y).toBeGreaterThan(1 * TILE);
    expect(run1.seen[1 * 6 + 1]).toBe(true);
    expect(run1.outcome).toBe('none');
  });

  test('怪、矿、箱子都放好了', () => {
    const state = make([
      { kind: 'mob', x: 3, y: 1 },
      { kind: 'ore', x: 1, y: 2 },
      { kind: 'chest', x: 4, y: 0 },
    ]);
    expect(state.mobs).toHaveLength(1);
    expect(state.ores).toHaveLength(1);
    expect(state.chests).toHaveLength(1);
    expect(state.mobs[0].hp).toBe(CONFIG.combat.mobHp);
  });
});

describe('连续移动', () => {
  test('按住方向键会一直往前挪，不是一格一格跳', () => {
    const state = make();
    const startX = state.player.x;
    run(state, { dx: 1, dy: 0, attack: false }, 0.2);
    const moved = state.player.x - startX;
    expect(moved).toBeGreaterThan(CONFIG.combat.playerSpeed * 0.15);
    expect(moved).toBeLessThan(CONFIG.combat.playerSpeed * 0.25);
  });

  test('斜着走不会更快', () => {
    const a = make();
    const b = make();
    run(a, { dx: 1, dy: 0, attack: false }, 0.2);
    run(b, { dx: 1, dy: 1, attack: false }, 0.2);
    const distA = Math.abs(a.player.x - (1 * TILE + TILE / 2));
    const distB = Math.hypot(b.player.x - (1 * TILE + TILE / 2), b.player.y - (1 * TILE + TILE / 2));
    expect(Math.abs(distA - distB)).toBeLessThan(2);
  });

  test('撞墙就停下，不会穿过去', () => {
    const state = make();
    // 把左边那格改成墙，再往左顶
    state.dungeon.tiles[1 * 6 + 0] = 'wall';
    state.player.x = 2 * TILE + TILE / 2;
    run(state, { dx: -1, dy: 0, attack: false }, 2);
    expect(state.player.x).toBeGreaterThanOrEqual(TILE + CONFIG.combat.playerRadius - 1);
    expect(state.player.x).toBeLessThan(2 * TILE);
  });
});

describe('挥锤', () => {
  test('怪在范围里会被打掉血', () => {
    const state = make([{ kind: 'mob', x: 2, y: 1 }]);
    const hp0 = state.mobs[0].hp;
    const events = run(state, { dx: 0, dy: 0, attack: true }, 0.2);
    expect(events.some((e) => e.kind === 'hit')).toBe(true);
    expect(state.mobs[0].hp).toBeLessThan(hp0);
  });

  test('冷却期间不会连砍', () => {
    const state = make([{ kind: 'mob', x: 2, y: 1 }]);
    state.mobs[0].hp = 999;
    const events = run(state, { dx: 0, dy: 0, attack: true }, 0.3);
    const hits = events.filter((e) => e.kind === 'hit').length;
    expect(hits).toBe(1);
  });

  test('远处够不着', () => {
    const state = make([{ kind: 'mob', x: 5, y: 2 }]);
    const events = run(state, { dx: 0, dy: 0, attack: true }, 0.2);
    expect(events.some((e) => e.kind === 'hit')).toBe(false);
  });
});

describe('怪物追人', () => {
  test('会一直靠近', () => {
    const state = make([{ kind: 'mob', x: 4, y: 1 }]);
    const before = Math.hypot(state.mobs[0].x - state.player.x, state.mobs[0].y - state.player.y);
    run(state, IDLE, 0.5);
    const after = Math.hypot(state.mobs[0].x - state.player.x, state.mobs[0].y - state.player.y);
    expect(after).toBeLessThan(before);
  });

  test('贴身会咬人，但有冷却', () => {
    const state = make([{ kind: 'mob', x: 2, y: 1 }]);
    state.mobs[0].x = state.player.x + 30;
    const events = run(state, IDLE, 1.2);
    const hurts = events.filter((e) => e.kind === 'hurt').length;
    expect(hurts).toBeGreaterThan(0);
    expect(hurts).toBeLessThan(4);
  });

  test('血掉光就算死', () => {
    const state = make([{ kind: 'mob', x: 2, y: 1 }]);
    state.player.hp = 1;
    state.mobs[0].x = state.player.x + 30;
    run(state, IDLE, 1);
    expect(state.outcome).toBe('dead');
  });
});

describe('挖矿、开箱、下楼', () => {
  test('站在矿边上会自己挖，够了就出材料', () => {
    const state = make([{ kind: 'ore', x: 1, y: 2 }]);
    state.player.x = 1 * TILE + TILE / 2;
    state.player.y = 2 * TILE + TILE / 2;
    const events = run(state, { ...IDLE, mine: true }, CONFIG.combat.mineTime + 0.3);
    expect(events.some((e) => e.kind === 'mine')).toBe(true);
    expect(events.some((e) => e.kind === 'ore')).toBe(true);
    expect(state.ores).toHaveLength(0);
  });

  test('不按 K 不会挖出东西', () => {
    const state = make([{ kind: 'ore', x: 1, y: 2 }]);
    state.player.x = 1 * TILE + TILE / 2;
    state.player.y = 2 * TILE + TILE / 2;
    const events = run(state, IDLE, CONFIG.combat.mineTime + 0.5);
    expect(events.some((e) => e.kind === 'ore')).toBe(false);
    expect(state.ores).toHaveLength(1);
  });

  test('走过去就开箱', () => {
    const state = make([{ kind: 'chest', x: 2, y: 1 }]);
    const events = run(state, { dx: 1, dy: 0, attack: false }, 1);
    expect(events.some((e) => e.kind === 'chest')).toBe(true);
    expect(state.chests[0].opened).toBe(true);
  });

  test('走到阶梯这一趟就结束', () => {
    const state = make();
    state.props = [];
    run(state, { dx: 1, dy: 0, attack: false }, 6);
    expect(state.outcome).toBe('stairs');
  });
});

describe('视线与箱桶', () => {
  test('直线被墙挡住就看不见', () => {
    const d = smallDungeon([]);
    const from = { x: 0.5 * TILE, y: 1.5 * TILE };
    const to = { x: 4.5 * TILE, y: 1.5 * TILE };
    d.tiles[1 * 6 + 2] = 'wall';

    expect(lineOfSight(d, from.x, from.y, to.x, to.y, TILE)).toBe(false);
    d.tiles[1 * 6 + 2] = 'floor';
    expect(lineOfSight(d, from.x, from.y, to.x, to.y, TILE)).toBe(true);
  });

  test('箱桶挡路，砸一下就碎', () => {
    const state = make();
    state.props = [{ id: 99, kind: 'crate', x: state.player.x + 40, y: state.player.y }];
    const x0 = state.player.x;
    run(state, { dx: 1, dy: 0, attack: false }, 0.6);
    expect(state.player.x).toBeLessThan(x0 + 40);

    const events = run(state, { dx: 0, dy: 0, attack: true }, 0.2);
    expect(events.some((e) => e.kind === 'smash')).toBe(true);
    expect(state.props).toHaveLength(0);
  });

  test('挥锤随时能挥，打不打得到都挥', () => {
    const state = make();
    const events = run(state, { dx: 0, dy: 0, attack: true }, 0.1);
    expect(events.some((e) => e.kind === 'swing')).toBe(true);
  });
});

describe('词条', () => {
  test('围裙减伤', () => {
    const plain = make([{ kind: 'mob', x: 2, y: 1 }]);
    const aproned = make([{ kind: 'mob', x: 2, y: 1 }], ['apron']);
    plain.mobs[0].x = plain.player.x + 30;
    aproned.mobs[0].x = aproned.player.x + 30;
    run(plain, IDLE, 0.6);
    run(aproned, IDLE, 0.6);
    expect(100 - aproned.player.hp).toBeLessThan(100 - plain.player.hp);
  });

  test('长明灯照得更远', () => {
    expect(make([], ['lamp']).visionRadius).toBe(CONFIG.dungeon.torchRadius + 2);
  });

  test('矿工的镐挖得更快', () => {
    const state = make([{ kind: 'ore', x: 1, y: 2 }], ['pick']);
    state.player.x = 1 * TILE + TILE / 2;
    state.player.y = 2 * TILE + TILE / 2;
    run(state, { ...IDLE, mine: true }, CONFIG.combat.mineTime * 0.75);
    expect(state.ores).toHaveLength(0);
  });

  test('止血草走够距离回血', () => {
    const state = make([], ['herb']);
    state.props = [];
    state.player.hp = 50;
    run(state, { dx: 1, dy: 0, attack: false }, 1);
    run(state, { dx: -1, dy: 0, attack: false }, 1);
    expect(state.player.hp).toBeGreaterThan(50);
  });
});
