// 火候控制：你是一团炉火，在五条道上左右躲水珠和蒸汽，接住干柴和炭。
// 东西有大有小：越大分越高、掉得越快。撑满 30 秒，净得分折算成成色。
import Phaser from 'phaser';
import { startBgm } from '../audio/bgm';
import { currentOrder, nextScene, settle, type Delivery } from '../core/game';
import { heatScore } from '../core/modes';
import { BaseScene } from '../engine/scenes';
import { COLOR, addText, hex } from '../engine/ui';
import { addHud, popText, showDelivery } from './common';

type DropKind = 'water' | 'steam' | 'wood' | 'charcoal';

interface Drop {
  lane: number;
  kind: DropKind;
  /** 1~5，越大分越高、掉得越快、画得越大 */
  size: number;
  points: number;
  sprite: Phaser.GameObjects.Image;
}

const KIND_ASSET: Record<DropKind, string> = {
  water: 'fx_splash',
  steam: 'fx_steam',
  wood: 'mat_wood',
  charcoal: 'mat_charcoal',
};

/** 干柴 +1~+5，木炭 +6~+10；水珠 -1~-5，蒸汽 -6~-10。 */
function pointsOf(kind: DropKind, size: number): number {
  const big = kind === 'charcoal' || kind === 'steam';
  return (big ? 5 + size : size) * (kind === 'water' || kind === 'steam' ? -1 : 1);
}

export class HeatScene extends BaseScene {
  private drops: Drop[] = [];
  private lane = 2;
  private points = 0;
  private heat = 70;
  private elapsed = 0;
  private spawnIn = 0.2;
  private patience = 0;
  private patienceMax = 1;
  private finished = false;
  private delivery: Delivery | null = null;

  private flame!: Phaser.GameObjects.Container;
  private heatBar!: Phaser.GameObjects.Rectangle;
  private scoreText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private laneHint!: Phaser.GameObjects.Graphics;

  private readonly playerY = 600;

  constructor() {
    super('heat');
  }

  create() {
    const { game, config } = this.ctx;
    const order = currentOrder(game);
    if (!order) {
      this.ctx.go('result');
      return;
    }

    this.drops = [];
    this.lane = 2;
    this.points = 0;
    this.heat = config.modes.heat.heat0;
    this.elapsed = 0;
    this.spawnIn = 0.3;
    this.patience = order.patience;
    this.patienceMax = order.patience;
    this.finished = false;
    this.delivery = null;

    startBgm(this, 0.5);
    this.background('bg_forge');
    this.add.rectangle(640, 360, 1280, 720, 0x1a120c, 0.2);
    addHud(this, game, config);

    this.drawLanes();
    this.drawFlame();
    this.drawGauges();

    this.onKey((event) => {
      if (event.code === 'ArrowLeft' || event.code === 'KeyA') this.move(-1);
      if (event.code === 'ArrowRight' || event.code === 'KeyD') this.move(1);
    });

    this.ctx.debug = () => ({
      scene: 'heat',
      mode: 'heat',
      lane: this.lane,
      points: this.points,
      heat: Math.round(this.heat),
      left: Math.round((config.modes.heat.duration - this.elapsed) * 10) / 10,
      done: this.finished,
      drops: this.drops.map((d) => ({ lane: d.lane, y: Math.round(d.sprite.y), bad: d.points < 0, points: d.points })),
    });
  }

  // ---- 画面 --------------------------------------------------------------

  private laneX(lane: number) {
    const { laneGap } = this.ctx.config.modes.heat;
    return 640 + (lane - 2) * laneGap;
  }

  private drawLanes() {
    const { lanes, laneGap, duration } = this.ctx.config.modes.heat;
    const left = 640 - (lanes * laneGap) / 2;
    const top = 152;
    const bottom = 664;

    this.add.rectangle(640, (top + bottom) / 2, lanes * laneGap, bottom - top, 0x2a1d14, 0.26);
    for (let i = 0; i <= lanes; i += 1) {
      this.add.rectangle(left + i * laneGap, (top + bottom) / 2, 3, bottom - top, 0xffffff, 0.16);
    }
    this.add.rectangle(640, bottom, lanes * laneGap, 4, hex('#fff3d0'), 0.35);

    addText(this, 640, 168, '躲开冷水，接住柴和炭：越大分越高', { size: 19, align: 'center', color: COLOR.cream, stroke: '#2a1d14' });
    addText(this, 640, 700, `撑住 ${duration} 秒　← → 换道`, {
      size: 18, align: 'center', color: COLOR.cream, stroke: '#2a1d14',
    });

    this.laneHint = this.add.graphics();
  }

