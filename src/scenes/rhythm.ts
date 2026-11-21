// 节奏打铁：铁块从左中右三条道落向砧口线，落线时按 ← ↓ →。
// 越往后越快：下落更快、音符更密、同时要按的键更多（和弦）。
import Phaser from 'phaser';
import { startBgm } from '../audio/bgm';
import type { Config } from '../config';
import { buildChart } from '../core/chart';
import type { Verdict } from '../core/forge';
import { currentOrder, nextScene, settle, type Delivery } from '../core/game';
import { rhythmScore } from '../core/modes';
import { BaseScene } from '../engine/scenes';
import { COLOR, addText, hex } from '../engine/ui';
import { addHud, popText, showDelivery, showModeIntro } from './common';

interface Note {
  lane: number;
  /** 应该落锤的时刻（秒） */
  time: number;
  verdict: Verdict | null;
  sprite: Phaser.GameObjects.Image;
}

const LANE_KEYS = ['ArrowLeft', 'ArrowDown', 'ArrowRight'];
const LANE_ICONS = ['←', '↓', '→'];

export class RhythmScene extends BaseScene {
  private notes: Note[] = [];
  private elapsed = 0;
  private combo = 0;
  private counts = { perfect: 0, good: 0, miss: 0 };
  private patience = 0;
  private patienceMax = 1;
  private speed = 1;
  private finished = false;
  private ready = false;
  private delivery: Delivery | null = null;

  private comboText!: Phaser.GameObjects.Text;
  private countText!: Phaser.GameObjects.Text;
  private patienceBar!: Phaser.GameObjects.Rectangle;

  constructor() {
    super('rhythm');
  }

  create() {
    const { game, config } = this.ctx;
    const order = currentOrder(game);
    if (!order) {
      this.ctx.go('result');
      return;
    }

    const cfg = config.modes.rhythm;
    const day = cfg.days[Math.min(game.day, cfg.days.length) - 1];

    this.notes = [];
    this.elapsed = 0;
    this.combo = 0;
    this.counts = { perfect: 0, good: 0, miss: 0 };
    this.patience = order.patience;
    this.patienceMax = order.patience;
    this.finished = false;
    this.ready = false;
    this.delivery = null;
    this.speed = (cfg.hitLineY - cfg.spawnY) / day.approach;

    startBgm(this, 0.5);
    this.background('bg_forge');
    this.add.rectangle(640, 360, 1280, 720, 0x1a120c, 0.26);
    addHud(this, game, config);

    this.drawLanes(cfg.lanes, cfg.laneGap, cfg.hitLineY);
    this.buildSprites(`${order.id}-${game.day}`, game.day);
    this.drawHudBits();

    this.onKey((event) => {
      const lane = LANE_KEYS.indexOf(event.code);
      if (lane >= 0) this.pressLane(lane);
    });

    this.ctx.debug = () => {
      const pending = this.notes.filter((n) => !n.verdict).sort((a, b) => a.time - b.time);
      const first = pending[0];
      // 同一时刻要按的键一起返回，走查脚本据此同时按多个键
      const group = first
        ? pending.filter((n) => Math.abs(n.time - first.time) < 0.02).map((n) => ({ lane: n.lane, dt: Math.round((n.time - this.elapsed) * 1000) / 1000 }))
        : [];
      return {
        scene: 'rhythm',
        mode: 'rhythm',
        ready: this.ready,
        day: game.day,
        group,
        left: pending.length,
        combo: this.combo,
        counts: this.counts,
        done: this.finished,
      };
    };
    showModeIntro(this, () => { this.ready = true; });
  }

  // ---- 谱面 --------------------------------------------------------------

  /** 谱面在 core 里算（可测），这里只把音符变成会往下掉的图。 */
  private buildSprites(seedText: string, dayIndex: number) {
    const cfg = this.ctx.config.modes.rhythm;
    const seed = [...seedText].reduce((acc, ch) => acc * 31 + ch.charCodeAt(0), 7);
    for (const note of buildChart(this.ctx.config, seed, dayIndex)) {
      const x = 640 + (note.lane - 1) * cfg.laneGap;
      const sprite = this.art('mat_iron_ingot', x, cfg.spawnY, 62).setDepth(6).setVisible(false);
      this.notes.push({ lane: note.lane, time: note.time, verdict: null, sprite });
    }
  }
  private drawLanes(lanes: number, gap: number, hitLineY: number) {
    const top = 196;
    for (let i = 0; i < lanes; i += 1) {
      const x = 640 + (i - 1) * gap;
      this.add.rectangle(x, (top + hitLineY) / 2, gap - 14, hitLineY - top, 0x2a1d14, 0.3).setStrokeStyle(2, 0xffffff, 0.1);
      addText(this, x, hitLineY + 52, LANE_ICONS[i] ?? '', { size: 30, weight: 700, align: 'center', color: COLOR.cream, stroke: '#2a1d14' });
    }
    this.add.rectangle(640, hitLineY, gap * lanes - 10, 5, hex('#fff3d0'), 0.85);
    this.add.rectangle(640, hitLineY + 9, gap * lanes - 10, 12, hex('#e8893a'), 0.25);
    addText(this, 640, 168, '铁块落到这条线上时落锤', { size: 20, align: 'center', color: COLOR.cream, stroke: '#2a1d14' });
  }

