// 接单：顾客上门，说清要什么、缺哪档材料、要几份。
// 材料够就直接配比开炉，不够就得先下窟；配比越舍得，成色上限越高。
import { startBgm } from '../audio/bgm';
import {
  canCraft,
  gradeName,
  materialCap,
  materialRank,
  orderAt,
  type GameState,
  type MaterialId,
  type Order,
} from '../core/game';
import { BaseScene } from '../engine/scenes';
import { COLOR, addText, hex } from '../engine/ui';

const ROWS = [0, 1, 2];

export class ShopScene extends BaseScene {
  private order!: Order;
  private picker!: Phaser.GameObjects.Container;
  private hint!: Phaser.GameObjects.Text;
  private playButton!: Phaser.GameObjects.Container;
  private pickerTexts: Phaser.GameObjects.Text[] = [];

  constructor() {
    super('shop');
  }

  create() {
    const { game, config } = this.ctx;
    startBgm(this, 0.4);

    const order = orderAt(game);
    if (!order) {
      this.ctx.go('result');
      return;
    }
    this.order = order;
    this.pickerTexts = [];

    // 默认配比：刚好满足要求
    const affordable = (game.materials[order.need] ?? 0) >= order.needCount;
    game.craft = affordable ? (Array(order.needCount).fill(order.need) as MaterialId[]) : [];

    this.background('bg_shop');
    this.add.rectangle(640, 360, 1280, 720, 0x2a1d14, 0.16);
    this.drawHud(game);
    this.drawCustomer(order);
    this.drawOrderCard(order, game);
    this.drawPicker(game);

    this.button({
      x: 400,
      y: 664,
      label: '开炉打造（空格）',
      key: 'Space',
      w: 320,
      h: 78,
      onClick: () => this.goForge(),
    });
    this.playButton = this.button({
      x: 780,
      y: 664,
      label: '下窟取料（D）',
      key: 'KeyD',
      style: 'secondary',
      w: 300,
      h: 78,
      onClick: () => this.ctx.go('delve'),
    });

    this.ctx.debug = () => ({
      scene: 'shop',
      day: game.day,
      order: order.id,
      item: order.itemName,
      need: order.need,
      needCount: order.needCount,
      craft: game.craft,
      cap: Math.round(materialCap(config, game.craft) * 100),
      can: canCraft(game, config, order, game.craft),
      materials: game.materials,
      hp: game.hp,
    });
  }

  private goForge() {
    const { game, config } = this.ctx;
    if (!canCraft(game, config, this.order, game.craft)) return;
    this.ctx.go('forge');
  }

  // ---- 顶部 --------------------------------------------------------------

  private drawHud(game: GameState) {
    const { config } = this.ctx;
    this.add.rectangle(640, 34, 1280, 68, 0x100c0a, 0.8).setOrigin(0.5, 0).setDepth(30);
    addText(this, 26, 34, `第 ${game.day} 天　第 ${game.history.length + 1} / ${game.orders.length} 单`, {
      size: 21, weight: 700, color: COLOR.cream,
    }).setDepth(31);
    addText(this, 560, 34, `血 ${game.hp}`, { size: 19, color: COLOR.cream }).setDepth(31);
    addText(this, 700, 34, `金币 ${game.coins}`, { size: 19, color: COLOR.cream }).setDepth(31);
    addText(this, 880, 34, `口碑 ${game.reputation} / ${config.game.maxReputation}`, { size: 19, color: COLOR.cream }).setDepth(31);
    const inv = config.materials.map((m) => `${m.name} ${game.materials[m.id] ?? 0}`).join('　');
    addText(this, 1180, 34, inv, { size: 17, align: 'right', color: '#ffd9a0' }).setDepth(31);
  }

