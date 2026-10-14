const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.SCROLL_TEST_URL || 'http://localhost:3011';
async function swipe(cdp, x, fromY, toY, dx = 0) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: fromY }] });
  for (let n = 1; n <= 16; n++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * n / 16, y: fromY + (toY - fromY) * n / 16 }] });
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const host of ['', 'chue.urbanite.com.tw']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
        extraHTTPHeaders: host ? { 'x-forwarded-host': host } : {} });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      const paths = host ? ['/'] : ['/', '/card', '/card/pricing', '/card/business'];
      if (process.env.SCROLL_CAMPAIGN_PATH) paths.push(process.env.SCROLL_CAMPAIGN_PATH);
      for (const path of paths) {
        await page.goto(base + path);
        await page.waitForTimeout(900);
        if (path === '/' && !paths.some(p => p.startsWith('/products/'))) {
          const product = await page.locator('a[href^="/products/"]').first().getAttribute('href').catch(() => null);
          if (product) paths.push(product);
        }
        for (let round = 0; round < 3; round++) {
          await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
          await swipe(cdp, 190, 650, 200, 15);
          await page.waitForTimeout(300);
          const down = await page.evaluate(() => scrollY);
          assert(down > 100, `${host}${path}: downward swipe blocked`);
          await swipe(cdp, 190, 180, 740, -10);
          await page.waitForTimeout(350);
          const up = await page.evaluate(() => scrollY);
          assert(up < down, `${host}${path}: upward swipe blocked`);
          await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
          await page.waitForTimeout(150);
          assert.equal(await page.evaluate(() => scrollY), 0, `${path}: cannot return to top`);
        }
        if (path === '/') {
          for (const [open, close] of [['開啟選單', '關閉選單'], ['購物車', '關閉'], ['收藏清單', '關閉']]) {
            await page.getByRole('button', { name: open, exact: true }).click();
            assert.equal(await page.evaluate(() => getComputedStyle(document.body).overflow), 'hidden');
            await page.getByRole('button', { name: close, exact: true }).filter({ visible: true }).click();
            await page.waitForTimeout(100);
            assert.notEqual(await page.evaluate(() => getComputedStyle(document.body).overflow), 'hidden');
          }
        }
        if (path === '/card') {
          const header = await page.locator('header').first().boundingBox();
          const hero = await page.locator('header + section').boundingBox();
          assert(hero.y >= header.y + header.height - 1, 'Hero clipped behind header');
        }
        if (path === '/card/pricing') {
          await page.getByRole('button', { name: '完整功能比較' }).click();
          await page.getByRole('button', { name: '關閉功能比較' }).click();
          await page.waitForFunction(() => getComputedStyle(document.body).overflow !== 'hidden');
        }
        for (const height of [650, 844]) {
          await page.setViewportSize({ width: 390, height });
          await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
          assert.equal(await page.evaluate(() => scrollY), 0);
        }
        console.log(`Passed native touch down/up, page-top restoration and resize: ${host || 'platform'}${path}`);
      }
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
