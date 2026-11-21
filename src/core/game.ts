// 游戏状态和规则：只放纯逻辑，不碰画面、键盘、声音。
// 一局 = 三天，每天两单；每单要下窟挖够材料，回来打造成色，交付换口碑。
import type { Config } from '../config';
import { mulberry32, pick, randInt } from './rng';

export type Grade = 'scrap' | 'common' | 'fine' | 'legend';
export type MaterialId = 'iron' | 'copper' | 'star';

export interface Order {
  id: string;
  day: number;
  customer: string;
  customerName: string;
  item: string;
  itemName: string;
  want: Grade;
  price: number;
  /** 这一单至少要哪种材料（只能用这种或更高级的） */
  need: MaterialId;
  /** 这一单至少要投几份 */
  needCount: number;
}

export interface Delivery {
  orderId: string;
  day: number;
  grade: Grade;
  coins: number;
  rep: number;
  /** 0~1 品质分 */
  score: number;
}

export interface GameState {
  seed: number;
  day: number;
  /** 今天第几单（0 起） */
  orderInDay: number;
  coins: number;
  reputation: number;
  hp: number;
  maxHp: number;
  /** 材料仓库：id → 数量 */
  materials: Record<string, number>;
  /** 这一单打算投哪些材料（shop 里选好，forge 按这个算上限） */
  craft: MaterialId[];
  /** 本局拿到的词条 id */
  relics: string[];
  orders: Order[];
  history: Delivery[];
  endReason: 'win' | 'lose' | null;
}

const GRADE_RANK: Record<Grade, number> = { scrap: 0, common: 1, fine: 2, legend: 3 };

export function gradeOf(config: Config, score: number): Grade {
  const { legend, fine, common } = config.forge.grade;
  if (score >= legend) return 'legend';
  if (score >= fine) return 'fine';
  if (score >= common) return 'common';
  return 'scrap';
}

export function meets(grade: Grade, want: Grade): boolean {
  return GRADE_RANK[grade] >= GRADE_RANK[want];
}

export function gradeName(grade: Grade): string {
  return { scrap: '废品', common: '普通', fine: '精良', legend: '传世' }[grade];
}

/** 按天数生成整局订单：越往后要求越高、报酬越高。 */
export function rollOrders(config: Config, seed: number): Order[] {
  const rnd = mulberry32(seed);
  const orders: Order[] = [];
  const wants: Grade[] = ['common', 'fine', 'legend'];
  let index = 0;

  for (let day = 1; day <= config.game.days; day += 1) {
    for (let i = 0; i < config.game.ordersPerDay; i += 1) {
      index += 1;
      const customer = pick(rnd, config.catalog.customers);
      const item = pick(rnd, config.catalog.items);
      const want = wants[Math.min(day - 1, wants.length - 1)];
      const need: MaterialId = day >= 3 ? 'star' : day === 2 ? 'copper' : 'iron';
      orders.push({
        id: `d${day}-${index}`,
        day,
        customer: customer.id,
        customerName: customer.name,
        item: item.id,
        itemName: item.name,
        want,
        price: item.price + randInt(rnd, -2, 4),
        need,
        needCount: config.game.needCountByDay[Math.min(day, config.game.needCountByDay.length) - 1],
      });
    }
  }
  return orders;
}

export function newGame(config: Config, seed = 1): GameState {
  const state: GameState = {
    seed,
    day: 1,
    orderInDay: 0,
    coins: 0,
    reputation: config.game.startReputation,
    hp: config.game.playerHp,
    maxHp: config.game.playerHp,
    materials: {},
    craft: [],
    relics: [],
    orders: rollOrders(config, seed),
    history: [],
    endReason: null,
  };
  return state;
}

/** 当前这一单：直接用「已经交了几单」去查，比维护两个计数器稳。 */
export function orderAt(state: GameState): Order | null {
  return state.orders[state.history.length] ?? null;
}

export function isFinished(state: GameState): boolean {
  return state.endReason !== null || state.history.length >= state.orders.length;
}

/** 材料够不够打造这一单。 */
export function hasMaterial(state: GameState, need: MaterialId): boolean {
  return (state.materials[need] ?? 0) > 0;
}

/** 材料的档次：生铁 0、铜精 1、陨铁 2。 */
export function materialRank(config: Config, id: MaterialId): number {
  return config.materials.findIndex((m) => m.id === id);
}

