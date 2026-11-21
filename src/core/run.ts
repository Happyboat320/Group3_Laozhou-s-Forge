// 地窟里的一趟：连续移动、怪物追人（要看得见）、挥锤、按键挖矿、可砸的箱桶。
// 纯逻辑：给一帧的输入和时间，返回这一帧发生了什么；画面只照着放动画。
import type { Config } from '../config';
import { isWalkable, type Dungeon } from './dungeon';
import { randInt } from './rng';

export interface Mob {
  id: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  cooldown: number;
  /** 看不见你的时候，往哪个方向晃 */
  wanderX: number;
  wanderY: number;
  wanderTimer: number;
}

export interface Ore {
  x: number;
  y: number;
  progress: number;
}

export interface Chest {
  x: number;
  y: number;
  opened: boolean;
}

export type PropKind = 'crate' | 'barrel' | 'rock';

export interface Prop {
  id: number;
  kind: PropKind;
  x: number;
  y: number;
}

export type DelveEvent =
  | { kind: 'swing' }
  | { kind: 'hit'; mobId: number; damage: number; killed: boolean; x: number; y: number }
  | { kind: 'smash'; x: number; y: number }
  | { kind: 'hurt'; damage: number }
  | { kind: 'mine'; x: number; y: number; ratio: number }
  | { kind: 'ore'; x: number; y: number }
  | { kind: 'chest'; x: number; y: number }
  | { kind: 'stairs' }
  | { kind: 'spawn'; mobId: number; x: number; y: number }
  | { kind: 'dead' };

export interface InputState {
  dx: number;
  dy: number;
  /** 挥锤（空格 / J） */
  attack: boolean;
  /** 挖矿（按住 K） */
  mine?: boolean;
}

export interface DelveState {
  dungeon: Dungeon;
  tile: number;
  visionRadius: number;
  relics: string[];
  player: {
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    cooldown: number;
    fx: number;
    fy: number;
    travelled: number;
  };
  mobs: Mob[];
  ores: Ore[];
  chests: Chest[];
  props: Prop[];
  seen: boolean[];
  /** 下一只怪还有多久刷出来 */
  mobSpawnIn: number;
  /** 可以刷怪的地板格（开图时算好） */
  floorCells: { x: number; y: number }[];
  outcome: 'none' | 'stairs' | 'dead';
}

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

/** 格子坐标（给视线用）。 */
function cellOf(value: number, tile: number) {
  return Math.floor(value / tile);
}

/**
 * 两点之间的直线有没有被墙挡住（Bresenham 走格子）。
 * 只看墙，箱桶不挡视线。
 */
export function lineOfSight(dungeon: Dungeon, x1: number, y1: number, x2: number, y2: number, tile: number): boolean {
  let cx = cellOf(x1, tile);
  let cy = cellOf(y1, tile);
  const tx = cellOf(x2, tile);
  const ty = cellOf(y2, tile);

  const dx = Math.abs(tx - cx);
  const dy = Math.abs(ty - cy);
  const sx = cx < tx ? 1 : -1;
  const sy = cy < ty ? 1 : -1;
  let err = dx - dy;

  let guard = 0;
  while (guard < 200) {
    guard += 1;
    if (cx === tx && cy === ty) return true;
    const e2 = err * 2;
    if (e2 > -dy) {
      err -= dy;
      cx += sx;
    }
    if (e2 < dx) {
      err += dx;
      cy += sy;
    }
    if (cx === tx && cy === ty) return true;
    if (!isWalkable(dungeon, cx, cy)) return false;
  }
  return false;
}

/** 玩家现在能看见哪些格子：半径内、且直线没被墙挡住。 */
export function computeVisible(state: DelveState): boolean[] {
  const { dungeon, player, tile } = state;
  const visible = new Array(dungeon.cols * dungeon.rows).fill(false);
  const r = state.visionRadius;
  const px = cellOf(player.x, tile);
  const py = cellOf(player.y, tile);

  for (let dy = -r; dy <= r; dy += 1) {
    for (let dx = -r; dx <= r; dx += 1) {
      if (Math.abs(dx) + Math.abs(dy) > r) continue;
      const x = px + dx;
      const y = py + dy;
      if (x < 0 || y < 0 || x >= dungeon.cols || y >= dungeon.rows) continue;
      if (lineOfSight(dungeon, player.x, player.y, x * tile + tile / 2, y * tile + tile / 2, tile)) {
        visible[y * dungeon.cols + x] = true;
      }
    }
  }
  return visible;
}

