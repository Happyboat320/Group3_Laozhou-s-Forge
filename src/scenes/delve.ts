// 地窟：连续移动（不是一格一格跳），怪物实时朝你走，靠近矿脉自动挖。
// 规则全在 core/run.ts，这里只做三件事：收键盘、每帧推一次逻辑、把结果画出来。
import Phaser from 'phaser';
import { generateDungeon, type Dungeon } from '../core/dungeon';
import { gainMaterial, gainRelic, orderAt, rollMaterial, type GameState } from '../core/game';
import {
  computeVisible,
  interactableHere,
  newDelve,
  updateRun,
  type DelveEvent,
  type DelveState,
  type InputState,
} from '../core/run';
import { mulberry32 } from '../core/rng';
import { BaseScene } from '../engine/scenes';
import { COLOR, addText, hex } from '../engine/ui';

const MOB_ART = ['mob_rust_slime', 'mob_bat', 'mob_bandit', 'mob_wisp'];

export class DelveScene extends BaseScene {
  private run!: DelveState;
  private dungeon!: Dungeon;
  private rnd = mulberry32(1);
  private size = 76;

  private tiles!: Phaser.GameObjects.Graphics;
  private fog!: Phaser.GameObjects.Graphics;
  private playerSprite!: Phaser.GameObjects.Image;
  private hammer!: Phaser.GameObjects.Image;
  private mobSprites = new Map<number, Phaser.GameObjects.Image>();
  private oreSprites = new Map<string, Phaser.GameObjects.Image>();
  private chestSprites = new Map<string, Phaser.GameObjects.Image>();
  private propSprites = new Map<number, Phaser.GameObjects.Image>();
  private stairsMark!: Phaser.GameObjects.Container;
  private mineBar!: Phaser.GameObjects.Rectangle;
  private hpBar!: Phaser.GameObjects.Rectangle;
  private hpText!: Phaser.GameObjects.Text;
  private bagText!: Phaser.GameObjects.Text;
  private tipText!: Phaser.GameObjects.Text;

  private keys = new Set<string>();
  private busy = false;
  private lastCell = '';
  private swing = 0;

  constructor() {
    super('delve');
  }

  create() {
    const { game, config } = this.ctx;
    const order = orderAt(game);
    if (!order) {
      this.ctx.go('result');
      return;
    }

    this.size = config.dungeon.tile;
    this.rnd = mulberry32(game.seed * 977 + game.day * 31 + 7);
    this.busy = false;
    this.keys.clear();
    this.lastCell = '';
    this.swing = 0;
    this.mobSprites.clear();
    this.oreSprites.clear();
    this.chestSprites.clear();
    this.propSprites.clear();

    this.dungeon = generateDungeon(config, game.seed * 131 + game.day * 17 + game.history.length * 7, game.day);
    this.run = newDelve(config, this.dungeon, game.hp, game.relics);

    this.cameras.main.setBackgroundColor('#0b0908');
    this.tiles = this.add.graphics();
    this.fog = this.add.graphics().setDepth(20);

    this.drawEntities();
    this.drawHud();
    this.redraw();

    // 连续移动要"按住"，所以自己收 keydown / keyup（BaseScene 的 onKey 只给按下）
    const down = (event: KeyboardEvent) => {
      this.keys.add(event.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
    };
    const up = (event: KeyboardEvent) => this.keys.delete(event.code);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    });

