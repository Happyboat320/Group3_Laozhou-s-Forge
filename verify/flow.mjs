import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const output = 'shots/flow';
await mkdir(output, { recursive: true });
const server = await createServer({ logLevel: 'error', server: { port: 5204, host: '127.0.0.1', open: false } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-unsafe-swiftshader'] });
  for (const target of ['dev', 'offline']) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, offline: target === 'offline' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => errors.push(request.url()));
    const url = target === 'dev' ? `${server.resolvedUrls.local[0]}?shot` : `${pathToFileURL(resolve('release/index.html')).href}?shot`;
    const waitScene = name => page.waitForFunction(expected => globalThis.__game?.sceneName === expected, name);
    const read = () => page.evaluate(() => {
      const ctx = globalThis.__game;
      const scene = globalThis.__phaser.scene.getScene(ctx.sceneName);
      return {
        scene: ctx.sceneName, mode: ctx.game.mode, helpOpen: Boolean(scene.howTo),
        seenHint: ctx.game.seenHint, elapsed: scene.elapsed, patience: scene.patience,
        debug: ctx.debug?.(),
      };
    });
    const lose = async () => {
      await page.evaluate(() => {
        const ctx = globalThis.__game;
        ctx.game.endReason = 'lose';
        ctx.game.reputation = 0;
        ctx.go('result');
      });
      await waitScene('result');
    };
    await page.goto(url);
    await waitScene('title');
    for (const key of ['Space', 'Escape', 'KeyH']) {
      await page.keyboard.press('KeyH');
      assert.equal((await read()).helpOpen, true);
      await page.keyboard.press('KeyC');
      assert.equal((await read()).helpOpen, true);
      await page.keyboard.press(key);
      assert.equal((await read()).scene, 'title');
      assert.equal((await read()).helpOpen, false);
    }
    for (const [horizontal, vertical] of [[20, 20], [1260, 20], [20, 700], [1260, 700], [640, 336]]) {
      await page.keyboard.press('KeyH');
      await page.evaluate(() => new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))));
      await page.mouse.click(horizontal, vertical);
      await page.waitForFunction(() => !globalThis.__phaser.scene.getScene('title').howTo);
      assert.equal((await read()).scene, 'title');
      assert.equal((await read()).helpOpen, false);
    }
    await page.keyboard.press('KeyH');
    await page.screenshot({ path: `${output}/${target}-help.png` });
    await page.keyboard.press('Space');
    await page.keyboard.press('Space');
    await waitScene('mode');
    for (const [key, mode, sceneName] of [['Digit2', 'rhythm', 'rhythm'], ['Digit3', 'heat', 'heat'], ['Digit1', 'timing', 'forge']]) {
      await page.keyboard.press(key);
      await waitScene('shop');
      await page.keyboard.press('Space');
      await waitScene(sceneName);
      if (mode !== 'timing') {
        const before = await read();
        assert.equal(before.debug.ready, false);
        await page.keyboard.press('ArrowLeft');
        await page.waitForTimeout(600);
        const after = await read();
        assert.equal(after.elapsed, 0);
        assert.equal(after.patience, before.patience);
        assert.deepEqual(after.debug, before.debug);
        await page.screenshot({ path: `${output}/${target}-${mode}-intro.png` });
        if (mode === 'heat') await page.mouse.click(640, 518);
        else await page.keyboard.press('Space');
        await page.waitForFunction(() => globalThis.__game.debug().ready);
        await page.waitForTimeout(250);
        assert.ok((await read()).elapsed > 0);
        assert.equal((await read()).seenHint, true);
        await page.evaluate(() => globalThis.__game.go('shop'));
        await waitScene('shop');
        await page.keyboard.press('Space');
        await waitScene(sceneName);
        assert.equal((await read()).debug.ready, true);
      }
      await lose();
      if (mode === 'heat') await page.screenshot({ path: `${output}/${target}-result.png` });
      await page.keyboard.press('Space');
      await waitScene('shop');
      assert.equal((await read()).mode, mode);
      assert.equal((await read()).seenHint, false);
      await lose();
      await page.keyboard.press('KeyM');
      await waitScene('mode');
    }
    await page.keyboard.press('Digit3');
    await waitScene('shop');
    await page.evaluate(() => {
      const ctx = globalThis.__game;
      ctx.game.endReason = 'lose';
      ctx.game.reputation = 0;
      ctx.save.writeRun(ctx.game);
      ctx.go('title');
    });
    await waitScene('title');
    await page.keyboard.press('KeyH');
    await page.keyboard.press('KeyC');
    assert.equal((await read()).scene, 'title');
    assert.equal((await read()).helpOpen, true);
    await page.keyboard.press('Escape');
    await page.keyboard.press('KeyC');
    await waitScene('result');
    assert.deepEqual(errors, []);
    console.log(`${target}: help keyboard/pointer isolation, paused introductions, repeat orders, replay modes, mode selection and finished-save routing passed`);
    await context.close();
  }
} finally {
  await browser?.close();
  await server.close();
}
