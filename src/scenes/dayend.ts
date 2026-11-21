// 关卡结算：一天两单做完，收摊算今天的账，然后进下一天。
import { GRADE_NAME, gradeRank } from '../core/forge';
import { currentOrder } from '../core/game';
import { BaseScene } from '../engine/scenes';
import { COLOR, addText } from '../engine/ui';
import { panel } from './common';
import { modeInfo } from '../core/modes';

export class DayEndScene extends BaseScene {
  constructor() {
    super('dayend');
  }

  create() {
    const { game, config } = this.ctx;
    const next = currentOrder(game);
    if (!next) {
      this.ctx.go('result');
      return;
    }

    const day = next.day - 1;
    const todays = game.history.filter((d) => d.day === day);
    const earned = todays.reduce((sum, d) => sum + d.coins, 0);
    const good = todays.filter((d) => gradeRank(d.grade) >= 2).length;

    this.background('bg_result');
    this.add.rectangle(640, 360, 1280, 720, 0x1b1714, 0.42);

    addText(this, 640, 92, `第 ${day} 天 · 收摊`, { size: 44, weight: 700, align: 'center', color: '#fff6dc', stroke: '#5a3220' });
    addText(this, 640, 134, modeInfo(game.mode).name, { size: 19, align: 'center', color: COLOR.cream, stroke: '#2a1d14' });

    panel(this, 640, 380, 720, 380, 0.95);
    addText(this, 640, 232, `今日进账 ${earned} 文　好成色 ${good} / ${todays.length} 件`, {
      size: 24, weight: 700, align: 'center', color: COLOR.ink,
    });

    todays.forEach((d, i) => {
      const y = 288 + i * 46;
      addText(this, 360, y, `${d.customerName} · ${d.itemName}`, { size: 20, color: COLOR.ink });
      addText(this, 812, y, d.timedOut ? '跑单' : `${GRADE_NAME[d.grade]}　+${d.coins} 文`, {
        size: 20, align: 'right', color: d.timedOut ? COLOR.gray : gradeRank(d.grade) >= 2 ? '#3f8f5f' : COLOR.ink,
      });
    });

    addText(this, 640, 412, `账上 ${game.coins} 文　口碑 ${game.reputation} / ${config.game.maxReputation}`, {
      size: 26, weight: 700, align: 'center', color: COLOR.ink,
    });
    addText(this, 640, 460, `明天：第 ${next.day} 天，顾客要的是「${next.itemName}」，成色要到${GRADE_NAME[next.want]}`, {
      size: 19, align: 'center', color: COLOR.gray, wrap: 640,
    });
    addText(this, 640, 502, '越往后判定越紧，耐心也越短', { size: 17, align: 'center', color: COLOR.gray });

    this.button({ x: 640, y: 620, label: `开始第 ${next.day} 天（空格）`, key: 'Space', onClick: () => this.ctx.go('shop') });

    this.ctx.debug = () => ({ scene: 'dayend', day, coins: game.coins, reputation: game.reputation });
    this.ctx.save.writeRun(game);
  }
}