  private drawFlame() {
    const glow = this.art('fx_glow', 0, 0, 114).setAlpha(0.28);
    const core = this.art('char_forge_flame', 0, 0, 86);
    this.flame = this.add.container(this.laneX(this.lane), this.playerY, [glow, core]).setDepth(10);
    this.tweens.add({ targets: this.flame, scale: 1.06, duration: 420, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  }

  private drawGauges() {
    this.scoreText = addText(this, 30, 98, '', { size: 22, weight: 700, color: COLOR.cream, stroke: '#2a1d14' });
    addText(this, 206, 98, '炉温', { size: 15, align: 'right', color: COLOR.cream, stroke: '#2a1d14' });
    this.add.image(620, 98, 'bar_track').setDisplaySize(800, 22);
    this.heatBar = this.add.rectangle(224, 98, 792, 13, hex('#e8893a')).setOrigin(0, 0.5);
    this.timeText = addText(this, 1250, 98, '', { size: 18, align: 'right', color: COLOR.cream, stroke: '#2a1d14' });
  }

  // ---- 操作 --------------------------------------------------------------

  private move(direction: number) {
    if (this.finished) return;
    const next = Phaser.Math.Clamp(this.lane + direction, 0, this.ctx.config.modes.heat.lanes - 1);
    if (next === this.lane) return;
    this.lane = next;
    this.tweens.add({ targets: this.flame, x: this.laneX(this.lane), duration: 95, ease: 'Quad.out' });
    this.sfx('sfx_click', { volume: 0.35 });
  }

  // ---- 掉落物 ------------------------------------------------------------

  private spawnOne(kind: DropKind, lane: number, size: number) {
    const cfg = this.ctx.config.modes.heat;
    const width = cfg.sizeWidth.base + cfg.sizeWidth.per * size;
    const sprite = this.art(KIND_ASSET[kind], this.laneX(lane), 136, width).setDepth(6);
    this.drops.push({ lane, kind, size, points: pointsOf(kind, size), sprite });
  }

  private spawn() {
    const cfg = this.ctx.config.modes.heat;
    if (this.drops.length > 34) return;

    const roll = Math.random();
    const kind: DropKind = roll < 0.34 ? 'water' : roll < 0.5 ? 'steam' : roll < 0.82 ? 'wood' : 'charcoal';

    const lanes = Array.from({ length: cfg.lanes }, (_, i) => i);
    const count = Math.random() < cfg.multiChance.three ? 3 : Math.random() < cfg.multiChance.two ? 2 : 1;

    for (let i = 0; i < count && lanes.length; i += 1) {
      const pick = Math.floor(Math.random() * lanes.length);
      const lane = lanes.splice(pick, 1)[0];
      const size = 1 + Math.floor(Math.random() * 5);
      this.spawnOne(kind, lane, size);
    }
  }

  private hit(drop: Drop) {
    const cfg = this.ctx.config.modes.heat;
    this.points += drop.points;
    this.heat = Phaser.Math.Clamp(this.heat + (drop.points > 0 ? drop.points * cfg.goodHeat : drop.points * cfg.badHeat), 0, 100);

    const bad = drop.points < 0;
    popText(this, this.flame.x, this.playerY - 90, `${drop.points > 0 ? '+' : ''}${drop.points}`, bad ? '#4a7fa5' : '#3f8f5f', 30);
    this.sfx(bad ? 'sfx_hiss' : 'sfx_coin', { volume: 0.55 });
    if (bad && drop.size >= 4) this.cameras.main.shake(110, 0.004);

    const p = this.art(bad ? 'fx_steam' : 'fx_spark', drop.sprite.x, this.playerY - 20, 90).setDepth(12);
    this.tweens.add({ targets: p, alpha: 0, y: this.playerY - 90, duration: 420, onComplete: () => p.destroy() });
  }

  // ---- 每帧 --------------------------------------------------------------

  update(_time: number, delta: number) {
    if (this.finished) return;
    const cfg = this.ctx.config.modes.heat;
    const dt = delta / 1000;
    this.elapsed += dt;
    this.patience -= dt;
    this.heat = Math.max(0, this.heat - cfg.decay * dt);

    this.spawnIn -= dt;
    if (this.spawnIn <= 0) {
      this.spawnIn = cfg.spawnEvery * (0.75 + Math.random() * 0.5);
      this.spawn();
    }

    for (let i = this.drops.length - 1; i >= 0; i -= 1) {
      const drop = this.drops[i];
      const speed = cfg.fallSpeed * (cfg.sizeSpeed.base + cfg.sizeSpeed.per * drop.size);
      drop.sprite.y += speed * dt;
      if (drop.sprite.y >= this.playerY - 26 && drop.sprite.y <= this.playerY + 44 && drop.lane === this.lane) {
        this.hit(drop);
        drop.sprite.destroy();
        this.drops.splice(i, 1);
        continue;
      }
      if (drop.sprite.y > 720) {
        drop.sprite.destroy();
        this.drops.splice(i, 1);
      }
    }

    this.heatBar.width = 792 * (this.heat / 100);
    this.heatBar.fillColor = this.heat > 55 ? hex('#3f8f5f') : this.heat > 25 ? hex('#e8893a') : hex('#b4472e');
    this.scoreText.setText(`得分 ${this.points}`);
    this.timeText.setText(`还剩 ${Math.max(0, cfg.duration - this.elapsed).toFixed(1)} 秒`);

    this.laneHint.clear();
    this.laneHint.fillStyle(hex('#ffd9a0'), 0.12);
    this.laneHint.fillRect(this.laneX(this.lane) - cfg.laneGap / 2, 152, cfg.laneGap, 512);

    if (this.heat <= 0 || this.patience <= 0) {
      this.finish(false);
      return;
    }
    if (this.elapsed >= cfg.duration) this.finish(true);
  }

  private finish(finished: boolean) {
    if (this.finished) return;
    this.finished = true;
    const score = finished ? heatScore(this.ctx.config, this.points) : 0;
    this.delivery = settle(this.ctx.game, this.ctx.config, { score, finished });
    this.ctx.save.writeRun(this.ctx.game);
    showDelivery(this, this.delivery, finished, () => this.next());
  }

  private next() {
    if (!this.delivery) return;
    this.ctx.go(nextScene(this.ctx.game, this.delivery));
  }
}
