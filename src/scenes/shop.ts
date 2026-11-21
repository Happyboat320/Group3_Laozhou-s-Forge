// 接单：顾客站在台前，说清楚要什么；右边是订单卡，看完成色要求和报酬再决定接不接。
import { startBgm } from '../audio/bgm';
import { GRADE_NAME } from '../core/forge';
import { currentOrder, doneToday, totalToday, type GameState, type Order } from '../core/game';
import { BaseScene } from '../engine/scenes';
import { COLOR, addText, hex } from '../engine/ui';
import { addHud, panel } from './common';
import { modeInfo } from '../core/modes';

const CARD = { x: 1010, y: 360, w: 440, h: 450 };

export class ShopScene extends BaseScene {
  constructor() {
    super('shop');
  }

  create() {
    const { game, config } = this.ctx;
    startBgm(this, 0.5);

    const order = currentOrder(game);
    if (!order) {
      this.ctx.go('result');
      return;
    }

    this.background('bg_shop');
    this.add.rectangle(640, 360, 1280, 720, 0x2a1d14, 0.16);

    addHud(this, game, config);
    this.drawCustomer(order);
    this.drawOrderCard(order, game);
    this.showDayBanner(game);

    this.label(640, 700, `${modeInfo(game.mode).name}：${modeInfo(game.mode).tagline}`, {
      size: 19, align: 'center', color: COLOR.cream, stroke: '#2a1d14',
    });

    this.button({
      x: 640, y: 636, label: '接单（空格）', key: 'Space',
      onClick: () => this.ctx.go(modeInfo(game.mode).scene),
    });

    this.ctx.debug = () => ({
      scene: 'shop',
      mode: game.mode,
      day: game.day,
      order: order.id,
      item: order.itemName,
      want: GRADE_NAME[order.want],
    });
    this.ctx.save.writeRun(game);
  }

  private drawCustomer(order: Order) {
    const folk = this.art(`${order.customer}_neutral`, 250, 668, 226).setOrigin(0.5, 1);
    const scaleY = folk.scaleY;
    this.tweens.add({
      targets: folk, scaleY: scaleY * 1.02, duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.inOut',
    });

    this.add.image(576, 300, 'bubble_speech').setDisplaySize(560, 200).setAlpha(0.96);
    this.add.triangle(338, 396, 0, 0, 44, 0, 0, 40, hex('#fdf7ea')).setAlpha(0.96);
    addText(this, 576, 258, `${order.customerName}：`, { size: 22, weight: 700, align: 'center', color: COLOR.orange });
    addText(this, 576, 296, order.line, { size: 26, align: 'center', color: COLOR.ink, wrap: 440 });
  }

  private drawOrderCard(order: Order, game: GameState) {
    panel(this, CARD.x, CARD.y, CARD.w, CARD.h, 0.94);
    addText(this, CARD.x, 168, '订　单', { size: 20, align: 'center', color: COLOR.gray, weight: 700 });

    this.art(order.item, CARD.x, 246, 140);
    addText(this, CARD.x, 332, order.itemName, { size: 32, weight: 700, align: 'center', color: COLOR.ink });

    this.art(`badge_${order.want}`, 884, 400, 62);
    addText(this, 928, 400, `要 ${GRADE_NAME[order.want]}`, { size: 24, weight: 700, color: COLOR.ink });

    this.art('icon_coin', 878, 454, 30);
    this.label(902, 454, `${order.price} 文`, { size: 24, weight: 700, color: COLOR.ink });
    this.art('icon_clock', 878, 496, 28);
    this.label(902, 496, `${order.patience} 秒`, { size: 20, color: COLOR.ink });
    this.label(878, 534, '超时算跑单', { size: 16, color: COLOR.gray });

    this.label(CARD.x, 560, `今天共 ${totalToday(game)} 单，这是第 ${doneToday(game) + 1} 单`, {
      size: 16, align: 'center', color: COLOR.gray,
    });
  }

  private showDayBanner(game: GameState) {
    if (doneToday(game) !== 0) return;
    const banner = addText(this, 640, 116, `第 ${game.day} 天`, {
      size: 40, weight: 700, align: 'center', color: '#fff6dc', stroke: '#7a3d16',
    }).setDepth(30);
    banner.setAlpha(0);
    this.tweens.add({ targets: banner, alpha: 1, duration: 240 });
    this.tweens.add({ targets: banner, alpha: 0, delay: 1000, duration: 400, onComplete: () => banner.destroy() });
  }
}
