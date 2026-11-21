// 难度选择：简单 / 普通 / 困难，显示每档最好成绩。选完开一局单曲。
import { BaseScene } from '../engine/scenes';
import { COLOR } from '../engine/ui';
import { startSingle } from '../core/game';
import { DIFFICULTIES, DIFFICULTY_NAME, type Difficulty } from '../core/rhythm';
import { chartExists, chartFor, songById } from '../data/songs';
import { backButton, panel } from './common';

export class DifficultyScene extends BaseScene {
  private songId = '';

  constructor() {
    super('difficulty');
  }

  init(data?: { songId?: string }) {
    this.songId = data?.songId ?? '';
  }

  create() {
    this.background('bg_training_ground');
    this.add.rectangle(640, 360, 1280, 720, 0x1a120c, 0.3);

    const song = songById(this.songId);
    this.label(640, 96, song.title, { size: 44, weight: 700, align: 'center', color: COLOR.cream, stroke: '#2a1d14' });
    this.label(640, 152, `这首歌锻「${song.equipName}」　选一个难度`, {
      size: 22, align: 'center', color: COLOR.cream, stroke: '#2a1d14',
    });

    const best = this.ctx.game.progress.best[song.id] ?? {};
    DIFFICULTIES.forEach((difficulty: Difficulty, index) => {
      const x = 640 + (index - 1) * 340;
      panel(this, x, 380, 300, 320, 0.96);
      const notes = chartFor(song.id, difficulty);
      this.label(x, 288, DIFFICULTY_NAME[difficulty], { size: 34, weight: 700, align: 'center' });
      this.label(x, 342, `音符 ${notes.length} 个`, { size: 20, align: 'center', color: COLOR.gray });
      const points = best[difficulty];
      this.label(x, 386, points ? `最好 ${points} 分` : '还没打过', {
        size: 22, align: 'center', color: points ? COLOR.ink : COLOR.gray,
      });
      this.button({
        x, y: 472, label: `开打（${index + 1}）`, key: `Digit${index + 1}`, w: 240, h: 62, size: 24,
        onClick: () => {
          if (!chartExists(song.id)) return;
          this.ctx.game.session = startSingle(song.id, difficulty);
          this.ctx.go('play');
        },
      });
    });

    backButton(this, '返回（Esc）', () => this.ctx.go('songs'));
    this.ctx.debug = () => ({ scene: 'difficulty', songId: this.songId });
  }
}
