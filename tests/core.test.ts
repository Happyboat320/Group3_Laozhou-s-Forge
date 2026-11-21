import { describe, expect, test } from 'vitest';
import { CONFIG } from '../src/config';
import { generateDungeon, isWalkable, reachable, tileAt } from '../src/core/dungeon';
import {
  canCraft,
  craftScore,
  gainMaterial,
  gainRelic,
  gradeOf,
  hasMaterial,
  materialCap,
  meets,
  newGame,
  orderAt,
  rollOrders,
  settle,
} from '../src/core/game';
import { mulberry32, randInt, shuffle } from '../src/core/rng';

describe('随机数', () => {
  test('同一个种子给出同一串数', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  test('randInt 落在闭区间里', () => {
    const rnd = mulberry32(7);
    for (let i = 0; i < 200; i += 1) {
      const v = randInt(rnd, 3, 5);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(5);
    }
  });

  test('洗牌不丢元素', () => {
    const rnd = mulberry32(11);
    const list = [1, 2, 3, 4, 5];
    const out = shuffle(rnd, [...list]);
    expect(out.sort()).toEqual(list);
  });
});

describe('地窟生成', () => {
  test('同一个种子出同一张图', () => {
    const a = generateDungeon(CONFIG, 2024, 1);
    const b = generateDungeon(CONFIG, 2024, 1);
    expect(b).toEqual(a);
  });

  test('不同种子出不同的图', () => {
    const a = generateDungeon(CONFIG, 1, 1);
    const b = generateDungeon(CONFIG, 2, 1);
    expect(b.tiles).not.toEqual(a.tiles);
  });

  test('房间不重叠、都在图里', () => {
    const d = generateDungeon(CONFIG, 99, 1);
    expect(d.rooms.length).toBe(CONFIG.dungeon.rooms);
    for (const r of d.rooms) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(d.cols);
      expect(r.y + r.h).toBeLessThanOrEqual(d.rows);
    }
    for (let i = 0; i < d.rooms.length; i += 1) {
      for (let j = i + 1; j < d.rooms.length; j += 1) {
        const a = d.rooms[i];
        const b = d.rooms[j];
        const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        expect(apart).toBe(true);
      }
    }
  });

  test('起点和阶梯都站得住', () => {
    const d = generateDungeon(CONFIG, 5, 1);
    expect(isWalkable(d, d.start.x, d.start.y)).toBe(true);
    expect(isWalkable(d, d.stairs.x, d.stairs.y)).toBe(true);
  });

  test('从起点走得到阶梯，也走得到所有东西', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const d = generateDungeon(CONFIG, seed, 1);
      const seen = new Set(reachable(d).map((p) => `${p.x},${p.y}`));
      expect(seen.has(`${d.stairs.x},${d.stairs.y}`)).toBe(true);
      for (const t of d.things) expect(seen.has(`${t.x},${t.y}`)).toBe(true);
    }
  });

  test('东西的数量对得上配置', () => {
    const d = generateDungeon(CONFIG, 7, 1);
    const count = (kind: string) => d.things.filter((t) => t.kind === kind).length;
    expect(count('ore')).toBe(CONFIG.dungeon.oreNodes);
    expect(count('mob')).toBe(CONFIG.dungeon.mobs);
    expect(count('chest')).toBe(CONFIG.dungeon.chests);
  });

  test('东西不会落在起点或墙里', () => {
    const d = generateDungeon(CONFIG, 8, 2);
    for (const t of d.things) {
      expect(tileAt(d, t.x, t.y)).toBe('floor');
      expect(t.x === d.start.x && t.y === d.start.y).toBe(false);
    }
  });

  test('任何一层、任何种子，阶梯和东西都走得到', () => {
    for (let day = 1; day <= 3; day += 1) {
      for (let seed = 1; seed <= 40; seed += 1) {
        const d = generateDungeon(CONFIG, seed * 17 + day, day);
        const seen = new Set(reachable(d).map((p) => `${p.x},${p.y}`));
        expect(seen.has(`${d.stairs.x},${d.stairs.y}`)).toBe(true);
        for (const t of d.things) expect(seen.has(`${t.x},${t.y}`)).toBe(true);
      }
    }
  });

  test('越深的洞窟怪物越多', () => {
    const shallow = generateDungeon(CONFIG, 3, 1);
    const deep = generateDungeon(CONFIG, 3, 3);
    const mobs = (d: typeof shallow) => d.things.filter((t) => t.kind === 'mob').length;
    expect(mobs(deep)).toBeGreaterThan(mobs(shallow));
  });
});

describe('订单', () => {
  test('三天六单，天数递增', () => {
    const orders = rollOrders(CONFIG, 1);
    expect(orders).toHaveLength(CONFIG.game.days * CONFIG.game.ordersPerDay);
    expect(orders.map((o) => o.day)).toEqual([1, 1, 2, 2, 3, 3]);
  });

  test('要求成色一天比一天高', () => {
    const orders = rollOrders(CONFIG, 1);
    expect(orders[0].want).toBe('common');
    expect(orders[2].want).toBe('fine');
    expect(orders[4].want).toBe('legend');
  });

  test('第一单要生铁，最后一单要陨铁', () => {
    const orders = rollOrders(CONFIG, 1);
    expect(orders[0].need).toBe('iron');
    expect(orders.at(-1)!.need).toBe('star');
  });

  test('同一个种子订单一样', () => {
    expect(rollOrders(CONFIG, 77)).toEqual(rollOrders(CONFIG, 77));
  });
});

