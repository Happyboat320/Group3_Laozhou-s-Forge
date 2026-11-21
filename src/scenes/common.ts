// 三个场景共用的小界面：顶部状态条、气泡、品质徽章、飘字。
import type { Config } from '../config';
import type { Delivery, GameState } from '../core/game';
import { GRADE_BADGE, GRADE_NAME, type Grade } from '../core/forge';
import type { BaseScene } from '../engine/scenes';
import { COLOR, hex, addText } from '../engine/ui';
import { modeInfo, modeInstructions } from '../core/modes';

export const INK = COLOR.ink;
export const CREAM = COLOR.cream;

export function showModeIntro(scene: BaseScene, onReady: () => void) {
  if (scene.ctx.game.seenHint) {
    onReady();
    return;
  }
  const mode = scene.ctx.game.mode;
  const veil = scene.add.rectangle(640, 360, 1280, 720, 0x1b1714, 0.62).setDepth(60).setInteractive();
  const card = panel(scene, 640, 350, 800, 460, 0.98).setDepth(61);
  const title = addText(scene, 640, 180, `${modeInfo(mode).name} · 开炉前看一眼`, {
    size: 32, weight: 700, align: 'center',
  }).setDepth(62);
  const controls = mode === 'heat' ? '← → / A D 换道；炉温为 0 会提前熄火。' : '← ↓ → 对应三条道；同排铁块要同时按。';
  const body = addText(scene, 640, 244, [...modeInstructions(scene.ctx.config, mode), '', controls].join('\n'), {
    size: 22, align: 'center', wrap: 710,
  }).setDepth(62);
  const hint = addText(scene, 640, 446, '读说明时不计时，也不消耗顾客耐心', {
    size: 18, align: 'center', color: COLOR.green,
  }).setDepth(62);
  const objects = [veil, card, title, body, hint];
  let closed = false;
  const begin = () => {
    if (closed) return;
    closed = true;
    for (const object of objects) object.destroy();
    button.destroy();
    scene.ctx.game.seenHint = true;
    scene.ctx.save.writeRun(scene.ctx.game);
    onReady();
  };
  const button = scene.button({ x: 640, y: 518, label: '准备好了（空格）', key: 'Space', onClick: begin }).setDepth(63);
}

/** 圆角底板，返回 graphics，想动它自己加 tween。 */
export function panel(scene: BaseScene, x: number, y: number, w: number, h: number, alpha = 0.9, color = '#fff6dc') {
  const g = scene.add.graphics();
  g.fillStyle(hex(color), alpha);
  g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 16);
  g.lineStyle(3, hex('#e8893a'), 0.85);
  g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 16);
  return g;
}

/** 顶部状态条：第几天第几单、金币、口碑。 */
export function addHud(scene: BaseScene, state: GameState, config: Config) {
  panel(scene, 250, 46, 460, 56, 0.88);
  const order = addText(scene, 36, 46, '', { size: 22, weight: 700 });
  const coins = addText(scene, 1010, 46, '', { size: 24, weight: 700, color: COLOR.ink, align: 'right' });
  const rep = addText(scene, 1244, 46, '', { size: 24, weight: 700, color: COLOR.ink, align: 'right' });
  const coinIcon = scene.art('icon_coin', 930, 46, 34);
  const repIcon = scene.art('icon_rep', 1132, 46, 34);

  const refresh = () => {
    const day = state.day;
    const total = state.orders.filter((o) => o.day === day).length;
    const done = state.orders.filter((o, i) => o.day === day && i < state.orderIndex).length;
    const current = Math.min(done + 1, total);
    order.setText(`第 ${day} 天　第 ${current} / ${total} 单`);
    coins.setText(`${state.coins} 文`);
    rep.setText(`${state.reputation} / ${config.game.maxReputation}`);
  };
  refresh();
  return { refresh, order, coins, rep, coinIcon, repIcon };
}

/** 品质徽章：徽章图 + 名字，居中放在 (x, y)。 */
export function addBadge(scene: BaseScene, grade: Grade, x: number, y: number, scale = 1) {
  const badge = scene.art(GRADE_BADGE[grade], x, y, 76 * scale);
  const name = addText(scene, x, y + 52 * scale, GRADE_NAME[grade], {
    size: Math.round(22 * scale),
    weight: 700,
    align: 'center',
    color: grade === 'legend' ? '#b8862b' : grade === 'scrap' ? COLOR.gray : COLOR.ink,
  });
  return { badge, name };
}

/** 一条会往上飘、淡出的提示字。 */
export function popText(scene: BaseScene, x: number, y: number, text: string, color = COLOR.orange, size = 34) {
  const t = addText(scene, x, y, text, { size, weight: 700, align: 'center', color, stroke: '#3a2416' });
  t.setDepth(50);
  scene.tweens.add({ targets: t, y: y - 70, alpha: 0, duration: 800, ease: 'Quad.out', onComplete: () => t.destroy() });
  return t;
}

export const VERDICT_TEXT = { perfect: '完美！', good: '不错', miss: '偏了' } as const;
export const VERDICT_COLOR = { perfect: '#3f8f5f', good: '#c8862f', miss: '#9a8a78' } as const;


/** 交付弹层：成色、报酬、口碑，一个「继续」按钮。三种玩法共用。 */
export function showDelivery(scene: BaseScene, delivery: Delivery, finished: boolean, onNext: () => void) {
  const state = scene.ctx.game;
  const order = state.orders[state.orderIndex - 1];
  const timedOut = !finished;

  scene.add.rectangle(640, 360, 1280, 720, 0x1b1714, 0.62).setDepth(40);
  panel(scene, 640, 340, 780, 440, 0.97).setDepth(41);

  if (order) scene.art(order.item, 398, 296, 132).setDepth(42);
  const badge = addBadge(scene, delivery.grade, 706, 252, 1.05);
  badge.badge.setDepth(42);
  badge.name.setDepth(42);

  addText(scene, 706, 374, timedOut ? '顾客等不及，走了' : `交出「${order?.itemName ?? '器物'}」`, {
    size: 28, weight: 700, align: 'center', color: timedOut ? COLOR.gray : COLOR.ink,
  }).setDepth(42);
  addText(scene, 706, 420, timedOut ? '这一单没做成' : `报酬 +${delivery.coins} 文`, {
    size: 26, align: 'center', color: timedOut ? COLOR.gray : COLOR.ink,
  }).setDepth(42);
  addText(scene, 706, 458, `口碑 ${delivery.rep >= 0 ? '+' : ''}${delivery.rep}`, {
    size: 26, align: 'center', color: delivery.rep >= 0 ? '#3f8f5f' : '#b4472e',
  }).setDepth(42);

  // 空格和点击都算「继续」，但只放行一次，免得一下跳两个场景
  let closed = false;
  const go = () => {
    if (closed) return;
    closed = true;
    onNext();
  };

  const skin = scene.add.image(640, 522, 'btn_primary').setDisplaySize(320, 76).setDepth(42);
  addText(scene, 640, 520, '继续（空格）', { size: 24, weight: 700, align: 'center', color: COLOR.cream, stroke: '#a4521f' }).setDepth(43);
  skin.setInteractive({ useHandCursor: true }).on('pointerdown', go);
  scene.onKey((event) => {
    if (event.code === 'Space') go();
  });

  if (delivery.grade === 'legend') scene.sfx('sfx_deliver', { volume: 0.9 });
  else if (timedOut || delivery.grade === 'scrap') scene.sfx('sfx_scrap', { volume: 0.9 });
  else scene.sfx('sfx_coin', { volume: 0.9 });
}
