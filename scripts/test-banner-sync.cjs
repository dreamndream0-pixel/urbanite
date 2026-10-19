/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium, webkit } = require(process.argv[2] || 'playwright');
const url = process.argv[3];
if (!url) throw new Error('Provide a temporary local route mounting scripts/fixtures/BannerSyncFixture.tsx');

(async () => {
  for (const [engine, width] of [[chromium, 390], [webkit, 390], [chromium, 1440]]) {
    const browser = await engine.launch({ headless: true, ...(engine === chromium ? { channel: 'chrome' } : {}) });
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    try {
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      let bannerReads = 0;
      const updates = [];
      const banners = new Map([
        ['first', { id: 'first', image: '/card/demo-fashion.webp', title: 'First banner', link: '', active: true, sort_order: 0 }],
        ['second', { id: 'second', image: '/card/demo-collection.webp', title: 'Second banner', link: '', active: true, sort_order: 1, group_no: 1 }],
        ['other', { id: 'other', image: '/card/demo-creator.webp', title: 'Other group', link: '', active: true, sort_order: 0, group_no: 2 }],
      ]);
      await page.route('**/api/**', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        if (pathname === '/api/banners' && request.method() === 'GET') {
          bannerReads++;
          // Simulate the stale public CDN snapshot that used to replace the admin's live data.
          return route.fulfill({ json: [] });
        }
        if (pathname === '/api/products/image') return route.fulfill({ json: { image_url: '/card/demo-fashion.webp?updated=1' } });
        if (pathname === '/api/banners' && request.method() === 'POST') {
          const created = { id: 'new-banner', active: true, link: '', ...request.postDataJSON() };
          banners.set(created.id, created);
          return route.fulfill({ status: 201, json: created });
        }
        if (pathname.startsWith('/api/banners/')) {
          const id = pathname.split('/').at(-1);
          if (request.method() === 'DELETE') { banners.delete(id); return route.fulfill({ json: { ok: true } }); }
          const patch = request.postDataJSON();
          updates.push({ id, ...patch });
          const updated = { ...banners.get(id), ...patch };
          banners.set(id, updated);
          return route.fulfill({ json: updated });
        }
        if (pathname === '/api/products' || pathname === '/api/categories') return route.fulfill({ status: 503, json: { error: 'Optional preview assets unavailable' } });
        return route.fulfill({ json: pathname === '/api/me' ? null : {} });
      });
      const tab = (name) => page.getByRole('button', { name, exact: true }).click();
      const group = () => page.locator('section').filter({ has: page.locator('p').filter({ hasText: /^輪播圖1 / }) }).last();
      const preview = async () => { await tab('預覽'); return page.getByRole('dialog').locator('[data-block-type="carousel"]'); };
      const close = () => tab('關閉預覽');
      const sources = (carousel) => carousel.locator('img').evaluateAll((imgs) => (imgs.length > 1 ? imgs.slice(1, -1) : imgs).map((img) => {
        const src = img.getAttribute('src');
        return src?.startsWith('/_next/image?') ? new URL(src, location.origin).searchParams.get('url') : src;
      }));
      const upload = async (input) => {
        await input.setInputFiles({ name: 'banner.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=', 'base64') });
        await tab('套用並上傳');
        await page.getByRole('button', { name: '套用並上傳', exact: true }).waitFor({ state: 'hidden' });
      };

      await page.goto(`${url}?section=settings`);
      await tab('模板設定');
      await page.getByLabel('使用模板首頁', { exact: false }).check();
      await page.getByLabel('新增板塊類型').selectOption('announcement');
      await tab('新增板塊');
      await page.getByLabel('標題', { exact: true }).fill('Unsaved copy stays');
      await page.getByLabel('新增板塊類型').selectOption('carousel');
      await tab('新增板塊');
      const selector = page.getByLabel('顯示哪一組輪播圖');
      assert.match(await selector.innerText(), /輪播圖1\(2 張\)/);
      assert.match(await selector.innerText(), /輪播圖2\(1 張\)/);
      assert.deepEqual(await sources(await preview()), ['/card/demo-fashion.webp', '/card/demo-collection.webp']);
      await close();

      await tab('輪播圖');
      await group().getByLabel('顯示', { exact: true }).first().click();
      await group().locator('input[type="checkbox"]:not(:checked)').waitFor();
      await tab('模板設定');
      assert.match(await selector.innerText(), /輪播圖1\(1 張\)/);
      assert.deepEqual(await sources(await preview()), ['/card/demo-collection.webp']);
      await close();
      await selector.selectOption('2');
      assert.deepEqual(await sources(await preview()), ['/card/demo-creator.webp']);
      await close();
      await selector.selectOption('1');

      await tab('輪播圖');
      await group().getByLabel('顯示', { exact: true }).first().click();
      await group().locator('input[type="checkbox"]:not(:checked)').waitFor({ state: 'hidden' });
      await group().getByRole('button', { name: '往後', exact: true }).first().click();
      await tab('模板設定');
      assert.deepEqual(await sources(await preview()), ['/card/demo-collection.webp', '/card/demo-fashion.webp']);
      await close();

      await tab('輪播圖');
      await upload(group().locator('label[title] input[type="file"]').first());
      await tab('模板設定');
      assert.deepEqual(await sources(await preview()), ['/card/demo-fashion.webp?updated=1', '/card/demo-fashion.webp']);
      await close();

      await tab('輪播圖');
      await upload(group().locator('input[type="file"]').first());
      await tab('模板設定');
      assert.match(await selector.innerText(), /輪播圖1\(3 張\)/);
      await tab('輪播圖');
      await group().getByRole('button', { name: '刪除', exact: true }).first().click();
      await tab('確定');
      await tab('模板設定');
      assert.match(await selector.innerText(), /輪播圖1\(2 張\)/);
      const carousel = await preview();
      await page.getByRole('dialog').getByRole('heading', { name: 'Unsaved copy stays', exact: true }).waitFor();
      if (width > 1000) await tab('桌面預覽');
      await carousel.locator('img').first().evaluate((img) => img.decode());
      await carousel.scrollIntoViewIfNeeded();
      assert.equal(await page.getByRole('dialog').evaluate((el) => el.scrollWidth <= el.clientWidth), true);
      const screenshots = path.join(os.tmpdir(), 'urbanite-banner-sync');
      fs.mkdirSync(screenshots, { recursive: true });
      await page.screenshot({ path: path.join(screenshots, `${engine.name()}-${width}.png`) });
      assert.equal(bannerReads, 0, 'Editor must not read stale public banner snapshots');
      assert.ok(updates.some((patch) => patch.active === false));
      assert.ok(updates.some((patch) => patch.sort_order === 0));
      assert.deepEqual(errors, []);
      console.log(`${engine.name()} ${width}: initial/group/default group, toggle, reorder, replace, upload, delete, draft preservation and preview passed. All API writes mocked.`);
    } catch (error) {
      console.error((await page.locator('body').innerText()).slice(-6000));
      throw error;
    } finally { await browser.close(); }
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
