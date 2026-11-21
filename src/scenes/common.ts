// 各场景共用的小界面：面板、金币条、品质星级、飘字、返回按钮。
import type { Config } from '../config';
import { QUALITY_COLOR, QUALITY_NAME, qualityRank, type Quality } from '../core/drop';
import type { GameState } from '../core/game';
import type { BaseScene } from '../engine/scenes';
import { COLOR, addText, hex } from '../engine/ui';

export const INK = COLOR.ink;
export const CREAM = COLOR.cream;

/** 圆角底板。 */
export function panel(scene: BaseScene, x: number, y: number, w: number, h: number, alpha = 0.9, color = '#fff6dc') {
  const g = scene.add.graphics();
  g.fillStyle(hex(color), alpha);
  g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 16);
  g.lineStyle(3, hex('#e8893a'), 0.85);
  g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 16);
  return g;
}

/** 顶部金币条，返回带 refresh 的对象。 */
export function addCoins(scene: BaseScene, state: GameState) {
  panel(scene, 1116, 46, 220, 56, 0.88);
  scene.art('icon_coin', 1032, 46, 34);
  const text = addText(scene, 1150, 46, '', { size: 24, weight: 700, align: 'center', color: COLOR.ink });
  const refresh = () => text.setText(`${state.progress.coins} 文`);
  refresh();
  return { refresh, text };
}

/** 品质星级：1~5 颗星 + 品质名，居中放在 (x, y)。 */
export function addQuality(scene: BaseScene, quality: Quality, x: number, y: number, scale = 1) {
  const rank = qualityRank(quality);
  const gap = 34 * scale;
  const startX = x - (4 * gap) / 2;
  for (let i = 0; i < 5; i += 1) {
    scene.art(i < rank ? 'icon_star' : 'icon_star_empty', startX + i * gap, y, 30 * scale);
  }
  return addText(scene, x, y + 40 * scale, QUALITY_NAME[quality], {
    size: Math.round(26 * scale),
    weight: 700,
    align: 'center',
    color: QUALITY_COLOR[quality],
  });
}

/** 一条会往上飘、淡出的提示字。 */
export function popText(scene: BaseScene, x: number, y: number, text: string, color = COLOR.orange, size = 34) {
  const t = addText(scene, x, y, text, { size, weight: 700, align: 'center', color, stroke: '#3a2416' });
  t.setDepth(50);
  scene.tweens.add({ targets: t, y: y - 70, alpha: 0, duration: 800, ease: 'Quad.out', onComplete: () => t.destroy() });
  return t;
}

/** 左下角返回按钮（Esc 也能触发）。 */
export function backButton(scene: BaseScene, label: string, onBack: () => void) {
  scene.button({ x: 150, y: 672, label, key: 'Escape', style: 'secondary', w: 220, h: 56, size: 20, onClick: onBack });
}

/** 品质卖出价的显示。 */
export function sellLabel(config: Config, quality: Quality): string {
  return `卖出 +${config.drop.sell[quality]} 文`;
}
