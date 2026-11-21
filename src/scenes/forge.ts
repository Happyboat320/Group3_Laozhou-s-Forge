// 打造：一炉一砧一桶水。火候、三锤、淬火，三次都在绿区按空格，出手的准头决定这一单值多少钱。
import Phaser from 'phaser';
import { startBgm } from '../audio/bgm';
import { GRADE_NAME, difficultyFor, judge, qualityOf, type ForgeResult, type Grade, type Verdict } from '../core/forge';
import { currentOrder, nextScene, settle, type Delivery } from '../core/game';
import { modeInstructions } from '../core/modes';
import { BaseScene } from '../engine/scenes';
import { COLOR, addText, hex } from '../engine/ui';
import { VERDICT_COLOR, VERDICT_TEXT, addHud, panel, popText, showDelivery } from './common';

type Phase = 'hint' | 'heat' | 'hit' | 'quench' | 'result';
type ActivePhase = Exclude<Phase, 'hint' | 'result'>;

const GAUGE = { x: 640, y: 648, halfWidth: 320 };
const PATIENCE = { x: 120, y: 104, width: 320 };

export class ForgeScene extends BaseScene {
  private phase: Phase = 'hint';
  /** 当前阶段的计时（秒），指针位置由它算出来。 */
  private t = 0;
  /** 指针位置：-1 最左，0 正中，1 最右。 */
  private pos = 0;
  private patience = 0;
  private strikes = 0;
  private heatVerdict: Verdict = 'miss';
  private hitVerdicts: Verdict[] = [];
  private quenchVerdict: Verdict = 'miss';
  /** 正在播反馈动画，这段时间不接新输入，也不扣耐心。 */
  private busy = false;
  private settled = false;
  private delivery: Delivery | null = null;

