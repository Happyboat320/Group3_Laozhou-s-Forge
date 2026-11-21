// 验证打包产物：用 file:// 打开 release/index.html，确认离线能玩进地窟。
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
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(e.message));

try {
  await page.goto(url);
  await page.waitForFunction(() => globalThis.__game?.sceneName, null, { timeout: 30000 });
  console.log('离线打开成功，场景：', await page.evaluate(() => globalThis.__game.sceneName));

  await page.keyboard.press('Space');
  await page.waitForFunction(() => globalThis.__game?.sceneName === 'shop', null, { timeout: 15000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'shots/offline-shop.png' });
  console.log('按空格进入接单页，正常。');

  await page.keyboard.press('Space');
  await page.waitForFunction(() => globalThis.__game?.sceneName === 'delve', null, { timeout: 15000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'shots/offline-delve.png' });
  console.log('再按空格进入地窟，正常。');
} finally {
  await page.close();
}

if (errors.length) {
  console.log('❌ 离线版报错：', errors.slice(0, 5));
  process.exitCode = 1;
} else {
  console.log('✅ 离线版控制台没有报错');
}
process.exit(process.exitCode ?? 0);
