// 节奏打铁：四条轨道的铁块竖直落下，落到判定线（铁块/铁砧）上时按 A S D F。
// 谱面来自 smlab 生成的 .sm（core/sm.ts 解析），音乐用 WebAudio 放，判定按场景自己的时钟。
import Phaser from 'phaser';
import { startBgm, stopBgm } from '../audio/bgm';
import { loadTrack, type TrackHandle } from '../audio/track';
import { DIFFICULTY_NAME, KeySequence, scoreSong, shortcutScore, type Verdict } from '../core/rhythm';
import { BaseScene } from '../engine/scenes';
import { COLOR, addText, hex } from '../engine/ui';
import { chartFor, chartLength, songById } from '../data/songs';
import { panel, popText } from './common';

interface Note {
  lane: number;
  time: number;
  verdict: Verdict | null;
  sprite: Phaser.GameObjects.Image;
}

const LANE_KEYS = ['KeyA', 'KeyS', 'KeyD', 'KeyF'];
const LANE_LABELS = ['A', 'S', 'D', 'F'];
/** 歌曲开始前的准备时间（秒），给玩家看清轨道 */
const LEAD_IN = 2.2;

export class PlayScene extends BaseScene {
  private notes: Note[] = [];
  /** 场景自己的时钟（秒） */
  private elapsed = 0;
  private combo = 0;
  private counts = { perfect: 0, good: 0, miss: 0 };
  private finished = false;
  private track: TrackHandle | null = null;
  private duration = 0;
  /** 彩蛋：1212 跳过（在 create 里初始化，字段初始化时还取不到 ctx） */
  private eggSkip = new KeySequence([]);
  /** 彩蛋：3434 自动打歌 */
  private eggAuto = new KeySequence([]);
  /** 自动打歌开着没有 */
  private autoPlay = false;

  private comboText!: Phaser.GameObjects.Text;
  private countText!: Phaser.GameObjects.Text;
  private progressFill!: Phaser.GameObjects.Rectangle;
  private keyCaps: Phaser.GameObjects.Container[] = [];
  private anvil!: Phaser.GameObjects.Image;

  constructor() {
    super('play');
  }

  create() {
    const session = this.ctx.game.session;
    if (!session) {
      this.ctx.go('songs');
      return;
    }
    const { rhythm } = this.ctx.config;
    const song = songById(session.songId);
    const notes = chartFor(session.songId, session.difficulty);
    if (!notes.length) {
      this.ctx.go('songs');
      return;
    }

    this.notes = [];
    this.elapsed = 0;
    this.combo = 0;
    this.counts = { perfect: 0, good: 0, miss: 0 };
    this.finished = false;
    this.track = null;
    this.duration = chartLength(session.songId, session.difficulty);
    this.keyCaps = [];
    this.eggSkip = new KeySequence(this.ctx.config.egg.skip.code);
    this.eggAuto = new KeySequence(this.ctx.config.egg.auto.code);
    this.autoPlay = false;

    stopBgm();
    this.background('bg_forge');
    this.add.rectangle(640, 360, 1280, 720, 0x1a120c, 0.34);

    this.drawLanes();
    this.drawHud(song.title, DIFFICULTY_NAME[session.difficulty]);

    for (const note of notes) {
      const x = this.laneX(note.lane);
      const sprite = this.art('mat_iron_ingot', x, rhythm.spawnY, 58).setDepth(6).setVisible(false);
      this.notes.push({ lane: note.lane, time: note.time, verdict: null, sprite });
    }

    this.onKey((event) => {
      // 彩蛋一：1 2 1 2 直接过关，按 80% 计分
      if (this.eggSkip.push(event.code)) {
        this.skipByEgg();
        return;
      }
      // 彩蛋二：3 4 3 4 开启 / 关闭自动打歌
      if (this.eggAuto.push(event.code)) {
        this.toggleAutoPlay();
        return;
      }
      const lane = LANE_KEYS.indexOf(event.code);
      if (lane >= 0) this.pressLane(lane);
      if (event.code === 'Escape') this.quit();
    });

    // 音乐：加载好就在 LEAD_IN 时刻开唱；加载失败游戏照打，只是没声
    void loadTrack(session.songId).then((track) => {
      if (!track || this.finished) return;
      this.track = track;
      this.duration = Math.max(this.duration, track.duration);
      track.play(Math.max(0.02, LEAD_IN - this.elapsed));
    });

    this.ctx.debug = () => {
      const pending = this.notes.filter((n) => !n.verdict).sort((a, b) => a.time - b.time);
      const first = pending[0];
      // 同一时刻要按的键一起返回，走查脚本据此同时按多个键
      const group = first
        ? pending
            .filter((n) => Math.abs(n.time - first.time) < 0.02)
            .map((n) => ({ lane: n.lane, dt: Math.round((n.time - this.songTime()) * 1000) / 1000 }))
        : [];
      return {
        scene: 'play',
        songId: session.songId,
        difficulty: session.difficulty,
        group,
        left: pending.length,
        combo: this.combo,
        counts: this.counts,
        songTime: Math.round(this.songTime() * 100) / 100,
        done: this.finished,
      };
    };
  }

