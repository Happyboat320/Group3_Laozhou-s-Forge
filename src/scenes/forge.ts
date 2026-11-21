// 打造：火候 → 三锤 → 淬火，绿区里按空格。
// 判定决定"手艺分"，材料决定天花板——手艺再好也打不过材料的上限。
import Phaser from 'phaser';
import { startBgm } from '../audio/bgm';
import type { Config } from '../config';
import { craftScore, gradeName, materialCap, orderAt, settle, type Delivery, type Order } from '../core/game';
import type { GameState } from '../core/game';
import { BaseScene } from '../engine/scenes';
import { COLOR, addText, hex } from '../engine/ui';

type Phase = 'heat' | 'hit' | 'quench' | 'result';
type Verdict = 'perfect' | 'good' | 'miss';

const GAUGE = { x: 640, y: 648, halfWidth: 320 };

export class ForgeScene extends BaseScene {
  private phase: Phase = 'heat';
  private t = 0;
  private pos = 0;
  private strikes = 0;
  private verdicts: Verdict[] = [];
  private heatVerdict: Verdict = 'miss';
  private quenchVerdict: Verdict = 'miss';
  private busy = false;
  private settled = false;
  private delivery: Delivery | null = null;
  private order!: Order;

  private marker!: Phaser.GameObjects.Rectangle;
  private zones!: Phaser.GameObjects.Graphics;
  private phaseLabel!: Phaser.GameObjects.Text;
  private tipLabel!: Phaser.GameObjects.Text;
  private iron!: Phaser.GameObjects.Image;
  private hammer!: Phaser.GameObjects.Image;
  private bucket!: Phaser.GameObjects.Image;

  constructor() {
    super('forge');
  }

  create() {
    const { game, config } = this.ctx;
    const order = orderAt(game);
    if (!order) {
      this.ctx.go('result');
      return;
    }
    this.order = order;

    this.phase = 'heat';
    this.t = 0;
    this.pos = 0;
    this.strikes = 0;
    this.verdicts = [];
    this.heatVerdict = 'miss';
    this.quenchVerdict = 'miss';
    this.busy = false;
    this.settled = false;
    this.delivery = null;

    startBgm(this, 0.4);
    this.background('bg_forge');
    this.add.rectangle(640, 360, 1280, 720, 0x1a120c, 0.2);
    this.drawHud(game, order, config);

    this.art('tool_furnace_hot', 150, 530, 250);
    this.art('anvil', 612, 480, 300);
    this.iron = this.art('iron_dark', 612, 374, 145);
    this.hammer = this.art('hammer_big', 706, 286, 158).setAngle(-36).setVisible(false);
    this.bucket = this.art('tool_quench_bucket', 884, 566, 152).setVisible(false);

    this.add.image(GAUGE.x, GAUGE.y, 'bar_track').setDisplaySize(GAUGE.halfWidth * 2 + 16, 48);
    this.zones = this.add.graphics();
    this.marker = this.add.rectangle(GAUGE.x, GAUGE.y, 12, 66, 0xfff3d0).setStrokeStyle(3, 0x8a4416);

    this.phaseLabel = addText(this, 640, 600, '', { size: 30, weight: 700, align: 'center', color: COLOR.cream, stroke: '#2a1d14' });
    this.tipLabel = addText(this, 640, 700, '', { size: 19, align: 'center', color: COLOR.cream, stroke: '#2a1d14' });

    this.onKey((event) => {
      if (event.code === 'Space') this.press();
    });

    this.ctx.debug = () => ({
      scene: 'forge',
      order: order.id,
      phase: this.phase,
      pos: Math.round(this.pos * 100) / 100,
      strikes: this.strikes,
    });

    this.startPhase('heat');
  }

  private drawHud(game: GameState, order: Order, config: Config) {
    const mat = config.materials.find((m) => m.id === order.need)!;
    this.add.rectangle(640, 34, 1280, 68, 0x100c0a, 0.8).setOrigin(0.5, 0).setDepth(30);
    addText(this, 26, 34, `第 ${game.day} 天　打一件「${order.itemName}」`, { size: 21, weight: 700, color: COLOR.cream }).setDepth(31);
    addText(this, 620, 34, `材料 ${mat.name}　成色上限 ${Math.round(mat.cap * 100)}%`, { size: 19, color: '#ffd9a0' }).setDepth(31);
    addText(this, 1000, 34, `顾客要 ${gradeName(order.want)}`, { size: 19, color: COLOR.cream }).setDepth(31);
  }

  // ---- 阶段 --------------------------------------------------------------

