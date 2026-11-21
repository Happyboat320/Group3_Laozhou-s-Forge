// 地窟生成：房间 + 走廊 + 东西（矿脉 / 宝箱 / 怪物），纯逻辑，能量化测试。
// 视觉上是"房间制"：格子只用来算位置和视线，不拼贴图。
import type { Config } from '../config';
import { mulberry32, randInt, shuffle } from './rng';

export type Tile = 'wall' | 'floor';
export type ThingKind = 'ore' | 'chest' | 'mob';
export type RoomKind = 'start' | 'stairs' | 'ore' | 'chest' | 'mob' | 'empty';

export interface Pos {
  x: number;
  y: number;
}

export interface Room extends Pos {
  w: number;
  h: number;
  kind: RoomKind;
}

export interface Thing extends Pos {
  kind: ThingKind;
}

export interface Dungeon {
  cols: number;
  rows: number;
  /** 行优先：tiles[y * cols + x] */
  tiles: Tile[];
  rooms: Room[];
  start: Pos;
  stairs: Pos;
  things: Thing[];
}

export function idx(cols: number, x: number, y: number): number {
  return y * cols + x;
}

export function tileAt(dungeon: Dungeon, x: number, y: number): Tile {
  if (x < 0 || y < 0 || x >= dungeon.cols || y >= dungeon.rows) return 'wall';
  return dungeon.tiles[idx(dungeon.cols, x, y)];
}

export function isWalkable(dungeon: Dungeon, x: number, y: number): boolean {
  return tileAt(dungeon, x, y) === 'floor';
}

export function centerOf(room: Room): Pos {
  return { x: room.x + Math.floor(room.w / 2), y: room.y + Math.floor(room.h / 2) };
}

/** 两个房间重叠（含 1 格间隔）就不行，不然挖出来会粘成一坨。 */
function overlaps(a: Room, b: Room): boolean {
  return (
    a.x - 1 < b.x + b.w && b.x - 1 < a.x + a.w && a.y - 1 < b.y + b.h && b.y - 1 < a.y + a.h
  );
}

/**
 * 生成一层的洞窟。
 * day 越深：房间更多、怪物更多（第 1 天最浅，第 3 天最难）。
 */
