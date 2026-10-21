/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const ts = require('typescript');
const { chromium, webkit } = require(process.argv[2] || 'playwright');
const url = process.argv[3];
if (!url) throw new Error('Provide a temporary local route mounting CheckoutStockFixture');
const fixture = require('./fixtures/variant-pricing.json');
const mod = { exports: {} };
new Function('module', 'exports', ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib/discount.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(mod, mod.exports);
const { evaluateCoupon } = mod.exports;
const coupon = (code, fields = {}) => ({ id: code, code, active: true, type: 'amount', value: 100, min_spend: 300, ...fields });
const coupons = [coupon('SAVE100'), coupon('PERCENT10', { type: 'percent', value: 10, min_spend: 0 }), coupon('TARGET', { value: 30, min_spend: 0, applicable_products: [fixture.id] }), coupon('SHIP', { type: 'free_shipping', min_spend: 0 })];
const settings = { logo_url: '', enabled_shipping_methods: ['宅配到府', '全家取貨不付款'], enabled_payment_methods: ['轉帳匯款'], shipping_fees: [{ name: '宅配到府', fee: 100 }, { name: '全家取貨不付款', fee: 60 }] };

(async () => {
  for (const [engine, width] of [[chromium, 320], [chromium, 390], [webkit, 390], [chromium, 1440]]) {
    if (process.argv[4] && engine.name() !== process.argv[4]) continue;
    const browser = await engine.launch({ headless: true, ...(engine === chromium ? { channel: 'chrome' } : {}) });
    const page = await browser.newPage({ viewport: { width, height: 900 }, ...(engine === webkit ? { isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.0.0 Mobile/15E148 Safari/604.1' } : {}) });
    let products = [{ ...structuredClone(fixture), inventory: 4, variants: [{ options: ['1入'], inventory: 3 }, { options: ['5入'], inventory: 1, price: 450 }, { options: ['10入'], inventory: 0, price: 800 }] }, { ...structuredClone(fixture), id: 'plain-fixture', name: '無規格商品', price: 300, inventory: 2, specs: [], variants: [] }];
    let gate = null;
    let failCoupon = false;
    let owned = false;
    const errors = [];
    const orderCalls = [];
    const responses = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/api/**', async (route) => {
      const req = route.request();
      const pathname = new URL(req.url()).pathname;
      if (pathname === '/api/products') return route.fulfill({ json: products });
      if (pathname === '/api/settings') return route.fulfill({ json: settings });
      if (pathname === '/api/me') return route.fulfill({ json: { name: 'Buyer', email: 'buyer@example.invalid' } });
      if (pathname === '/api/me/credit') return route.fulfill({ json: { enabled: false } });
      if (pathname === '/api/user-coupons') return route.fulfill({ json: { owned: owned ? coupons.map((entry) => ({ id: `owned-${entry.code}`, status: 'available', coupon: entry })) : [] } });
      if (pathname === '/api/discounts/validate') {
        const body = req.postDataJSON();
        const entry = coupons.find((c) => c.code === body.code);
        const result = entry ? evaluateCoupon(entry, { ...body, products, userId: 'fixture', isFirstPurchase: true }) : { ok: false, reason: '無效優惠券' };
        const currentGate = gate?.match(body) ? gate : null;
        if (currentGate) { currentGate.started(); await currentGate.promise; }
        responses.push(body);
        await route.fulfill(failCoupon ? { status: 500, json: { error: 'Unavailable' } } : result.ok
          ? { json: { code: entry.code, discount: result.finalCouponAmount, user_coupon_id: body.user_coupon_id || undefined } }
          : { status: 400, json: { error: result.reason } }).catch(() => {});
        currentGate?.finished();
        return;
      }
      if (pathname === '/api/orders') { orderCalls.push(req.postDataJSON()); return route.fulfill({ status: 500, json: { error: 'No real orders in test' } }); }
      return route.fulfill({ json: [] });
    });
    const cartLine = (variant = '1入', quantity = 3, product = products[0]) => ({ id: `${product.id}-${variant}`, productId: product.id, name: product.name, variant, quantity, price: product.variants.find((v) => v.options.join(' / ') === variant)?.price ?? product.price });
    const setCart = (cart) => page.evaluate((items) => { localStorage.setItem('cart', JSON.stringify(items)); }, cart);
    const replaceCart = async (cart) => {
      await setCart(cart);
      await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'cart' })));
    };
    const visit = async (cart, mode = 'checkout') => {
      await page.waitForLoadState('networkidle');
      await setCart(cart);
      await page.goto(`${url}?mode=${mode}`);
      if (mode === 'checkout') await page.locator('[data-checkout-items]').waitFor();
    };
    const click = (name) => page.getByRole('button', { name, exact: true }).click();
    const increase = () => page.getByRole('button', { name: `增加 ${fixture.name} 1入 數量`, exact: true });
    const decrease = () => click(`減少 ${fixture.name} 1入 數量`);
    const apply = async (code) => { await page.getByLabel('優惠代碼', { exact: true }).fill(code); await click('套用'); };
    const applied = (code) => page.locator('[data-selected-coupon]').filter({ hasText: `${code}・已套用` }).waitFor();
    const total = async (amount) => assert.equal(await page.locator('[data-checkout-total]').innerText(), `$${amount}`);
    const hold = (match) => {
      let release, started, finished;
      const promise = new Promise((resolve) => { release = resolve; });
      const began = new Promise((resolve) => { started = resolve; });
      const done = new Promise((resolve) => { finished = resolve; });
      gate = { match, promise, started, finished };
      return { began, release: async () => { gate = null; release(); await done; await page.evaluate(() => true); } };
    };
    try {
      await page.goto(`${url}?mode=checkout`);
      await page.waitForLoadState('networkidle');
      await visit([{ ...cartLine(), price: 1 }]);
      await total(400);
      assert.equal(await increase().isDisabled(), true);
      await page.getByText('已達庫存上限（3 件）', { exact: true }).waitFor();
      await decrease(); assert.equal(await increase().isEnabled(), true);
      await increase().click(); assert.equal(await increase().isDisabled(), true);
      assert.equal(await page.locator('[data-cart-quantity]').innerText(), '3');

      await apply('SAVE100'); await applied('SAVE100'); await total(300);
      await decrease();
      await page.getByText(/不符合優惠券門檻或使用條件（未滿 NT\$300）/).first().waitFor();
      assert.equal(await page.locator('[data-selected-coupon]').count(), 0);
      assert.equal(await page.getByLabel('優惠代碼', { exact: true }).inputValue(), '');
      await click('重新選擇');
      await apply('PERCENT10'); await applied('PERCENT10'); await total(280);
      await increase().click(); await applied('PERCENT10'); await total(370);
      await click('移除優惠券'); assert.equal(await page.locator('[data-selected-coupon]').count(), 0); await total(400);

      await apply('SHIP'); await applied('SHIP'); await total(300);
      await page.getByText('-$100', { exact: true }).waitFor();
      await page.getByRole('combobox').first().selectOption('全家取貨不付款');
      await applied('SHIP'); await total(300);
      await page.getByText('-$60', { exact: true }).waitFor();
      await page.getByRole('combobox').first().selectOption('宅配到府'); await applied('SHIP');
      await click('移除優惠券');

      await apply('TARGET'); await applied('TARGET');
      await replaceCart([cartLine('標準款', 1, products[1])]);
      await page.getByText(/不符合優惠券門檻或使用條件（僅限指定商品或分類使用）/).first().waitFor();
      assert.equal(await page.locator('[data-selected-coupon]').count(), 0);
      await click('重新選擇');

      await visit([cartLine()]);
      const race = hold((body) => body.code === 'PERCENT10' && body.subtotal === 300);
      await apply('PERCENT10'); await race.began;
      assert.equal(await page.getByRole('button', { name: '送出訂單', exact: true }).isDisabled(), true);
      await decrease(); await applied('PERCENT10'); await total(280);
      await race.release();
      await page.waitForFunction(() => document.querySelector('[data-selected-coupon]')?.textContent.includes('PERCENT10・已套用'));
      await total(280);
      await click('移除優惠券');
      const removed = hold((body) => body.code === 'PERCENT10');
      await apply('PERCENT10'); await removed.began;
      await click('移除優惠券'); await removed.release();
      await page.getByText('已移除優惠券，可重新選擇。', { exact: true }).waitFor();
      assert.equal(await page.locator('[data-selected-coupon]').count(), 0); await total(300);

      const staleInvalid = hold((body) => body.code === 'SAVE100' && body.subtotal === 200);
      await apply('SAVE100'); await staleInvalid.began;
      await apply('PERCENT10'); await applied('PERCENT10'); await staleInvalid.release();
      await total(280);
      assert.equal(await page.getByRole('button', { name: '重新選擇', exact: true }).count(), 0, 'Stale failure must not clear a newer selection');
      await click('移除優惠券');

      failCoupon = true;
      await apply('PERCENT10');
      await page.getByText('暫時無法確認優惠券資格，已取消套用，請重新選擇或稍後再試。', { exact: true }).first().waitFor();
      await click('重新選擇'); failCoupon = false;
      assert.equal(await page.locator('[data-selected-coupon]').count(), 0);

      owned = true;
      await visit([cartLine()]);
      await page.getByRole('button', { name: /^SAVE100/ }).click(); await applied('SAVE100');
      await decrease(); await click('重新選擇');
      assert.equal(await page.locator('[data-selected-coupon]').count(), 0);
      await page.getByRole('button', { name: /^PERCENT10/ }).click(); await applied('PERCENT10');
      assert.equal(await page.getByRole('button', { name: /^PERCENT10/ }).getAttribute('aria-pressed'), 'true');
      assert.equal(await page.getByRole('button', { name: /^PERCENT10/ }).getAttribute('data-selected-coupon'), '');
      assert.equal(await page.locator('[data-selected-coupon]').count(), 1, 'Selected state must live on the coupon itself, not a duplicate panel');
      await page.getByRole('button', { name: /^PERCENT10/ }).screenshot({ path: path.join(os.tmpdir(), `urbanite-coupon-selected-${engine.name()}-${width}.png`) });
      await page.getByRole('button', { name: /^PERCENT10/ }).click();
      assert.equal(await page.locator('[data-selected-coupon]').count(), 0, 'Selected member coupon can be toggled off');
      const memberPending = hold((body) => body.user_coupon_id === 'owned-PERCENT10');
      await page.getByRole('button', { name: /^PERCENT10/ }).click(); await memberPending.began;
      assert.equal(await page.getByRole('button', { name: /^PERCENT10/ }).isEnabled(), true);
      await page.getByRole('button', { name: /^PERCENT10/ }).click(); await memberPending.release();
      assert.equal(await page.locator('[data-selected-coupon]').count(), 0, 'A coupon can be toggled off even before its check completes');

      await visit([cartLine('1入', 9)]);
      await page.getByText('目前最多可購 3 件，請調整數量。', { exact: true }).waitFor();
      assert.equal(await increase().isDisabled(), true);
      assert.equal(await page.getByRole('button', { name: '送出訂單', exact: true }).isDisabled(), true);
      await click(`移除 ${fixture.name} 1入`); await page.getByText('購物車是空的。', { exact: true }).waitFor();

      await visit([cartLine()]);
      products[0].variants[0].inventory = 1;
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await page.getByText('目前最多可購 1 件，請調整數量。', { exact: true }).waitFor();
      assert.equal(await increase().isDisabled(), true);
      assert.equal(await page.getByRole('button', { name: '送出訂單', exact: true }).isDisabled(), true);
      await decrease(); await decrease();
      products[0].variants[0].inventory = 3;
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await increase().click();
      assert.equal(await page.locator('[data-cart-quantity]').innerText(), '2');

      await visit([cartLine('標準款', 2, products[1])]);
      assert.equal(await page.getByRole('button', { name: '增加 無規格商品 標準款 數量', exact: true }).isDisabled(), true);
      await visit([cartLine('missing', 1)]);
      await page.getByText('此商品或規格目前無法購買，請移除。', { exact: true }).waitFor();

      await visit([cartLine('1入', 2)], 'detail');
      await page.getByText('最多還可加入 1 件（已扣除購物車數量）', { exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: '增加數量', exact: true }).isDisabled(), true);
      await click('加入購物車');
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.cart)[0].quantity), 3);
      assert.equal(await page.getByRole('button', { name: '加入購物車', exact: true }).isDisabled(), true);
      await click('5入');
      await page.getByText('NT $450', { exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: '增加數量', exact: true }).isDisabled(), true);
      assert.equal(await page.locator('[data-product-quantity]').innerText(), '1');

      await visit([], 'detail');
      await page.getByRole('button', { name: '增加數量', exact: true }).click();
      await page.getByRole('button', { name: '增加數量', exact: true }).click();
      assert.equal(await page.locator('[data-product-quantity]').innerText(), '3');
      await click('5入'); assert.equal(await page.locator('[data-product-quantity]').innerText(), '1', 'Switching to low-stock variant clamps selection immediately');

      await visit([cartLine('1入', 2)], 'store');
      await page.getByRole('button', { name: `將 ${fixture.name} 加入購物車`, exact: true }).click();
      await page.getByText('最多還可加入 1 件（已扣除購物車數量）', { exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: '增加數量', exact: true }).isDisabled(), true);
      await click('加入購物車');
      await click('購物車');
      await page.getByText('已達庫存上限（3）', { exact: true }).waitFor();
      assert.equal(await page.locator('aside').getByRole('button', { name: '+', exact: true }).isDisabled(), true);
      await page.waitForFunction(() => [...document.querySelectorAll('aside')].some((el) => !el.inert && el.getBoundingClientRect().right <= innerWidth + 1));
      await page.screenshot({ path: path.join(os.tmpdir(), `urbanite-stock-cart-${engine.name()}-${width}.png`) });

      const standardProduct = structuredClone(products[0]);
      const matrix = { ...standardProduct, inventory: 3,
        specs: [{ name: '顏色', options: ['紅色', '藍色', '白色'], display: 'image' }, { name: '尺寸', options: ['S', 'M'] }],
        color_images: { 紅色: '/card/demo-fashion.webp', 藍色: '/card/demo-creator.webp' },
        variants: [{ options: ['紅色', 'S'], inventory: 0, price: 200 }, { options: ['紅色', 'M'], inventory: 2, price: 250 }, { options: ['藍色', 'S'], inventory: 1, price: 500 }, { options: ['藍色', 'M'], inventory: 0, price: 550 }, { options: ['白色', 'S'], inventory: 0 }],
      };
      const pickerSnapshots = [];
      for (const mode of ['detail', 'store']) {
        products[0] = structuredClone(matrix);
        await visit([], mode);
        if (mode === 'store') await page.getByRole('button', { name: `將 ${fixture.name} 加入購物車`, exact: true }).click();
        const picker = page.locator('[data-product-spec-picker]');
        await picker.getByRole('group', { name: '顏色', exact: true }).waitFor();
        assert.equal(await picker.getByRole('button', { name: '紅色', exact: true }).getAttribute('aria-pressed'), 'true');
        assert.equal(await picker.getByRole('button', { name: 'M', exact: true }).getAttribute('aria-pressed'), 'true');
        assert.equal(await picker.getByRole('button', { name: '白色', exact: true }).isDisabled(), true);
        assert.equal(await picker.getByRole('button', { name: '藍色', exact: true }).locator('img').getAttribute('src'), '/card/demo-creator.webp');
        pickerSnapshots.push(await picker.locator('button').evaluateAll((buttons) => buttons.map((button) => ({ label: button.getAttribute('aria-label'), selected: button.getAttribute('aria-pressed'), disabled: button.disabled, image: button.querySelector('img')?.getAttribute('src') ?? null }))));
        await picker.getByRole('button', { name: '藍色', exact: true }).click();
        assert.equal(await picker.getByRole('button', { name: 'S', exact: true }).getAttribute('aria-pressed'), 'true', 'Select the available size when the chosen color has no M stock');
        await page.getByText(mode === 'detail' ? 'NT $500' : '$500', { exact: true }).waitFor();
        assert.equal(await page.locator('[data-product-spec-image]').getAttribute('src'), '/card/demo-creator.webp');
        await page.waitForFunction(() => { const img = document.querySelector('[data-product-spec-image]'); return img?.complete && img.naturalWidth > 0; });
        assert.equal(await page.getByRole('button', { name: '增加數量', exact: true }).isDisabled(), true);
        await picker.getByRole('button', { name: 'M', exact: true }).click();
        assert.equal(await picker.getByRole('button', { name: '紅色', exact: true }).getAttribute('aria-pressed'), 'true');
        await page.getByText(mode === 'detail' ? 'NT $250' : '$250', { exact: true }).waitFor();
        if (mode === 'store') {
          const dialog = page.getByRole('dialog', { name: `${fixture.name} 規格選擇`, exact: true });
          await dialog.screenshot({ path: path.join(os.tmpdir(), `urbanite-quick-specs-${engine.name()}-${width}.png`) });
          const bounds = await dialog.boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
        }
        products[0] = { ...standardProduct, specs: [{ name: '入數', options: ['1入', '5入'], display: 'image' }], color_images: { '5入': '/card/demo-collection.webp' }, variants: [{ options: ['1入'], inventory: 0, price: 120 }, { options: ['5入'], inventory: 2, price: 480 }] };
        await page.evaluate(() => window.dispatchEvent(new Event('focus')));
        await picker.getByRole('group', { name: '入數', exact: true }).waitFor();
        assert.equal(await picker.getByRole('group', { name: '顏色', exact: true }).count(), 0);
        await picker.getByRole('button', { name: '5入', exact: true }).click();
        await page.getByText(mode === 'detail' ? 'NT $480' : '$480', { exact: true }).waitFor();
        assert.equal(await page.locator('[data-product-spec-image]').getAttribute('src'), '/card/demo-collection.webp');
        await click('加入購物車');
        const chosen = await page.evaluate(() => JSON.parse(localStorage.cart));
        assert.equal(chosen[0].variant, '5入'); assert.equal(chosen[0].price, 480); assert.equal(chosen[0].quantity, 1);
      }
      assert.deepEqual(pickerSnapshots[0], pickerSnapshots[1], 'Homepage quick add and product detail must share the same options, images, selection and availability');
      products[0] = standardProduct;

      await visit([cartLine()]);
      await apply('SAVE100'); await applied('SAVE100');
      await decrease(); await page.getByRole('button', { name: '重新選擇', exact: true }).waitFor();
      await page.screenshot({ path: path.join(os.tmpdir(), `urbanite-coupon-invalid-${engine.name()}-${width}.png`) });
      await click('重新選擇');
      await page.screenshot({ path: path.join(os.tmpdir(), `urbanite-checkout-stock-${engine.name()}-${width}.png`) });
      assert.deepEqual(errors, []);
      assert.deepEqual(orderCalls, [], 'No orders/payments may be created by the test');
      assert.ok(responses.length > 10);
      console.log(`${engine.name()} ${width}: stock caps, shared detail/quick-add specs/images/prices/schema refresh, existing-cart limits, plain/missing/overstock items, direct coupon-card toggles (including pending checks), live amount/shipping/category checks, network failure and stale-response races passed. All API traffic mocked; no orders created.`);
    } catch (error) {
      console.error((await page.locator('body').innerText()).slice(-4500));
      throw error;
    } finally { gate?.started(); await browser.close(); }
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