/** 站得下吗：格子是地板，且没被箱桶挡住。 */
export function canStand(state: DelveState, x: number, y: number, radius: number): boolean {
  const { dungeon, tile } = state;
  const minX = Math.floor((x - radius) / tile);
  const maxX = Math.floor((x + radius) / tile);
  const minY = Math.floor((y - radius) / tile);
  const maxY = Math.floor((y + radius) / tile);
  for (let ty = minY; ty <= maxY; ty += 1) {
    for (let tx = minX; tx <= maxX; tx += 1) {
      if (!isWalkable(dungeon, tx, ty)) return false;
    }
  }
  return true;
}

/** 玩家多了箱桶的阻挡。 */
function playerCanStand(state: DelveState, x: number, y: number, radius: number): boolean {
  if (!canStand(state, x, y, radius)) return false;
  const propR = 26;
  for (const prop of state.props) {
    if (dist(x, y, prop.x, prop.y) < radius + propR - 6) return false;
  }
  return true;
}

export function newDelve(config: Config, dungeon: Dungeon, hp: number, relics: string[] = []): DelveState {
  const has = (id: string) => relics.includes(id);
  const tile = config.dungeon.tile;
  const center = (p: { x: number; y: number }) => ({ x: p.x * tile + tile / 2, y: p.y * tile + tile / 2 });
  const start = center(dungeon.start);

  const occupied = new Set<string>([
    `${dungeon.start.x},${dungeon.start.y}`,
    `${dungeon.stairs.x},${dungeon.stairs.y}`,
    ...dungeon.things.map((t) => `${t.x},${t.y}`),
  ]);

  // 摆箱桶：挑空地板，别压在起点、阶梯和东西上
  const props: Prop[] = [];
  const free: { x: number; y: number }[] = [];
  for (let y = 0; y < dungeon.rows; y += 1) {
    for (let x = 0; x < dungeon.cols; x += 1) {
      if (dungeon.tiles[y * dungeon.cols + x] !== 'floor') continue;
      if (occupied.has(`${x},${y}`)) continue;
      free.push({ x, y });
    }
  }
  const kinds: PropKind[] = ['crate', 'barrel', 'rock'];
  for (let i = 0; i < Math.min(config.dungeon.props, free.length); i += 1) {
    const spot = free[(i * 7 + 3) % free.length];
    props.push({ id: i + 1, kind: kinds[i % kinds.length], ...center(spot) });
    occupied.add(`${spot.x},${spot.y}`);
  }

  const state: DelveState = {
    dungeon,
    tile,
    visionRadius: config.dungeon.torchRadius + (has('lamp') ? 2 : 0),
    relics,
    player: {
      x: start.x,
      y: start.y,
      hp,
      maxHp: hp,
      cooldown: 0,
      fx: 0,
      fy: 1,
      travelled: 0,
    },
    mobs: dungeon.things
      .filter((t) => t.kind === 'mob')
      .map((t, i) => ({
        id: i + 1,
        ...center(t),
        hp: config.combat.mobHp,
        maxHp: config.combat.mobHp,
        cooldown: 0,
        wanderX: 0,
        wanderY: 0,
        wanderTimer: 0,
      })),
    ores: dungeon.things.filter((t) => t.kind === 'ore').map((t) => ({ ...center(t), progress: 0 })),
    chests: dungeon.things.filter((t) => t.kind === 'chest').map((t) => ({ ...center(t), opened: false })),
    props,
    seen: new Array(dungeon.cols * dungeon.rows).fill(false),
    mobSpawnIn: config.combat.mobSpawnEvery,
    floorCells: [],
    outcome: 'none',
  };
  for (let y = 0; y < dungeon.rows; y += 1) {
    for (let x = 0; x < dungeon.cols; x += 1) {
      if (dungeon.tiles[y * dungeon.cols + x] === 'floor') state.floorCells.push({ x, y });
    }
  }
  markSeen(state);
  return state;
}

