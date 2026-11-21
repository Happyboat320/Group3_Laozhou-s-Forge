// 结算：打完一首歌的分数、判定、连击，然后锻装备。
// 单曲：按「难度 × 准确率」掷品质，卖出换钱或收入装备库。
// 挑战中途：看分数、进下一首；挑战收尾：总分、排行名次、保底一件随机传说装备。
import { startBgm } from '../audio/bgm';
import { QUALITY_NAME, rollQuality, sellValue, type Quality } from '../core/drop';
import { addEquipment, recordBest, submitChallenge } from '../core/economy';
import { advanceSession, challengeEntry, challengeTotal, type Session } from '../core/game';
import { BaseScene } from '../engine/scenes';
import { COLOR, addText } from '../engine/ui';
import { equipmentArt, equipmentName, randomEquipment, songById } from '../data/songs';
import { addQuality, backButton, panel, popText, sellLabel } from './common';

export class SettleScene extends BaseScene {
  constructor() {
    super('settle');
  }

  create() {
    startBgm(this, 0.5);
    this.background('bg_result');
    this.add.rectangle(640, 360, 1280, 720, 0x1a120c, 0.3);

    const session = this.ctx.game.session;
    if (!session || !session.last) {
      this.ctx.go('songs');
      return;
    }

    if (session.kind === 'single') this.buildSingle(session.songId);
    else if (session.index < session.songs.length) this.buildChallengeNext(session);
    else this.buildChallengeFinal(session);
  }

  // ---- 单曲 --------------------------------------------------------------

  private buildSingle(songId: string) {
    const session = this.ctx.game.session!;
    const last = session.last!;
    const song = songById(songId);
    recordBest(this.ctx.game.progress, songId, session.difficulty, last.points);

    this.label(640, 84, `${song.title}　打完了！`, { size: 40, weight: 700, align: 'center', color: COLOR.cream, stroke: '#2a1d14' });
    this.showScore(last.points, last.accuracy, last.combo, 190);

    // 掷品质：难度 × 准确率修正；器物由这首歌决定，图由品质决定
    const quality = rollQuality(Math.random, this.ctx.config, session.difficulty, last.accuracy);
    this.showForgeResult(songId, quality, () => this.ctx.go('songs'));
  }

  /** 装备锻造结果：图 + 品质 + 卖出 / 入库。 */
  private showForgeResult(songId: string, quality: Quality, onDone: () => void) {
    const song = songById(songId);
    const config = this.ctx.config;

    panel(this, 640, 436, 700, 358, 0.97);
    this.art(equipmentArt(song.equipment, quality), 420, 420, 176);

    // 品质悬念：快闪几档再揭晓
    const rolling = addText(this, 760, 366, '锻造成色……', { size: 30, weight: 700, align: 'center', color: COLOR.gray });
    const qualities: Quality[] = ['common', 'fine', 'rare', 'epic', 'legend'];
    for (let i = 0; i < 8; i += 1) {
      this.time.delayedCall(90 * i, () => rolling.setText(QUALITY_NAME[qualities[i % qualities.length]]));
    }
    this.time.delayedCall(820, () => {
      rolling.destroy();
      addQuality(this, quality, 760, 386, 1.15);
      this.art('fx_glow', 760, 386, 220).setDepth(1).setAlpha(0.35);
      this.sfx(quality === 'legend' ? 'sfx_deliver' : 'sfx_coin', { volume: 0.9 });
    });

    this.label(640, 556, `锻出「${QUALITY_NAME[quality]}${equipmentName(song.equipment)}」`, { size: 26, weight: 700, align: 'center' });

    this.button({
      x: 462, y: 652, label: sellLabel(config, quality), w: 300, h: 64, size: 22,
      onClick: () => {
        this.ctx.game.progress.coins += sellValue(config, quality);
        this.ctx.save.writeRun(this.ctx.game);
        popText(this, 462, 600, `+${sellValue(config, quality)} 文`, '#c8862f');
        this.sfx('sfx_coin', { volume: 0.9 });
        this.time.delayedCall(500, onDone);
      },
    });
    this.button({
      x: 818, y: 652, label: '收入装备库', w: 300, h: 64, size: 22, style: 'secondary',
      onClick: () => {
        addEquipment(this.ctx.game.progress, {
          type: song.equipment,
          name: equipmentName(song.equipment),
          quality,
          songId,
        });
        this.ctx.save.writeRun(this.ctx.game);
        popText(this, 818, 600, '已入库', '#3f8f5f');
        this.time.delayedCall(500, onDone);
      },
    });
  }

  // ---- 挑战中途 -----------------------------------------------------------