  private marker!: Phaser.GameObjects.Rectangle;
  private zones!: Phaser.GameObjects.Graphics;
  private patienceBar!: Phaser.GameObjects.Rectangle;
  private phaseLabel!: Phaser.GameObjects.Text;
  private tipLabel!: Phaser.GameObjects.Text;
  private iron!: Phaser.GameObjects.Image;
  private hammer!: Phaser.GameObjects.Image;
  private bucket!: Phaser.GameObjects.Image;
  private furnace!: Phaser.GameObjects.Image;
  private hintObjects: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super('forge');
  }

  create() {
    const { game, config } = this.ctx;
    const order = currentOrder(game);
    if (!order) {
      this.ctx.go('result');
      return;
    }

    this.phase = 'hint';
    this.t = 0;
    this.pos = 0;
    this.patience = order.patience;
    this.strikes = 0;
    this.heatVerdict = 'miss';
    this.hitVerdicts = [];
    this.quenchVerdict = 'miss';
    this.busy = false;
    this.settled = false;
    this.delivery = null;
    this.hintObjects = [];

    startBgm(this, 0.5);
    this.background('bg_forge');
    this.add.rectangle(640, 360, 1280, 720, 0x1a120c, 0.2);

    addHud(this, game, config);
    this.drawOrderPlate(order.item, order.itemName, order.want);

    this.furnace = this.art('tool_furnace_hot', 150, 530, 250);
    this.art('anvil', 612, 480, 300);
    this.iron = this.art('iron_dark', 612, 374, 145);
    this.hammer = this.art('hammer_big', 706, 286, 158).setAngle(-36).setVisible(false);
    this.bucket = this.art('tool_quench_bucket', 884, 566, 152).setVisible(false);

    // 顾客的耐心
    this.add.image(PATIENCE.x + PATIENCE.width / 2, PATIENCE.y, 'bar_track').setDisplaySize(PATIENCE.width + 10, 26);
    this.patienceBar = this.add
      .rectangle(PATIENCE.x, PATIENCE.y, PATIENCE.width, 16, hex('#3f8f5f'))
      .setOrigin(0, 0.5);
    this.art('icon_clock', 54, PATIENCE.y, 28);
    this.label(76, PATIENCE.y, '耐心', { size: 18, color: COLOR.cream, stroke: '#2a1d14' });

    // 判定槽
    this.add.image(GAUGE.x, GAUGE.y, 'bar_track').setDisplaySize(GAUGE.halfWidth * 2 + 16, 48);
    this.zones = this.add.graphics();
    this.marker = this.add
      .rectangle(GAUGE.x, GAUGE.y, 12, 66, 0xfff3d0)
      .setStrokeStyle(3, 0x8a4416);

    this.phaseLabel = addText(this, 640, 600, '', { size: 30, weight: 700, align: 'center', color: COLOR.cream, stroke: '#2a1d14' });
    this.tipLabel = addText(this, 640, 700, '', { size: 19, align: 'center', color: COLOR.cream, stroke: '#2a1d14' });

    this.ctx.debug = () => ({
      scene: 'forge',
      phase: this.phase,
      pos: Math.round(this.pos * 100) / 100,
      patience: Math.round(this.patience * 10) / 10,
      strikes: this.strikes,
    });

    this.onKey((event) => {
      if (event.code === 'Space') this.press();
    });

    if (!game.seenHint) this.showHint();
    else this.startPhase('heat');
  }

  private drawOrderPlate(item: string, itemName: string, want: Grade) {
    panel(this, 1124, 148, 286, 92, 0.92);
    this.art(item, 1012, 148, 58);
    this.label(1048, 130, itemName, { size: 22, weight: 700 });
    this.label(1048, 166, `要求：${GRADE_NAME[want]}`, { size: 18, color: COLOR.gray });
  }

  // ---- 阶段流转 ----------------------------------------------------------

  private startPhase(phase: ActivePhase) {
    this.phase = phase;
    this.t = 0;
    this.busy = false;

    const windows = difficultyFor(this.ctx.config, this.ctx.game.day);
    const win = windows[phase];
    this.drawZones(win.perfect, win.good);

    if (phase === 'heat') {
      this.iron.setTexture('iron_orange');
      this.hammer.setVisible(false);
      this.bucket.setVisible(false);
      this.phaseLabel.setText('火候　把铁烧到火色正好');
      this.tipLabel.setText('指针进绿区时按 空格 夹出来');
      this.tweens.add({
        targets: this.furnace, scale: this.furnace.scale * 1.05,
        duration: 420, yoyo: true, repeat: -1, ease: 'Sine.inOut',
      });
    } else if (phase === 'hit') {
      this.tweens.killTweensOf(this.furnace);
      this.iron.setTexture('iron_orange');
      this.hammer.setVisible(true).setAngle(-36).setPosition(706, 286);
      this.phaseLabel.setText(`锻打　第 ${this.strikes + 1} / ${this.ctx.config.forge.strikes} 锤`);
      this.tipLabel.setText('绿区里按 空格 落锤');
    } else {
      this.hammer.setVisible(false);
      this.bucket.setVisible(true);
      this.iron.setTexture('iron_white');
      this.phaseLabel.setText('淬火　一口气入水');
      this.tipLabel.setText('绿区里按 空格 入水');
    }
  }

  /** 淬火落手：铁坯沉进桶里、冒一股蒸汽。 */
  private dipIntoWater() {
    this.tweens.add({
      targets: this.iron,
      x: 884,
      y: 534,
      scale: this.iron.scale * 0.55,
      alpha: 0,
      duration: 300,
      ease: 'Quad.in',
    });
    const steam = this.art('fx_steam', 884, 506, 170).setDepth(21);
    this.tweens.add({ targets: steam, y: 440, alpha: 0, duration: 640, ease: 'Sine.out', onComplete: () => steam.destroy() });
  }

  private press() {
    if (this.phase === 'hint') {
      this.closeHint();
      return;
    }

    if (this.busy) return;

    const windows = difficultyFor(this.ctx.config, this.ctx.game.day);

    if (this.phase === 'heat') {
      this.heatVerdict = judge(this.pos, windows.heat);
      this.react(this.heatVerdict, false);
      this.busy = true;
      this.time.delayedCall(520, () => this.startPhase('hit'));
      return;
    }

    if (this.phase === 'hit') {
      const verdict = judge(this.pos, windows.hit);
      this.hitVerdicts.push(verdict);
      this.strikes += 1;
      this.swingHammer(verdict);
      this.react(verdict, false);
      this.busy = true;
      const complete = this.strikes >= this.ctx.config.forge.strikes;
      this.time.delayedCall(complete ? 560 : 400, () => this.startPhase(complete ? 'quench' : 'hit'));
      return;
    }

    this.quenchVerdict = judge(this.pos, windows.quench);
    this.dipIntoWater();
    this.react(this.quenchVerdict, true);
    this.busy = true;
    this.time.delayedCall(640, () => this.finish(true));
  }

  private finish(finished: boolean) {
    if (this.settled) return;
    this.settled = true;
    this.phase = 'result';
    const result: ForgeResult = {
      heat: this.heatVerdict,
      hits: this.hitVerdicts,
      quench: this.quenchVerdict,
      finished,
    };
    const { score } = qualityOf(this.ctx.config, result);
    this.delivery = settle(this.ctx.game, this.ctx.config, { score, finished });
    this.ctx.save.writeRun(this.ctx.game);
    this.busy = false;
    this.phaseLabel.setVisible(false);
    this.tipLabel.setVisible(false);
    showDelivery(this, this.delivery, finished, () => this.next());
  }

  private next() {
    if (!this.delivery) return;
    this.ctx.go(nextScene(this.ctx.game, this.delivery));
  }

  // ---- 画面与反馈 --------------------------------------------------------

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

  private swingHammer(verdict: Verdict) {
    this.tweens.killTweensOf(this.hammer);
    this.hammer.setAngle(-36).setPosition(706, 286);
    this.tweens.add({
      targets: this.hammer,
      angle: verdict === 'miss' ? -18 : 6,
      y: verdict === 'miss' ? 316 : 340,
      duration: 95,
      yoyo: true,
      ease: 'Quad.in',
    });
    this.cameras.main.shake(verdict === 'perfect' ? 120 : 70, verdict === 'perfect' ? 0.006 : 0.003);
  }

  private react(verdict: Verdict, isQuench: boolean) {
    const label = VERDICT_TEXT[verdict];
    // 淬火时铁坯已经沉进桶里，反馈就落在桶的位置
    const fx = isQuench ? 884 : this.iron.x;
    const fy = isQuench ? 500 : this.iron.y;
    popText(this, fx, fy - 76, isQuench ? `淬火·${label}` : label, VERDICT_COLOR[verdict]);

    if (!isQuench) {
      this.iron.setTexture(verdict === 'miss' ? 'iron_ouch' : 'iron_happy');
      this.time.delayedCall(340, () => {
        if (this.phase === 'result') return;
        this.iron.setTexture(this.phase === 'heat' ? 'iron_orange' : 'iron_white');
      });
    }

    const spark = this.art('fx_spark', fx + (Math.random() * 50 - 25), fy, verdict === 'perfect' ? 132 : 90);
    spark.setDepth(20);
    this.tweens.add({
      targets: spark, alpha: 0, scale: spark.scale * 1.7, angle: 40,
      duration: 380, ease: 'Quad.out', onComplete: () => spark.destroy(),
    });

    if (verdict === 'perfect') {
      const flash = this.add.rectangle(640, 360, 1280, 720, 0xfff3d0, 0.3).setDepth(15);
      this.tweens.add({ targets: flash, alpha: 0, duration: 220, onComplete: () => flash.destroy() });
    }

    if (this.phase === 'hit') this.sfx(verdict === 'perfect' ? 'sfx_hammer_heavy' : 'sfx_hammer_light', { volume: 0.9 });
    else if (this.phase === 'heat' || this.phase === 'quench') this.sfx('sfx_hiss', { volume: 0.55 });
    if (verdict === 'miss') this.sfx('sfx_miss', { volume: 0.8 });
  }

  // ---- 新手提示 ----------------------------------------------------------

  private showHint() {
    const veil = this.add.rectangle(640, 360, 1280, 720, 0x1b1714, 0.62).setDepth(60);
    const card = panel(this, 640, 344, 760, 420, 0.97).setDepth(61);
    const title = addText(this, 640, 190, '火候、锻打、淬火：三道工序', { size: 34, weight: 700, align: 'center' }).setDepth(62);
    const body = addText(this, 640, 238, [
      ...modeInstructions(this.ctx.config, 'timing'),
      '',
      '指针进绿区时按空格；越靠中间，成色越好。',
      '顾客的耐心一直在掉，别磨蹭。',
    ].join('\n'), { size: 22, align: 'center', color: COLOR.ink, wrap: 620 }).setDepth(62);

    const catcher = this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.001).setDepth(63).setInteractive();
    catcher.on('pointerdown', () => this.closeHint());

    const skin = this.add.image(640, 506, 'btn_primary').setDisplaySize(320, 76).setDepth(64);
    const text = addText(this, 640, 504, '开炉（空格）', { size: 24, weight: 700, align: 'center', color: COLOR.cream, stroke: '#a4521f' }).setDepth(65);

    this.hintObjects = [veil, card, title, body, catcher, skin, text];
    this.phaseLabel.setVisible(false);
    this.tipLabel.setVisible(false);
  }

  private closeHint() {
    if (!this.hintObjects.length) return;
    for (const obj of this.hintObjects) obj.destroy();
    this.hintObjects = [];
    this.ctx.game.seenHint = true;
    this.ctx.save.writeRun(this.ctx.game);
    this.phaseLabel.setVisible(true);
    this.tipLabel.setVisible(true);
    this.startPhase('heat');
  }

  // ---- 每帧 --------------------------------------------------------------

  update(_time: number, delta: number) {
    const phase = this.phase;
    const active = phase === 'heat' || phase === 'hit' || phase === 'quench';
    if (!active) return;
    if (this.busy) {
      this.marker.x = GAUGE.x + this.pos * GAUGE.halfWidth;
      return;
    }

    const dt = delta / 1000;
    this.t += dt;
    this.patience -= dt;

    const speed = this.ctx.config.forge.speed[phase];
    const offset = phase === 'heat' ? this.ctx.config.forge.phaseOffset : 0;
    this.pos = triangle(this.t * speed + offset);
    this.marker.x = GAUGE.x + this.pos * GAUGE.halfWidth;

    const total = currentOrder(this.ctx.game)?.patience ?? 1;
    const ratio = Math.max(0, Math.min(1, this.patience / total));
    this.patienceBar.width = PATIENCE.width * ratio;
    this.patienceBar.fillColor = ratio > 0.5 ? hex('#3f8f5f') : ratio > 0.25 ? hex('#e8893a') : hex('#b4472e');

    if (this.patience <= 0) this.finish(false);
  }
}

/** 三角波：u 每加 1 走一个来回，返回 -1…1。 */
function triangle(u: number): number {
  const p = u - Math.floor(u);
  return p < 0.5 ? -1 + p * 4 : 3 - p * 4;
}