function markSeen(state: DelveState) {
  const visible = computeVisible(state);
  for (let i = 0; i < visible.length; i += 1) if (visible[i]) state.seen[i] = true;
}

/** 沿方向挪，撞墙只走能走的那一半（贴墙滑行）。 */
function slide(state: DelveState, radius: number, vx: number, vy: number, dt: number): number {
  const { player } = state;
  const nx = player.x + vx * dt;
  const ny = player.y + vy * dt;
  let moved = 0;
  if (playerCanStand(state, nx, player.y, radius)) {
    moved += Math.abs(nx - player.x);
    player.x = nx;
  }
  if (playerCanStand(state, player.x, ny, radius)) {
    moved += Math.abs(ny - player.y);
    player.y = ny;
  }
  return moved;
}

export function updateRun(state: DelveState, config: Config, input: InputState, dt: number, rnd: () => number): DelveEvent[] {
  const events: DelveEvent[] = [];
  if (state.outcome !== 'none') return events;

  const { player, relics } = state;
  const c = config.combat;

  // 1) 走
  let dx = input.dx;
  let dy = input.dy;
  const len = Math.hypot(dx, dy);
  if (len > 1) {
    dx /= len;
    dy /= len;
  }
  if (len > 0) {
    player.fx = dx;
    player.fy = dy;
  }
  player.travelled += slide(state, c.playerRadius, dx * c.playerSpeed, dy * c.playerSpeed, dt);
  if (relics.includes('herb') && player.travelled >= 300) {
    player.travelled -= 300;
    player.hp = Math.min(player.maxHp, player.hp + 2);
  }

  // 2) 挥锤：随时能挥，只看冷却
  player.cooldown = Math.max(0, player.cooldown - dt);
  if (input.attack && player.cooldown <= 0) {
    player.cooldown = c.attackCooldown;
    events.push({ kind: 'swing' });

    // 先砸箱桶
    for (const prop of [...state.props]) {
      if (dist(player.x, player.y, prop.x, prop.y) > c.attackRange) continue;
      state.props = state.props.filter((p) => p.id !== prop.id);
      events.push({ kind: 'smash', x: prop.x, y: prop.y });
    }
    // 再打怪
    for (const mob of [...state.mobs]) {
      if (dist(player.x, player.y, mob.x, mob.y) > c.attackRange) continue;
      const damage = randInt(rnd, c.playerAtk[0], c.playerAtk[1]);
      mob.hp -= damage;
      const killed = mob.hp <= 0;
      if (killed) state.mobs = state.mobs.filter((m) => m.id !== mob.id);
      events.push({ kind: 'hit', mobId: mob.id, damage, killed, x: mob.x, y: mob.y });
    }
  }

  // 3) 怪物：看得见你就追，看不见就随便晃
  for (const mob of state.mobs) {
    mob.cooldown = Math.max(0, mob.cooldown - dt);
    const d = dist(mob.x, mob.y, player.x, player.y);
    const canSee = d < c.mobSight * state.tile && lineOfSight(state.dungeon, mob.x, mob.y, player.x, player.y, state.tile);

    let vx = 0;
    let vy = 0;
    if (canSee && d > 1) {
      vx = ((player.x - mob.x) / d) * c.mobSpeed;
      vy = ((player.y - mob.y) / d) * c.mobSpeed;
    } else {
      mob.wanderTimer -= dt;
      if (mob.wanderTimer <= 0) {
        mob.wanderTimer = 0.8 + rnd() * 1.4;
        const angle = rnd() * Math.PI * 2;
        mob.wanderX = Math.cos(angle);
        mob.wanderY = Math.sin(angle);
      }
      vx = mob.wanderX * c.mobSpeed * 0.45;
      vy = mob.wanderY * c.mobSpeed * 0.45;
    }

    const nx = mob.x + vx * dt;
    const ny = mob.y + vy * dt;
    if (canStand(state, nx, mob.y, c.mobRadius)) mob.x = nx;
    else mob.wanderTimer = 0;
    if (canStand(state, mob.x, ny, c.mobRadius)) mob.y = ny;
    else mob.wanderTimer = 0;

    const touch = c.mobRadius + c.playerRadius;
    if (dist(mob.x, mob.y, player.x, player.y) <= touch && mob.cooldown <= 0) {
      const raw = randInt(rnd, c.mobAtk[0], c.mobAtk[1]);
      const damage = Math.max(1, raw - (relics.includes('apron') ? 2 : 0));
      player.hp = Math.max(0, player.hp - damage);
      mob.cooldown = c.mobHitCooldown;
      events.push({ kind: 'hurt', damage });
    }
  }

  // 4) 按住 K 才挖矿
  const nearOre = state.ores.find((o) => dist(player.x, player.y, o.x, o.y) <= c.mineRadius);
  if (nearOre && input.mine) {
    const speed = relics.includes('pick') ? 1.6 : 1;
    nearOre.progress += dt * speed;
    events.push({ kind: 'mine', x: nearOre.x, y: nearOre.y, ratio: Math.min(1, nearOre.progress / c.mineTime) });
    if (nearOre.progress >= c.mineTime) {
      state.ores = state.ores.filter((o) => o !== nearOre);
      events.push({ kind: 'ore', x: nearOre.x, y: nearOre.y });
    }
  }

  // 5) 宝箱：走过去就开
  for (const chest of state.chests) {
    if (chest.opened) continue;
    if (dist(player.x, player.y, chest.x, chest.y) <= c.chestRadius) {
      chest.opened = true;
      events.push({ kind: 'chest', x: chest.x, y: chest.y });
    }
  }

  // 6) 源源不断刷怪：挑离玩家足够远的地板格
  state.mobSpawnIn -= dt;
  if (state.mobSpawnIn <= 0 && state.mobs.length < c.maxMobs) {
    state.mobSpawnIn = c.mobSpawnEvery;
    const tile = state.tile;
    const px = player.x / tile;
    const py = player.y / tile;
    const spots = state.floorCells.filter(
      (cell) =>
        Math.hypot(cell.x + 0.5 - px, cell.y + 0.5 - py) >= c.spawnMinDistance &&
        !state.mobs.some((m) => Math.abs(m.x - (cell.x * tile + tile / 2)) < tile / 2 && Math.abs(m.y - (cell.y * tile + tile / 2)) < tile / 2),
    );
    if (spots.length) {
      const spot = spots[Math.floor(rnd() * spots.length)];
      const id = Math.max(0, ...state.mobs.map((m) => m.id)) + 1;
      state.mobs.push({
        id,
        x: spot.x * tile + tile / 2,
        y: spot.y * tile + tile / 2,
        hp: c.mobHp,
        maxHp: c.mobHp,
        cooldown: 0,
        wanderX: 0,
        wanderY: 0,
        wanderTimer: 0,
      });
      events.push({ kind: 'spawn', mobId: id, x: spot.x, y: spot.y });
    }
  }

  // 7) 阶梯
  const stairPos = { x: state.dungeon.stairs.x * state.tile + state.tile / 2, y: state.dungeon.stairs.y * state.tile + state.tile / 2 };
  if (dist(player.x, player.y, stairPos.x, stairPos.y) <= c.stairsRadius) {
    state.outcome = 'stairs';
    events.push({ kind: 'stairs' });
  }

  markSeen(state);

  if (player.hp <= 0) {
    state.outcome = 'dead';
    events.push({ kind: 'dead' });
  }
  return events;
}

/** 玩家身边能互动的东西（给界面提示用）。 */
export function interactableHere(state: DelveState, config: Config): 'ore' | 'chest' | 'stairs' | null {
  const { player } = state;
  const c = config.combat;
  if (state.ores.some((o) => dist(player.x, player.y, o.x, o.y) <= c.mineRadius)) return 'ore';
  if (state.chests.some((ch) => !ch.opened && dist(player.x, player.y, ch.x, ch.y) <= c.chestRadius)) return 'chest';
  const stairPos = { x: state.dungeon.stairs.x * state.tile + state.tile / 2, y: state.dungeon.stairs.y * state.tile + state.tile / 2 };
  if (dist(player.x, player.y, stairPos.x, stairPos.y) <= c.stairsRadius * 2) return 'stairs';
  return null;
}
