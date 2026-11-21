// 装备库：打出来的装备都收在这里，可以按品质价卖出换金币（金币用来解锁歌曲）。
import { startBgm } from '../audio/bgm';
import { QUALITY_COLOR, QUALITY_NAME, sellValue } from '../core/drop';
import { sellEquipment } from '../core/economy';
import { BaseScene } from '../engine/scenes';
import { COLOR, addText } from '../engine/ui';
import { addCoins, backButton, panel, popText } from './common';

const COLS = 6;

export class InventoryScene extends BaseScene {
  constructor() {
    super('inventory');
  }

  create() {
    startBgm(this, 0.5);
    this.background('bg_warehouse');
    this.add.rectangle(640, 360, 1280, 720, 0x1a120c, 0.26);

    this.label(640, 52, '装备库', { size: 40, weight: 700, align: 'center', color: COLOR.cream, stroke: '#2a1d14' });
    const coins = addCoins(this, this.ctx.game);

    const inventory = this.ctx.game.progress.inventory;
    if (!inventory.length) {
      addText(this, 640, 340, '装备库还是空的\n去打几首歌锻点装备吧！', {
        size: 26, align: 'center', color: COLOR.cream, stroke: '#2a1d14',
      }).setOrigin(0.5);
    }

    inventory.forEach((item, index) => {
      const col = index % COLS;
      const row = Math.floor(index / COLS);
      const x = 178 + col * 188;
      const y = 172 + row * 218;
      panel(this, x, y, 172, 200, 0.94);
      this.art(item.type, x, y - 34, 104);
      this.label(x, y + 34, item.name, { size: 19, weight: 700, align: 'center' });
      this.label(x, y + 62, QUALITY_NAME[item.quality], {
        size: 17, align: 'center', color: QUALITY_COLOR[item.quality],
      });
      this.button({
        x, y: y + 108, label: `卖出 ${sellValue(this.ctx.config, item.quality)} 文`, w: 150, h: 44, size: 16, style: 'secondary',
        onClick: () => {
          const gained = sellEquipment(this.ctx.game.progress, this.ctx.config, item.id);
          if (gained > 0) {
            this.sfx('sfx_coin', { volume: 0.85 });
            popText(this, x, y + 40, `+${gained} 文`, '#c8862f', 26);
            this.ctx.save.writeRun(this.ctx.game);
            this.scene.restart();
            coins.refresh();
          }
        },
      });
    });

    backButton(this, '返回（Esc）', () => this.ctx.go('title'));
    this.ctx.debug = () => ({ scene: 'inventory', count: inventory.length, coins: this.ctx.game.progress.coins });
  }
}