  private startPhase(phase: 'heat' | 'hit' | 'quench') {
    this.phase = phase;
    this.t = 0;
    this.busy = false;
    const { config, game } = this.ctx;
    const d = config.forge.difficulty[Math.min(game.day, config.forge.difficulty.length) - 1];
    const win = d[phase];
    this.drawZones(win.perfect, win.good);

    if (phase === 'heat') {
      this.iron.setTexture('iron_orange');
      this.hammer.setVisible(false);
      this.bucket.setVisible(false);
      this.phaseLabel.setText('火候　把铁烧到火色正好');
      this.tipLabel.setText('指针进绿区时按 空格 夹出来');
    } else if (phase === 'hit') {
      this.iron.setTexture('iron_orange');
      this.hammer.setVisible(true).setAngle(-36).setPosition(706, 286);
      this.phaseLabel.setText(`锻打　第 ${this.strikes + 1} / ${config.forge.strikes} 锤`);
      this.tipLabel.setText('绿区里按 空格 落锤');
    } else {
      this.hammer.setVisible(false);
      this.bucket.setVisible(true);
      this.iron.setTexture('iron_white');
      this.phaseLabel.setText('淬火　一口气入水');
      this.tipLabel.setText('绿区里按 空格 入水');
    }
  }

  private press() {
    if (this.phase === 'result' || this.busy) return;
    const { config, game } = this.ctx;
    const d = config.forge.difficulty[Math.min(game.day, config.forge.difficulty.length) - 1];

    if (this.phase === 'heat') {
      this.heatVerdict = this.judge(d.heat.perfect, d.heat.good);
      this.react(this.heatVerdict, false);
      this.busy = true;
      this.time.delayedCall(500, () => this.startPhase('hit'));
      return;
    }
    if (this.phase === 'hit') {
      const verdict = this.judge(d.hit.perfect, d.hit.good);
      this.verdicts.push(verdict);
      this.strikes += 1;
      this.react(verdict, false);
      this.swing();
      this.busy = true;
      const done = this.strikes >= config.forge.strikes;
      this.time.delayedCall(done ? 540 : 380, () => this.startPhase(done ? 'quench' : 'hit'));
      return;
    }
    this.quenchVerdict = this.judge(d.quench.perfect, d.quench.good);
    this.react(this.quenchVerdict, true);
    this.busy = true;
    this.time.delayedCall(600, () => this.finish(true));
  }

  private judge(perfect: number, good: number): Verdict {
    const dist = Math.abs(this.pos);
    if (dist <= perfect) return 'perfect';
    if (dist <= good) return 'good';
    return 'miss';
  }

  private skillScore(): number {
    const { config } = this.ctx;
    const { weight, value } = config.forge;
    const hitAvg = this.verdicts.length
      ? this.verdicts.reduce((s, v) => s + value[v], 0) / this.verdicts.length
      : 0;
    return value[this.heatVerdict] * weight.heat + hitAvg * weight.hits + value[this.quenchVerdict] * weight.quench;
  }

  private finish(finished: boolean) {
    if (this.settled) return;
    this.settled = true;
    this.phase = 'result';
    const { config } = this.ctx;
    const skill = this.skillScore();
    const pieces = this.ctx.game.craft.length ? this.ctx.game.craft : [this.order.need];
    const score = finished ? craftScore(config, skill, pieces) : 0;
    this.delivery = settle(this.ctx.game, config, this.order, { score, finished }, pieces);
    this.ctx.save.writeRun(this.ctx.game);
    this.showResult(this.delivery, skill, score);
  }

  private next() {
    if (!this.delivery) return;
    this.ctx.go(this.ctx.game.endReason ? 'result' : 'shop');
  }

  // ---- 画面 --------------------------------------------------------------

  private drawZones(perfect: number, good: number) {
    const { x, y, halfWidth } = GAUGE;
    const px = (v: number) => x + v * halfWidth;
    this.zones.clear();
    this.zones.fillStyle(hex('#f2a54a'), 0.5);
    this.zones.fillRect(px(-good), y - 22, px(good) - px(-good), 44);
    this.zones.fillStyle(hex('#2f7a4f'), 0.78);
    this.zones.fillRect(px(-perfect), y - 22, px(perfect) - px(-perfect), 44);
    this.zones.lineStyle(2, hex('#fff3d0'), 0.5);
    this.zones.lineBetween(x, y - 26, x, y + 26);
  }

  private swing() {
    this.tweens.add({ targets: this.hammer, angle: 6, y: 340, duration: 95, yoyo: true, ease: 'Quad.in' });
    this.cameras.main.shake(90, 0.004);
  }

