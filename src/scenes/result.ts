// 三天过完：老周看账本和口碑，决定传不传手艺。
import { startBgm } from '../audio/bgm';
import { gradeName, type GameState } from '../core/game';
import { BaseScene } from '../engine/scenes';
import { COLOR, addText, hex } from '../engine/ui';

export class ResultScene extends BaseScene {
  constructor() {
    super('result');
  }

  create() {
    const { game, config } = this.ctx;
    startBgm(this, 0.4);
    const win = game.endReason === 'win';
    const delivered = game.history.length;
    const good = game.history.filter((d) => d.grade === 'fine' || d.grade === 'legend').length;

    this.background('bg_result');
    this.add.rectangle(640, 360, 1280, 720, 0x1b1714, 0.32);
    addText(this, 640, 72, '三 天 到 头', { size: 46, weight: 700, align: 'center', color: '#fff6dc', stroke: '#5a3220' });

    const laozhou = this.art(win ? 'char_laozhou_happy' : 'char_laozhou_sad', 196, 664, 224).setOrigin(0.5, 1);
    const scaleY = laozhou.scaleY;
    this.tweens.add({ targets: laozhou, scaleY: scaleY * 1.02, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    const g = this.add.graphics();
    g.fillStyle(hex('#fff6dc'), 0.95);
    g.fillRoundedRect(416, 130, 780, 470, 16);
    g.lineStyle(3, hex('#e8893a'), 0.85);
    g.strokeRoundedRect(416, 130, 780, 470, 16);

    addText(this, 806, 170, win ? '老周把手艺传给了你' : '老周另请了高明', {
      size: 30, weight: 700, align: 'center', color: win ? '#3f8f5f' : '#b4472e',
    });
    addText(this, 806, 210, win ? '「敢下窟、也敢落锤，这铺子交给你我放心。」' : '「手艺还得练，窟里也别太贪。」', {
      size: 18, align: 'center', color: COLOR.ink, wrap: 700,
    });

    const rows: [string, string][] = [
      ['交货', `${delivered} / ${game.orders.length} 单（好成色 ${good} 件）`],
      ['金币', `${game.coins} 文`],
      ['口碑', `${game.reputation} / ${config.game.maxReputation}（传手艺要 ${config.game.winReputation}）`],
      ['词条', game.relics.length ? game.relics.map((r) => config.relics.find((x) => x.id === r)?.name ?? r).join('、') : '一个都没拿到'],
    ];
    rows.forEach(([k, v], i) => {
      addText(this, 470, 264 + i * 40, k, { size: 20, color: COLOR.gray });
      addText(this, 560, 264 + i * 40, v, { size: 21, weight: 700, color: COLOR.ink });
    });

    addText(this, 470, 436, '每一单：', { size: 18, color: COLOR.gray });
    game.history.slice(0, 6).forEach((d, i) => {
      const x = 470 + (i % 2) * 350;
      const y = 470 + Math.floor(i / 2) * 30;
      addText(this, x, y, `${d.day}日 ${gradeName(d.grade)}`, {
        size: 17,
        color: d.grade === 'legend' ? '#3f8f5f' : d.grade === 'scrap' ? '#b4472e' : COLOR.ink,
      });
      addText(this, x + 250, y, `${d.rep >= 0 ? '+' : ''}${d.rep} 口碑`, { size: 17, align: 'right', color: COLOR.gray });
    });

    this.ctx.save.clearRun();
    this.button({ x: 700, y: 646, label: '再来一局（空格）', key: 'Space', w: 320, onClick: () => this.ctx.go('title') });
    this.ctx.debug = () => ({ scene: 'result', win, coins: game.coins, reputation: game.reputation });
  }
}
