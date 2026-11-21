import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const assets = ['ui_mode_timing', 'ui_mode_rhythm', 'char_forge_flame'];
const output = 'shots/art';
await mkdir(output, { recursive: true });
const server = await createServer({ logLevel: 'error', server: { port: 5203, host: '127.0.0.1', open: false } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const targets = {
    dev: `${server.resolvedUrls.local[0]}?shot`,
    offline: `${pathToFileURL(resolve('release/index.html')).href}?shot`,
  };
  for (const [name, url] of Object.entries(targets)) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, offline: name === 'offline' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => errors.push(request.url()));
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    await page.goto(url);
    await page.waitForFunction(() => globalThis.__game?.sceneName === 'title');
    await page.keyboard.press('Space');
    await page.waitForFunction(() => globalThis.__game.sceneName === 'mode');
    const textures = await page.evaluate(ids => ids.map(id => {
      const source = globalThis.__phaser.textures.get(id).getSourceImage();
      const canvas = document.createElement('canvas');
      canvas.width = source.width;
      canvas.height = source.height;
      const brush = canvas.getContext('2d');
      brush.drawImage(source, 0, 0);
      const pixels = brush.getImageData(0, 0, source.width, source.height).data;
      let transparent = 0;
      let opaque = 0;
      for (let offset = 3; offset < pixels.length; offset += 4) {
        if (pixels[offset] === 0) transparent++;
        if (pixels[offset] === 255) opaque++;
      }
      return { id, width: source.width, height: source.height, transparent, opaque };
    }), assets);
    for (const texture of textures) {
      assert.ok(texture.transparent > 0 && texture.opaque > 0, `${texture.id}: expected transparent sprite with opaque subject`);
      assert.ok(texture.width >= 512 && texture.height >= 512);
    }
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${output}/${name}-mode.png` });
    await page.keyboard.press('Digit3');
    await page.waitForFunction(() => globalThis.__game.sceneName === 'shop');
    await page.keyboard.press('Space');
    await page.waitForFunction(() => globalThis.__game.sceneName === 'heat');
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${output}/${name}-heat.png` });
    const laneBefore = await page.evaluate(() => globalThis.__game.debug().lane);
    await page.keyboard.press('ArrowLeft');
    const laneAfter = await page.evaluate(() => globalThis.__game.debug().lane);
    assert.equal(laneAfter, laneBefore - 1);
    const flameTexture = await page.evaluate(() => globalThis.__phaser.scene.getScene('heat').flame.list[1].texture.key);
    assert.equal(flameTexture, 'char_forge_flame');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ target: name, textures, flameTexture, laneBefore, laneAfter, errors }));
    await context.close();
  }
} finally {
  await browser?.close();
  await server.close();
}