  private drawCustomer(order: Order) {
    const folk = this.art(`${order.customer}_neutral`, 150, 650, 190).setOrigin(0.5, 1);
    const scaleY = folk.scaleY;
    this.tweens.add({ targets: folk, scaleY: scaleY * 1.02, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    this.add.image(520, 290, 'bubble_speech').setDisplaySize(520, 176).setAlpha(0.96);
    this.add.triangle(300, 372, 0, 0, 40, 0, 0, 36, hex('#fdf7ea')).setAlpha(0.96);
    addText(this, 520, 252, `${order.customerName}：`, { size: 21, weight: 700, align: 'center', color: COLOR.orange });
    addText(this, 520, 288, `一件${order.itemName}，成色要${gradeName(order.want)}。料你出，${this.materialName(order.need)}至少 ${order.needCount} 份。`, {
      size: 21, align: 'center', color: COLOR.ink, wrap: 400,
    });
  }

  private materialName(id: string) {
    return this.ctx.config.materials.find((m) => m.id === id)?.name ?? id;
  }

  private drawOrderCard(order: Order, game: GameState) {
    const g = this.add.graphics();
    g.fillStyle(hex('#fff6dc'), 0.94);
    g.fillRoundedRect(850, 150, 400, 380, 16);
    g.lineStyle(3, hex('#e8893a'), 0.85);
    g.strokeRoundedRect(850, 150, 400, 380, 16);

    addText(this, 1050, 180, '订　单', { size: 19, align: 'center', color: COLOR.gray, weight: 700 });
    this.art(order.item, 1050, 250, 116);
    addText(this, 1050, 328, order.itemName, { size: 28, weight: 700, align: 'center', color: COLOR.ink });

    this.art(`badge_${order.want}`, 930, 384, 54);
    addText(this, 968, 384, `要 ${gradeName(order.want)}`, { size: 21, weight: 700, color: COLOR.ink });

    const mat = this.ctx.config.materials.find((m) => m.id === order.need)!;
    this.art(mat.icon, 926, 432, 32);
    addText(this, 950, 432, `${mat.name} × ${order.needCount}（可用更高级）`, { size: 18, color: COLOR.ink });

    this.art('icon_coin', 926, 476, 28);
    addText(this, 950, 476, `${order.price} 文`, { size: 20, color: COLOR.ink });

    const have = game.materials[order.need] ?? 0;
    addText(this, 1050, 510, have >= order.needCount ? '料够了' : '料不够，得下窟', {
      size: 16, align: 'center', color: have >= order.needCount ? '#3f8f5f' : '#b4472e',
    });
  }

  // ---- 配比 --------------------------------------------------------------

  private drawPicker(game: GameState) {
    const g = this.add.graphics();
    g.fillStyle(hex('#fff6dc'), 0.93);
    g.fillRoundedRect(40, 386, 700, 230, 16);
    g.lineStyle(3, hex('#e8893a'), 0.7);
    g.strokeRoundedRect(40, 386, 700, 230, 16);

    addText(this, 64, 404, '这一炉投什么料（份数越多、料越好，成色上限越高）', { size: 17, color: COLOR.gray });

    for (const i of ROWS) {
      const mat = this.ctx.config.materials[i];
      const y = 452 + i * 46;
      this.art(mat.icon, 80, y, 34);
      this.button({
        x: 470,
        y,
        label: '−',
        w: 46,
        h: 42,
        size: 24,
        style: 'secondary',
        onClick: () => this.changeCraft(mat.id as MaterialId, -1),
      });
      this.button({
        x: 600,
        y,
        label: '+',
        w: 46,
        h: 42,
        size: 24,
        onClick: () => this.changeCraft(mat.id as MaterialId, 1),
      });
    }

    this.hint = addText(this, 64, 570, '', { size: 19, weight: 700, color: COLOR.ink });
    this.renderPicker(game);
  }

  /** 文字每次重画，数字永远不会停在旧值上。 */
  private renderPicker(game: GameState) {
    for (const t of this.pickerTexts) t.destroy();
    this.pickerTexts = [];

    this.ctx.config.materials.forEach((m, i) => {
      const y = 452 + i * 46;
      const selected = game.craft.filter((p) => p === m.id).length;
      const stock = game.materials[m.id] ?? 0;

      this.pickerTexts.push(
        addText(this, 108, y, m.name, { size: 19, weight: 700, color: COLOR.ink }),
        addText(this, 190, y, `库存 ${stock}`, { size: 17, weight: 700, color: stock > 0 ? '#3f8f5f' : '#b4472e' }),
        addText(this, 300, y, `上限 ${Math.round(m.cap * 100)}%`, { size: 15, color: COLOR.gray }),
        addText(this, 535, y, `${selected}`, {
          size: 28,
          weight: 700,
          align: 'center',
          color: selected > 0 ? COLOR.orange : COLOR.gray,
        }),
      );
    });

    this.updateHint();
  }

  private changeCraft(id: MaterialId, delta: number) {
    const { game, config } = this.ctx;
    const needRank = materialRank(config, this.order.need);

    if (delta > 0) {
      if (game.craft.length >= this.order.needCount + config.maxExtraPieces) return;
      if (materialRank(config, id) < needRank) return;
      const owned = game.materials[id] ?? 0;
      if (game.craft.filter((p) => p === id).length >= owned) return;
      game.craft.push(id);
    } else {
      const idx = game.craft.lastIndexOf(id);
      if (idx < 0) return;
      game.craft.splice(idx, 1);
    }

    this.renderPicker(game);
  }

  private updateHint() {
    const { game, config } = this.ctx;
    const total = game.craft.length;
    const cap = Math.round(materialCap(config, game.craft) * 100);
    const ok = canCraft(game, config, this.order, game.craft);
    this.hint.setColor(ok ? COLOR.ink : '#b4472e');
    this.hint.setText(
      `投入 ${total} 份（至少 ${this.order.needCount} 份，最多 ${this.order.needCount + config.maxExtraPieces} 份）　成色上限 ${cap}%${
        ok ? '' : '　—　材料不够'
      }`,
    );
  }
}
