// 走查脚本：连上本机已经在跑的 Chrome（--remote-debugging-port=9222），
// 选一种玩法，从封面一路玩到结算，每个阶段截一张图到 shots/<玩法>/。
// 用法：node verify/tour.mjs [timing|rhythm|heat]
// 只用于开发自检，不参与打包。
import { mkdir, rm } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const MODE = process.argv[2] ?? 'timing';
const MODE_KEY = { timing: 'Digit1', rhythm: 'Digit2', heat: 'Digit3' }[MODE];
const MODE_SCENE = { timing: 'forge', rhythm: 'rhythm', heat: 'heat' }[MODE];
if (!MODE_KEY) {
  console.error('用法：node verify/tour.mjs [timing|rhythm|heat]');
  process.exit(1);
}

const OUT = `shots/${MODE}`;
await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const PORT = 5199 + Math.max(0, ['timing', 'rhythm', 'heat'].indexOf(MODE));
const server = await createServer({ logLevel: 'error', server: { port: PORT, host: '127.0.0.1', open: false } });
await server.listen();
const url = `${server.resolvedUrls.local[0]}?shot`;

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const context = browser.contexts()[0] ?? (await browser.newContext());
const page = await context.newPage();
await page.setViewportSize({ width: 1280, height: 720 });
await page.bringToFront();

const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`[console] ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

let shotIndex = 0;
let presses = 0;

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
    game: globalThis.__game ? JSON.parse(JSON.stringify(globalThis.__game.game)) : null,
  }));

const press = async (code = 'Space') => {
  presses += 1;
  await page.evaluate((c) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: c, key: ' ', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: c, key: ' ', bubbles: true }));
  }, code);
};

async function waitScene(name, timeout = 20000) {
  await page.waitForFunction((n) => globalThis.__game?.sceneName === n, name, { timeout });
}

/** 在页面里挂一个自动驾驶：按每种玩法的规则出手，比来回通信快，也打得更准。 */
async function startAutoPlay() {
  await page.evaluate(() => {
    window.__auto = true;
    const tap = (code) => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code, key: ' ', bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code, key: ' ', bubbles: true }));
    };
    let lastHeat = 0;

    const tick = () => {
      if (!window.__auto) return;
      const d = window.__game?.debug?.();
      if (d?.ready === false) {
        tap('Space');
        requestAnimationFrame(tick);
        return;
      }
      if (d) {
        // 时机玩法：指针进中心就落手
        if (d.scene === 'forge' && d.phase && d.phase !== 'result' && d.phase !== 'hint' && Math.abs(d.pos) <= 0.08) {
          tap('Space');
        }
        // 节奏玩法：音符快到线时按对应的方向键
        if (d.scene === 'rhythm' && Array.isArray(d.group)) {
          for (const g of d.group) {
            if (Math.abs(g.dt) <= 0.05) tap(['ArrowLeft', 'ArrowDown', 'ArrowRight'][g.lane]);
          }
        }
        // 火候玩法：躲坏的、靠好的
        if (d.scene === 'heat' && Array.isArray(d.drops)) {
          const now = performance.now();
          if (now - lastHeat > 130) {
            lastHeat = now;
            const danger = (lane) => d.drops.some((x) => x.bad && x.lane === lane && x.y > 330 && x.y < 690);
            const treat = (lane) => d.drops.some((x) => !x.bad && x.lane === lane && x.y > 280 && x.y < 730);
            let target = d.lane;
            if (danger(d.lane)) {
              const safe = [d.lane - 1, d.lane + 1, d.lane - 2, d.lane + 2].filter((l) => l >= 0 && l < 5 && !danger(l));
              if (safe.length) target = safe[0];
            } else if (!treat(d.lane)) {
              const want = [0, 1, 2, 3, 4].filter((l) => treat(l) && !danger(l));
              if (want.length) target = want.reduce((a, b) => (Math.abs(b - d.lane) < Math.abs(a - d.lane) ? b : a), want[0]);
            }
            if (target !== d.lane) tap(target < d.lane ? 'ArrowLeft' : 'ArrowRight');
          }
        }
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}

try {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => globalThis.__game?.sceneName, null, { timeout: 30000 });

  await waitScene('title');
  await page.waitForTimeout(800);
  await snap('title');
  await press();

  await waitScene('mode');
  await page.waitForTimeout(900);
  await snap('mode');
  await press(MODE_KEY);

  await waitScene('shop');
  await page.waitForTimeout(900);
  await snap('shop');
  await startAutoPlay();
  await press();
  await waitScene(MODE_SCENE);

  const seen = new Set();
  const perOrder = new Map();
  let done = false;
  let guard = 0;

  while (!done && guard < 4000) {
    guard += 1;
    const s = await read();
    const d = s.debug;

    if (s.scene === 'shop') {
      await page.waitForTimeout(500);
      await snap(`shop-${s.game.orderIndex + 1}`);
      await press();
      await page.waitForTimeout(350);
      continue;
    }

    if (s.scene === 'dayend') {
      await page.waitForTimeout(800);
      await snap('dayend');
      await press();
      await page.waitForTimeout(500);
      continue;
    }

    if (s.scene === MODE_SCENE && d) {
      if (d.phase === 'hint') {
        if (!seen.has('hint')) {
          await page.waitForTimeout(400);
          await snap('hint');
          seen.add('hint');
        }
        await press();
        await page.waitForTimeout(450);
        continue;
      }

      if (d.done || d.phase === 'result') {
        const key = `delivery-${s.game.orderIndex}`;
        if (!seen.has(key)) {
          await page.waitForTimeout(800);
          await snap('delivery');
          seen.add(key);
        }
        await press();
        await page.waitForTimeout(450);
        continue;
      }

      const orderKey = `play-${s.game.orderIndex}`;
      if (!seen.has(orderKey)) {
        seen.add(orderKey);
        await page.waitForTimeout(1200);
        await snap(`play-${MODE}`);
      }
      await page.waitForTimeout(180);
      continue;
    }

    if (s.scene === 'result') {
      await page.waitForTimeout(900);
      await snap('result');
      done = true;
      break;
    }

    await page.waitForTimeout(90);
  }

  await page.evaluate(() => {
    window.__auto = false;
  });

  const final = await page.evaluate(() => ({
    scene: globalThis.__game?.sceneName,
    game: JSON.parse(JSON.stringify(globalThis.__game?.game ?? null)),
  }));

  console.log(`\n=== ${MODE} 走查结束 ===`);
  console.log('场景：', final.scene, '　按键：', presses);
  console.log('金币：', final.game?.coins, '　口碑：', final.game?.reputation, '　结束：', final.game?.endReason);
  for (const h of final.game?.history ?? []) {
    console.log(`  ${h.day}日 ${h.customerName} ${h.itemName} → ${h.grade} 分数 ${h.score ?? "-"} ${h.coins}文 ${h.rep >= 0 ? "+" : ""}${h.rep}${h.timedOut ? "（跑单）" : ""}`);
  }
  const missing = await page.evaluate(() => globalThis.__game.missing.length);
  if (missing) console.log(`ℹ 还有 ${missing} 个素材文件没放（用占位）`);
} finally {
  await page.evaluate(() => {
    window.__auto = false;
  }).catch(() => {});
  await page.close();
  await server.close();
}

if (errors.length) {
  console.log(`\n❌ 控制台有 ${errors.length} 条报错：`);
  for (const e of errors.slice(0, 20)) console.log('   ' + e);
  process.exitCode = 1;
} else {
  console.log('\n✅ 控制台没有报错');
}
process.exit(process.exitCode ?? 0);
