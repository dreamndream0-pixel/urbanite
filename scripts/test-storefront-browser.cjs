const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(process.argv[2] || 'playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let style = 'classic';
    const product = { id: 'test-product', name: '測試商品', tagline: '日常精選', price: 590, original_price: null, inventory: 10, status: '上架中', category: 'clothes', image: '/card/demo-fashion.webp', images: [], colors: [], sizes: [], specs: [], variants: [], is_featured: true, sort_order: 0 };
    await page.route('**/api/**', async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      let data = [];
      if (pathname === '/api/settings') data = { shop_name: '測試商店', site_theme: { storefront: { enabled: true, style, title: 'New Collection', subtitle: '日常裡的選擇', action: '探索商品', productsTitle: '本週精選', featureTitle: '品牌日常', featureText: '找到屬於你的生活風格。' } } };
      if (pathname === '/api/products') data = [product, { ...product, id: 'test-two' }];
      if (pathname === '/api/categories') data = [{ id: 'cat', slug: 'clothes', name: '服飾', en: 'CLOTHES', image: product.image, sort_order: 0 }];
      if (pathname === '/api/banners') data = [{ id: 'banner', image: product.image, active: true }];
      if (pathname === '/api/me') data = null;
      await route.fulfill({ json: data });
    });
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (style of ['classic', 'editorial', 'gallery', 'category', 'campaign', 'minimal']) {
        await page.goto('http://localhost:3011/?store-test=1');
        await page.locator(`[data-storefront-style="${style}"]`).waitFor();
        await page.getByRole('heading', { name: '本週精選' }).waitFor();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow ${style} ${width}`);
        await page.getByRole('button', { name: '探索商品' }).first().click();
        if (style === 'gallery' || style === 'category') {
          await page.getByRole('navigation', { name: '精選商品分類' }).getByRole('button', { name: '服飾' }).click();
          await page.locator('#store-products h1').filter({ hasText: '服飾' }).waitFor();
        }
        await page.screenshot({ path: path.join(os.tmpdir(), `urbanite-template-${style}-${width}.png`), fullPage: true });
      }
    }
    assert.deepEqual(errors, []);
    console.log('12 responsive template cases passed; screenshots in temp directory. All API responses mocked; no production writes.');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
