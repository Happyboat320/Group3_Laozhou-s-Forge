// 挑战模式：系统从全部曲目（含未解锁）随机抽三首、统一普通难度连打，
// 总分上榜（本地排行榜），打完保底一件随机类型的传说装备。
import { startBgm } from '../audio/bgm';
import { startChallenge } from '../core/game';
import { DIFFICULTY_NAME } from '../core/rhythm';
import { BaseScene } from '../engine/scenes';
import { COLOR, addText } from '../engine/ui';
import { songById } from '../data/songs';
import { backButton, panel } from './common';

const RULES = [
  '系统随机抽三首歌（没解锁的也能打），统一「普通」难度',
  '三首连打，总分计入排行榜',
  '打完必得一件随机类型的传说装备',
];

export class ChallengeScene extends BaseScene {
  constructor() {
    super('challenge');
  }

  create() {
    startBgm(this, 0.5);
    this.background('bg_training_ground');
    this.add.rectangle(640, 360, 1280, 720, 0x1a120c, 0.32);

    this.label(640, 66, '挑战模式', { size: 44, weight: 700, align: 'center', color: COLOR.cream, stroke: '#2a1d14' });

    panel(this, 400, 300, 620, 320, 0.95);
    RULES.forEach((line, i) => {
      this.label(400, 216 + i * 54, line, { size: 21, align: 'center', wrap: 560 });
    });
    this.label(400, 372, `难度：${DIFFICULTY_NAME[this.ctx.config.challenge.difficulty]}`, {
      size: 22, weight: 700, align: 'center', color: COLOR.ink,
    });
    this.button({
      x: 400, y: 452, label: '开始挑战（空格）', key: 'Space', w: 320, h: 72,
      onClick: () => {
        this.ctx.game.session = startChallenge(this.ctx.config, Math.random);
        this.ctx.go('play');
      },
    });

    this.drawLeaderboard();

    backButton(this, '返回（Esc）', () => this.ctx.go('title'));
    this.ctx.debug = () => ({ scene: 'challenge', board: this.ctx.game.progress.leaderboard.length });
  }

  private drawLeaderboard() {
    const board = this.ctx.game.progress.leaderboard;
    panel(this, 940, 300, 520, 420, 0.95);
    this.label(940, 132, '排行榜', { size: 30, weight: 700, align: 'center' });

    if (!board.length) {
      addText(this, 940, 320, '还没有成绩\n来打一次挑战吧！', {
        size: 22, align: 'center', color: COLOR.gray,
      }).setOrigin(0.5);
      return;
    }

    board.forEach((entry, index) => {
      const y = 186 + index * 38;
      const color = index === 0 ? '#c8862f' : COLOR.ink;
      this.label(716, y, `${index + 1}`, { size: 21, weight: 700, color });
      this.label(756, y, `${entry.score} 分`, { size: 21, weight: 700, color });
      this.label(1000, y, entry.date, { size: 18, align: 'right', color: COLOR.gray });
      const songs = entry.songs.map((id) => songById(id).title).join(' / ');
      this.label(1030, y, songs, { size: 16, align: 'right', color: COLOR.gray });
    });
  }
}
