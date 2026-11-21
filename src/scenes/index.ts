// 所有场景在这里登记。新写一个场景：新建文件导出一个继承 BaseScene 的类，
// 构造函数里 super('名字')，再加进下面的数组；切过去用 this.ctx.go('名字')。
import { DayEndScene } from './dayend';
import { ForgeScene } from './forge';
import { HeatScene } from './heat';
import { ModeScene } from './mode';
import { ResultScene } from './result';
import { RhythmScene } from './rhythm';
import { ShopScene } from './shop';
import { TitleScene } from './title';

export const scenes = [TitleScene, ModeScene, ShopScene, ForgeScene, RhythmScene, HeatScene, DayEndScene, ResultScene];