  private react(verdict: Verdict, isQuench: boolean) {
    const color = verdict === 'perfect' ? '#3f8f5f' : verdict === 'good' ? '#c8862f' : '#9a8a78';
    const word = verdict === 'perfect' ? '完美！' : verdict === 'good' ? '不错' : '偏了';
    const label = addText(this, isQuench ? 884 : 612, isQuench ? 430 : 300, word, {
      size: 30, weight: 700, align: 'center', color, stroke: '#3a2416',
    }).setDepth(40);
    this.tweens.add({ targets: label, y: label.y - 50, alpha: 0, duration: 700, onComplete: () => label.destroy() });

    if (!isQuench) {
      this.iron.setTexture(verdict === 'miss' ? 'iron_ouch' : 'iron_happy');
      this.time.delayedCall(320, () => {
        if (this.phase !== 'result') this.iron.setTexture(this.strikes > 0 ? 'iron_white' : 'iron_orange');
      });
    }

    const spark = this.art('fx_spark', this.iron.x + 20, this.iron.y, verdict === 'perfect' ? 130 : 90).setDepth(20);
    this.tweens.add({ targets: spark, alpha: 0, scale: spark.scale * 1.7, duration: 360, onComplete: () => spark.destroy() });

    if (verdict === 'perfect') {
      const flash = this.add.rectangle(640, 360, 1280, 720, 0xfff3d0, 0.28).setDepth(15);
      this.tweens.add({ targets: flash, alpha: 0, duration: 220, onComplete: () => flash.destroy() });
    }
    if (this.phase === 'hit') this.sfx(verdict === 'perfect' ? 'sfx_hammer_heavy' : 'sfx_hammer_light', { volume: 0.9 });
    else if (isQuench) this.sfx('sfx_hiss', { volume: 0.6 });
    if (verdict === 'miss') this.sfx('sfx_miss', { volume: 0.7 });
  }

  private showResult(delivery: Delivery, skill: number, score: number) {
    this.add.rectangle(640, 360, 1280, 720, 0x1b1714, 0.62).setDepth(40);
    const g = this.add.graphics().setDepth(41);
    g.fillStyle(hex('#fff6dc'), 0.97);
    g.fillRoundedRect(250, 120, 780, 440, 16);
    g.lineStyle(3, hex('#e8893a'), 0.85);
    g.strokeRoundedRect(250, 120, 780, 440, 16);

    this.art(this.order.item, 398, 296, 132).setDepth(42);
    this.art(`badge_${delivery.grade}`, 706, 250, 84).setDepth(42);
    addText(this, 706, 316, gradeName(delivery.grade), { size: 26, weight: 700, align: 'center', color: COLOR.ink }).setDepth(42);

    addText(this, 706, 366, `手艺 ${Math.round(skill * 100)}%　材料上限 ${Math.round(score / Math.max(0.01, skill) * 100)}%`, {
      size: 19, align: 'center', color: COLOR.gray,
    }).setDepth(42);
    addText(this, 706, 408, delivery.coins === 0 ? '这单没做成' : `报酬 +${delivery.coins} 文`, {
      size: 26, weight: 700, align: 'center', color: COLOR.ink,
    }).setDepth(42);
    addText(this, 706, 448, `口碑 ${delivery.rep >= 0 ? '+' : ''}${delivery.rep}`, {
      size: 24, align: 'center', color: delivery.rep >= 0 ? '#3f8f5f' : '#b4472e',
    }).setDepth(42);

    let closed = false;
    const go = () => {
      if (closed) return;
      closed = true;
      this.next();
    };
    const skin = this.add.image(640, 522, 'btn_primary').setDisplaySize(320, 76).setDepth(42);
    addText(this, 640, 520, '继续（空格）', { size: 24, weight: 700, align: 'center', color: COLOR.cream, stroke: '#a4521f' }).setDepth(43);
    skin.setInteractive({ useHandCursor: true }).on('pointerdown', go);
    this.onKey((e) => {
      if (e.code === 'Space') go();
    });

    if (delivery.grade === 'legend') this.sfx('sfx_deliver', { volume: 0.9 });
    else if (delivery.grade === 'scrap') this.sfx('sfx_scrap', { volume: 0.9 });
    else this.sfx('sfx_coin', { volume: 0.9 });
  }

  update(_time: number, delta: number) {
    const phase = this.phase;
    if (phase !== 'heat' && phase !== 'hit' && phase !== 'quench') return;
    if (this.busy) {
      this.marker.x = GAUGE.x + this.pos * GAUGE.halfWidth;
      return;
    }
    const dt = delta / 1000;
    this.t += dt;
    this.pos = triangle(this.t * this.ctx.config.forge.speed[phase]);
    this.marker.x = GAUGE.x + this.pos * GAUGE.halfWidth;
  }
}

function triangle(u: number): number {
  const p = u - Math.floor(u);
  return p < 0.5 ? -1 + p * 4 : 3 - p * 4;
}
