// StepMania .sm 谱面解析：纯逻辑，把 smlab 生成的 .sm 文本解析成「哪一列、第几拍」的音符序列，
// 再按 OFFSET / BPMS / STOPS 把拍子换算成歌曲秒数。不碰文件和声音，所以能直接写测试。
//
// 换算语义与 smlab（以及 StepMania 源码）一致：
//   beat 0 发生在歌曲的 -OFFSET 秒处（#OFFSET 为正表示 beat 0 在歌曲开始之前）。
//   STOPS 里每个 beat 处的停顿，发生在该拍的音符判定之后，所以只影响它后面的音符。
//
// 列序是 dance-single 的固定顺序：0=左 1=下 2=上 3=右，游戏里直接对应 A S D F 四条轨道。

/** 音符：第几列（0~3）、第几拍。 */
export interface SmNote {
  lane: number;
  beat: number;
}

/** 一张分难度的谱。 */
export interface SmChart {
  /** .sm 里写的难度名，如 Easy / Medium / Hard */
  difficulty: string;
  meter: number;
  notes: SmNote[];
}

export interface SmBpmSegment {
  beat: number;
  bpm: number;
}

export interface SmStop {
  beat: number;
  seconds: number;
}

export interface SmTiming {
  /** #OFFSET 的值（秒）。beat 0 发生在 -offset 秒。 */
  offset: number;
  bpms: SmBpmSegment[];
  stops: SmStop[];
}

export interface ParsedSm {
  title: string;
  artist: string;
  timing: SmTiming;
  charts: SmChart[];
}

/** .sm 一拍 4 行（十六分音符）是常规；实际行数以小节内的行数为准。 */
const LANES = 4;
const BEATS_PER_MEASURE = 4;
/** 音符行只含这些字符：0~4 是格子，M 地雷，L/F 长按相关。 */
const NOTE_ROW = /^[0-4MLF]+$/i;

/**
 * 解析 #TAG:value; 形式。同一个 tag 出现多次（比如每个难度一段 #NOTES）就都记下来。
 * 注意：值的原文里可能有逗号（#NOTES 的音符数据用逗号分小节），所以这里不切分。
 */
