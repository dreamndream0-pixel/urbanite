/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium, webkit } = require(process.argv[2] || 'playwright');
const editorUrl = process.argv[3];
if (!editorUrl) throw new Error('Provide a temporary local route mounting scripts/fixtures/StorefrontEditorFixture.tsx');

(async () => {
  for (const [engine, width] of [[chromium, 390], [webkit, 390], [chromium, 1440]]) {
    const browser = await engine.launch({ headless: true, ...(engine === chromium ? { channel: 'chrome' } : {}) });
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    try {
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      let stored = { storefront: { enabled: true, style: 'classic', blocks: [{ id: 'carousel', type: 'carousel', group: 1, ratio: 'wide' }] } };
      const banner = { id: 'banner', image: '/card/demo-fashion.webp', title: 'Ratio test', active: true, group_no: 1, sort_order: 0 };
      await page.route('**/api/**', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        if (pathname === '/api/editor-fixture') return route.fulfill({ json: stored });
        if (pathname === '/api/banners') return route.fulfill({ json: [banner] });
        if (pathname === '/api/settings') {
          if (request.method() === 'PATCH') {
            const body = request.postDataJSON();
            stored = body.site_theme_draft ? { ...stored, draft: body.site_theme_draft } : body.site_theme;
            return route.fulfill({ json: { site_theme: stored } });
          }
          const { draft, ...published } = stored;
          void draft;
          return route.fulfill({ json: { site_theme: published, shop_name: 'Ratio fixture' } });
        }
        return route.fulfill({ json: pathname === '/api/me' ? null : [] });
      });
      const click = (name) => page.getByRole('button', { name, exact: true }).click();
      const expand = () => page.locator('[data-editor-block="carousel"] button[aria-expanded]').click();
      const ratioField = page.getByLabel('輪播顯示比例');
      const checkRatio = async (root, ratio) => {
        const image = root.locator('[data-block-type="carousel"] img').first();
        await image.waitFor();
        await image.evaluate((img) => img.decode());
        const measured = await image.evaluate((img) => {
          const rect = img.parentElement.getBoundingClientRect();
          return { ratio: rect.width / rect.height, width: rect.width, viewport: innerWidth, naturalWidth: img.naturalWidth };
        });
        const expected = ratio === 'portrait' ? 4 / 5 : ratio === 'square' ? 1 : ratio === 'wide' ? 16 / 9 : measured.width < 640 ? 4 / 5 : measured.viewport >= 1024 ? 16 / 5 : 16 / 7;
        assert.ok(Math.abs(measured.ratio - expected) < 0.015, `${ratio}: got ${measured.ratio}, expected ${expected}`);
        assert.ok(measured.naturalWidth > 0);
      };
      await page.goto(editorUrl);
      await expand();
      assert.equal(await ratioField.inputValue(), 'auto', 'Legacy unused ratio must not change the initial display');
      for (const ratio of ['auto', 'portrait', 'square', 'wide']) {
        await ratioField.selectOption(ratio);
        await click('預覽');
        if (width > 1000) await click('桌面預覽');
        const dialog = page.getByRole('dialog');
        await checkRatio(dialog, ratio);
        assert.equal(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth), true);
        const output = path.join(os.tmpdir(), 'urbanite-carousel-ratio');
        fs.mkdirSync(output, { recursive: true });
        await page.screenshot({ path: path.join(output, `${engine.name()}-${width}-${ratio}.png`) });
        await click('關閉預覽');
      }
      await ratioField.selectOption('portrait');
      await click('儲存草稿');
      await page.getByText('草稿已儲存，正式官網尚未變更。', { exact: true }).waitFor();
      await click('確定');
      assert.equal(stored.draft.storefront.blocks[0].carouselRatio, 'portrait');
      assert.equal(stored.storefront.blocks[0].carouselRatio, undefined);
      await page.reload();
      await expand();
      assert.equal(await ratioField.inputValue(), 'portrait');
      await click('發布官網');
      await click('確定');
      await page.getByText('已發布至官網。', { exact: true }).waitFor();
      await click('確定');
      assert.equal(stored.storefront.blocks[0].carouselRatio, 'portrait');
      assert.equal(stored.draft, undefined);
      await page.goto(new URL('/', editorUrl).href);
      await checkRatio(page, 'portrait');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.deepEqual(errors, []);
      console.log(`${engine.name()} ${width}: all four ratios, image rendering, draft/reload/publish and storefront display passed. API mocked; no live writes.`);
    } catch (error) {
      console.error((await page.locator('body').innerText()).slice(-4000));
      throw error;
    } finally { await browser.close(); }
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