describe('打造与交付', () => {
  test('材料决定品质上限：生铁封顶 0.62', () => {
    const iron = CONFIG.materials.find((m) => m.id === 'iron')!;
    expect(craftScore(CONFIG, 1, ['iron'])).toBeCloseTo(iron.cap);
    expect(craftScore(CONFIG, 0.5, ['iron'])).toBeCloseTo(0.5 * iron.cap);
  });

  test('陨铁能打出传世', () => {
    expect(gradeOf(CONFIG, craftScore(CONFIG, 1, ['star']))).toBe('legend');
  });

  test('生铁再准也打不出传世', () => {
    expect(gradeOf(CONFIG, craftScore(CONFIG, 1, ['iron']))).toBe('common');
  });

  test('混着投：上限是各材料上限的平均', () => {
    const iron = CONFIG.materials.find((m) => m.id === 'iron')!.cap;
    const copper = CONFIG.materials.find((m) => m.id === 'copper')!.cap;
    expect(materialCap(CONFIG, ['iron'])).toBeCloseTo(iron);
    expect(materialCap(CONFIG, ['iron', 'copper'])).toBeCloseTo((iron + copper) / 2);
    expect(materialCap(CONFIG, ['iron', 'iron', 'star'])).toBeCloseTo((iron * 2 + 1) / 3);
  });

  test('份数够、不比要求差、仓库里有，才能开炉', () => {
    const state = newGame(CONFIG, 1);
    const order = orderAt(state)!;
    gainMaterial(state, 'iron', 3);
    gainMaterial(state, 'copper', 1);

    expect(canCraft(state, CONFIG, order, ['iron'])).toBe(true);
    expect(canCraft(state, CONFIG, order, [])).toBe(false);
    // 第一天只要 1 份，最多 3 份
    expect(canCraft(state, CONFIG, order, ['iron', 'iron', 'iron', 'iron'])).toBe(false);
    // 第一天要生铁，不能拿更差的（这里没有更差的，用够份数就行）
    expect(canCraft(state, CONFIG, order, ['iron', 'copper'])).toBe(true);
    // 仓库里没有陨铁
    expect(canCraft(state, CONFIG, order, ['star'])).toBe(false);
  });

  test('交单按配比扣料', () => {
    const state = newGame(CONFIG, 1);
    const order = orderAt(state)!;
    gainMaterial(state, 'iron', 2);
    gainMaterial(state, 'copper', 1);
    settle(state, CONFIG, order, { score: 0.7, finished: true }, ['iron', 'copper']);
    expect(state.materials.iron).toBe(1);
    expect(state.materials.copper).toBe(0);
  });

  test('成色比较', () => {
    expect(meets('legend', 'fine')).toBe(true);
    expect(meets('fine', 'legend')).toBe(false);
  });

  test('交一单：扣材料、加钱、加口碑、推进', () => {
    const state = newGame(CONFIG, 1);
    gainMaterial(state, 'iron', 1);
    const order = orderAt(state)!;
    expect(hasMaterial(state, 'iron')).toBe(true);

    const delivery = settle(state, CONFIG, order, { score: 0.62, finished: true });
    expect(delivery.grade).toBe('common');
    expect(delivery.coins).toBeGreaterThan(0);
    expect(state.coins).toBe(delivery.coins);
    expect(state.materials.iron).toBe(0);
    expect(orderAt(state)?.id).not.toBe(order.id);
  });

  test('六单交完就结束', () => {
    const state = newGame(CONFIG, 1);
    state.reputation = 80;
    for (let i = 0; i < 6; i += 1) {
      const order = orderAt(state)!;
      gainMaterial(state, order.need, 1);
      settle(state, CONFIG, order, { score: 1, finished: true });
    }
    expect(state.history).toHaveLength(6);
    expect(state.endReason).toBe('win');
  });

  test('口碑掉光就输了', () => {
    const state = newGame(CONFIG, 1);
    state.reputation = 5;
    const order = orderAt(state)!;
    gainMaterial(state, order.need, 1);
    settle(state, CONFIG, order, { score: 0.05, finished: true });
    expect(state.reputation).toBe(0);
    expect(state.endReason).toBe('lose');
  });

  test('词条不重复', () => {
    const state = newGame(CONFIG, 1);
    const rnd = mulberry32(3);
    for (let i = 0; i < CONFIG.relics.length; i += 1) gainRelic(state, CONFIG, rnd);
    expect(new Set(state.relics).size).toBe(state.relics.length);
    expect(state.relics.length).toBeLessThanOrEqual(CONFIG.relics.length);
  });
});
