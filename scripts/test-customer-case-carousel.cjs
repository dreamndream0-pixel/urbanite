/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { chromium, webkit } = require(process.argv[2] || 'playwright');
const url = process.argv[3] || 'http://localhost:3015/card';
(async () => {
  for (const [engine, width] of [[chromium, 320], [chromium, 390], [webkit, 390], [chromium, 768], [chromium, 1440]]) {
    const browser = await engine.launch({ headless: true, ...(engine === chromium ? { channel: 'chrome' } : {}) });
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: true, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      const section = page.locator('#customer-cases');
      const track = section.getByRole('region', { name: '網站範例' });
      const next = section.getByRole('button', { name: '下一個網站範例' });
      const previous = section.getByRole('button', { name: '上一個網站範例' });
      await section.scrollIntoViewIfNeeded();
      assert.equal(await track.locator('a').count(), 3);
      assert.equal(await section.locator('[class*="phone"]').count(), 0);
      assert.equal(await previous.isDisabled(), true);
      for (let i = 0; i < 3; i++) {
        if (i) await next.click();
        await page.waitForFunction(({ index }) => {
          const track = document.querySelector('#customer-cases [aria-label="網站範例"]');
          return Math.abs(track.scrollLeft - (track.children[index].offsetLeft - track.children[0].offsetLeft)) < 2;
        }, { index: i });
        const image = track.locator('img').nth(i);
        await image.evaluate(el => el.decode());
        const geometry = await image.evaluate(el => {
          const box = el.getBoundingClientRect(), parent = el.parentElement, css = getComputedStyle(parent);
          return { ratio: box.width / box.height, natural: el.naturalWidth / el.naturalHeight, border: css.borderTopWidth, radius: css.borderRadius, bg: css.backgroundColor, visible: box.left >= -1 && box.right <= innerWidth + 1 };
        });
        assert.ok(Math.abs(geometry.ratio - geometry.natural) < .01, 'Complete screenshot must keep its natural aspect');
        assert.equal(geometry.border, '0px'); assert.equal(geometry.radius, '0px'); assert.equal(geometry.bg, 'rgba(0, 0, 0, 0)');
        assert.equal(geometry.visible, true);
        await page.screenshot({ path: path.join(os.tmpdir(), `urbanite-cases-${engine.name()}-${width}-${i}.png`) });
      }
      assert.equal(await next.isDisabled(), true);
      await track.focus(); await page.keyboard.press('ArrowLeft');
      await page.waitForFunction(() => document.querySelector('#customer-cases p[aria-live]').textContent === '2 / 3');
      if (engine === chromium && width === 390) {
        const session = await context.newCDPSession(page), box = await track.boundingBox();
        const x = box.x + box.width * .8, y = box.y + Math.min(box.height / 2, 120);
        await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        for (let i = 1; i <= 12; i++) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - i * box.width * .06, y }] });
        await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await page.waitForFunction(() => document.querySelector('#customer-cases p[aria-live]').textContent === '3 / 3');
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.waitForLoadState('networkidle');
      await page.goto(new URL('/card/cases', url).href, { waitUntil: 'networkidle' });
      assert.equal(await page.locator('[class*="phoneScreen"]').count(), 0);
      await page.getByRole('button', { name: '預覽 URBANITE', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByAltText('URBANITE URBANITE 實際網站').evaluate(el => el.decode());
      assert.ok((await dialog.locator('img').getAttribute('src')).includes('urbanite-live'));
      await dialog.getByRole('button', { name: '下一個案例' }).click();
      assert.equal(await dialog.getByRole('heading').innerText(), 'CHUÉ');
      await page.keyboard.press('Escape');
      assert.equal(await dialog.isVisible(), false);
      assert.deepEqual(errors, []);
      console.log(`${engine.name()} ${width}: unframed full screenshots, arrows, keyboard, swipe, edge states, gallery preview and no overflow passed.`);
    } finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