  private buildChallengeNext(session: Session) {
    const last = session.last!;
    const played = songById(session.songs[session.index - 1]);
    const next = songById(session.songs[session.index]);
    recordBest(this.ctx.game.progress, played.id, session.difficulty, last.points);

    this.label(640, 110, `挑战 ${session.index} / ${session.songs.length}　完成！`, {
      size: 40, weight: 700, align: 'center', color: COLOR.cream, stroke: '#2a1d14',
    });
    this.showScore(last.points, last.accuracy, last.combo, 240);
    this.label(640, 500, `下一首：${next.title}（${equipmentName(next.equipment)}）`, { size: 28, weight: 700, align: 'center' });
    this.button({
      x: 640, y: 596, label: '继续（空格）', key: 'Space', w: 320, h: 72,
      onClick: () => {
        advanceSession(session, last.points);
        this.ctx.go('play');
      },
    });
    this.label(640, 676, '挑战中途不能退出，退出不计成绩', { size: 18, align: 'center', color: COLOR.gray });
  }

  // ---- 挑战收尾 -----------------------------------------------------------

  private buildChallengeFinal(session: Session) {
    const last = session.last!;
    const { progress } = this.ctx.game;
    const config = this.ctx.config;
    recordBest(this.ctx.game.progress, session.songs[session.index - 1], session.difficulty, last.points);
    advanceSession(session, last.points);

    const total = challengeTotal(session);
    const rank = submitChallenge(progress, config, challengeEntry(session));
    this.ctx.save.writeRun(this.ctx.game);

    this.label(640, 76, '挑战完成！', { size: 42, weight: 700, align: 'center', color: COLOR.cream, stroke: '#2a1d14' });
    this.label(640, 130, `三首总分 ${total}　排行榜第 ${rank} 名`, { size: 28, weight: 700, align: 'center', color: COLOR.cream, stroke: '#2a1d14' });
    this.label(640, 172, session.scores.map((p, i) => `${songById(session.songs[i]).title} ${p}`).join('　'), {
      size: 20, align: 'center', color: COLOR.cream, stroke: '#2a1d14',
    });

    // 保底：一件随机器物的传说品质装备
    const drop = randomEquipment();
    panel(this, 640, 400, 700, 320, 0.97);
    this.art(equipmentArt(drop.art, 'legend'), 420, 392, 176);
    addQuality(this, 'legend', 760, 372, 1.15);
    this.art('fx_glow', 760, 372, 220).setDepth(1).setAlpha(0.35);
    this.label(640, 538, `保底传说：「${QUALITY_NAME.legend}${drop.name}」`, { size: 26, weight: 700, align: 'center' });
    this.sfx('sfx_deliver', { volume: 0.9 });

    this.button({
      x: 462, y: 640, label: sellLabel(config, 'legend'), w: 300, h: 64, size: 22,
      onClick: () => {
        progress.coins += sellValue(config, 'legend');
        this.ctx.save.writeRun(this.ctx.game);
        popText(this, 462, 588, `+${sellValue(config, 'legend')} 文`, '#c8862f');
        this.sfx('sfx_coin', { volume: 0.9 });
        this.time.delayedCall(500, () => this.ctx.go('challenge'));
      },
    });
    this.button({
      x: 818, y: 640, label: '收入装备库', w: 300, h: 64, size: 22, style: 'secondary',
      onClick: () => {
        addEquipment(progress, { type: drop.art, name: drop.name, quality: 'legend', songId: session.songs[0] });
        this.ctx.save.writeRun(this.ctx.game);
        popText(this, 818, 588, '已入库', '#3f8f5f');
        this.time.delayedCall(500, () => this.ctx.go('challenge'));
      },
    });
    backButton(this, '回标题（Esc）', () => this.ctx.go('title'));
  }

  // ---- 小件 ---------------------------------------------------------------

  private showScore(points: number, accuracy: number, combo: number, y: number) {
    panel(this, 640, y, 700, 150, 0.9);
    this.label(412, y - 24, '得分', { size: 22, align: 'center', color: COLOR.gray });
    this.label(412, y + 22, String(points), { size: 44, weight: 700, align: 'center' });
    this.label(640, y - 24, '准确率', { size: 22, align: 'center', color: COLOR.gray });
    this.label(640, y + 22, `${Math.round(accuracy * 1000) / 10}%`, { size: 44, weight: 700, align: 'center' });
    this.label(868, y - 24, '最高连击', { size: 22, align: 'center', color: COLOR.gray });
    this.label(868, y + 22, String(combo), { size: 44, weight: 700, align: 'center' });
  }
}
