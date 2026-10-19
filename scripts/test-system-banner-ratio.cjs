/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { chromium, webkit } = require(process.argv[2] || 'playwright');
const url = process.argv[3];
if (!url) throw new Error('Provide a temporary local route mounting scripts/fixtures/BannerSyncFixture.tsx');
const storefrontUrl = process.argv[4] || new URL('/', url).href;

(async () => {
  for (const [engine, width] of [[chromium, 390], [webkit, 390], [chromium, 1440]]) {
    const browser = await engine.launch({ headless: true, ...(engine === chromium ? { channel: 'chrome' } : {}) });
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    try {
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      let fail = false;
      const settings = { site_theme: { bannerRatios: { 2: 'wide' }, storefront: { enabled: true, style: 'classic', blocks: [
        { id: 'group-one', type: 'carousel', group: 1 },
        { id: 'group-two', type: 'carousel', group: 2 },
        { id: 'override', type: 'carousel', group: 1, carouselRatio: 'portrait' },
      ] } } };
      const banner = { id: 'first', image: '/card/demo-fashion.webp', title: 'Test image', link: '', active: true, sort_order: 0 };
      await page.route('**/api/**', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        if (pathname === '/api/settings') {
          if (request.method() === 'PATCH') {
            if (fail) return route.fulfill({ status: 500, json: { error: 'Ratio save failed' } });
            const { banner_ratio: patch } = request.postDataJSON();
            assert.ok(patch);
            settings.site_theme.bannerRatios[patch.group] = patch.ratio;
          }
          return route.fulfill({ json: { ...settings, shop_name: 'Ratio fixture' } });
        }
        if (pathname === '/api/banners') return route.fulfill({ json: [banner, { ...banner, id: 'other', group_no: 2 }] });
        return route.fulfill({ json: pathname === '/api/me' ? null : [] });
      });
      const click = (name) => page.getByRole('button', { name, exact: true }).click();
      const field = (group) => page.getByRole('combobox', { name: `輪播圖${group}顯示比例`, exact: true });
      const saveRatio = async (ratio) => {
        await Promise.all([page.waitForResponse((res) => res.url().endsWith('/api/settings') && res.request().method() === 'PATCH'), field(1).selectOption(ratio)]);
        await page.waitForFunction(() => !document.querySelector('[aria-label="輪播圖1顯示比例"]').disabled);
      };
      const checkRatio = async (image, ratio) => {
        await image.waitFor();
        await page.waitForFunction((img) => img.naturalWidth > 0, await image.elementHandle());
        const measured = await image.evaluate((img) => {
          const r = img.parentElement.getBoundingClientRect();
          return { actual: r.width / r.height, width: innerWidth };
        });
        const expected = ratio === 'square' ? 1 : ratio === 'portrait' ? .8 : ratio === 'wide' ? 16 / 9 : measured.width >= 1024 ? 16 / 5 : measured.width >= 640 ? 16 / 7 : .8;
        assert.ok(Math.abs(measured.actual - expected) < .015, `${ratio}: ${measured.actual} != ${expected}`);
      };
      const checkBlocks = async (root, firstRatio) => {
        for (const [id, ratio] of [['group-one', firstRatio], ['group-two', 'wide'], ['override', 'portrait']]) {
          await checkRatio(root.locator(`[data-block-id="${id}"] img`).first(), ratio);
        }
      };
      await page.goto(`${url}?section=settings`);
      await click('輪播圖');
      assert.equal(await field(1).inputValue(), 'auto');
      assert.equal(await field(2).inputValue(), 'wide');
      for (const ratio of ['portrait', 'square', 'auto', 'wide']) {
        await saveRatio(ratio);
        assert.equal(await field(1).inputValue(), ratio);
        assert.equal(await field(2).inputValue(), 'wide');
        await click('模板設定');
        await click('預覽');
        if (width > 1000) await click('桌面預覽');
        await checkBlocks(page.getByRole('dialog'), ratio);
        await click('關閉預覽');
        await click('輪播圖');
      }
      fail = true;
      await saveRatio('square');
      await page.getByText('Ratio save failed', { exact: true }).waitFor();
      await click('確定');
      assert.equal(await field(1).inputValue(), 'wide', 'Failed saves retain the last saved selection');
      fail = false;
      await page.reload();
      await click('輪播圖');
      assert.equal(await field(1).inputValue(), 'wide');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await field(1).scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(os.tmpdir(), `urbanite-system-ratio-${engine.name()}-${width}.png`) });
      const group = page.locator('section').filter({ has: field(1) }).last();
      await checkRatio(group.locator('label[title] img').first(), 'wide');
      await group.locator('input[type="file"]').first().setInputFiles({ name: 'crop.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=', 'base64') });
      await page.getByText('輸出尺寸 1600 × 900 px', { exact: true }).waitFor();
      await checkRatio(page.locator('img[src^="blob:"]').first(), 'wide');
      await click('取消');
      await page.goto(storefrontUrl);
      await checkBlocks(page, 'wide');
      settings.site_theme.storefront.enabled = false;
      await page.reload();
      await checkRatio(page.getByRole('region', { name: '首頁輪播', exact: true }).locator('img').first(), 'wide');
      assert.deepEqual(errors, []);
      console.log(`${engine.name()} ${width}: system ratio selection/save/reload/failure, independent groups, live template preview, explicit override and legacy storefront passed. All API writes mocked.`);
    } catch (error) {
      console.error((await page.locator('body').innerText()).slice(-3000));
      throw error;
    } finally { await browser.close(); }
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
