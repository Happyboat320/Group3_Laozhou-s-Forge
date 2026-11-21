// 选玩法：三种打法用同一间铺子、同一套接单与交付，只有「打造」环节不同。
import { startBgm } from '../audio/bgm';
import { newGame } from '../core/game';
import { MODES, type Mode, type ModeInfo } from '../core/modes';
import { BaseScene } from '../engine/scenes';
import { COLOR, addText, hex } from '../engine/ui';

const CARD_W = 344;
const CARD_H = 452;
const GAP = 26;

export class ModeScene extends BaseScene {
  constructor() {
    super('mode');
  }

  create() {
    startBgm(this, 0.5);
    this.background('bg_title');
    this.add.rectangle(640, 360, 1280, 720, 0x2a1d14, 0.42);

    addText(this, 640, 74, '选一种打法', { size: 46, weight: 700, align: 'center', color: '#fff6dc', stroke: '#5a3220' });
    addText(this, 640, 120, '同一间铺子、一样的接单和交付，只有「打造」不一样。三天六单，看口碑。', {
      size: 19, align: 'center', color: '#fff6dc', stroke: '#5a3220',
    });

    const total = MODES.length * CARD_W + (MODES.length - 1) * GAP;
    const startX = 640 - total / 2 + CARD_W / 2;
    MODES.forEach((mode, i) => this.card(mode, startX + i * (CARD_W + GAP), i));

    addText(this, 640, 686, '按 1 / 2 / 3 选，也可以点卡片　　Esc 回封面', {
      size: 18, align: 'center', color: COLOR.cream, stroke: '#2a1d14',
    });

    this.onKey((event) => {
      const hit = MODES.find((m) => m.key === event.code);
      if (hit) this.pick(hit.id);
      // 空格等于选第一种，这样截图自检那种「一路按空格」的脚本也能走完
      if (event.code === 'Space') this.pick(MODES[0].id);
      if (event.code === 'Escape') this.ctx.go('title');
    });

    this.ctx.debug = () => ({ scene: 'mode', modes: MODES.map((m) => m.id) });
  }

  private card(mode: ModeInfo, x: number, index: number) {
    const bg = this.add.graphics();
    bg.fillStyle(hex('#fff6dc'), 0.95);
    bg.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 18);
    bg.lineStyle(3, hex('#e8893a'), 0.85);
    bg.strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 18);

    const icon = this.art(mode.icon, 0, -150, mode.id === 'heat' ? 110 : 104);
    const name = addText(this, 0, -76, mode.name, { size: 30, weight: 700, align: 'center', color: COLOR.ink });
    const tagline = addText(this, 0, -34, mode.tagline, {
      size: 17, align: 'center', color: COLOR.ink, wrap: 280,
    });
    const how = addText(this, 0, 30, mode.how.map((line) => `· ${line}`).join('\n'), {
      size: 15, align: 'center', color: COLOR.gray, wrap: 300,
    });
    const chip = this.add.graphics();
    chip.fillStyle(hex('#e8893a'), 1);
    chip.fillRoundedRect(-26, 176, 52, 40, 10);
    const keyText = addText(this, 0, 196, `${index + 1}`, { size: 22, weight: 700, align: 'center', color: COLOR.cream });

    const card = this.add.container(x, 396, [bg, icon, name, tagline, how, chip, keyText]);
    card.setSize(CARD_W, CARD_H).setInteractive({ useHandCursor: true });
    card.on('pointerover', () => this.tweens.add({ targets: card, scale: 1.03, duration: 120 }));
    card.on('pointerout', () => this.tweens.add({ targets: card, scale: 1, duration: 120 }));
    card.on('pointerdown', () => this.pick(mode.id));
  }

  private pick(mode: Mode) {
    this.ctx.game = newGame(this.ctx.config, mode);
    this.sfx('sfx_deliver', { volume: 0.7 });
    this.ctx.go('shop');
  }
}
