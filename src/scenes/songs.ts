// 选歌：一首歌一张卡片，← → 移动选择，空格/回车选择，未解锁的按回车解锁。
// 解锁要用金币；挑战模式里的曲子不受这里限制。
import { BaseScene } from '../engine/scenes';
import { COLOR } from '../engine/ui';
import { isUnlocked, unlockSong } from '../core/economy';
import { DIFFICULTIES, DIFFICULTY_NAME, type Difficulty } from '../core/rhythm';
import { preloadTrack } from '../audio/track';
import { SONGS, chartExists, equipmentArt, equipmentName, songById, type SongInfo } from '../data/songs';
import { addCoins, backButton, panel, popText } from './common';

const CARD_W = 232;
const CARD_GAP = 24;

export class SongsScene extends BaseScene {
  /** 当前选中的第几张卡片 */
  private cursor = 0;
  private cards: Phaser.GameObjects.Container[] = [];
  private frames: Phaser.GameObjects.Graphics[] = [];
  /** 每张卡片的基准 x（未平移时） */
  private baseX: number[] = [];
  private hint!: Phaser.GameObjects.Text;
  private coins!: { refresh: () => void };

  constructor() {
    super('songs');
  }

  init(data?: { index?: number }) {
    this.cursor = Math.min(Math.max(data?.index ?? 0, 0), SONGS.length - 1);
  }

  create() {
    this.cards = [];
    this.frames = [];
    this.baseX = [];
    this.background('bg_shop');
    this.add.rectangle(640, 360, 1280, 720, 0x1a120c, 0.22);

    this.coins = addCoins(this, this.ctx.game);
    this.label(640, 48, '选一首歌，锻一件装备', { size: 32, weight: 700, align: 'center', stroke: '#2a1d14', color: COLOR.cream });

    // 卡片一排，整排居中；10 首时窗口内左右翻页
    this.layoutCards();

    this.hint = this.add
      .text(640, 604, '', { fontFamily: 'system-ui, sans-serif', fontSize: '22px', color: COLOR.cream, align: 'center' })
      .setOrigin(0.5)
      .setStroke('#2a1d14', 5);
    this.hint.setResolution(2);

    this.label(640, 690, '← → 选择　空格 开始　未解锁按空格用金币解锁　Esc 返回', {
      size: 18, align: 'center', color: COLOR.cream, stroke: '#2a1d14',
    });
    backButton(this, '返回（Esc）', () => this.ctx.go('title'));

    for (const song of SONGS) preloadTrack(song.id);

    this.onKey((event) => {
      if (event.code === 'ArrowLeft' || event.code === 'KeyA') this.move(-1);
      else if (event.code === 'ArrowRight' || event.code === 'KeyD') this.move(1);
      else if (event.code === 'Space' || event.code === 'Enter') this.confirm();
    });

    this.refresh();
    this.ctx.debug = () => ({ scene: 'songs', cursor: this.cursor, songId: SONGS[this.cursor]?.id });
  }

  /** 一排卡片，按当前光标整体平移，保证选中那张在中间。 */
  private layoutCards() {
    const total = SONGS.length;
    const width = total * CARD_W + (total - 1) * CARD_GAP;
    const step = CARD_W + CARD_GAP;
    const startX = 640 - width / 2 + CARD_W / 2;

    SONGS.forEach((song, index) => {
      const x = startX + index * step;
      const y = 330;

      const frame = this.add.graphics().setDepth(3);
      const card = this.add.container(x, y).setDepth(2);
      this.addCardContent(card, song, index);

      // 点击卡片 = 选中并确认
      card.setSize(CARD_W, 430);
      card.setInteractive({ useHandCursor: true });
      card.on('pointerdown', () => {
        if (this.cursor === index) this.confirm();
        else {
          this.cursor = index;
          this.refresh();
        }
      });

      this.frames.push(frame);
      this.cards.push(card);
      this.baseX.push(startX + index * step);
    });
  }

