/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { chromium, webkit } = require(process.argv[2] || 'playwright');
const url = process.argv[3];
const product = require('./fixtures/variant-pricing.json');
if (!url) throw new Error('Provide a temporary local route mounting VariantPricingFixture');
(async () => {
  for (const [engine, width] of [[chromium, 390], [webkit, 390], [chromium, 1440]]) {
    const browser = await engine.launch({ headless: true, ...(engine === chromium ? { channel: 'chrome' } : {}) });
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    const saved = [];
    let current = structuredClone(product);
    let releasePrices;
    let priceGate;
    let failPrices = false;
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/api/**', async (route) => {
      const req = route.request();
      const pathname = new URL(req.url()).pathname;
      if (pathname.startsWith('/api/products') && ['POST', 'PATCH'].includes(req.method())) {
        const data = req.postDataJSON(); saved.push({ method: req.method(), data });
        current = { ...current, ...data };
        return route.fulfill({ json: current, status: req.method() === 'POST' ? 201 : 200 });
      }
      if (pathname === '/api/products') {
        if (priceGate) await priceGate;
        return route.fulfill(failPrices ? { status: 500, json: { error: 'Unavailable' } } : { json: [current] });
      }
      if (pathname === '/api/me') return route.fulfill({ json: { name: 'Buyer', email: 'buyer@example.invalid' } });
      if (pathname === '/api/settings') return route.fulfill({ json: { id: 1, logo_url: '', shipping_fees: [{ name: '宅配到府', fee: 0 }], enabled_shipping_methods: ['宅配到府'], enabled_payment_methods: ['轉帳匯款'] } });
      return route.fulfill({ json: [] });
    });
    const click = (name) => page.getByRole('button', { name, exact: true }).click();
    try {
      await page.goto(`${url}?section=products`);
      await click('編輯');
      assert.equal(await page.getByLabel('1入 售價', { exact: true }).inputValue(), '');
      assert.equal(await page.getByLabel('5入 售價', { exact: true }).inputValue(), '450');
      await page.getByLabel('5入 售價', { exact: true }).fill('420');
      await page.getByLabel('10入 售價', { exact: true }).fill('');
      await page.getByLabel('5入 售價', { exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(os.tmpdir(), `urbanite-variant-editor-${engine.name()}-${width}.png`) });
      const inputBounds = await page.getByLabel('5入 售價', { exact: true }).boundingBox();
      assert.ok(inputBounds.x >= 0 && inputBounds.x + inputBounds.width <= width);
      await click('儲存');
      await page.getByRole('heading', { name: '編輯商品', exact: true }).waitFor({ state: 'hidden' });
      assert.equal(saved.at(-1).method, 'PATCH');
      assert.deepEqual(saved.at(-1).data.variants.map((v) => v.price), [null, 420, null]);
      assert.equal(saved.at(-1).data.variants[1].location, 'A1');
      assert.equal(saved.at(-1).data.variants[1].cost, 200);
      await click('編輯');
      assert.equal(await page.getByLabel('5入 售價', { exact: true }).inputValue(), '420');
      assert.equal(await page.getByLabel('10入 售價', { exact: true }).inputValue(), '');

      await page.goto(`${url}?mode=detail`);
      await page.getByRole('heading', { name: product.name }).waitFor();
      await click('5入');
      await page.getByText('NT $450', { exact: true }).waitFor();
      assert.equal(await page.getByText('NT $200', { exact: true }).count(), 0, 'A lower original price must not be crossed out');
      await click('加入購物車');
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.cart)[0].price), 450);
      await click('1入');
      await page.getByText('NT $100', { exact: true }).waitFor();

      await page.goto(`${url}?mode=store`);
      await page.getByRole('button', { name: `將 ${product.name} 加入購物車`, exact: true }).click();
      await click('5入');
      await page.locator('span.text-2xl').getByText('$420', { exact: true }).waitFor();
      await click('加入購物車');
      const cart = await page.evaluate(() => JSON.parse(localStorage.cart));
      assert.equal(cart[0].price, 420);
      assert.equal(cart[0].quantity, 2);
      await page.evaluate(() => { const cart = JSON.parse(localStorage.cart); cart[0].price = 1; localStorage.cart = JSON.stringify(cart); });
      priceGate = new Promise((resolve) => { releasePrices = resolve; });
      await page.goto(`${url}?mode=checkout`);
      await page.getByText('載入中…', { exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: '送出訂單', exact: true }).count(), 0);
      releasePrices(); priceGate = null;
      await page.getByText('$840', { exact: true }).first().waitFor();
      assert.equal(await page.getByText('$2', { exact: true }).count(), 0);
      await page.screenshot({ path: path.join(os.tmpdir(), `urbanite-variant-checkout-${engine.name()}-${width}.png`) });
      failPrices = true;
      await page.reload();
      await page.getByRole('alert').filter({ hasText: '無法取得最新商品售價' }).waitFor();
      assert.equal(await page.getByRole('button', { name: '送出訂單', exact: true }).count(), 0);
      failPrices = false;
      await click('重新載入');
      await page.getByText('$840', { exact: true }).first().waitFor();

      await page.goto(`${url}?section=products`);
      await click('新增商品');
      await page.getByLabel('商品代碼(英文,新增後不可改)', { exact: true }).fill('new-pack-fixture');
      await page.getByLabel('商品名稱', { exact: true }).fill('新組合商品');
      await page.getByLabel('基本售價', { exact: true }).fill('120');
      await click('為商品新增更多規格');
      await page.getByPlaceholder('規格', { exact: true }).fill('入數');
      const option = page.getByPlaceholder('輸入選項後按 Enter', { exact: true });
      for (const value of ['1入', '5入']) { await option.fill(value); await option.press('Enter'); }
      await page.getByLabel('1入 售價', { exact: true }).fill('120');
      await page.getByLabel('5入 售價', { exact: true }).fill('500');
      await click('儲存');
      await page.getByRole('heading', { name: '新增商品', exact: true }).waitFor({ state: 'hidden' });
      assert.equal(saved.at(-1).method, 'POST');
      assert.deepEqual(saved.at(-1).data.variants.map((v) => v.price), [120, 500]);
      assert.deepEqual(saved.at(-1).data.variants.map((v) => v.inventory), [0, 0]);
      assert.deepEqual(errors, []);
      console.log(`${engine.name()} ${width}: admin create/edit/reopen/clear/metadata, detail switching, quick add, existing-cart repricing and checkout passed. API writes mocked.`);
    } catch (error) { console.error((await page.locator('body').innerText()).slice(-3500)); throw error; }
    finally { await browser.close(); }
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
