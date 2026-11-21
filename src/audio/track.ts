// 歌曲播放：按需取 mp3 文件解码后用 WebAudio 播放。
// 不走 manifest 预载：四首歌 20 多 MB，进游戏就解码太浪费，选歌后才加载。
// 谱面计时不依赖音频时钟（场景自己按帧计时），音频只管出声，坏了也不影响判定。
import { urlOf } from '../engine/assets';
import { songById } from '../data/songs';

let ctx: AudioContext | null = null;
const buffers = new Map<string, Promise<AudioBuffer | null>>();

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  // 浏览器的自动播放策略：用户点过按钮以后 resume 一下就能响
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function loadBuffer(songId: string): Promise<AudioBuffer | null> {
  const hit = buffers.get(songId);
  if (hit) return hit;
  const promise = (async () => {
    const url = urlOf(songById(songId).file);
    const audio = context();
    if (!url || !audio) return null;
    try {
      const response = await fetch(url);
      const data = await response.arrayBuffer();
      return await audio.decodeAudioData(data);
    } catch (error) {
      console.warn('歌曲加载失败：', songId, error);
      return null;
    }
  })();
  buffers.set(songId, promise);
  return promise;
}

export interface TrackHandle {
  /** afterSeconds 秒后开始放（相对现在）。 */
  play(afterSeconds: number): void;
  stop(): void;
  /** 音频时长（秒）；没加载到是 0。 */
  readonly duration: number;
}

/**
 * 加载一首歌。没有文件或解码失败时返回 null（游戏照打，只是没声）。
 * preload 可以提前把 buffer 拉进来（选歌界面用）。
 */
export async function loadTrack(songId: string): Promise<TrackHandle | null> {
  const buffer = await loadBuffer(songId);
  const audio = context();
  if (!buffer || !audio) return null;

  let source: AudioBufferSourceNode | null = null;
  const gain = audio.createGain();
  gain.gain.value = 0.65;
  gain.connect(audio.destination);

  return {
    play(afterSeconds: number) {
      source?.stop();
      const node = audio.createBufferSource();
      node.buffer = buffer;
      node.connect(gain);
      node.start(Math.max(audio.currentTime + 0.02, audio.currentTime + afterSeconds));
      source = node;
    },
    stop() {
      try {
        source?.stop();
      } catch {
        // 已经停了就算了
      }
      source = null;
    },
    get duration() {
      return buffer.duration;
    },
  };
}

/** 提前解码，选歌界面预热用。 */
export function preloadTrack(songId: string) {
  void loadBuffer(songId);
}
