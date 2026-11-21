# 老周的铁匠铺

> **组号**：待填　**游戏名**：老周的铁匠铺
>
> | 组员 | 学号 | 提交记录里的用户名 | 负责内容 |
> |---|---|---|---|
> | 待填 | | | |
>
> 一首歌锻一件装备：铁块随音乐从四条道路竖直落下，按 A S D F 落锤。成绩越好、难度越高，越容易锻出高品质装备；装备能卖钱解锁新歌。另有挑战模式连打三首、总分上本地排行榜。

## 长什么样

| 画面 | 说明 |
|---|---|
| 封面 | 点街坊有反应，「怎么玩」里写了规则 |
| 选歌 | 四首歌各锻一件装备，显示最好成绩与解锁价格 |
| 难度 | 简单 / 普通 / 困难，音符数量和最好成绩一眼可见 |
| 打铁 | 四条竖直轨道，A S D F 键帽，底部中央是铁砧（落锤目标） |
| 结算 | 得分、准确率、最高连击，按概率锻出装备，可卖出或入库 |
| 挑战 | 随机三首连打，本地排行榜，保底一件传说装备 |
| 装备库 | 收藏的装备，随时卖成金币 |

截图在 `docs/screenshots/`；`verify/tour.mjs` 会自动走查一遍并截图到 `shots/<模式>/`。

## 运行

需要 Node.js 22（20.19 以上也行）和 Google Chrome（`npm run shot` 截图自检要用）。

```bash
npm install      # 第一次装依赖
npm run dev      # 打开 http://localhost:5173 ，改代码后自动刷新
npm run check    # 类型检查 + 规则测试（30 项）
npm run shot     # 模板自带的截图自检（按空格走流程）
npm run pack     # 打包成 release/index.html，双击就能玩
```

交作业用的包在 `release/index.html`：图片、代码、声音全部内联在一个文件里，离线双击就能玩。

技术栈：TypeScript + Vite + Phaser 4（2D 网页游戏框架）。

## 玩法说明

**一句话**：听着歌打铁——铁块落到判定线上时按 A S D F，成绩越好锻出的装备越好，装备卖钱解锁新歌。

### 一局的流程

`封面 → 选歌 → 选难度 → 打完整首歌 → 结算锻装备`。

- **四轨竖直下落**：← / ↓ / ↑ / → 四列从左到右，对应 **A S D F**。
- **判定**：完美 ±0.085 秒、不错 ±0.17 秒，更远算落空；空敲也罚（连击清零）。
- **计分**：准确率 = 各判定分值平均（完美 1 / 不错 0.6 / 落空 0），分数 = 准确率 × 10000。

### 曲库（4 首 CC0 音乐，每首一件装备）

| 曲目 | 分类 | 时长 | 装备 | 解锁价 |
|---|---|---|---|---|
| Inspiration | Upbeat | 2:14 | 长剑 | 免费 |
| Funshine | Upbeat | 2:45 | 马蹄铁 | 120 文 |
| Beat One | Electronic | 3:00 | 匕首 | 160 文 |
| Hit n Smash | Epic | 2:13 | 战斧 | 220 文 |

### 掉落：难度 × 分数决定品质（5 档）

基准分布（普通难度、60~80% 准确率）：凡品 52% / 良品 28% / 珍品 13% / 极品 5% / 传说 2%。

机制是「每高一档，权重再乘一次 f」，`f = 难度系数 × 分数系数`：

| 因子 | 取值 |
|---|---|
| 难度 | 简单 ×0.72 / 普通 ×1 / 困难 ×1.62 |
| 准确率 | <60% ×0.85 / 60~80% ×1 / 80~90% ×1.25 / ≥90% ×1.35 |

效果：**困难 + 90% 以上**时传说约 17%、极品+传说约 36%；**简单 + 低分**时凡品约 69%，几乎不出极品以上。

卖价：凡品 8 / 良品 18 / 珍品 40 / 极品 90 / 传说 200 文。

### 挑战模式

系统从全部曲目（含未解锁，相当于试玩）随机抽 3 首、统一「普通」难度连打；总分计入本地排行榜（Top 10）；打完**保底一件随机类型的传说装备**。挑战中途不能退出。

### 金币循环

装备卖出 → 金币 → 解锁新歌 → 打更高难度的歌 → 更好的装备。免费曲目只有 Inspiration，其余三首要攒钱开。

## 项目结构与文件分工

游戏分三层，每层只做自己的事（给 AI 的项目说明见 `AGENTS.md`）：