  private addCardContent(card: Phaser.GameObjects.Container, song: SongInfo, index: number) {
    const { progress } = this.ctx.game;
    const unlocked = isUnlocked(progress, song.id);

    const bg = this.add.image(0, 0, 'ui_slot').setDisplaySize(CARD_W, 430);
    const art = this.add.image(0, -130, equipmentArt(song.equipment, 'legend')).setDisplaySize(140, 140);
    const title = this.add
      .text(0, -26, song.title, { fontFamily: 'system-ui, sans-serif', fontSize: '22px', fontStyle: 'bold', color: COLOR.ink, align: 'center' })
      .setOrigin(0.5);
    title.setResolution(2);
    const equip = this.add
      .text(0, 8, equipmentName(song.equipment), { fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: COLOR.gray })
      .setOrigin(0.5);
    equip.setResolution(2);

    const best = progress.best[song.id] ?? {};
    const rows = DIFFICULTIES.map((d: Difficulty, i) => {
      const points = best[d];
      const t = this.add
        .text(0, 48 + i * 28, `${DIFFICULTY_NAME[d]}　${points ? `${points} 分` : '—'}`, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '16px',
          color: points ? COLOR.ink : COLOR.gray,
        })
        .setOrigin(0.5);
      t.setResolution(2);
      return t;
    });

    const status = this.add
      .text(0, 158, unlocked ? (chartExists(song.id) ? '已解锁' : '谱面制作中') : `未解锁 ${song.price} 文`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '17px',
        fontStyle: 'bold',
        color: unlocked ? '#3f8f5f' : '#b4472e',
      })
      .setOrigin(0.5);
    status.setResolution(2);

    const indexTag = this.add
      .text(-CARD_W / 2 + 14, -206, `${index + 1}`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '15px',
        color: COLOR.gray,
      })
      .setOrigin(0);
    indexTag.setResolution(2);

    card.add([bg, art, title, equip, ...rows, status, indexTag]);
  }

  private move(delta: number) {
    const next = this.cursor + delta;
    if (next < 0 || next >= SONGS.length) return;
    this.cursor = next;
    this.sfx('sfx_click', { volume: 0.55 });
    this.refresh();
  }

  /** 重画边框、卡片透明度、整排平移把选中的那张摆到中间，并更新提示文字。 */
  private refresh() {
    const step = CARD_W + CARD_GAP;
    const shift = (this.cursor - (SONGS.length - 1) / 2) * step;

    this.cards.forEach((card, index) => {
      const selected = index === this.cursor;
      // 整排平移：选中的那张始终在中间
      card.x = this.baseX[index] - shift;
      card.setAlpha(selected ? 1 : 0.72).setScale(selected ? 1.06 : 1);
      const frame = this.frames[index];
      frame.clear();
      if (selected) {
        // 框画在卡片自己的位置和尺寸上（卡片会缩放，框自己算）
        const w = CARD_W * 1.06 + 12;
        const h = 430 * 1.06 + 12;
        const x = card.x;
        const y = card.y;
        frame.lineStyle(14, 0xffe066, 0.3);
        frame.strokeRoundedRect(x - w / 2 - 8, y - h / 2 - 8, w + 16, h + 16, 22);
        frame.lineStyle(6, 0xffc400, 1);
        frame.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 18);
      }
    });

    const song = songById(SONGS[this.cursor].id);
    const unlocked = isUnlocked(this.ctx.game.progress, song.id);
    this.hint.setText(
      unlocked
        ? `「${song.title}」　锻 ${equipmentName(song.equipment)}　空格开始`
        : `「${song.title}」　要 ${song.price} 文解锁（现有 ${this.ctx.game.progress.coins} 文）`,
    );
    this.coins.refresh();
  }

  private confirm() {
    const song = SONGS[this.cursor];
    const { progress } = this.ctx.game;

    if (isUnlocked(progress, song.id)) {
      if (!chartExists(song.id)) {
        popText(this, 640, 500, '谱面还没做', '#b4472e');
        return;
      }
      this.ctx.go('difficulty', { songId: song.id, cursor: this.cursor });
      return;
    }

    if (unlockSong(progress, this.ctx.config, song.id)) {
      this.sfx('sfx_coin', { volume: 0.85 });
      this.ctx.save.writeRun(this.ctx.game);
      popText(this, 640, 500, `解锁「${song.title}」！`, '#3f8f5f');
      this.scene.restart({ index: this.cursor });
    } else {
      this.sfx('sfx_miss', { volume: 0.6 });
      popText(this, 640, 500, `金币不够，还差 ${song.price - progress.coins} 文`, '#b4472e');
    }
  }
}
