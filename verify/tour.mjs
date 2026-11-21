// 走查脚本：自己开 dev server，用本机 Chrome 无头跑一局完整流程，每个关键场景截图到 shots/tour/。
// 用法：node verify/tour.mjs            单曲：选歌 → 难度 → 打一首 → 结算 → 卖装备
//       node verify/tour.mjs challenge  挑战：随机抽三首连打 → 总分上榜 → 保底传说
// 只用于开发自检，不参与打包。
import { mkdir, rm } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { build, preview } from 'vite';

const MODE = process.argv[2] === 'challenge' ? 'challenge' : 'single';
const OUT = `shots/${MODE}`;
await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

// 用构建后的静态产物跑，避免 dev server 的热更新在打歌途中刷新页面把流程打断
const PORT = MODE === 'challenge' ? 5291 : 5290;
await build({ logLevel: 'error' });
const server = await preview({ logLevel: 'error', preview: { port: PORT, host: '127.0.0.1', open: false } });
const url = `${server.resolvedUrls.local[0]}?shot`;

async function launch() {
  const args = ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'];
  for (const channel of ['chrome', 'msedge']) {
    try {
      return await chromium.launch({ channel, headless: true, args });
    } catch {
      // 试下一个浏览器
    }
  }
  throw new Error('没找到 Chrome 或 Edge');
}

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => {
  const text = m.text();
  // headless 下 WebGL 的性能提示不是报错
  if (text.includes('GL Driver Message') || text.startsWith('Failed to load resource')) return;
  if (m.type() === 'error') errors.push(`[console] ${text}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

let shotIndex = 0;
async function snap(label) {
  shotIndex += 1;
  const file = `${OUT}/${String(shotIndex).padStart(2, '0')}-${label}.png`;
  await page.screenshot({ path: file });
  console.log(`📸 ${file}`);
}

const read = () =>
  page.evaluate(() => ({
    scene: globalThis.__game?.sceneName ?? '',
    debug: globalThis.__game?.debug?.() ?? null,
    progress: globalThis.__game ? JSON.parse(JSON.stringify(globalThis.__game.game.progress)) : null,
    session: globalThis.__game ? JSON.parse(JSON.stringify(globalThis.__game.game.session)) : null,
  }));

const press = (code = 'Space') =>
  page.evaluate((c) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: c, key: ' ', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: c, key: ' ', bubbles: true }));
  }, code);

const waitScene = (name, timeout = 30000) =>
  page.waitForFunction((n) => globalThis.__game?.sceneName === n, name, { timeout });

/** 自动驾驶：音符快到线时按 A S D F。 */
const startAuto = () =>
  page.evaluate(() => {
    window.__auto = true;
    const KEYS = ['KeyA', 'KeyS', 'KeyD', 'KeyF'];
    const tap = (code) => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code, key: ' ', bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code, key: ' ', bubbles: true }));
    };
    const tick = () => {
      if (!window.__auto) return;
      const d = globalThis.__game?.debug?.();
      if (d && d.scene === 'play' && Array.isArray(d.group)) {
        for (const g of d.group) if (Math.abs(g.dt) <= 0.05) tap(KEYS[g.lane] ?? 'KeyA');
      }
      requestAnimationFrame(tick);
    };
    tick();
  });

const stopAuto = () => page.evaluate(() => { window.__auto = false; });

try {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => globalThis.__game?.sceneName, null, { timeout: 30000 });

  await waitScene('title');
  await page.waitForTimeout(700);
  await snap('title');

  if (MODE === 'challenge') {
    await press('KeyC');
    await waitScene('challenge');
    await page.waitForTimeout(700);
    await snap('challenge');
    await press();
  } else {
    await press();
    await waitScene('songs');
    await page.waitForTimeout(1000);
    await snap('songs');
    await press('Digit1');
    await waitScene('difficulty');
    await page.waitForTimeout(600);
    await snap('difficulty');
    await press('Digit2'); // 普通难度
  }

  await waitScene('play');
  await startAuto();

  let plays = 0;
  let guard = 0;
  while (guard < 6000) {
    guard += 1;
    const s = await read();

    if (s.scene === 'play') {
      plays += 1;
      if (plays === 1) {
        await page.waitForTimeout(2600); // 等音符落下来
        await snap('play');
      }
      await page.waitForTimeout(500);
      continue;
    }

    if (s.scene === 'settle') {
      await page.waitForTimeout(1400);
      await snap('settle');
      // 点「卖出」（左按钮），单曲和挑战都是这个位置
      await page.mouse.click(462, 652);
      await page.waitForTimeout(1200);
      const after = await read();
      if (after.scene === 'play') {
        // 挑战的下一首
        continue;
      }
      await page.waitForTimeout(800);
      await snap(`after-${after.scene}`);
      break;
    }

    if (s.scene === 'songs' || s.scene === 'challenge') {
      await page.waitForTimeout(600);
      await snap(`end-${s.scene}`);
      break;
    }

    await page.waitForTimeout(150);
  }

  await stopAuto();
  const final = await read();
  console.log(`\n=== ${MODE} 走查结束 ===`);
  console.log('结束场景：', final.scene, '　进入玩法次数：', plays);
  console.log('金币：', final.progress?.coins, '　装备库：', final.progress?.inventory?.length);
  console.log('排行榜：', JSON.stringify(final.progress?.leaderboard ?? []));
  for (const [song, best] of Object.entries(final.progress?.best ?? {})) console.log(`  最好成绩 ${song}: ${JSON.stringify(best)}`);

  // 结束后回标题，看装备库
  await page.evaluate(() => globalThis.__game && window.__game.go('inventory'));
  await page.waitForTimeout(900);
  await snap('inventory');
  await page.evaluate(() => window.__game.go('challenge'));
  await page.waitForTimeout(900);
  await snap('leaderboard');
} finally {
  await stopAuto().catch(() => {});
  await page.close();
  await browser.close();
  await server.httpServer.close();
}

if (errors.length) {
  console.log(`\n❌ 控制台有 ${errors.length} 条报错：`);
  for (const e of errors.slice(0, 20)) console.log('   ' + e);
  process.exitCode = 1;
} else {
  console.log('\n✅ 控制台没有报错');
}
process.exit(process.exitCode ?? 0);