    this.ctx.debug = () => ({
      scene: 'delve',
      day: game.day,
      order: order.id,
      hp: Math.round(this.run.player.hp),
      pos: [Math.round(this.run.player.x), Math.round(this.run.player.y)],
      mobs: this.run.mobs.length,
      ores: this.run.ores.length,
      chests: this.run.chests.filter((c) => !c.opened).length,
      stairs: [this.dungeon.stairs.x * this.size + this.size / 2, this.dungeon.stairs.y * this.size + this.size / 2],
      oreList: this.run.ores.map((o) => [Math.round(o.x), Math.round(o.y)]),
      chestList: this.run.chests.filter((c) => !c.opened).map((c) => [Math.round(c.x), Math.round(c.y)]),
      mobList: this.run.mobs.map((m) => [Math.round(m.x), Math.round(m.y)]),
      outcome: this.run.outcome,
      materials: game.materials,
    });
  }

  // ---- 每帧 --------------------------------------------------------------

  update(_time: number, delta: number) {
    if (this.busy) return;
    const dt = Math.min(delta, 50) / 1000;
    const k = this.keys;
    const input: InputState = {
      dx: (k.has('ArrowRight') || k.has('KeyD') ? 1 : 0) - (k.has('ArrowLeft') || k.has('KeyA') ? 1 : 0),
      dy: (k.has('ArrowDown') || k.has('KeyS') ? 1 : 0) - (k.has('ArrowUp') || k.has('KeyW') ? 1 : 0),
      attack: k.has('Space') || k.has('KeyJ'),
      mine: k.has('KeyK'),
    };

    const events = updateRun(this.run, this.ctx.config, input, dt, this.rnd);
    if (this.swing > 0) this.swing = Math.max(0, this.swing - dt);

    this.applyEvents(events);
    this.syncSprites();

    const p = this.run.player;
    const cell = `${Math.floor(p.x / this.size)},${Math.floor(p.y / this.size)}`;
    if (cell !== this.lastCell) {
      this.lastCell = cell;
      this.redraw();
    }
    this.updateHud();

    if (this.run.outcome === 'stairs') this.finishTrip();
    else if (this.run.outcome === 'dead') this.die();
  }

  // ---- 画面 --------------------------------------------------------------

  private offsetX() {
    return Math.round((this.ctx.config.view.width - this.dungeon.cols * this.size) / 2);
  }

  private offsetY() {
    return 76;
  }

  private tileCenter(tx: number, ty: number) {
    return { cx: this.offsetX() + tx * this.size + this.size / 2, cy: this.offsetY() + ty * this.size + this.size / 2 };
  }

  private toScreen(x: number, y: number) {
    return { sx: this.offsetX() + x, sy: this.offsetY() + y };
  }

  private drawEntities() {
    for (const mob of this.run.mobs) {
      const { sx, sy } = this.toScreen(mob.x, mob.y);
      this.mobSprites.set(mob.id, this.art(MOB_ART[mob.id % MOB_ART.length], sx, sy, 56).setDepth(6));
    }
    for (const ore of this.run.ores) {
      const { sx, sy } = this.toScreen(ore.x, ore.y);
      this.oreSprites.set(`${ore.x},${ore.y}`, this.art('tile_ore_node', sx, sy, 60).setDepth(4));
    }
    for (const chest of this.run.chests) {
      const { sx, sy } = this.toScreen(chest.x, chest.y);
      this.chestSprites.set(`${chest.x},${chest.y}`, this.art('item_chest', sx, sy, 48).setDepth(4));
    }

    for (const prop of this.run.props) {
      const { sx, sy } = this.toScreen(prop.x, prop.y);
      this.propSprites.set(prop.id, this.art(this.propArt(prop.kind), sx, sy + 4, 52).setDepth(5));
    }

    const stairs = this.tileCenter(this.dungeon.stairs.x, this.dungeon.stairs.y);
    const glow = this.art('fx_glow', 0, 0, 108).setAlpha(0.5);
    const label = addText(this, 0, 0, '↓', { size: 38, weight: 700, align: 'center', color: '#fff3d0', stroke: '#3a2416' });
    this.stairsMark = this.add.container(stairs.cx, stairs.cy, [glow, label]).setDepth(4);
    this.tweens.add({ targets: glow, alpha: 0.85, duration: 900, yoyo: true, repeat: -1 });

    const p = this.toScreen(this.run.player.x, this.run.player.y);
    this.playerSprite = this.art('char_apprentice_neutral', p.sx, p.sy, 50).setDepth(8);
    this.hammer = this.art('hammer_small', p.sx, p.sy, 40).setDepth(9).setVisible(false);

    // 挖矿进度条
    this.mineBar = this.add.rectangle(0, 0, 0, 6, hex('#ffd9a0')).setDepth(12).setVisible(false);
    this.syncSprites();
  }

  /** 每帧把贴图挪到逻辑坐标上。 */
  private syncSprites() {
    const p = this.toScreen(this.run.player.x, this.run.player.y);
    this.playerSprite.setPosition(p.sx, p.sy);

    const faceLeft = this.run.player.fx < 0;
    this.playerSprite.setFlipX(faceLeft);

    // 锤子：挥的时候露出来，朝面朝的方向
    if (this.swing > 0) {
      const dirX = this.run.player.fx || (faceLeft ? -1 : 1);
      const dirY = this.run.player.fy;
      const len = Math.hypot(dirX, dirY) || 1;
      this.hammer
        .setVisible(true)
        .setPosition(p.sx + (dirX / len) * 34, p.sy + (dirY / len) * 34)
        .setAngle(-30 + (1 - this.swing / 0.18) * 70);
    } else {
      this.hammer.setVisible(false);
    }

    for (const mob of this.run.mobs) {
      const { sx, sy } = this.toScreen(mob.x, mob.y);
      let sprite = this.mobSprites.get(mob.id);
      if (!sprite) {
        sprite = this.art(MOB_ART[mob.id % MOB_ART.length], sx, sy, 56).setDepth(6);
        this.mobSprites.set(mob.id, sprite);
      }
      sprite.setPosition(sx, sy);
    }
    for (const [key, sprite] of this.mobSprites) {
      if (!this.run.mobs.some((m) => m.id === Number(key))) {
        sprite.destroy();
        this.mobSprites.delete(key);
      }
    }
    for (const [key, sprite] of this.oreSprites) {
      if (!this.run.ores.some((o) => `${Math.round(o.x)},${Math.round(o.y)}` === key)) {
        sprite.destroy();
        this.oreSprites.delete(key);
      }
    }
    for (const [key, sprite] of this.propSprites) {
      if (!this.run.props.some((p) => p.id === key)) {
        sprite.destroy();
        this.propSprites.delete(key);
      }
    }
    for (const [key, sprite] of this.chestSprites) {
      const chest = this.run.chests.find((c) => `${c.x},${c.y}` === key);
      if (chest) sprite.setAlpha(chest.opened ? 0.35 : 1);
    }
  }

  private propArt(kind: string) {
    if (kind === 'barrel') return 'tile_barrel';
    if (kind === 'rock') return 'tile_rock';
    return 'tile_crate';
  }

  private redraw() {
    const { cols, rows } = this.dungeon;
    // 视线：从角色打直线出去，被墙挡住就看不见
    const visArr = computeVisible(this.run);
    const visible = new Set<number>();
    for (let i = 0; i < visArr.length; i += 1) if (visArr[i]) visible.add(i);

    this.tiles.clear();
    this.fog.clear();

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const i = y * cols + x;
        const seen = this.run.seen[i];
        const lit = visible.has(i);
        const px = this.offsetX() + x * this.size;
        const py = this.offsetY() + y * this.size;

        if (this.dungeon.tiles[i] === 'floor') {
          const hash = ((x * 73856093) ^ (y * 19349663)) >>> 0;
          const pal = [0x3a2a20, 0x3f2e23, 0x362720, 0x3d2d21];
          this.tiles.fillStyle(lit ? pal[hash % pal.length] : 0x241a14, 1);
          this.tiles.fillRect(px, py, this.size, this.size);
          if (y > 0 && this.dungeon.tiles[(y - 1) * cols + x] === 'wall') {
            this.tiles.fillStyle(0x6b4c36, lit ? 0.55 : 0.25);
            this.tiles.fillRect(px, py, this.size, 5);
          }
          if (hash % 9 === 0) {
            this.tiles.fillStyle(0x1e1410, lit ? 0.35 : 0.2);
            this.tiles.fillCircle(px + (hash % 40) + 18, py + (hash % 30) + 24, 3 + (hash % 4));
          }
        } else {
          this.tiles.fillStyle(lit ? 0x241c17 : 0x120d0a, 1);
          this.tiles.fillRect(px, py, this.size, this.size);
        }

        // 视野外一律全黑，不留记忆
        if (!lit) {
          this.fog.fillStyle(0x050403, 1);
          this.fog.fillRect(px, py, this.size, this.size);
        }
      }
    }

    this.stairsMark.setVisible(this.run.seen[this.dungeon.stairs.y * cols + this.dungeon.stairs.x]);
  }


  // ---- HUD ---------------------------------------------------------------

  private drawHud() {
    const { game } = this.ctx;
    const order = orderAt(game)!;

    this.add.rectangle(640, 34, 1280, 68, 0x100c0a, 0.82).setOrigin(0.5, 0).setDepth(30);
    addText(this, 26, 34, `第 ${game.day} 天　${order.customerName}要「${order.itemName}」`, {
      size: 21, weight: 700, color: COLOR.cream,
    }).setDepth(31);

    this.hpText = addText(this, 560, 34, '', { size: 19, color: COLOR.cream }).setDepth(31);
    this.add.rectangle(560, 58, 180, 12, 0x2a1d18).setOrigin(0, 0.5).setDepth(31);
    this.hpBar = this.add.rectangle(562, 58, 176, 8, hex('#b4472e')).setOrigin(0, 0.5).setDepth(32);

    this.bagText = addText(this, 760, 34, '', { size: 19, color: COLOR.cream }).setDepth(31);
    this.tipText = addText(this, 640, 690, '', { size: 17, align: 'center', color: COLOR.cream, stroke: '#1b1410' }).setDepth(31);

    this.updateHud();
  }

  private updateHud() {
    const { game, config } = this.ctx;
    const hp = this.run.player.hp;
    this.hpText.setText(`血 ${Math.round(hp)} / ${this.run.player.maxHp}`);
    this.hpBar.width = 176 * Math.max(0, hp / this.run.player.maxHp);
    this.bagText.setText(config.materials.map((m) => `${m.name}×${game.materials[m.id] ?? 0}`).join('　'));

    const here = interactableHere(this.run, config);
    this.tipText.setText(
      here === 'ore'
        ? '站在矿边上，按住 K 挖'
        : here === 'chest'
          ? '宝箱会自动打开'
          : '方向键 / WASD 移动　空格 / J 挥锤（能砸箱桶）　按住 K 挖矿　↓ 下一层',
    );
  }

  // ---- 反馈 --------------------------------------------------------------

  private applyEvents(events: DelveEvent[]) {
    for (const e of events) {
      if (e.kind === 'swing') {
        this.swing = 0.18;
        this.sfx('sfx_hammer_light', { volume: 0.45 });
      } else if (e.kind === 'hit') {
        this.cameras.main.shake(60, 0.003);
        this.popAt(e.x, e.y - 20, `-${e.damage}`, '#ffd9a0');
      } else if (e.kind === 'smash') {
        this.sfx('sfx_hammer_heavy', { volume: 0.6 });
        this.cameras.main.shake(80, 0.004);
        this.popAt(e.x, e.y, '碎了', '#cbb59a');
      } else if (e.kind === 'hurt') {
        this.sfx('sfx_miss', { volume: 0.5 });
        this.cameras.main.shake(120, 0.005);
        this.cameras.main.flash(100, 110, 20, 20);
      } else if (e.kind === 'mine') {
        this.mineBar.setVisible(true);
        this.sfx('sfx_tick', { volume: 0.25 });
        const p = this.toScreen(e.x, e.y);
        this.mineBar.setPosition(p.sx - 26, p.sy - 44).setSize(52 * e.ratio, 6);
      } else if (e.kind === 'ore') {
        this.mineBar.setVisible(false);
        const id = rollMaterial(this.ctx.config, this.ctx.game.relics.includes('eye'));
        const mat = this.ctx.config.materials.find((m) => m.id === id)!;
        gainMaterial(this.ctx.game, id, 1);
        this.sfx('sfx_coin', { volume: 0.7 });
        this.popAt(e.x, e.y, `+${mat.name}`, '#8fd19e');
      } else if (e.kind === 'spawn') {
        this.popAt(e.x * this.size + this.size / 2, e.y * this.size + this.size / 2, '来了！', '#e8893a');
      } else if (e.kind === 'chest') {
        this.sfx('sfx_coin', { volume: 0.8 });
        const relic = gainRelic(this.ctx.game, this.ctx.config);
        if (relic) {
          const info = this.ctx.config.relics.find((r) => r.id === relic);
          this.popAt(e.x, e.y, info ? info.name : '词条', '#ffd9a0');
        }
      }
    }
  }

  private lastMobPos(id: number) {
    const sprite = this.mobSprites.get(id);
    if (!sprite) return null;
    return { x: sprite.x - this.offsetX(), y: sprite.y - this.offsetY() };
  }



  private popAt(x: number, y: number, text: string, color: string) {
    const p = this.toScreen(x, y);
    const t = addText(this, p.sx, p.sy - 10, text, { size: 22, weight: 700, align: 'center', color, stroke: '#1b1410' }).setDepth(40);
    this.tweens.add({ targets: t, y: p.sy - 60, alpha: 0, duration: 700, onComplete: () => t.destroy() });
  }

  // ---- 收尾 --------------------------------------------------------------

  private finishTrip() {
    if (this.busy) return;
    this.busy = true;
    const { game } = this.ctx;
    game.hp = Math.max(1, Math.round(this.run.player.hp));
    this.ctx.save.writeRun(game);

    this.add.rectangle(640, 360, 1280, 720, 0x000000, 0.6).setDepth(50);
    addText(this, 640, 300, '这一趟到底了', { size: 40, weight: 700, align: 'center', color: '#fff6dc' }).setDepth(51);
    addText(this, 640, 356, `血还剩 ${game.hp}　材料 ${Object.entries(game.materials).map(([k, v]) => `${k}×${v}`).join(' ') || '空'}`, {
      size: 20, align: 'center', color: COLOR.cream, wrap: 900,
    }).setDepth(51);

    this.button({ x: 640, y: 470, label: '回铺子打造（空格）', key: 'Space', onClick: () => this.ctx.go('shop') }).setDepth(52);
    this.sfx('sfx_deliver', { volume: 0.8 });
  }

  private die() {
    if (this.busy) return;
    this.busy = true;
    const { game } = this.ctx;
    game.hp = 0;
    game.endReason = 'lose';
    this.ctx.save.clearRun();
    this.add.rectangle(640, 360, 1280, 720, 0x120404, 0.75).setDepth(50);
    addText(this, 640, 300, '你倒在了地窟里', { size: 44, weight: 700, align: 'center', color: '#ff9f8f' }).setDepth(51);
    addText(this, 640, 360, '这一局到此为止。老周的铺子，没人接手了。', { size: 20, align: 'center', color: COLOR.cream }).setDepth(51);
    this.button({ x: 640, y: 470, label: '重来（空格）', key: 'Space', onClick: () => this.ctx.go('title') }).setDepth(52);
    this.sfx('sfx_scrap', { volume: 0.9 });
  }
}
