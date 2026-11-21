// core/sm.ts：.sm 谱面解析与拍→秒换算的测试。
import { describe, expect, test } from 'vitest';
import { beatToSeconds, chartDuration, chartNotes, parseSm } from '../src/core/sm';

/** 一份手工拼的 .sm：120 BPM，第 8 拍起变 60 BPM，第 4 拍停 0.5 秒，OFFSET -0.1。 */
const SM = `
#TITLE:Test Song;
#ARTIST:Tester;
#OFFSET:-0.100;
#BPMS:0.000=120.000,8.000=60.000;
#STOPS:4.000=0.500;
#NOTES:
     dance-single:
     :
     Easy:
     3:
     0.100,0.200,0.300,0.400,0.500:
1000
0100
0000
0000
,
0001
0000
0000
0000
;
#NOTES:
     dance-single:
     :
     Hard:
     9:
     0.200,0.300,0.400,0.500,0.600:
1000
0100
0010
0001
,
2000
0100
3000
0000
,
0M00
0000
0000
0000
;
`;

describe('parseSm', () => {
  const parsed = parseSm(SM);

  test('读出标题、艺人和时间轴', () => {
    expect(parsed.title).toBe('Test Song');
    expect(parsed.artist).toBe('Tester');
    expect(parsed.timing.offset).toBeCloseTo(-0.1);
    expect(parsed.timing.bpms).toEqual([
      { beat: 0, bpm: 120 },
      { beat: 8, bpm: 60 },
    ]);
    expect(parsed.timing.stops).toEqual([{ beat: 4, seconds: 0.5 }]);
  });

  test('两张谱按难度分开', () => {
    expect(parsed.charts.map((c) => c.difficulty)).toEqual(['Easy', 'Hard']);
    expect(parsed.charts[0].meter).toBe(3);
    expect(parsed.charts[1].meter).toBe(9);
  });

  test('音符行解析出列和拍子', () => {
    const easy = chartNotes(parsed, 'Easy');
    expect(easy).toEqual([
      { lane: 0, time: 0.1 }, // 第 0 小节第 0 行
      { lane: 1, time: 0.6 }, // 第 0 小节第 1 行（1 拍 = 0.5 秒）
      { lane: 3, time: 2.1 }, // 第 1 小节第 0 行（第 4 拍，停顿在它之后才开始）
    ]);
  });

  test('长按头算一个音符、尾巴和地雷跳过', () => {
    const hard = chartNotes(parsed, 'Hard');
    // 第 0 小节 4 个 + 第 1 小节 2 个（长按头 2000 算、尾巴 3000 不算）+ 第 2 小节地雷 0M00 不算
    expect(hard).toHaveLength(6);
    expect(hard.filter((n) => n.time < 2)).toHaveLength(4); // 0.1 / 0.6 / 1.1 / 1.6
    expect(hard.filter((n) => n.time > 2)).toHaveLength(2); // 2.1 长按头 / 3.1
  });

  test('难度名不区分大小写，查不到返回空', () => {
    expect(chartNotes(parsed, 'easy')).toHaveLength(3);
    expect(chartNotes(parsed, 'nope')).toEqual([]);
  });
});

describe('beatToSeconds', () => {
  const timing = parseSm(SM).timing;

  test('beat 0 在 -OFFSET 处', () => {
    expect(beatToSeconds(timing, 0)).toBeCloseTo(0.1);
  });

  test('停顿只影响它后面的拍', () => {
    expect(beatToSeconds(timing, 4)).toBeCloseTo(2.1);
    expect(beatToSeconds(timing, 5)).toBeCloseTo(3.1);
  });

  test('变速段拼接', () => {
    // 0~8 拍 120BPM（4 秒）+ 停顿 0.5 + 8~9 拍 60BPM（1 秒）
    expect(beatToSeconds(timing, 8)).toBeCloseTo(4.6);
    expect(beatToSeconds(timing, 9)).toBeCloseTo(5.6);
  });

  test('没有 OFFSET / BPMS 的谱按 120 BPM、零偏移算', () => {
    const plain = parseSm('#NOTES:\ndance-single:\n:\nEasy:\n1:\n:\n1000\n;');
    expect(plain.timing.offset).toBe(0);
    expect(beatToSeconds(plain.timing, 1)).toBeCloseTo(0.5);
    expect(chartDuration(plain, 'Easy')).toBeCloseTo(1.5); // 最后一个音符 0 秒 + 1.5 秒余量
  });
});
