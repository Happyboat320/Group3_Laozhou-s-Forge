// 标题 / 欢迎页：小镇街景、招牌、两侧站着街坊。点街坊会换成开心表情跳一下。
import Phaser from 'phaser';
import { startBgm } from '../audio/bgm';
import { BaseScene } from '../engine/scenes';
import { COLOR, FONT, hex } from '../engine/ui';

// 左右两组街坊：[角色 ID 前缀, x, 是否在后排]。后排小一点、靠上一点。
const FOLKS: [string, number, boolean][] = [
  ['char_grandma', 92, true],
  ['char_auntie', 300, true],
  ['char_laozhou', 172, false],
  ['char_apprentice', 382, false],
  ['char_scholar', 980, true],
  ['char_kid', 1196, true],
  ['char_merchant', 898, false],
  ['char_heroine', 1104, false],
];

const HOW_TO = [
  '老周闪了腰，铺子交给你看三天，一天两单。',
  '',
  '① 接单：看顾客要什么器型、什么成色。',
  '② 打造：火候 → 三锤 → 淬火，每次都在绿区按空格。',
  '③ 交付：成色越好，钱越多，口碑越高。',
  '',
  '口碑掉光就提前收摊；三天后口碑够高，老周才传手艺。',
];

export class TitleScene extends BaseScene {
  private howTo: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('title');
  }

  create() {
    this.howTo = null;
    startBgm(this, 0.5);
    this.background('bg_title');
    const veil = this.add.graphics();
    veil.fillGradientStyle(hex(COLOR.cream), hex(COLOR.cream), hex(COLOR.cream), hex(COLOR.cream), 0.55, 0.55, 0, 0);
    veil.fillRect(0, 0, 1280, 300);

    for (const [prefix, x, back] of FOLKS) this.addFolk(prefix, x, back);

    const logo = this.art('logo_title', 640, 138, 720);
    this.tweens.add({ targets: logo, y: 146, duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    let y = 336;
    this.button({
      x: 640, y, label: '开炉（空格）', key: 'Space',
      onClick: () => this.start(),
    });
    const run = this.ctx.save.run;
    if (run) {
      y += 92;
      this.button({
        x: 640, y, label: '继续（C）', key: 'KeyC', style: 'secondary',
        onClick: () => {
          this.ctx.game = run;
          this.ctx.go('shop');
        },
      });
    }
    y += 92;
    this.button({
      x: 640, y, label: '怎么玩（H）', key: 'KeyH', style: 'secondary',
      onClick: () => this.toggleHowTo(),
    });

    this.label(640, 694, '点一点街坊打个招呼', { size: 18, align: 'center', color: COLOR.ink }).setAlpha(0.7);
  }

  private start() {
    this.ctx.go('mode');
  }

  private toggleHowTo() {
    if (this.howTo) {
      this.howTo.destroy();
      this.howTo = null;
      return;
    }
    const veil = this.add.rectangle(640, 360, 1280, 720, 0x1b1714, 0.55).setDepth(20);
    const card = this.add.image(640, 344, 'ui_panel_wood').setDisplaySize(760, 470).setDepth(21);
    const title = this.add.text(640, 168, '怎么玩', {
      fontFamily: FONT, fontSize: '40px', fontStyle: 'bold', color: COLOR.ink,
    }).setOrigin(0.5).setDepth(22);
    const body = this.add.text(640, 200, HOW_TO.join('\n'), {
      fontFamily: FONT,
      fontSize: '22px',
      color: COLOR.ink,
      align: 'left',
      lineSpacing: 12,
    }).setOrigin(0.5, 0).setDepth(22);

    const hint = this.add.text(640, 548, '按 空格 / 点任意处 关闭', {
      fontFamily: FONT, fontSize: '18px', color: COLOR.gray,
    }).setOrigin(0.5).setDepth(22);

    const group = this.add.container(0, 0, [veil, card, title, body, hint]).setDepth(20);
    group.setSize(1280, 720).setInteractive();
    group.on('pointerdown', () => {
      group.destroy();
      this.howTo = null;
    });
    this.howTo = group;
  }

  private addFolk(prefix: string, x: number, back: boolean) {
    const h = back ? 236 : 276;
    const baseY = back ? 676 : 732;
    const folk = this.art(`${prefix}_neutral`, x, baseY, h * 0.75).setOrigin(0.5, 1);
    folk.setFlipX(x > 640);
    folk.setDepth(back ? 0 : 1);
    const scaleY = folk.scaleY;
    this.tweens.add({
      targets: folk, scaleY: scaleY * 1.025, duration: 1100 + Math.random() * 500,
      yoyo: true, repeat: -1, ease: 'Sine.inOut', delay: Math.random() * 800,
    });

    let busy = false;
    folk.setInteractive({ useHandCursor: true, pixelPerfect: true, alphaTolerance: 10 });
    folk.on('pointerdown', () => {
      if (busy || this.howTo) return;
      busy = true;
      folk.setTexture(`${prefix}_happy`);
      this.sfx('sfx_coin', { volume: 0.6 });
      this.tweens.add({ targets: folk, y: baseY - 36, duration: 160, yoyo: true, ease: 'Quad.out' });
      const heart = this.art('fx_heart', x + (x > 640 ? -40 : 40), baseY - h + 10, 56).setDepth(5);
      this.tweens.add({ targets: heart, y: heart.y - 70, alpha: 0, duration: 1100, ease: 'Sine.out', onComplete: () => heart.destroy() });
      this.time.delayedCall(1400, () => {
        folk.setTexture(`${prefix}_neutral`);
        busy = false;
      });
    });
  }
}
