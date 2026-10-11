const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(process.argv[2] || 'playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    let style = 'circle', template = 'classic', images = true, inherit = false;
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      let data = [];
      if (url.pathname === '/api/settings') data = { category_image_style: style, site_theme: { storefront: { enabled: true, style: template, blocks: [{ id: 'cats', type: 'categories', title: '商品分類', categoryImageStyle: inherit ? undefined : style }, { id: 'products', type: 'products', title: '精選商品' }] } } };
      if (url.pathname === '/api/categories') data = Array.from({ length: 12 }, (_, i) => ({ id: `cat-${i}`, slug: `cat-${i}`, name: `分類 ${i + 1}`, sort_order: i, image: images ? '/card/demo-fashion.webp' : '' }));
      if (url.pathname === '/api/me') data = null;
      await route.fulfill({ json: data });
    });
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (style of ['circle', 'square', 'cutout']) {
        await page.goto('http://localhost:3011/');
        const row = page.locator(`[data-block-id="cats"] .store-category-row--${style}`);
        await row.waitFor();
        assert.equal(await row.evaluate((el) => el.scrollWidth > el.clientWidth), true);
        const tops = await row.locator('button').evaluateAll((els) => els.map((el) => el.offsetTop));
        assert.equal(new Set(tops).size, 1);
        await row.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
        assert.ok(await row.evaluate((el) => el.scrollLeft) > 0);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.screenshot({ path: path.join(os.tmpdir(), `classic-categories-${style}-${width}.png`) });
        await row.getByRole('button', { name: '分類 12', exact: true }).click();
        await page.locator('#store-products h1').filter({ hasText: '分類 12' }).waitFor();
      }
    }
    inherit = true; style = 'square';
    await page.goto('http://localhost:3011/');
    await page.locator('[data-block-id="cats"] .store-category-row--square').waitFor();
    images = false;
    await page.goto('http://localhost:3011/');
    await page.locator('[data-block-id="cats"] .store-category-row').waitFor();
    assert.equal(await page.locator('[data-block-id="cats"] .store-category-image').count(), 0);
    template = 'gallery';
    await page.goto('http://localhost:3011/');
    await page.locator('[data-block-id="cats"]').waitFor();
    assert.equal(await page.locator('[data-block-id="cats"] .store-category-row').count(), 0);
    assert.deepEqual(errors, []);
    console.log('Classic categories passed: 3 image styles at 2 widths, horizontal scroll, navigation, inherited style, text-only fallback, other template unchanged.');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