  private laneX(lane: number): number {
    const { lanes, laneGap } = this.ctx.config.rhythm;
    return 640 + (lane - (lanes - 1) / 2) * laneGap;
  }

  /** 歌曲时间轴上的秒数（减去准备时间；准备期是负数）。 */
  private songTime(): number {
    return this.elapsed - LEAD_IN;
  }

  // ---- 画面 --------------------------------------------------------------

  private drawLanes() {
    const { lanes, laneGap, hitLineY } = this.ctx.config.rhythm;
    const top = 96;

    for (let i = 0; i < lanes; i += 1) {
      const x = this.laneX(i);
      this.add.rectangle(x, (top + hitLineY) / 2, laneGap - 10, hitLineY - top, 0x2a1d14, 0.38).setStrokeStyle(2, 0xffffff, 0.12);
    }

    // 中央的铁块：判定线就落在砧面上，铁块作为落锤目标摆在下方
    this.anvil = this.art('anvil', 640, hitLineY + 168, 360).setDepth(2);
    this.add.rectangle(640, hitLineY, laneGap * lanes - 4, 5, hex('#fff3d0'), 0.9).setDepth(4);
    this.add.rectangle(640, hitLineY + 10, laneGap * lanes - 4, 12, hex('#e8893a'), 0.28).setDepth(4);

    // 键帽 A S D F（压在砧面两侧，不挡判定线）
    for (let i = 0; i < lanes; i += 1) {
      const x = this.laneX(i);
      const cap = this.add.container(x, hitLineY + 82);
      const bg = this.add.rectangle(0, 0, 72, 72, hex('#fff6dc'), 0.92).setStrokeStyle(3, hex('#a4521f'));
      const text = addText(this, 0, 0, LANE_LABELS[i] ?? '', { size: 36, weight: 700, align: 'center' });
      cap.add([bg, text]);
      cap.setDepth(8);
      this.keyCaps.push(cap);
    }
  }

  private drawHud(title: string, difficultyName: string) {
    panel(this, 250, 46, 460, 56, 0.88);
    this.label(36, 46, `${title}　${difficultyName}`, { size: 22, weight: 700 });

    // 歌曲进度条
    this.add.image(940, 46, 'bar_track').setDisplaySize(330, 26);
    this.progressFill = this.add.rectangle(778, 46, 324, 16, hex('#3f8f5f')).setOrigin(0, 0.5);

    this.countText = addText(this, 36, 110, '完美 0　不错 0　落空 0', { size: 20, color: COLOR.cream, stroke: '#2a1d14' });

    addText(this, 1150, 620, '连击', { size: 18, align: 'right', color: COLOR.cream, stroke: '#2a1d14' });
    this.comboText = addText(this, 1150, 660, '0', { size: 44, weight: 700, align: 'right', color: '#ffd9a0', stroke: '#2a1d14' });
  }

  // ---- 打 ---------------------------------------------------------------

