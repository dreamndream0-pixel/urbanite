/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { chromium, webkit } = require(process.argv[2] || 'playwright');
const url = process.argv[3];
const fixture = require('./fixtures/variant-pricing.json');
(async () => {
  for (const [engine, width] of [[chromium, 320], [chromium, 390], [webkit, 390], [chromium, 1440]]) {
    if (process.argv[4] && process.argv[4] !== `${engine.name()}-${width}`) continue;
    const browser = await engine.launch({ headless: true, ...(engine === chromium ? { channel: 'chrome' } : {}) });
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [], writes = [];
    let failRead = false, failWrite = false, staleQuote = false, staleRequests = 0;
    let settings = { id: 1, logo_url: '', enabled_shipping_methods: ['宅配到府', '全家取貨不付款'], enabled_payment_methods: ['轉帳匯款'], shipping_fees: [{ name: '宅配到府', fee: 120 }, { name: '全家取貨不付款', fee: 60 }] };
    const product = { ...structuredClone(fixture), price: 500, inventory: 100, specs: [], variants: [], colors: [], sizes: [] };
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', async route => {
      const req = route.request(), pathname = new URL(req.url()).pathname;
      if (pathname === '/api/settings') {
        if (req.method() === 'PATCH') {
          const body = req.postDataJSON(); writes.push(body);
          if (failWrite) return route.fulfill({ status: 500, json: { error: '儲存失敗測試' } });
          settings = { ...settings, ...body }; return route.fulfill({ json: settings });
        }
        return route.fulfill(failRead ? { status: 503, json: { error: 'offline' } } : { json: settings });
      }
      if (pathname === '/api/products') return route.fulfill({ json: [product] });
      if (pathname === '/api/me') return route.fulfill({ json: { name: 'Buyer', email: 'buyer@example.invalid' } });
      if (pathname === '/api/user-coupons') return route.fulfill({ json: { owned: [] } });
      if (pathname === '/api/me/credit') return route.fulfill({ json: { enabled: false } });
      if (pathname === '/api/orders') {
        if (!staleQuote) throw new Error('Browser tests must not place orders');
        staleRequests++; staleQuote = false;
        assert.equal(req.postDataJSON().expected_shipping, 0);
        settings = { ...settings, free_shipping_threshold: 3000 };
        return route.fulfill({ status: 409, json: { code: 'SHIPPING_CHANGED', error: '運費條件已更新，請確認最新金額後重新結帳' } });
      }
      return route.fulfill({ json: [] });
    });
    const go = async mode => { await page.waitForLoadState('networkidle'); await page.goto(`${url}?mode=${mode}`); };
    const input = page.getByRole('spinbutton', { name: '全店免運金額', exact: true });
    const toggle = page.getByRole('switch', { name: '啟用全店滿額免運', exact: true });
    const saveButton = page.getByRole('button', { name: '儲存活動', exact: true });
    const save = async () => { await saveButton.click(); await page.getByText('已是最新', { exact: true }).waitFor(); };
    const cart = quantity => [{ id: 'cart-p', productId: product.id, name: product.name, variant: '標準款', price: 500, quantity }];
    const setCart = quantity => page.evaluate(items => localStorage.setItem('cart', JSON.stringify(items)), cart(quantity));
    const total = amount => page.waitForFunction(value => document.querySelector('[data-checkout-total]')?.textContent === value, `$${amount.toLocaleString('en-US')}`);
    try {
      await go('activities'); await input.waitFor(); assert.equal(await input.inputValue(), '2000');
      await input.fill('1500'); await save();
      assert.equal(writes.at(-1).free_shipping_threshold, 1500);
      assert.equal(writes.at(-1).promo_notices[0].text, '全店消費滿 $1,500 免運費');
      await go('activities'); assert.equal(await input.inputValue(), '1500');
      await page.screenshot({ path: path.join(os.tmpdir(), `urbanite-free-shipping-${engine.name()}-${width}.png`) });
      failWrite = true; await input.fill('1800'); await saveButton.click();
      await page.getByRole('alert').filter({ hasText: '儲存失敗測試' }).waitFor();
      assert.equal(await input.inputValue(), '1800'); assert.equal(settings.free_shipping_threshold, 1500);
      failWrite = false; await save(); assert.equal(settings.free_shipping_threshold, 1800);
      const count = writes.length;
      await input.fill('-1'); await saveButton.click(); await page.getByRole('alert').filter({ hasText: '整數免運門檻' }).waitFor(); assert.equal(writes.length, count);
      await input.fill('1500'); await save();
      await setCart(3); await go('checkout'); await total(1500);
      await page.getByRole('button', { name: `減少 ${product.name} 標準款 數量`, exact: true }).click(); await total(1120);
      await page.getByRole('combobox').first().selectOption('全家取貨不付款'); await total(1060);
      await go('detail'); await page.getByText('全店消費滿 $1,500 免運費', { exact: true }).waitFor();
      await setCart(3); await go('store'); await page.getByRole('button', { name: '購物車', exact: true }).click();
      await page.locator('aside').getByText('免運', { exact: true }).waitFor();
      await go('activities'); await toggle.uncheck(); await save(); assert.equal(settings.free_shipping_threshold, null);
      await go('activities'); assert.equal(await toggle.isChecked(), false); assert.equal(await input.isDisabled(), true);
      await setCart(3); await go('checkout'); await total(1620);
      await go('detail'); await page.waitForLoadState('networkidle'); assert.equal(await page.getByText(/全店消費滿.*免運費/).count(), 0);
      await go('activities'); await toggle.check(); await input.fill('0'); await save();
      await setCart(1); await go('checkout'); await total(500);
      if (engine === chromium && width === 390) {
        await page.getByPlaceholder('收件人電話', { exact: true }).fill('0912345678');
        await page.getByRole('combobox').filter({ has: page.getByRole('option', { name: '選擇縣市', exact: true }) }).selectOption({ index: 1 });
        await page.getByRole('combobox').filter({ has: page.getByRole('option', { name: '選擇行政區', exact: true }) }).selectOption({ index: 1 });
        await page.getByPlaceholder('詳細地址(路/街、門牌號)', { exact: true }).fill('Test address');
        staleQuote = true;
        await page.getByRole('button', { name: '送出訂單', exact: true }).click();
        await page.getByText('運費條件已更新，請確認最新金額後重新結帳', { exact: true }).waitFor();
        await total(620); assert.equal(staleRequests, 1);
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('cart')).length), 1);
        settings = { ...settings, free_shipping_threshold: 0 };
      }
      await go('detail'); await page.getByText('全店免運費', { exact: true }).waitFor();
      failRead = true; await go('activities'); await page.getByRole('alert').filter({ hasText: '無法載入活動設定' }).waitFor(); assert.equal(await input.count(), 0);
      failRead = false; await page.getByRole('button', { name: '重新載入', exact: true }).click(); await input.waitFor(); assert.equal(await input.inputValue(), '0');
      failRead = true; await go('checkout'); await page.getByRole('alert').filter({ hasText: '無法取得最新運費設定' }).waitFor(); assert.equal(await page.getByRole('button', { name: '送出訂單', exact: true }).count(), 0);
      await go('detail'); await page.waitForLoadState('networkidle'); assert.equal(await page.getByText('全店消費滿 $2,000 免運費', { exact: true }).count(), 0, 'Failed reads must not advertise an incorrect default threshold');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.deepEqual(errors, []);
      console.log(`${engine.name()} ${width}: activity settings save/reload, validation, failure retry, cart/checkout thresholds, custom fees, zero/disabled, synced product notice and fail-closed settings passed. All APIs mocked.`);
    } catch (error) { console.error((await page.locator('body').innerText()).slice(-3500)); throw error; }
    finally { await browser.close(); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
