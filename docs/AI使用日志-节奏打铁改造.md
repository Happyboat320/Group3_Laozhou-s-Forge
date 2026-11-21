# AI 使用日志 · 第二次改造（节奏打铁音游 + smlab 谱面）

> 时间：2026-11-21
> 分支：`feature/rhythm-forge`（基于 `dev` 的 `7e74e4a`）
> 涉及提交：`f9698c9` → `7148b27` → `6174b73` → `9f7a5f6`
> 工具：DSH（DeepSeek Harness）+ smlab + FreePD 曲库，全程无 sub-agent，单会话完成

---

## 一、需求是怎么一步步定下来的

第一步没写代码，先做**需求拷问（grilling）**：把「改游戏」拆成一棵决策树，一轮轮问，每轮只问「前置条件已经确定」的那些问题，并给出推荐答案。

| 轮次 | 问到了什么 | 用户的选择 | 我的推荐 |
|---|---|---|---|
| 第 1 轮 | 用哪个 smlab、4 列怎么映射到 3 个方向、单局多长、难度体系、删还是藏、按键 | 保留 4 路不折叠；一次一首歌；出 3 个难度自选；另两个玩法代码直接删；A S D F | 折叠成 3 路、30 秒一单 |
| 第 2 轮 | 「四个竖直方向」到底是并排 4 轨还是中央汇聚；周边经营循环留不留 | 经典 4 轨竖直下落；**改成歌曲=装备的音游循环** | 精简为纯音游 |
| 第 3 轮 | 歌曲从哪来、排行榜存哪、挑战怎么出题、装备去留 | FreePD 补足 4 首；本地排行榜；随机 3 首统一普通难度；做装备库页面 | 同 |
| 第 4 轮 | 品质档位与概率表、挑战抽歌池、挑战是否掉装备 | 5 档概率分布；全曲库随机（含未解锁） | 同 |
| 第 5 轮 | 「挑战完成一个分数就随机获得传说」的确切规则 | **保底传说，替换普通掉落** | 同 |

**学到的**：用户的几轮回答改掉了我的三个推荐（折叠 3 路 → 保留 4 路；精简循环 → 歌曲=装备经济；挑战奖励规则）。如果一开始就按我的推荐动手，会白做三轮。

---

## 二、AI 分工一览

| 环节 | AI 做了什么 | 人的判断 |
|---|---|---|
| 仓库侦察 | 读 `AGENTS.md`、`config.ts`、`core/`、`scenes/`、`tools/shot.mjs`、`verify/tour.mjs`，摸清三层架构和既有约定 | 确认「core 只放纯逻辑、数值进 config」的边界 |
| 需求拷问 | 把模糊需求拆成 5 轮共 16 个问题 | 逐轮拍板 |
| 谱面流水线 | 装 smlab、下载模型、调通生成、写 `core/sm.ts` 解析器 | 选曲、难度 meter、`--holds 0` |
| 规则内核 | 写 `rhythm.ts` / `drop.ts` / `economy.ts` / `game.ts` | 掉落公式要能复现「困难+高分→传说约 17%」 |
| 场景 | 重写 7 个场景（title/songs/difficulty/play/settle/challenge/inventory） | 保留原素材画风 |
| 验证 | 改走查脚本、跑测试、截图复查 | 逐张看截图挑问题 |

---

## 三、关键决策与理由

**1. 谱面交给 smlab，不手搓。**
手写 10 首歌 × 3 难度 = 30 张谱，人力成本过高，而且踩不准鼓点。smlab 用 ML 模型从音频直接生成 StepMania `dance-single` 谱，自带 BPM/偏移检测和难度缩放。

**2. 解析器自己写，换算对齐 StepMania 语义。**
扒了 smlab 的 `timing.py` 源码确认：**beat 0 发生在音频的 `-OFFSET` 秒处**，`STOPS` 里的停顿在该拍音符判定之后。`core/sm.ts` 按这个规则实现 `beatToSeconds()`，用合成 .sm 样本测了偏移、变速、停顿、长按头、地雷、多难度六种情况。

**3. 掉落概率：权重按档位次方缩放。**
拷问时我承诺过「困难+90% 时传说约 16%」，但当时写的「乘良品及以上权重」在这个基准下最多只能到 4%。按承诺的效果反推，得到等效机制：**每高一档，权重再乘一次 f**（f = 难度系数 × 分数系数）。实现后在 README 里如实标注了这处修正。

**4. 音乐按需加载。**
10 首歌共 47MB，进游戏就全解码太浪费。`audio/track.ts` 用 `fetch` + `decodeAudioData`，选歌界面预取、进打歌场景才播。

**5. 判定不依赖音频时钟。**
场景自己按帧累加 `elapsed`，音频只管出声。音频加载失败游戏照打，只是没声音——比「等音频就绪再开始」稳。

---

## 四、踩坑记录（按出现顺序）

**① smlab 卡在下载，GPU 是 0%**
第一次跑 `smlab generate` 二十多分钟没动静，`nvidia-smi` 显示 0%。查 `/proc/<pid>/fd` 发现它连着 `185.199.x.x`（GitHub CDN）。用 `py-spy` 看调用栈失败（权限不足），改用 `/proc/<pid>/io` 和 strace 定位。

**② 权重文件名不对**
手动从镜像下载的 `smlab-0.1.1-chart.pt` 放到 `~/.local/share/smlab/`，但 smlab 本地认的是**去掉版本号**的 `chart.pt`（`asset_name()` 只在下载地址里加版本前缀）。改个名就认了。