| 位置 | 作用 |
|---|---|
| `src/core/sm.ts` | .sm 谱面解析与「拍 → 秒」换算。纯逻辑 |
| `src/core/rhythm.ts` | 判定窗口、整首计分（判定/连击/准确率）。纯逻辑 |
| `src/core/drop.ts` | 五档品质、难度×分数修正的掉落概率、卖价。纯逻辑 |
| `src/core/economy.ts` | 金币、解锁、装备库、最好成绩、排行榜。纯逻辑 |
| `src/core/game.ts` | 游戏状态（进度 + 当前这一局）、单曲/挑战开局与推进。纯逻辑 |
| `src/config.ts` | 所有数值：判定窗口、四轨布局、曲库与价格、掉落概率表、挑战参数 |
| `src/data/songs.ts` | 曲库数据：曲目表 + 读 `assets/charts/*.sm` |
| `src/scenes/title.ts` | 封面 |
| `src/scenes/songs.ts` | 选歌与解锁 |
| `src/scenes/difficulty.ts` | 选难度 |
| `src/scenes/play.ts` | 打铁：四轨下落、A S D F 判定、铁砧与火花、进度条 |
| `src/scenes/settle.ts` | 结算：分数、锻装备、卖出/入库；挑战中途与收尾（保底传说） |
| `src/scenes/challenge.ts` | 挑战模式说明与排行榜 |
| `src/scenes/inventory.ts` | 装备库与卖出 |
| `src/scenes/common.ts` | 共用：面板、金币条、品质星级、飘字、返回按钮 |
| `src/audio/track.ts` | 歌曲按需加载与 WebAudio 播放（切到游戏时才解码） |
| `src/audio/bgm.ts` | 菜单背景音乐（WebAudio 现场合成） |
| `src/engine/`、`src/main.ts`、`tools/` | 框架：素材加载、合成音、存档、截图与打包脚本（未改） |
| `assets/charts/*.sm` | smlab 生成的谱面，每首 3 个难度 |
| `tests/core.test.ts`、`tests/sm.test.ts` | 规则测试：判定、计分、掉落概率、经济、对局流程、谱面解析 |
| `verify/tour.mjs` | 开发自检：无头 Chrome 完整走一局并截图 |

## 谱面怎么来的（smlab）

谱面不是手搓的，用 [smlab](https://github.com/Tatsh/smlab)（用 ML 从音频生成 StepMania `dance-single` 谱面）生成：

```bash
pip install "smlab[stems]"                     # 走清华镜像
# 模型权重放 ~/.local/share/smlab/{chart.pt,offset.pt}
export HF_ENDPOINT=https://hf-mirror.com        # demucs 的分离模型走 HF 国内镜像
smlab generate assets/music/Inspiration.mp3 -o out -T Inspiration \
  -D Easy:3 -D Medium:6 -D Hard:9 -f sm --holds 0
cp out/Inspiration/Inspiration.sm assets/charts/inspiration.sm
```

- `--holds 0`：不要长按，全部是单击音符；`-D` 三个难度一次出齐。
- 游戏里的 `core/sm.ts` 解析 .sm，按 `#OFFSET` / `#BPMS` / `#STOPS` 把拍子换算成歌曲秒数（与 StepMania 语义一致，有测试）。
- 换歌只要：mp3 放进 `assets/music/`，.sm 放进 `assets/charts/<id>.sm`，在 `config.ts` 的 `songs` 里加一条。

## 调手感

全在 `src/config.ts`：

- `rhythm.window`：判定窗口（完美 / 不错），想更宽容就调大。
- `rhythm.approach`：音符从出现到落线要几秒，按难度分；越小越快越难。
- `rhythm.hitLineY`、`laneGap`、`lanes`：轨道布局与判定线高度。
- `drop.base`：五档品质的基准权重；`drop.difficultyFactor`、`drop.scoreFactor`：难度与分数怎么影响高品质概率；`drop.sell`：卖价。
- `challenge`：抽几首、什么难度、排行榜留几名。
- `songs`：曲目、对应装备图、解锁价格。

## AI 创作日志

| 环节 | 工具 | 用 AI 做了什么 | 人的判断和修改 |
|---|---|---|---|
| 选型与游戏卡 | DSH | 读学生任务书和四份参考框架，比较四条参考路线，起草 `GAME_CARD.md` | 定了「一种输入、规则能测、手感能调」的方向 |
| 规则内核 | DSH | 写 `core/` 下的判定、计分、掉落概率、经济、对局流程 | 要求规则不许碰画面（便于写测试）；数值全部提到 `config.ts` |
| 谱面流水线 | DSH + smlab | 用 smlab 把 4 首 CC0 音乐各生成 3 个难度；写 `core/sm.ts` 解析 .sm 并换算成秒 | 选曲（Upbeat/Electronic/Epic 各取一）；`--holds 0` 只要单击；难度 meter 手动定 |
| 玩法与界面 | DSH | 四轨下落式打铁、铁砧/键帽/火花、选歌/难度/结算/挑战/装备库六个场景 | 保留原素材画风；判定窗口沿用旧版数值；按「难度×分数提升高品质概率」重做掉落 |
| 走查 | DSH + Chrome | `verify/tour.mjs` 无头跑完整局、自动打歌、截图、抓控制台报错 | 走查发现挑战抽歌可能死循环、空格键冲突等，逐个修 |

完整记录在 `ai-logs/`。

## 已知限制

- 菜单背景音乐是合成的，音色简单；打歌时用的是真音频（CC0）。
- 歌曲在选歌时才解码，第一次进某首歌的结算前会有一点加载时间（约 1~2 秒）。
- 排行榜存在本机 localStorage，换浏览器/清缓存会丢。
- 判定偏移没有做「音频延迟校准」设置；如果玩家设备声画不同步，只能改 `rhythm` 里的数值。
- 谱面难度是按 smlab 的 meter 粗分的（Easy 3~4 / Medium 6~8 / Hard 9~11），真人手感仍需试玩校准。
