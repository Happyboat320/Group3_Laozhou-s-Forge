// 生成铁质生活用具的装备图：10 种器物 × 5 档品质。
// 两步：① 调生图工具出纯白底的 2048×2048 大图；② 用 tools/cutout.py 抠成透明底，缩到 512×512 存成 webp。
//
// 用法：
//   node tools/gen_ironware.mjs --sample            # 只出一张样张（wok × epic），放到 assets/images/item/
//   node tools/gen_ironware.mjs                     # 出全部 50 张
//   node tools/gen_ironware.mjs --item pot --quality common   # 出指定的几张
//   node tools/gen_ironware.mjs --skip-existing     # 已经有的不再生成
// 生成的原图放在 assets/images/item/_raw/ 下（不登记 manifest），透明底成品放在 assets/images/item/ 下。

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetId, buildPrompt, ITEMS, QUALITIES, QUALITY_LABEL } from './ironware_prompts.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ITEM_DIR = join(ROOT, 'assets/images/item');
const RAW_DIR = join(ITEM_DIR, '_raw');
const GEN_SIZE = '2048x2048'; // 生图模型要求 ≥3686400 像素，2048² 是方形里最小的安全值
const FINAL_SIZE = 512;
const SEEDANCE_MODEL = process.env.IRONWARE_IMAGE_MODEL || 'kspmas-ksyun/doubao-seedream-4.5';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const value = (n) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

function pickJobs() {
  const onlyItem = value('item');
  const onlyQuality = value('quality');
  let jobs = [];
  for (const item of ITEMS) {
    for (const q of QUALITIES) {
      if (onlyItem && item.name !== onlyItem) continue;
      if (onlyQuality && q !== onlyQuality) continue;
      jobs.push({ item: item.name, zh: item.zh, quality: q });
    }
  }
  if (flag('sample')) jobs = jobs.filter((j) => j.item === 'wok' && j.quality === 'epic');
  return jobs;
}

function findRaw(id) {
  // 生图工具可能存成 .jpg 或 .png，按实际情况找
  for (const ext of ['.jpg', '.png', '.jpeg', '.webp']) {
    const p = join(RAW_DIR, `${id}${ext}`);
    if (existsSync(p)) return p;
  }
  return null;
}

function generate(job) {
  const id = assetId(job.item, job.quality);
  const prompt = buildPrompt(job.item, job.quality);
  let rawBase = findRaw(id);

  if (rawBase) {
    console.log(`[跳过生图] ${id}：原图已存在`);
  } else {
    console.log(`[生图] ${id}（${job.zh} · ${QUALITY_LABEL[job.quality]}）`);
    const r = spawnSync(
      'magpie',
      ['tool', 'generate_image', '--model', SEEDANCE_MODEL, '--prompt', prompt, '--size', GEN_SIZE, '-o', join(RAW_DIR, `${id}.png`)],
      { encoding: 'utf8' },
    );
    rawBase = findRaw(id);
    if (!rawBase) {
      console.error(r.stdout, r.stderr);
      throw new Error(`生图失败：${id}`);
    }
  }

  const out = join(ITEM_DIR, `${id}.webp`);
  const c = spawnSync('python3', [join(ROOT, 'tools/cutout.py'), rawBase, out, String(FINAL_SIZE), '--report'], {
    encoding: 'utf8',
  });
  if (c.status !== 0) {
    console.error(c.stdout, c.stderr);
    throw new Error(`抠图失败：${id}`);
  }
  console.log(c.stdout.trim());
  return out;
}

mkdirSync(RAW_DIR, { recursive: true });
let jobs = pickJobs();
if (flag('skip-existing')) jobs = jobs.filter((j) => !existsSync(join(ITEM_DIR, `${assetId(j.item, j.quality)}.webp`)));

console.log(`共 ${jobs.length} 张要生成`);
let ok = 0;
const failed = [];
for (const job of jobs) {
  try {
    generate(job);
    ok += 1;
  } catch (e) {
    console.error(String(e.message || e));
    failed.push(assetId(job.item, job.quality));
  }
}
console.log(`完成 ${ok} 张${failed.length ? `，失败 ${failed.length} 张：${failed.join(', ')}` : ''}`);
process.exit(failed.length ? 1 : 0);
