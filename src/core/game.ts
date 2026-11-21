// 游戏状态和规则：只放纯逻辑，不碰画面、键盘、声音，所以能直接写测试。
// 一天两单，三天六单；每交一单就结算金币和口碑，第六单之后看账本。
import type { Config } from '../config';
import { coinsFor, gradeOf, gradeRank, reputationDelta, type Grade } from './forge';
import type { Mode } from './modes';

export type { ForgeResult, Grade, Verdict } from './forge';
export type { Mode } from './modes';

export interface Order {
  id: string;
  day: number;
  customer: string;
  customerName: string;
  item: string;
  itemName: string;
  want: Grade;
  price: number;
  patience: number;
  line: string;
}

export interface Delivery {
  orderId: string;
  /** 这一单是第几天交的，关卡结算要用 */
  day: number;
  /** 0~1 的品质分，调难度时看它最直观 */
  score: number;
  customerName: string;
  itemName: string;
  grade: Grade;
  coins: number;
  rep: number;
  timedOut: boolean;
}

export interface GameState {
  /** 这一局选的玩法。 */
  mode: Mode;
  /** 今天第几天，1 起。 */
  day: number;
  coins: number;
  /** 口碑 0~100，掉到 0 提前收摊。 */
  reputation: number;
  /** 当前是第几单（全局，0 起）。 */
  orderIndex: number;
  orders: Order[];
  history: Delivery[];
  /** 新手提示看过没有，存档会记住。 */
  seenHint: boolean;
  /** 结束原因：赢了（老周传手艺）/ 输了（另请高明）。没结束是 null。 */
  endReason: 'win' | 'lose' | null;
}

/** 按 config.orders 生成这一局的订单表，id 形如 d1-1。 */
export function newGame(config: Config, mode: Mode = 'timing'): GameState {
  const orders: Order[] = config.orders.map((order, index) => ({
    ...order,
    id: `d${order.day}-${index + 1}`,
  }));
  return {
    mode,
    day: orders[0]?.day ?? 1,
    coins: config.game.startCoins,
    reputation: config.game.startReputation,
    orderIndex: 0,
    orders,
    history: [],
    seenHint: false,
    endReason: null,
  };
}

export function currentOrder(state: GameState): Order | null {
  return state.orders[state.orderIndex] ?? null;
}

export function isFinished(state: GameState): boolean {
  return state.endReason !== null || state.orderIndex >= state.orders.length;
}

/** 今天还剩几单（含当前这单）。 */
export function remainingToday(state: GameState): number {
  const today = currentOrder(state)?.day;
  if (today === undefined) return 0;
  return state.orders.filter((o, i) => o.day === today && i >= state.orderIndex).length;
}

/** 今天已经交了几单。 */
export function doneToday(state: GameState): number {
  const today = currentOrder(state)?.day ?? state.day;
  return state.orders.filter((o, i) => o.day === today && i < state.orderIndex).length;
}

/** 今天一共几单。 */
export function totalToday(state: GameState): number {
  const today = currentOrder(state)?.day ?? state.day;
  return state.orders.filter((o) => o.day === today).length;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** 一次打造的结果：0~1 的品质分，外加顾客有没有等到最后。 */
export interface Outcome {
  score: number;
  finished: boolean;
}

/**
 * 交付一单：算成色、给钱、改口碑、推到下一单。
 * 三种玩法各自算好自己的 score 再交进来，这里只认分数。
 * 顾客等太久（finished 为 false）算跑单：不给钱，扣口碑。
 */
export function settle(state: GameState, config: Config, outcome: Outcome): Delivery {
  const order = currentOrder(state);
  if (!order) throw new Error('没有可以交付的订单了');

  const grade = gradeOf(config, outcome.score, state.mode);
  const timedOut = !outcome.finished;
  const coins = timedOut ? 0 : coinsFor(config, order.price, grade, order.want);
  const rep = reputationDelta(config, grade, order.want, timedOut);

  state.coins += coins;
  state.reputation = clamp(state.reputation + rep, 0, config.game.maxReputation);

  const delivery: Delivery = {
    orderId: order.id,
    day: order.day,
    score: Math.round(outcome.score * 100) / 100,
    customerName: order.customerName,
    itemName: order.itemName,
    grade,
    coins,
    rep,
    timedOut,
  };
  state.history.push(delivery);
  state.orderIndex += 1;

  const next = currentOrder(state);
  if (next) state.day = next.day;

  if (state.reputation <= 0) {
    state.endReason = 'lose';
  } else if (state.orderIndex >= state.orders.length) {
    state.endReason = state.reputation >= config.game.winReputation ? 'win' : 'lose';
  }
  return delivery;
}

/** 交完一单以后该去哪个场景：赢了去结算，换天了去关卡结算，否则回铺子。 */
export function nextScene(state: GameState, delivery: Delivery): 'result' | 'dayend' | 'shop' {
  if (state.endReason) return 'result';
  const next = state.orders[state.orderIndex];
  if (next && next.day !== delivery.day) return 'dayend';
  return 'shop';
}

export interface Summary {
  coins: number;
  reputation: number;
  win: boolean;
  legend: number;
  fine: number;
  common: number;
  scrap: number;
  timedOut: number;
  /** 平均品质分排名，0~1，给结算页写评语用。 */
  bestItem: string;
}

/** 结算页要的数字。 */
export function summarize(state: GameState, config: Config): Summary {
  const count = (g: Grade) => state.history.filter((d) => d.grade === g).length;
  const best = state.history.reduce<Delivery | null>(
    (acc, d) => (acc === null || gradeRank(d.grade) > gradeRank(acc.grade) ? d : acc),
    null,
  );
  return {
    coins: state.coins,
    reputation: state.reputation,
    win: state.reputation >= config.game.winReputation,
    legend: count('legend'),
    fine: count('fine'),
    common: count('common'),
    scrap: count('scrap'),
    timedOut: state.history.filter((d) => d.timedOut).length,
    bestItem: best?.itemName ?? '—',
  };
}
