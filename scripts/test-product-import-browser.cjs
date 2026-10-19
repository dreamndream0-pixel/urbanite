/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { chromium, webkit } = require(process.argv[2] || 'playwright');
const url = process.argv[3];
if (!url) throw new Error('Provide a temporary local route mounting ProductImportFixture');
const root = 'https://source.example';
const productA = { sourceUrl: `${root}/products/a`, name: '規格禮盒', description: '<p>產品介紹</p>', images: ['/card/demo-fashion.webp'], price: 100, originalPrice: null, currency: 'TWD', specs: [{ name: '入數', options: ['1入', '5入'] }], variants: [{ options: ['1入'], price: 100, inventory: null }, { options: ['5入'], price: 450, inventory: null }], inventory: null, category: '禮盒', colorImages: {}, warnings: ['來源未公開實際庫存'], reviewRequired: false };
const productB = { ...productA, sourceUrl: `${root}/products/b`, name: '通用辨識商品', price: 20, currency: 'USD', specs: [], variants: [], reviewRequired: true, warnings: ['原幣別為 USD，請換算新臺幣'] };
(async () => {
  for (const [engine, width] of [[chromium, 390], [webkit, 390], [chromium, 1440]]) {
    const browser = await engine.launch({ headless: true, ...(engine === chromium ? { channel: 'chrome' } : {}) });
    const page = await browser.newPage({ viewport: { width, height: 960 } });
    const errors = []; const writes = [];
    let releaseRead;
    const gate = new Promise((resolve) => { releaseRead = resolve; });
    let held = false; let fail = true; let duplicate = false;
    const created = new Map();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/api/**', async (route) => {
      const request = route.request();
      if (new URL(request.url()).pathname === '/api/products/import') {
        const body = request.postDataJSON();
        if (body.action === 'discover') return route.fulfill({ json: { root, url: body.url, products: body.seed ? [productA.sourceUrl] : [productA.sourceUrl, productB.sourceUrl, `${root}/products/blocked`], pages: body.seed ? [`${root}/collections/all?page=2`] : [], nextOffset: null, warnings: [] } });
        if (body.action === 'read') {
          if (body.url === productA.sourceUrl && !held) { held = true; await gate; }
          return body.url.includes('blocked') ? route.fulfill({ status: 400, json: { error: '來源網站要求登入' } }) : route.fulfill({ json: body.url === productA.sourceUrl ? productA : productB });
        }
        writes.push(body);
        if (fail) return route.fulfill({ status: 400, json: { error: '圖片搬移失敗，尚未上架' } });
        const product = { id: body.product.sourceUrl.includes('/a') ? 'import-a' : 'import-b', name: body.product.name, tagline: body.product.description, price: body.product.price, original_price: null, inventory: body.stock * (body.product.variants.length || 1), variants: body.product.variants.map((v) => ({ ...v, inventory: v.inventory ?? body.stock })), specs: body.product.specs, status: body.publish ? '上架中' : '已下架', category: body.category, image: '/card/demo-fashion.webp', images: ['/card/demo-fashion.webp'], colors: [], sizes: [], is_featured: false, sort_order: 0 };
        created.set(product.id, product);
        return route.fulfill({ status: duplicate ? 200 : 201, json: { status: duplicate ? 'duplicate' : 'created', product, warnings: [] } });
      }
      return route.fulfill({ json: new URL(request.url()).pathname === '/api/me' ? null : [] });
    });
    const click = (name) => page.getByRole('button', { name, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '商品一鍵搬家' });
    const open = async () => { await click('一鍵搬家'); await dialog.getByLabel('來源網址', { exact: true }).waitFor(); };
    const close = async () => { await click('關閉商品搬家'); await dialog.waitFor({ state: 'hidden' }); };
    const a = dialog.getByRole('article', { name: productA.name, exact: true });
    const b = dialog.getByRole('article', { name: productB.name, exact: true });
    const publishButton = dialog.getByRole('button', { name: '確認並上架', exact: true });
    try {
      await page.goto(`${url}?section=products`);
      await open();
      await click('整間商店');
      await dialog.getByLabel('來源網址', { exact: true }).fill(root);
      await click('開始讀取');
      await page.waitForFunction(() => document.body.innerText.includes('讀取商品：https://source.example/products/a'));
      await click('暫停'); releaseRead();
      await dialog.getByText('已暫停，可繼續讀取', { exact: true }).waitFor();
      await page.waitForFunction(async () => { const request = indexedDB.open('urbanite-product-import'); const db = await new Promise((r) => request.onsuccess = () => r(request.result)); const read = db.transaction('jobs').objectStore('jobs').get(location.host); return new Promise((resolve) => read.onsuccess = () => resolve(read.result?._entryUrls?.length === 1)); });
      await close();
      await page.reload(); await open();
      await a.waitFor();
      await click('繼續讀取');
      await dialog.getByText('讀取完成', { exact: true }).waitFor();
      await b.waitFor();
      assert.equal(await dialog.getByRole('article').count(), 3, 'Duplicate discovered URLs must not duplicate entries');
      assert.equal(writes.length, 0, 'Reading never publishes products');
      await dialog.getByLabel('未公開庫存', { exact: true }).fill('7');
      await dialog.getByLabel('匯入後狀態', { exact: true }).selectOption('publish');
      await dialog.getByLabel('我有權使用來源商品的圖片與內容', { exact: true }).check();
      assert.equal(await publishButton.isDisabled(), true, 'Foreign currency and unreviewed content must block publication');
      await b.getByLabel(`選取 ${productB.name}`, { exact: true }).uncheck();
      await publishButton.click();
      await a.getByRole('alert').waitFor();
      assert.equal(await a.getByText('匯入成功', { exact: true }).count(), 0);
      fail = false; await publishButton.click();
      await a.getByText('匯入成功', { exact: true }).waitFor();
      assert.equal(writes.at(-1).stock, 7); assert.equal(writes.at(-1).publish, true); assert.equal(writes.at(-1).category, 'gifts');
      assert.deepEqual(writes.at(-1).product.variants.map((v) => v.price), [100, 450]);
      await b.getByRole('button', { name: `編輯 ${productB.name}`, exact: true }).click();
      await b.getByLabel('商品售價', { exact: true }).fill('600');
      await b.getByLabel('價格已確認為新臺幣', { exact: true }).check();
      await b.getByLabel('已核對來源商品與規格資料', { exact: true }).check();
      await b.getByLabel(`選取 ${productB.name}`, { exact: true }).check();
      await b.scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(os.tmpdir(), `urbanite-product-import-${engine.name()}-${width}.png`) });
      assert.ok(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
      await publishButton.click(); await b.getByText('匯入成功', { exact: true }).waitFor();
      assert.equal(writes.at(-1).product.price, 600); assert.equal(writes.at(-1).product.currency, 'TWD');
      assert.equal(writes.at(-1).reviewed, true);
      await close();
      assert.equal(created.size, 2);
      await page.getByText(productA.name, { exact: true }).waitFor();
      await open();
      await click('單一商品');
      await dialog.getByLabel('來源網址', { exact: true }).fill(productA.sourceUrl);
      await click('開始讀取'); await click('確定');
      await dialog.getByText('讀取完成', { exact: true }).waitFor();
      await dialog.getByLabel('未公開庫存', { exact: true }).fill('7');
      duplicate = true;
      await dialog.getByLabel('我有權使用來源商品的圖片與內容', { exact: true }).check();
      await dialog.getByRole('button', { name: /確認並上架|匯入為未上架/ }).click();
      await a.getByText('已存在，未覆蓋原商品', { exact: true }).waitFor();
      assert.deepEqual(errors, []);
      console.log(`${engine.name()} ${width}: single/store discovery, dedup, pause/reload/IndexedDB resume, authentication-error item retention, no implicit writes, missing stock/currency/review gates, failed image feedback/retry, variant prices, destination category, parent updates and duplicate-safe imports passed. API reads/writes mocked.`);
    } catch (error) { console.error((await page.locator('body').innerText()).slice(-5000)); throw error; }
    finally { releaseRead(); await browser.close(); }
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