export function generateDungeon(config: Config, seed: number, day = 1): Dungeon {
  const { cols, rows, roomMin, roomMax } = config.dungeon;
  const depth = Math.max(0, day - 1);
  const roomTarget = config.dungeon.rooms + depth;
  const rnd = mulberry32(seed);

  const tiles: Tile[] = new Array(cols * rows).fill('wall');
  const rooms: Room[] = [];

  // 把地图切成若干"槽位"，每个槽位放一间房：保证房间数固定、且永不重叠。
  // 槽位数、房间大小、房间在槽位里的位置都随机，免得每张图长得一样。
  const slotCols = randInt(rnd, 2, 3);
  const slotRows = Math.ceil(roomTarget / slotCols);
  const slotW = Math.floor(cols / slotCols);
  const slotH = Math.floor(rows / slotRows);
  const maxW = Math.max(2, Math.min(roomMax, slotW - 1));
  const maxH = Math.max(2, Math.min(roomMax, slotH - 1));
  const minW = Math.max(2, Math.min(roomMin, maxW) - 1);
  const minH = Math.max(2, Math.min(roomMin, maxH) - 1);

  for (let i = 0; i < roomTarget; i += 1) {
    const cx = i % slotCols;
    const cy = Math.floor(i / slotCols);
    const w = randInt(rnd, minW, maxW);
    const h = randInt(rnd, minH, maxH);
    const x = cx * slotW + randInt(rnd, 0, Math.max(0, slotW - 1 - w));
    const y = cy * slotH + randInt(rnd, 0, Math.max(0, slotH - 1 - h));
    rooms.push({ x, y, w, h, kind: 'empty' });
  }

  // 先挖房间
  for (const room of rooms) {
    for (let yy = room.y; yy < room.y + room.h; yy += 1) {
      for (let xx = room.x; xx < room.x + room.w; xx += 1) {
        tiles[idx(cols, xx, yy)] = 'floor';
      }
    }
  }

  // 再连走廊：按从左到右的顺序串起来，并额外补两条捷径，免得只有一条独木桥
  const ordered = [...rooms].sort((a, b) => centerOf(a).x - centerOf(b).x);
  for (let i = 1; i < ordered.length; i += 1) {
    carveCorridor(tiles, cols, centerOf(ordered[i - 1]), centerOf(ordered[i]), rnd);
  }
  if (ordered.length > 3) {
    carveCorridor(tiles, cols, centerOf(ordered[0]), centerOf(ordered[ordered.length - 2]), rnd);
    carveCorridor(tiles, cols, centerOf(ordered[1]), centerOf(ordered[ordered.length - 1]), rnd);
  }

  // 起点和阶梯随机挑两个"离得最远"的房间，别老是同一头
  const far = ordered.reduce(
    (best, a) => {
      for (const b of ordered) {
        const d = Math.abs(centerOf(a).x - centerOf(b).x) + Math.abs(centerOf(a).y - centerOf(b).y);
        if (d > best.d) best = { a, b, d };
      }
      return best;
    },
    { a: ordered[0], b: ordered[ordered.length - 1], d: -1 },
  );
  const startRoom = rnd() < 0.5 ? far.a : far.b;
  const stairsRoom = startRoom === far.a ? far.b : far.a;
  startRoom.kind = 'start';
  stairsRoom.kind = 'stairs';

  const start = centerOf(startRoom);
  const stairs = centerOf(stairsRoom);

  // 把东西放进房间：起点房不放，阶梯房只放阶梯
  const spots: Pos[] = [];
  for (const room of ordered) {
    if (room.kind === 'start' || room.kind === 'stairs') continue;
    for (let yy = room.y; yy < room.y + room.h; yy += 1) {
      for (let xx = room.x; xx < room.x + room.w; xx += 1) {
        spots.push({ x: xx, y: yy });
      }
    }
  }
  shuffle(rnd, spots);

  const things: Thing[] = [];
  const takeSpot = (): Pos | null => spots.pop() ?? null;

  const place = (kind: ThingKind, count: number) => {
    for (let i = 0; i < count; i += 1) {
      const spot = takeSpot();
      if (!spot) return;
      things.push({ ...spot, kind });
    }
  };

  place('ore', config.dungeon.oreNodes);
  place('mob', config.dungeon.mobs + depth);
  place('chest', config.dungeon.chests);

  // 房间的类型标签只用于显示（挂什么招牌），以东西的内容为准
  for (const room of ordered) {
    if (room.kind !== 'empty') continue;
    const inRoom = things.filter(
      (t) => t.x >= room.x && t.x < room.x + room.w && t.y >= room.y && t.y < room.y + room.h,
    );
    if (inRoom.some((t) => t.kind === 'ore')) room.kind = 'ore';
    else if (inRoom.some((t) => t.kind === 'chest')) room.kind = 'chest';
    else if (inRoom.some((t) => t.kind === 'mob')) room.kind = 'mob';
  }

  return { cols, rows, tiles, rooms, start, stairs, things };
}

function carveCorridor(tiles: Tile[], cols: number, a: Pos, b: Pos, rnd: () => number) {
  const horizontalFirst = rnd() < 0.5;
  if (horizontalFirst) {
    carveH(tiles, cols, a.x, b.x, a.y);
    carveV(tiles, cols, a.y, b.y, b.x);
  } else {
    carveV(tiles, cols, a.y, b.y, a.x);
    carveH(tiles, cols, a.x, b.x, b.y);
  }
}

function carveH(tiles: Tile[], cols: number, x1: number, x2: number, y: number) {
  for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x += 1) tiles[y * cols + x] = 'floor';
}

function carveV(tiles: Tile[], cols: number, y1: number, y2: number, x: number) {
  for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y += 1) tiles[y * cols + x] = 'floor';
}

/** 从起点能走到的所有格子（四方向）。 */
export function reachable(dungeon: Dungeon): Pos[] {
  const seen = new Set<number>();
  const out: Pos[] = [];
  const queue: Pos[] = [dungeon.start];
  seen.add(idx(dungeon.cols, dungeon.start.x, dungeon.start.y));

  while (queue.length) {
    const cur = queue.shift()!;
    out.push(cur);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (!isWalkable(dungeon, nx, ny)) continue;
      const key = idx(dungeon.cols, nx, ny);
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push({ x: nx, y: ny });
    }
  }
  return out;
}

/** 两点之间的格子距离（走格子的步数，绕墙不算）。 */
export function manhattan(a: Pos, b: Pos): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
