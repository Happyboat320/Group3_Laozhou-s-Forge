// 选歌：四首歌一张卡片一首，显示对应装备、最好成绩、解锁状态。
// 解锁要用金币；挑战模式里的曲子不受这里限制。按 1~4 或点卡片选歌。
import { BaseScene } from '../engine/scenes';
import { COLOR } from '../engine/ui';
import { isUnlocked, unlockSong } from '../core/economy';
import { DIFFICULTIES, DIFFICULTY_NAME, type Difficulty } from '../core/rhythm';
import { preloadTrack } from '../audio/track';
import { SONGS, chartExists, equipmentArt, equipmentName, type SongInfo } from '../data/songs';
import { addCoins, backButton, panel, popText } from './common';

export class SongsScene extends BaseScene {
  constructor() {
    super('songs');
  }

  create() {
    this.background('bg_shop');
    this.add.rectangle(640, 360, 1280, 720, 0x1a120c, 0.22);

    const coins = addCoins(this, this.ctx.game);
    this.label(640, 52, '选一首歌，锻一件装备', { size: 34, weight: 700, align: 'center', stroke: '#2a1d14', color: COLOR.cream });

    SONGS.forEach((song, index) => {
      this.addSongCard(song, 190 + index * 302, 340, index, coins.refresh);
    });

    this.label(640, 668, '难度越高、打得越准，出高品质装备的概率越大', {
      size: 20, align: 'center', color: COLOR.cream, stroke: '#2a1d14',
    });
    backButton(this, '返回（Esc）', () => this.ctx.go('title'));

    for (const song of SONGS) preloadTrack(song.id);

    this.ctx.debug = () => ({ scene: 'songs', songs: SONGS.map((s) => s.id), unlocked: this.ctx.game.progress.unlocked });
  }

  private addSongCard(song: SongInfo, x: number, y: number, index: number, refreshCoins: () => void) {
    const { progress } = this.ctx.game;
    const unlocked = isUnlocked(progress, song.id);

    panel(this, x, y, 276, 420, 0.96);
    this.art(equipmentArt(song.equipment, 'legend'), x, y - 120, 150);
    this.label(x, y - 14, song.title, { size: 26, weight: 700, align: 'center' });
    this.label(x, y + 20, `锻出：${equipmentName(song.equipment)}`, { size: 19, align: 'center', color: COLOR.gray });

    // 最好成绩：三个难度各一行
    const best = progress.best[song.id] ?? {};
    DIFFICULTIES.forEach((d: Difficulty, i) => {
      const points = best[d];
      this.label(x - 96, y + 64 + i * 30, DIFFICULTY_NAME[d], { size: 18, color: COLOR.ink });
      this.label(x + 96, y + 64 + i * 30, points ? `${points} 分` : '—', {
        size: 18, align: 'right', color: points ? COLOR.ink : COLOR.gray,
      });
    });

    if (!chartExists(song.id)) {
      this.label(x, y + 186, '谱面制作中', { size: 20, align: 'center', color: COLOR.gray });
      return;
    }

    if (unlocked) {
      this.button({
        x, y: y + 182, label: `选择（${index + 1}）`, key: `Digit${index + 1}`, w: 230, h: 58, size: 21,
        onClick: () => this.ctx.go('difficulty', { songId: song.id }),
      });
    } else {
      this.label(x, y + 146, '未解锁', { size: 20, align: 'center', color: '#b4472e' });
      this.button({
        x, y: y + 186, label: `解锁 ${song.price} 文`, w: 230, h: 58, size: 21, style: 'secondary',
        onClick: () => {
          if (unlockSong(this.ctx.game.progress, this.ctx.config, song.id)) {
            this.sfx('sfx_coin', { volume: 0.8 });
            this.ctx.save.writeRun(this.ctx.game);
            popText(this, x, y + 140, '解锁成功！', '#3f8f5f');
            this.scene.restart();
          } else {
            popText(this, x, y + 140, '金币不够', '#b4472e');
            this.sfx('sfx_miss', { volume: 0.6 });
          }
          refreshCoins();
        },
      });
    }
  }
}
