// 验证打包产物：直接用 file:// 打开 release/index.html，确认离线也能玩。
// 用法：node verify/offline.mjs
import { chromium } from 'playwright-core';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const url = pathToFileURL(resolve('release/index.html')).href;
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const context = browser.contexts()[0] ?? (await browser.newContext());
const page = await context.newPage();
await page.setViewportSize({ width: 1280, height: 720 });

const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`[console] ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

try {
  await page.goto(url);
  await page.waitForFunction(() => globalThis.__game?.sceneName, null, { timeout: 30000 });
  const scene = await page.evaluate(() => globalThis.__game.sceneName);
  console.log('离线打开成功，当前场景：', scene);
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'shots/offline-title.png' });

  await page.keyboard.press('Space');
  await page.waitForFunction(() => globalThis.__game?.sceneName === 'mode', null, { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'shots/offline-mode.png' });
  console.log('按空格进入「选打法」页，正常。');

  await page.keyboard.press('Digit1');
  await page.waitForFunction(() => globalThis.__game?.sceneName === 'shop', null, { timeout: 15000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'shots/offline-shop.png' });
  console.log('选时机判定后进入接单页，正常。');

  const missing = await page.evaluate(() => globalThis.__game.missing.length);
  console.log('缺素材数量：', missing, '（声音是合成的，占位属正常）');
} finally {
  await page.close();
}

if (errors.length) {
  console.log('❌ 离线版有报错：');
  for (const e of errors) console.log('  ' + e);
  process.exitCode = 1;
} else {
  console.log('✅ 离线版控制台没有报错');
}
process.exit(process.exitCode ?? 0);
