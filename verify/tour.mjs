// 走查：从封面一路打到结算——接单、下窟挖矿、回炉打造、交付，六单跑完。
// 地窟里用 BFS 找路（遇到贴身的怪就先打），打造用「指针进中心就落手」。
// 用法：node verify/tour.mjs
import { mkdir, rm } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const OUT = 'shots';
await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const server = await createServer({ logLevel: 'error', server: { port: 5201, host: '127.0.0.1', open: false } });
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

let n = 0;
const seen = new Set();

async function snap(label) {
  n += 1;
  const file = `${OUT}/${String(n).padStart(2, '0')}-${label}.png`;
  await page.screenshot({ path: file });
  console.log(`📸 ${file}`);
}

const press = (code) =>
  page.evaluate((c) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: c, key: ' ', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: c, key: ' ', bubbles: true }));
  }, code);

const read = () =>
  page.evaluate(() => ({
    scene: globalThis.__game?.sceneName ?? '',
    debug: globalThis.__game?.debug?.() ?? null,
    game: globalThis.__game ? JSON.parse(JSON.stringify(globalThis.__game.game)) : null,
  }));

/** 连续移动：按住方向键一小段，朝目标（最近矿脉或阶梯）走。 */
const held = new Set();
async function hold(codes, ms) {
  for (const c of codes) {
    if (held.has(c)) continue;
    held.add(c);
    await page.evaluate((code) => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    }, c);
  }
  for (const c of [...held]) {
    if (codes.includes(c)) continue;
    held.delete(c);
    await page.evaluate((code) => {
      window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
    }, c);
  }
  await page.waitForTimeout(ms);
}
try {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => globalThis.__game?.sceneName, null, { timeout: 30000 });

  await page.waitForTimeout(600);
  await snap('title');
  await press('Space');

  let guard = 0;
  const bot = { lastPos: null, stuck: 0, side: false };
  let done = false;

  while (!done && guard < 4000) {
    guard += 1;
    const s = await read();
    const d = s.debug;

    if (s.scene === 'shop') {
      if (process.env.FORCE_DEATH && s.game.history.length === 0) {
        await page.evaluate(() => {
          globalThis.__game.game.hp = 8;
        });
      }
      const book = `shop-${s.game.history.length}`;
      if (!seen.has(book)) {
        seen.add(book);
        await page.waitForTimeout(500);
        await snap(`shop-${s.game.history.length + 1}`);
      }
      await press('Space');
      await page.waitForTimeout(350);
      continue;
    }

    if (s.scene === 'delve' && d) {
      if (!seen.has(`delve-${s.game.history.length}`)) {
        seen.add(`delve-${s.game.history.length}`);
        await page.waitForTimeout(500);
        await snap('delve');
      }
      if (d.outcome === 'dead') {
        await snap('dead');
        done = true;
        break;
      }
      if (d.outcome === 'stairs') {
        if (!seen.has('stairs')) {
          seen.add('stairs');
          await page.waitForTimeout(400);
          await snap('stairs');
        }
        await press('Space');
        await page.waitForTimeout(500);
        continue;
      }
      const [px, py] = d.pos;
      const target = (d.hp > 35 && (d.oreList ?? []).length ? d.oreList : [d.stairs]).reduce((best, cur) => {
        const dist = (p) => Math.hypot(p[0] - px, p[1] - py);
        return dist(cur) < dist(best) ? cur : best;
      });
      const dx = target[0] - px;
      const dy = target[1] - py;
      const near = Math.hypot(dx, dy) < 40;
      if (near && (d.oreList ?? []).length === 0 && Math.hypot(target[0] - d.stairs[0], target[1] - d.stairs[1]) < 1) {
        await hold([], 60);
        continue;
      }
      const codes = [];
      if (dx > 14) codes.push('ArrowRight');
      else if (dx < -14) codes.push('ArrowLeft');
      if (dy > 14) codes.push('ArrowDown');
      else if (dy < -14) codes.push('ArrowUp');
      // 卡住了就换个方向蹭一下
      const moved = Math.hypot(px - (bot.lastPos?.[0] ?? px), py - (bot.lastPos?.[1] ?? py));
      bot.stuck = moved < 3 ? (bot.stuck ?? 0) + 1 : 0;
      bot.lastPos = [px, py];
      if (bot.stuck > 3) {
        codes.length = 0;
        codes.push(bot.side ? 'ArrowDown' : 'ArrowUp');
        bot.side = !bot.side;
        bot.stuck = 0;
      }
      // 贴身有怪就一直挥锤
      const swing = (d.mobList ?? []).some(([mx, my]) => Math.hypot(mx - px, my - py) < 90);
      if (swing) codes.push('Space');
      await hold(codes, 90);
      continue;
    }

    if (s.scene === 'forge' && d) {
      if (!seen.has('forge')) {
        seen.add('forge');
        await page.waitForTimeout(300);
        await snap('forge');
      }
      if (d.phase === 'result') {
        if (!seen.has(`delivery-${s.game.history.length}`)) {
          seen.add(`delivery-${s.game.history.length}`);
          await page.waitForTimeout(600);
          await snap('delivery');
        }
        await press('Space');
        await page.waitForTimeout(450);
        continue;
      }
      if (Math.abs(d.pos) <= 0.08) await press('Space');
      await page.waitForTimeout(30);
      continue;
    }

    if (s.scene === 'result') {
      await page.waitForTimeout(700);
      await snap('result');
      done = true;
      break;
    }

    await page.waitForTimeout(150);
  }

  const final = await read();
  console.log('\n=== 走查结束 ===');
  console.log('场景：', final.scene);
  console.log('天数 / 已交货：', final.game?.day, '/', final.game?.history?.length);
  console.log('金币：', final.game?.coins, '　口碑：', final.game?.reputation, '　结果：', final.game?.endReason);
  for (const h of final.game?.history ?? []) {
    console.log(`  ${h.day}日 ${h.grade} 分数 ${h.score} ${h.coins}文 ${h.rep >= 0 ? '+' : ''}${h.rep}`);
  }
} finally {
  await page.close();
  await server.close();
}

if (errors.length) {
  console.log(`\n❌ 控制台有 ${errors.length} 条报错：`);
  for (const e of errors.slice(0, 10)) console.log('   ' + e);
  process.exitCode = 1;
} else {
  console.log('\n✅ 控制台没有报错');
}
process.exit(process.exitCode ?? 0);
