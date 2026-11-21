// 背景音乐：有 bgm_main 文件就放文件；没有文件就用 WebAudio 现场合成一段可循环的小曲。
// 课程素材包里没有配乐文件，所以默认走合成这条；换成真音乐只要把文件放进 assets/sounds/
// 并在 manifest.json 里登记 bgm_main 即可，这里的合成会自动让位。
//
// 为什么这里能用 setInterval：音乐是全局的、跟场景无关，切场景不该打断它，
// 所以调度器挂在模块上，由 stopBgm() 统一停。场景里的计时仍然只用 this.time。
import type Phaser from 'phaser';
import { playMusic } from '../engine/assets';

const BPM = 92;
/** 一个八分音符多长（秒）。 */
const STEP = 60 / BPM / 2;
/** 以 D 为宫的五声音阶，单位是半音。 */
const SCALE = [0, 2, 4, 7, 9];
const BASE = 293.66; // D4
/** 旋律：每格一个八分音符，数字是音阶级数（可以超过 4，会往上翻八度），null 是休止。 */
const MELODY: (number | null)[] = [
  0, 2, 4, 2, 0, null, 1, 2,
  4, 5, 4, 2, 1, 0, null, 0,
  2, 4, 5, 7, 5, 4, 2, 1,
  0, null, 1, 2, 0, null, null, null,
];
/** 低音：每 8 格换一次，单位是相对 D3 的半音。 */
const BASS = [0, 0, 5, 7];

interface Voice {
  audio: AudioContext;
  out: AudioNode;
}

let timer: ReturnType<typeof setInterval> | null = null;
let voice: Voice | null = null;
let step = 0;
let nextTime = 0;

function frequency(degree: number): number {
  const octave = Math.floor(degree / SCALE.length);
  return BASE * 2 ** ((SCALE[degree % SCALE.length] + octave * 12) / 12);
}

function tone(ctx: AudioContext, out: AudioNode, freq: number, at: number, duration: number, volume: number, type: OscillatorType) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  osc.connect(gain).connect(out);
  osc.start(at);
  osc.stop(at + duration + 0.05);
}

function playStep(index: number, at: number) {
  if (!voice) return;
  const { audio, out } = voice;

  const note = MELODY[index % MELODY.length];
  if (note !== null) {
    tone(audio, out, frequency(note), at, 0.42, 0.07, 'triangle');
    // 一点五度泛音，听起来不那么单薄
    tone(audio, out, frequency(note) * 1.5, at + 0.01, 0.3, 0.02, 'sine');
  }

  if (index % 8 === 0) {
    const bass = BASS[Math.floor(index / 8) % BASS.length];
    tone(audio, out, (BASE / 2) * 2 ** (bass / 12), at, 0.9, 0.09, 'sine');
  }

  // 每小节第一拍一记很轻的鼓点，给节奏感
  if (index % 8 === 0 || index % 8 === 4) {
    tone(audio, out, 110, at, 0.12, 0.05, 'sine');
  }
}

function schedule() {
  if (!voice) return;
  const now = voice.audio.currentTime;
  if (voice.audio.state === 'suspended') void voice.audio.resume();
  // 只往前排 0.6 秒，够走一小段，又不会因为卡顿一次排太久
  while (nextTime < now + 0.6) {
    playStep(step, nextTime);
    step += 1;
    nextTime += STEP;
  }
}

/** 开始播背景音乐。scene 用来找 Phaser 的 AudioContext。 */
export function startBgm(scene: Phaser.Scene, volume = 0.5) {
  if (timer) return;
  // 有真文件就放文件，合成让位
  if (scene.cache.audio.exists('bgm_main')) {
    playMusic(scene, 'bgm_main', volume);
    return;
  }
  const sound = scene.sound as Partial<Phaser.Sound.WebAudioSoundManager>;
  const audio = sound.context;
  const out = sound.destination;
  if (!audio || !out) return;
  voice = { audio, out };
  step = 0;
  nextTime = audio.currentTime + 0.15;
  schedule();
  timer = setInterval(schedule, 250);
}

/** 停掉背景音乐。 */
export function stopBgm() {
  if (timer) clearInterval(timer);
  timer = null;
  voice = null;
}

/** 现在有没有在放（截图报告里用）。 */
export function bgmRunning(): boolean {
  return timer !== null;
}
