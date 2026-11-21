// 结算：三天过完，老周看账本和口碑。列出每一单的成色，给一句评语和一个结论。
import { startBgm } from '../audio/bgm';
import { GRADE_NAME, gradeRank } from '../core/forge';
import { isFinished, newGame, summarize } from '../core/game';
import { modeInfo } from '../core/modes';
import { BaseScene } from '../engine/scenes';
import { COLOR, addText } from '../engine/ui';
import { panel } from './common';

export class ResultScene extends BaseScene {
  constructor() {
    super('result');
  }

  create() {
    const { game, config } = this.ctx;
    startBgm(this, 0.5);

    const summary = summarize(game, config);
    const win = game.endReason === 'win';

    this.background('bg_result');
    this.add.rectangle(640, 360, 1280, 720, 0x1b1714, 0.28);

    addText(this, 640, 30, `玩法 · ${modeInfo(game.mode).name}`, { size: 18, align: 'center', color: '#fff6dc', stroke: '#5a3220' });
    addText(this, 640, 72, '三 天 到 头', { size: 46, weight: 700, align: 'center', color: '#fff6dc', stroke: '#5a3220' });

    const laozhou = this.art(win ? 'char_laozhou_happy' : 'char_laozhou_sad', 196, 664, 220).setOrigin(0.5, 1);
    const scaleY = laozhou.scaleY;
    this.tweens.add({ targets: laozhou, scaleY: scaleY * 1.02, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    panel(this, 796, 356, 780, 476, 0.95);
    addText(this, 796, 156, win ? '老周把手艺传给了你' : '老周另请了高明', {
      size: 32, weight: 700, align: 'center', color: win ? '#3f8f5f' : '#b4472e',
    });
    addText(this, 796, 198, win
      ? '「三天看下来，手上有准头，心里有数。这铺子，交给你了。」'
      : '「心思是好的，火候还差些。回去再练练吧。」', {
      size: 19, align: 'center', color: COLOR.ink, wrap: 700,
    });

    this.row(272, '金币', `${summary.coins} 文`);
    this.row(316, '口碑', `${summary.reputation} / ${config.game.maxReputation}　（传手艺要 ${config.game.winReputation}）`);
    this.row(360, '成色', `传世 ${summary.legend}　精良 ${summary.fine}　普通 ${summary.common}　废品 ${summary.scrap}`);
    if (summary.timedOut) this.row(404, '跑单', `${summary.timedOut} 单`);

    addText(this, 470, 444, '这一炉一炉打出来的：', { size: 19, color: COLOR.gray });
    game.history.slice(0, 6).forEach((d, i) => {
      const x = 470 + (i % 2) * 350;
      const y = 476 + Math.floor(i / 2) * 32;
      const color = d.timedOut ? COLOR.gray : gradeRank(d.grade) >= 2 ? '#3f8f5f' : COLOR.ink;
      addText(this, x, y, `${d.customerName} · ${d.itemName}`, { size: 18, color });
      addText(this, x + 250, y, d.timedOut ? '跑单' : `${GRADE_NAME[d.grade]} +${d.coins}`, {
        size: 18, align: 'right', color,
      });
    });

    const best = Math.max(this.ctx.save.best, summary.coins);
    this.ctx.save.recordScore(summary.coins);
    this.ctx.save.clearRun();
    addText(this, 796, 564, `最高纪录：${best} 文`, { size: 18, align: 'center', color: COLOR.gray });

    this.button({ x: 712, y: 648, label: '再开一炉（空格）', key: 'Space', w: 320, onClick: () => this.restart() });
    this.button({
      x: 1040, y: 648, label: '回封面（Esc）', key: 'Escape', style: 'secondary', w: 260,
      onClick: () => this.ctx.go('title'),
    });

    this.ctx.debug = () => ({
      scene: 'result',
      win,
      coins: summary.coins,
      reputation: summary.reputation,
      finished: isFinished(game),
    });
  }

  private row(y: number, label: string, value: string) {
    addText(this, 470, y, label, { size: 21, color: COLOR.gray });
    addText(this, 566, y, value, { size: 23, weight: 700, color: COLOR.ink });
  }

  private restart() {
    this.ctx.game = newGame(this.ctx.config);
    this.ctx.save.clearRun();
    this.ctx.go('shop');
  }
}
