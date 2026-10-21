/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { chromium, webkit } = require(process.argv[2] || 'playwright');
const url = process.argv[3] || 'http://localhost:3014/product-order-test';
const make = (id, sort_order, campaign_id = null) => ({ id, name: id, price: 10, inventory: 0, status: '上架中', category: '', image: '', images: [], colors: [], sizes: [], specs: [], variants: [], is_featured: false, sort_order, campaign_id, created_at: '2026-01-01T00:00:00Z' });
(async () => {
  for (const [engine, width] of [[chromium, 390], [webkit, 390], [chromium, 1440]]) {
    const browser = await engine.launch({ headless: true, ...(engine === chromium ? { channel: 'chrome' } : {}) });
    try {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      let products = [make('old-main', 0), make('old-main-2', 1), make('old-campaign', 0, 'campaign-a'), make('old-campaign-2', 1, 'campaign-a'), make('other-campaign', -1000, 'campaign-b')];
      const errors = []; const writes = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/api/**', async (route) => {
        const request = route.request(); const path = new URL(request.url()).pathname;
        if (path === '/api/products' && request.method() === 'GET') return route.fulfill({ json: products });
        if (path === '/api/products' && request.method() === 'POST') {
          const body = request.postDataJSON(); writes.push(body);
          const group = products.filter((p) => (p.campaign_id || null) === body.campaign_id);
          const rank = body.insert_at_start ? group.length ? Math.min(...group.map((p) => p.sort_order)) - 1 : 0 : body.sort_order;
          const created = { ...make(body.id, rank, body.campaign_id), ...body, sort_order: rank, created_at: new Date().toISOString() };
          products = [created, ...products];
          return route.fulfill({ status: 201, json: created });
        }
        if (path.startsWith('/api/products/') && request.method() === 'PATCH') {
          const id = decodeURIComponent(path.split('/').at(-1)); const patch = request.postDataJSON();
          products = products.map((p) => p.id === id ? { ...p, ...patch } : p);
          return route.fulfill({ json: products.find((p) => p.id === id) });
        }
        return route.fulfill({ json: path === '/api/me' ? null : [] });
      });
      const rows = page.locator('[data-admin-product]');
      const first = async (id) => { await page.waitForFunction((expected) => document.querySelector('[data-admin-product]')?.getAttribute('data-admin-product') === expected, id); };
      const create = async (id, campaign = false) => {
        await page.getByRole('button', { name: campaign ? '＋ 新增活動商品' : '新增商品', exact: true }).click();
        const editor = page.getByRole('dialog', { name: '新增商品', exact: true });
        await editor.locator('input').first().fill(id);
        await editor.getByPlaceholder('為您的商品命名').fill(id);
        await editor.getByRole('button', { name: '儲存', exact: true }).click();
        await editor.waitFor({ state: 'hidden' });
        await first(id);
        assert.equal(writes.at(-1).insert_at_start, true);
      };
      const main = async () => { await page.goto(`${url}?section=products`); await page.getByRole('button', { name: /^已售完（/ }).click(); await rows.first().waitFor(); };
      await main(); await first('old-main');
      await create('new-main');
      await main(); await first('new-main');
      await create('new-main-2');
      const before = products.filter((p) => !p.campaign_id).length;
      await page.locator('[data-admin-product="old-main"]').getByRole('button', { name: '編輯', exact: true }).click();
      const edit = page.getByRole('dialog', { name: '編輯商品', exact: true });
      await edit.getByLabel('排序(小的在前)', { exact: true }).fill('-50');
      await edit.getByRole('button', { name: '儲存', exact: true }).click();
      await edit.waitFor({ state: 'hidden' }); await first('old-main');
      await create('new-main-3');
      assert.equal(products.filter((p) => !p.campaign_id).length, before + 1);
      assert.equal(products.find((p) => p.id === 'new-main-3').sort_order, -51);
      await page.goto(`${url}?section=campaign-pages`);
      await first('old-campaign');
      await create('new-campaign', true);
      assert.equal(products.find((p) => p.id === 'new-campaign').sort_order, -1, 'Other campaign ranks must not leak into this activity');
      await page.reload(); await first('new-campaign');
      assert.equal(await page.locator('[data-admin-product="new-main-3"]').count(), 0, 'Main and campaign lists remain separate');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.deepEqual(errors, []);
      console.log(`${engine === chromium ? 'chromium' : 'webkit'} ${width}: create/prepend, refresh persistence, manual order, subsequent head insertion and isolated activity products passed. All API writes intercepted.`);
    } finally { await browser.close(); }
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