  private pressLane(lane: number) {
    if (this.finished || this.songTime() < -0.2) return;
    const { window } = this.ctx.config.rhythm;
    let target: Note | null = null;
    let bestDt = Number.POSITIVE_INFINITY;

    for (const note of this.notes) {
      if (note.verdict || note.lane !== lane) continue;
      const dt = Math.abs(note.time - this.songTime());
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
    popText(this, this.laneX(lane), this.ctx.config.rhythm.hitLineY - 60, '落空', '#9a8a78');
    this.sfx('sfx_miss', { volume: 0.6 });
    this.flashCap(lane);
  }

  private judge(note: Note, verdict: Verdict) {
    note.verdict = verdict;
    const { hitLineY } = this.ctx.config.rhythm;
    const color = verdict === 'perfect' ? '#3f8f5f' : '#c8862f';
    this.flashCap(note.lane);

    if (verdict === 'miss') {
      this.combo = 0;
      this.counts.miss += 1;
    } else {
      this.combo += 1;
      this.counts[verdict] += 1;
      popText(this, note.sprite.x, hitLineY - 60, verdict === 'perfect' ? '完美！' : '不错', color, 28);
      this.sfx(verdict === 'perfect' ? 'sfx_hammer_heavy' : 'sfx_hammer_light', { volume: 0.8 });
      this.cameras.main.shake(verdict === 'perfect' ? 70 : 45, verdict === 'perfect' ? 0.0012 : 0.0007);

      // 落锤的火星 + 铁块颤一下
      const spark = this.art('fx_spark', note.sprite.x, hitLineY, 96).setDepth(20);
      this.tweens.add({ targets: spark, alpha: 0, scale: spark.scale * 1.6, duration: 320, onComplete: () => spark.destroy() });
      this.tweens.add({ targets: this.anvil, scaleY: this.anvil.scaleY * 0.96, duration: 70, yoyo: true });
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

  /** 键帽按下的亮光。 */
  private flashCap(lane: number) {
    const cap = this.keyCaps[lane];
    if (!cap) return;
    this.tweens.add({ targets: cap, scale: 0.88, duration: 60, yoyo: true });
  }

  private updateCounts() {
    const { perfect, good, miss } = this.counts;
    this.countText.setText(`完美 ${perfect}　不错 ${good}　落空 ${miss}`);
  }

  // ---- 结束 --------------------------------------------------------------

  private finish() {
    if (this.finished) return;
    this.finished = true;
    this.track?.stop();
    const session = this.ctx.game.session;
    if (!session) {
      this.ctx.go('songs');
      return;
    }
    const verdicts = [...this.notes].sort((a, b) => a.time - b.time).map((n) => n.verdict ?? 'miss');
    session.last = scoreSong(this.ctx.config, verdicts);
    this.ctx.save.writeRun(this.ctx.game);
    this.ctx.go('settle');
  }

  /** 彩蛋：3 4 3 4 开关自动打歌。 */
  private toggleAutoPlay() {
    this.autoPlay = !this.autoPlay;
    if (this.autoPlay) {
      this.sfx('sfx_deliver', { volume: 0.7 });
      popText(this, 640, 300, '彩蛋！铁砧自己会打铁了', '#c8862f', 36);
    } else {
      popText(this, 640, 300, '自动打歌已关闭', '#9a8a78', 30);
    }
  }

  /** 自动打歌：每帧把该敲的音符替玩家敲掉，偶尔手抖一下判成「不错」。 */
  private tickAutoPlay() {
    const { window } = this.ctx.config.rhythm;
    const now = this.songTime();
    for (const note of this.notes) {
      if (note.verdict) continue;
      const dt = note.time - now;
      if (dt > 0 || dt < -window.good) continue;
      const slip = Math.random() < this.ctx.config.egg.auto.slipChance;
      this.judge(note, slip ? 'good' : 'perfect');
    }
  }

  /** 彩蛋：直接算过关，成绩按满分的 80%。 */
  private skipByEgg() {
    if (this.finished) return;
    const session = this.ctx.game.session;
    if (!session) return;
    this.finished = true;
    this.track?.stop();
    this.sfx('sfx_deliver', { volume: 0.9 });
    popText(this, 640, 300, '彩蛋！这一单算八成', '#c8862f', 40);
    session.last = shortcutScore(this.notes.length, this.ctx.config.egg.skip.score);
    this.ctx.save.writeRun(this.ctx.game);
    this.time.delayedCall(900, () => this.ctx.go('settle'));
  }

  private quit() {
    if (this.finished) return;
    this.finished = true;
    this.track?.stop();
    startBgm(this, 0.5);
    this.ctx.go('songs');
  }

  update(_time: number, delta: number) {
    if (this.finished) return;
    this.elapsed += delta / 1000;
    const { hitLineY, spawnY, window } = this.ctx.config.rhythm;
    const speed = (hitLineY - spawnY) / this.ctx.config.rhythm.approach[this.ctx.game.session?.difficulty ?? 'normal'];
    const now = this.songTime();

    if (this.autoPlay) this.tickAutoPlay();

    let pending = 0;
    for (const note of this.notes) {
      if (note.verdict) continue;
      const y = hitLineY - (note.time - now) * speed;
      note.sprite.y = y;
      note.sprite.setVisible(y >= 100 && y < hitLineY + 70);
      if (now - note.time > window.good) {
        this.judge(note, 'miss');
        continue;
      }
      pending += 1;
    }

    // 进度条
    const ratio = this.duration > 0 ? Math.max(0, Math.min(1, now / this.duration)) : 0;
    this.progressFill.width = 324 * ratio;

    if (pending === 0 && this.notes.length > 0 && now > 0.5) {
      this.finish();
      return;
    }
    if (this.duration > 0 && now > this.duration + 2) this.finish();
  }
}
