const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(process.argv[2] || 'playwright');
const editorUrl = process.argv[3];
if (!editorUrl) throw new Error('Provide the URL of a temporary local route mounting scripts/fixtures/StorefrontEditorFixture.tsx');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  let page;
  try {
    page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    let stored = { storefront: { enabled: true, title: 'Original headline' } };
    let writes = 0;
    let failSave = false;
    const product = { id: 'test-product', name: '測試商品', tagline: '日常精選', price: 590, original_price: null, inventory: 10, status: '上架中', category: 'clothes', image: '/card/demo-fashion.webp', images: [], colors: [], sizes: [], specs: [], variants: [], is_featured: true, sort_order: 0 };
    await page.route('**/api/**', async (route) => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      let data = [];
      if (pathname === '/api/editor-fixture') data = stored;
      if (pathname === '/api/products') data = [product];
      if (pathname === '/api/categories') data = [{ id: 'cat', slug: 'clothes', name: '服飾', en: 'CLOTHES', image: product.image, sort_order: 0 }];
      if (pathname === '/api/banners') data = [{ id: 'hero', image: product.image, active: true }];
      if (pathname === '/api/me') data = null;
      if (pathname === '/api/settings') {
        if (request.method() === 'PATCH') {
          if (failSave) return route.fulfill({ status: 500, json: { error: '測試儲存失敗' } });
          const body = request.postDataJSON(); writes++;
          if (body.site_theme_draft) stored = { ...stored, draft: body.site_theme_draft };
          else stored = body.site_theme;
          data = { site_theme: stored };
        } else { const { draft, ...published } = stored; void draft; data = { site_theme: published, shop_name: '測試商店' }; }
      }
      await route.fulfill({ json: data });
    });
    const confirm = () => page.getByRole('button', { name: '確定', exact: true }).click();
    const editorBlock = (id) => page.locator(`[data-editor-block="${id}"]`);
    await page.goto(editorUrl);
    await editorBlock('hero').getByRole('button', { name: '1. Original headline', exact: true }).click();
    await page.getByLabel('板塊標題', { exact: true }).fill('Draft headline with spaces');
    await page.getByRole('button', { name: '預覽', exact: true }).click();
    await page.getByRole('dialog').getByRole('heading', { name: 'Draft headline with spaces' }).waitFor();
    assert.equal(await page.locator('dialog [data-storefront-blocks]').evaluate((el) => el.scrollWidth <= el.clientWidth), true);
    assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
    await page.screenshot({ path: path.join(os.tmpdir(), 'urbanite-block-preview-mobile.png') });
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => document.body.style.overflow), '');
    await page.getByRole('button', { name: '下移板塊 1', exact: true }).click();
    assert.equal(await page.locator('[data-editor-block]').first().getAttribute('data-editor-block'), 'categories');
    await page.getByRole('combobox', { name: '板塊類型' }).selectOption('announcement');
    await page.getByRole('button', { name: '新增板塊' }).click();
    await page.getByLabel('板塊標題', { exact: true }).fill('Private announcement');
    await page.getByLabel('顯示板塊 5').uncheck();
    await page.getByRole('button', { name: '儲存草稿', exact: true }).click();
    await page.getByText('草稿已儲存，正式官網尚未變更。', { exact: true }).waitFor(); await confirm();
    assert.equal(stored.storefront.title, 'Original headline');
    assert.equal(stored.draft.storefront.blocks[1].title, 'Draft headline with spaces');
    await page.reload();
    await page.getByText('草稿已儲存，尚未發布', { exact: true }).waitFor();
    assert.equal(await page.locator('[data-editor-block]').count(), 5);
    await page.getByRole('button', { name: '發布官網', exact: true }).click(); await confirm();
    await page.getByText('已發布至官網。', { exact: true }).waitFor(); await confirm();
    assert.equal(stored.draft, undefined);
    assert.equal(writes, 2);
    await page.goto('http://localhost:3011/');
    await page.locator('[data-storefront-blocks]').waitFor();
    await page.getByRole('heading', { name: 'Draft headline with spaces' }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Private announcement' }).count(), 0);
    await page.getByRole('button', { name: '將 測試商品 加入購物車' }).click();
    await page.getByRole('button', { name: '立即購買', exact: true }).waitFor();
    await page.goto(editorUrl);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('button', { name: '拖曳板塊 1', exact: true }).dragTo(editorBlock('products'));
    assert.equal(await page.locator('[data-editor-block]').nth(2).getAttribute('data-editor-block'), 'categories');
    await page.getByRole('button', { name: '預覽', exact: true }).click();
    await page.getByRole('button', { name: '桌面預覽', exact: true }).click();
    await page.screenshot({ path: path.join(os.tmpdir(), 'urbanite-block-preview-desktop.png') });
    assert.equal(await page.getByRole('dialog').evaluate((el) => el.scrollWidth <= el.clientWidth), true);
    await page.getByRole('button', { name: '關閉預覽', exact: true }).click();
    failSave = true;
    await page.getByRole('button', { name: '儲存草稿', exact: true }).click();
    await page.getByText('測試儲存失敗', { exact: true }).waitFor(); await confirm();
    assert.equal(await page.getByRole('button', { name: '儲存草稿', exact: true }).isEnabled(), true);
    assert.deepEqual(errors, []);
    console.log('Editor UI passed: draft isolation/reload/publish, hidden blocks, ordering/drag, mobile/desktop preview, cart entry, failed-save retention. API mocked; no live writes.');
  } catch (error) { console.error(await page?.locator('body').innerText()); throw error; }
  finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