**③ 真正的卡点是 HuggingFace**
修好权重名后模型能加载到 GPU（416MiB），但日志里出现 `connect_tcp host='huggingface.co'` 超时重试。demucs 4.1 从 HF hub 拉分离模型。解法：`export HF_ENDPOINT=https://hf-mirror.com`。**这一条是整件事最省时间的一步**——模型、权重都备好了，只差把域名换掉。

**④ 一个 mp3 读不了**
`BeatOne.mp3` 报 `could not read audio`。ffprobe 看是 256kbps、带 mjpeg 封面图。用 `ffmpeg -map 0:a -id3v2_version 0` 剥掉 ID3 重编码后正常。

**⑤ `KeySequence` 三次都没写对**
彩蛋的 `1 2 1 2` 检测：第一版用「超长就 shift」会让 `1 1 2 2` 误触发；第二版 `findIndex` 找第一个不匹配的位置，索引对错了；第三版改为「看缓冲区后缀是不是目标串前缀，取最长的那段」才通过测试。**测试先写、红了再改，比肉眼推演快。**

**⑥ 字段初始化器里访问 `this.ctx` 崩了**
`private egg = new KeySequence(this.ctx.config.egg.code)` —— 类字段初始化时 Phaser 的 `registry` 还没就绪，整个游戏白屏。错误是 `Cannot read properties of undefined (reading 'get')`，堆栈指向 `get ctx()`。改成在 `create()` 里初始化。

**⑦ 走查脚本被热更新打断**
`verify/tour.mjs` 跑着跑着报 `Execution context was destroyed, most likely because of a navigation`。原因是它用 `createServer` 起 dev server，我同时在改文件，HMR 把页面刷了。改成 `build()` + `preview()` 跑静态产物。

**⑧ 音符看不见**
截图里轨道是空的。原因是 `spawnY: -60` 让音符从画面外开始，而可见性条件 `y > 96` 又太严，加上第一首歌困难谱前 6 秒没音符，截图时机永远错过。改成从通道顶部生成、可见区间放宽到 `100 ~ hitLineY+70`。

**⑨ 装备库全灰**
装备库存的是器物 id（`cleaver`），素材 id 却是 `item_iron_cleaver_rare`。直接拿 `item.type` 取图 → 占位灰块。改成 `equipmentArt(type, quality)`。

**⑩ 选歌高亮框位置错乱**
用 `container.getBounds()` 拿世界坐标去画 Graphics，但 Graphics 自己在原点，导致框跑到屏幕左边。改成用容器的 `x/y` 自己算。

**⑪ 选中的卡片被挤出画面**
一排 10 张卡片按固定宽度排列，超出屏幕。改成「整排按光标位置平移，让选中的那张始终居中」。

---

## 五、grep 抓到的几个「假 bug」

排查过程中有两次看着像 bug、实际是测试脚本写错：

- **挑战模式抽歌死循环**：`startChallenge` 用 `splice(index,1)` 抽，固定 rng 抽到重复索引时 `pool` 在缩小而索引不变，循环卡住。这是真 bug，改成 Fisher-Yates 洗牌后取前 N。
- **`notes.length === 0`**：测试脚本按 `Digit3` 想选 Beat One，但那一步其实还在「选歌页」，Digit3 是第三张卡；再按一次才进难度页。动画流程本身没错。

---

## 六、验证方式

| 检查 | 命令 / 方法 | 结果 |
|---|---|---|
| 类型 + 单测 | `npm run check` | 32 项全过（谱面解析 9 + 规则 23） |
| 单曲全流程 | `node verify/tour.mjs` | 封面→选歌→难度→打歌→结算→卖出→装备库，无控制台报错 |
| 彩蛋 | 无头浏览器连按 `1 2 1 2` | 跳到结算、得分 8000（80%）、连击不断 |
| 谱面质量 | 逐首统计音符数与密度 | 1.25 ~ 4.07 nps，四列分布均衡 |
| 视觉复查 | 逐张看截图 | 发现并修掉 ⑧⑨⑩⑪ 四处布局问题 |

---

## 七、如果重来一次

1. **先确认「模型从哪下」再动手。** smlab 的卡片上写着「checkpoint 从 GitHub release 下载」，我按这个思路只备了 GitHub 镜像，漏了 demucs 走 HF。应该一开始就 `grep` 完所有包的网络调用。
2. **需求拷问的每一轮都该算一遍数值。** 掉落公式那处承诺（传说 16%）写的时候没验算，实现时才发现对不上，只能反推等效机制。
3. **走查脚本要和开发流程解耦。** dev server + HMR 在长时间流程里必然冲突，一开始就该用构建产物。
4. **截图脚本别猜下一帧。** 「等 2.5 秒再截」这种写法，遇到前奏长短不同的曲子必然错过；应该等到「状态满足条件」再截。

---

## 八、产物清单

| 文件 | 作用 |
|---|---|
| `src/core/sm.ts` | .sm 解析 + 拍→秒换算 |
| `src/core/rhythm.ts` | 判定窗口、整首计分、彩蛋序列 |
| `src/core/drop.ts` | 五档品质、掉落概率、卖价 |
| `src/core/economy.ts` | 金币、解锁、装备库、排行榜 |
| `src/core/game.ts` | 进度 + 对局状态、单曲/挑战开局 |
| `src/data/songs.ts` | 曲库数据、谱面读取、装备取图 |
| `src/audio/track.ts` | 歌曲按需加载与播放 |
| `src/scenes/*.ts` | 7 个场景（title / songs / difficulty / play / settle / challenge / inventory） |
| `assets/charts/*.sm` | 10 首 × 3 难度 = 30 张谱面 |
| `assets/music/*.mp3` | 10 首 CC0 音乐 |
| `tests/*.test.ts` | 32 项规则测试 |
| `verify/tour.mjs` | 无头浏览器全流程走查 |