function readTags(text: string): Map<string, string[]> {
  const tags = new Map<string, string[]>();
  // 去掉 // 行注释，避免注释里的 # 干扰
  const clean = text.replace(/^\s*\/\/.*$/gm, '');
  for (const match of clean.matchAll(/#([A-Z0-9]+)\s*:([^;]*);/gi)) {
    const name = match[1].toUpperCase();
    const value = match[2].trim();
    const list = tags.get(name);
    if (list) list.push(value);
    else tags.set(name, [value]);
  }
  return tags;
}

/** 解析 "beat=值,beat=值" 形式的时间列表（BPMS / STOPS）。 */
function parseNumberList(raw: string[], fallback: number): { beat: number; value: number }[] {
  const out: { beat: number; value: number }[] = [];
  for (const occurrence of raw) {
    for (const pair of occurrence.split(',')) {
      const [b, v] = pair.split('=').map((x) => Number.parseFloat(x));
      if (Number.isFinite(b) && Number.isFinite(v)) out.push({ beat: b, value: v });
    }
  }
  if (!out.length) out.push({ beat: 0, value: fallback });
  out.sort((a, b) => a.beat - b.beat);
  return out;
}

/**
 * 解析一整份 .sm 文本。格式是 smlab 生成的标准 MSD：
 * #NOTES: 一段里依次是 stepstype / 描述 / 难度 / meter / 雷达 / 音符数据，用冒号分隔。
 */
export function parseSm(text: string): ParsedSm {
  const tags = readTags(text);
  const timing: SmTiming = {
    offset: Number.parseFloat(tags.get('OFFSET')?.[0] ?? '0') || 0,
    bpms: parseNumberList(tags.get('BPMS') ?? [], 120).map(({ beat, value }) => ({ beat, bpm: value })),
    stops: parseNumberList(tags.get('STOPS') ?? [], 0)
      .filter(({ value }) => value !== 0)
      .map(({ beat, value }) => ({ beat, seconds: value })),
  };

  const charts: SmChart[] = [];
  for (const raw of tags.get('NOTES') ?? []) {
    const chart = parseNotesBlock(raw);
    if (chart) charts.push(chart);
  }

  return {
    title: tags.get('TITLE')?.[0] ?? '',
    artist: tags.get('ARTIST')?.[0] ?? '',
    timing,
    charts,
  };
}

/** 解析 #NOTES: 的一段原文。 */
function parseNotesBlock(block: string): SmChart | null {
  // 字段：stepstype : description : difficulty : meter : radar : notedata（前 5 个冒号前是字段）
  const fields = block.split(':');
  if (fields.length < 6) return null;
  const stepType = fields[0].trim();
  if (stepType && stepType !== 'dance-single') return null;
  const difficulty = fields[2].trim();
  const meter = Number.parseInt(fields[3], 10) || 0;
  const data = fields.slice(5).join(':');

  const notes: SmNote[] = [];
  data.split(',').forEach((measure, measureIndex) => {
    const rows = measure
      .split(/\r?\n/)
      .map((row) => row.trim())
      .filter((row) => row.length >= LANES && NOTE_ROW.test(row));
    const step = BEATS_PER_MEASURE / Math.max(rows.length, 1);
    rows.forEach((row, rowIndex) => {
      const beat = measureIndex * BEATS_PER_MEASURE + rowIndex * step;
      for (let lane = 0; lane < LANES; lane += 1) {
        const cell = row[lane];
        // '1' 普通音符、'2' 长按头、'4' roll 头（都算一个要按的点）；'3' 尾巴、'M' 地雷跳过
        if (cell === '1' || cell === '2' || cell === '4') notes.push({ lane, beat });
      }
    });
  });

  notes.sort((a, b) => a.beat - b.beat || a.lane - b.lane);
  return { difficulty, meter, notes };
}

/** 把第 beat 拍换算成歌曲秒数（与 StepMania 一致）。 */
export function beatToSeconds(timing: SmTiming, beat: number): number {
  const bpms = timing.bpms.length ? timing.bpms : [{ beat: 0, bpm: 120 }];
  let seconds = -timing.offset;
  for (let i = 0; i < bpms.length; i += 1) {
    const seg = bpms[i];
    const nextBeat = i + 1 < bpms.length ? bpms[i + 1].beat : Number.POSITIVE_INFINITY;
    const to = Math.min(beat, nextBeat);
    if (to > seg.beat) seconds += ((to - seg.beat) * 60) / seg.bpm;
    if (beat <= nextBeat) break;
  }
  // 只有发生在这一拍之前的停顿才算进来（停顿在该拍音符判定之后才开始）
  for (const stop of timing.stops) {
    if (stop.beat < beat) seconds += stop.seconds;
  }
  return seconds;
}

/** 游戏里用的音符：列 + 落锤时刻（秒）。 */
export interface ChartNote {
  lane: number;
  time: number;
}

/** 取某张谱的音符并换算成秒。难度名不区分大小写。 */
export function chartNotes(parsed: ParsedSm, difficulty: string): ChartNote[] {
  const chart = parsed.charts.find((c) => c.difficulty.toLowerCase() === difficulty.toLowerCase());
  if (!chart) return [];
  return chart.notes.map((n) => ({ lane: n.lane, time: beatToSeconds(parsed.timing, n.beat) }));
}

/** 这份谱打完大概要多少秒（最后一个音符的时刻 + 一点余量）。 */
export function chartDuration(parsed: ParsedSm, difficulty: string): number {
  const notes = chartNotes(parsed, difficulty);
  return notes.length ? notes[notes.length - 1].time + 1.5 : 0;
}