  private drawHudBits() {
    this.art('icon_clock', 30, 104, 26);
    this.add.image(196, 104, 'bar_track').setDisplaySize(330, 26);
    this.patienceBar = this.add.rectangle(34, 104, 324, 16, hex('#3f8f5f')).setOrigin(0, 0.5);
    this.countText = addText(this, 386, 104, '', { size: 19, color: COLOR.cream, stroke: '#2a1d14' });

    addText(this, 1244, 622, '连击', { size: 18, align: 'right', color: COLOR.cream, stroke: '#2a1d14' });
    this.comboText = addText(this, 1244, 664, '0', { size: 40, weight: 700, color: '#ffd9a0', stroke: '#2a1d14' });
  }

  // ---- 打 ---------------------------------------------------------------

  private pressLane(lane: number) {
    if (this.finished || !this.ready) return;
    const { window } = this.ctx.config.modes.rhythm;
    let target: Note | null = null;
    let bestDt = Number.POSITIVE_INFINITY;

    for (const note of this.notes) {
      if (note.verdict || note.lane !== lane) continue;
      const dt = Math.abs(note.time - this.elapsed);
      if (dt < bestDt) {
        bestDt = dt;
        target = note;
      }
    }

    if (target && bestDt <= window.good) {
      this.judge(target, bestDt <= window.perfect ? 'perfect' : 'good');
      return;
    }
    // 空敲：手快了也罚，不然乱按就能刷
    this.combo = 0;
    this.counts.miss += 1;
    this.comboText.setText('0');
    popText(this, 640, 300, '落空', '#9a8a78');
    this.sfx('sfx_miss', { volume: 0.6 });
  }

  private judge(note: Note, verdict: Verdict) {
    note.verdict = verdict;
    const cfg = this.ctx.config.modes.rhythm;
    const color = verdict === 'perfect' ? '#3f8f5f' : '#c8862f';

    if (verdict === 'miss') {
      this.combo = 0;
      this.counts.miss += 1;
      popText(this, note.sprite.x, cfg.hitLineY - 40, '偏了', '#9a8a78', 26);
    } else {
      this.combo += 1;
      this.counts[verdict] += 1;
      popText(this, note.sprite.x, cfg.hitLineY - 40, verdict === 'perfect' ? '完美！' : '不错', color, 26);
      this.sfx(verdict === 'perfect' ? 'sfx_hammer_heavy' : 'sfx_hammer_light', { volume: 0.8 });
      this.cameras.main.shake(verdict === 'perfect' ? 90 : 60, verdict === 'perfect' ? 0.004 : 0.002);

      const spark = this.art('fx_spark', note.sprite.x, cfg.hitLineY, 96).setDepth(20);
      this.tweens.add({ targets: spark, alpha: 0, scale: spark.scale * 1.6, duration: 320, onComplete: () => spark.destroy() });
    }

    this.comboText.setText(String(this.combo));
    this.updateCounts();

    const sprite = note.sprite;
    this.tweens.add({
      targets: sprite,
      alpha: 0,
      scale: sprite.scale * 1.5,
      duration: 160,
      onComplete: () => sprite.destroy(),
    });
  }

  private updateCounts() {
    const { perfect, good, miss } = this.counts;
    this.countText.setText(`完美 ${perfect}　不错 ${good}　落空 ${miss}`);
  }

  // ---- 结束 --------------------------------------------------------------

  private finish(finished: boolean) {
    if (this.finished) return;
    this.finished = true;
    const verdicts = this.notes.map((n) => n.verdict ?? 'miss');
    const score = rhythmScore(this.ctx.config, verdicts);
    this.delivery = settle(this.ctx.game, this.ctx.config, { score, finished });
    this.ctx.save.writeRun(this.ctx.game);
    showDelivery(this, this.delivery, finished, () => this.next());
  }

  private next() {
    if (!this.delivery) return;
    this.ctx.go(nextScene(this.ctx.game, this.delivery));
  }

  update(_time: number, delta: number) {
    if (this.finished || !this.ready) return;
    const dt = delta / 1000;
    const cfg = this.ctx.config.modes.rhythm;
    this.elapsed += dt;
    this.patience -= dt;

    const ratio = Math.max(0, Math.min(1, this.patience / this.patienceMax));
    this.patienceBar.width = 324 * ratio;
    this.patienceBar.fillColor = ratio > 0.5 ? hex('#3f8f5f') : ratio > 0.25 ? hex('#e8893a') : hex('#b4472e');

    let pending = 0;
    for (const note of this.notes) {
      if (note.verdict) continue;
      const y = cfg.hitLineY - (note.time - this.elapsed) * this.speed;
      note.sprite.y = y;
      note.sprite.setVisible(y > 176);
      if (y > cfg.hitLineY + 90) {
        this.judge(note, 'miss');
        continue;
      }
      pending += 1;
    }

    if (this.patience <= 0) {
      this.finish(false);
      return;
    }
    if (pending === 0 && this.notes.length > 0) this.finish(true);
  }
}