/** 一把材料混着用，上限就是各自上限的平均值。 */
export function materialCap(config: Config, pieces: MaterialId[]): number {
  if (!pieces.length) return 0;
  const total = pieces.reduce((sum, id) => sum + (config.materials.find((m) => m.id === id)?.cap ?? 0), 0);
  return total / pieces.length;
}

/**
 * 打造出来的品质分 = 判定分 × 材料上限。
 * 材料越好、投得越多，上限越高；判定再准也超不过材料的天花板。
 */
export function craftScore(config: Config, skill: number, pieces: MaterialId[]): number {
  return Math.max(0, Math.min(1, skill * materialCap(config, pieces)));
}

/** 这一套配比能不能用：份数够、不比要求的差、仓库里确实有。 */
export function canCraft(state: GameState, config: Config, order: Order, pieces: MaterialId[]): boolean {
  if (pieces.length < order.needCount) return false;
  if (pieces.length > order.needCount + config.maxExtraPieces) return false;
  const needRank = materialRank(config, order.need);
  if (pieces.some((p) => materialRank(config, p) < needRank)) return false;

  const used: Record<string, number> = {};
  for (const p of pieces) used[p] = (used[p] ?? 0) + 1;
  return Object.entries(used).every(([id, n]) => (state.materials[id] ?? 0) >= n);
}

export interface CraftOutcome {
  score: number;
  finished: boolean;
}

/** 交付一单：扣材料、给钱、改口碑、推进。 */
export function settle(state: GameState, config: Config, order: Order, outcome: CraftOutcome, pieces: MaterialId[] = []): Delivery {
  const grade = gradeOf(config, outcome.score);
  const timedOut = !outcome.finished;
  const coins = timedOut ? 0 : Math.round(order.price * config.pay.multiplier[grade] *
    (GRADE_RANK[grade] > GRADE_RANK[order.want] ? config.pay.bonusAboveWant : 1));
  const rep = timedOut
    ? -config.pay.rep.timeout
    : grade === 'scrap'
      ? -config.pay.rep.scrap
      : meets(grade, order.want)
        ? config.pay.rep.gain
        : -config.pay.rep.loss;

  // 扣掉这一炉投进去的材料
  const spend = pieces.length ? pieces : ([order.need] as MaterialId[]);
  for (const id of spend) state.materials[id] = Math.max(0, (state.materials[id] ?? 0) - 1);
  // 交完一单回铺子歇口气：不然连着下六趟窟，血根本不够
  state.hp = Math.min(state.maxHp, state.hp + config.game.healPerOrder);
  state.coins += coins;
  state.reputation = Math.max(0, Math.min(config.game.maxReputation, state.reputation + rep));

  const delivery: Delivery = { orderId: order.id, day: order.day, grade, coins, rep, score: Math.round(outcome.score * 100) / 100 };
  state.history.push(delivery);

  const next = orderAt(state);
  if (next) state.day = next.day;

  if (state.hp <= 0) state.endReason = 'lose';
  else if (state.reputation <= 0) state.endReason = 'lose';
  else if (!next) state.endReason = state.reputation >= config.game.winReputation ? 'win' : 'lose';

  return delivery;
}

/** 挖矿产什么料：生铁 50 / 铜精 35 / 陨铁 15；有识矿眼就变 40 / 40 / 20。 */
export function rollMaterial(config: Config, hasEye: boolean, rnd: () => number = Math.random): MaterialId {
  const table = hasEye ? config.dropRates.withEye : config.dropRates.base;
  const total = table.iron + table.copper + table.star;
  let roll = rnd() * total;
  if (roll < table.iron) return 'iron';
  roll -= table.iron;
  if (roll < table.copper) return 'copper';
  return 'star';
}

/** 挖到材料。 */
export function gainMaterial(state: GameState, id: MaterialId, amount = 1) {
  state.materials[id] = (state.materials[id] ?? 0) + amount;
}

/** 拿到词条（重复的就不给了）。rnd 可以传进来，测试里就能固定结果。 */
export function gainRelic(state: GameState, config: Config, rnd: () => number = Math.random): string | null {
  const pool = config.relics.filter((r) => !state.relics.includes(r.id));
  if (!pool.length) return null;
  const relic = pool[Math.min(pool.length - 1, Math.floor(rnd() * pool.length))];
  state.relics.push(relic.id);
  return relic.id;
}

/** 开局给材料：让第一单不用空手。 */
export function startingKit(state: GameState) {
  gainMaterial(state, 'iron', 1);
}

