/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { chromium, webkit } = require(process.argv[2] || 'playwright');
const url = process.argv[3];
if (!url) throw new Error('Provide a temporary local route mounting scripts/fixtures/StorefrontLoadingFixture.tsx');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const deferred = () => { let release; const promise = new Promise((resolve) => { release = resolve; }); return { promise, release }; };

(async () => {
  for (const [engine, width] of [[chromium, 390], [webkit, 390], [chromium, 1440]]) {
    const browser = await engine.launch({ headless: true, ...(engine === chromium ? { channel: 'chrome' } : {}) });
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    let gate = deferred();
    try {
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      let settingsSeen = deferred();
      let fail = false;
      let bannerReads = 0;
      const settings = { id: 1, logo_url: '', shop_name: 'Loading fixture', site_theme: { bannerRatios: { 1: 'wide' }, storefront: { enabled: false } } };
      const banners = ['/card/demo-fashion.webp', '/card/demo-collection.webp', '/card/demo-creator.webp'].map((image, i) => ({ id: `banner-${i}`, image, title: `Banner ${i}`, link: '', active: true, sort_order: i, group_no: 1 }));
      await page.route('**/api/**', async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        if (pathname === '/api/settings') {
          settingsSeen.release();
          await gate.promise;
          return route.fulfill({ status: fail ? 500 : 200, json: fail ? { error: 'Unavailable' } : settings });
        }
        if (pathname === '/api/banners') { bannerReads++; return route.fulfill({ json: banners }); }
        if (pathname === '/api/products') { await delay(600); return route.fulfill({ json: [{ id: 'product', name: '測試商品', tagline: '', image: '/card/demo-collection.webp', images: [], price: 100, original_price: null, inventory: 10, status: '上架中', category: 'cakes', colors: [], sizes: [], specs: [], variants: [], is_featured: true, sort_order: 0 }] }); }
        if (pathname === '/api/categories') { await delay(500); return route.fulfill({ json: [{ id: 'category', slug: 'cakes', name: '蛋糕', en: 'CAKES', image: banners[0].image, sort_order: 0 }] }); }
        return route.fulfill({ json: pathname === '/api/me' ? null : [] });
      });
      await page.route('**/_next/image?**', async (route) => { await delay(300); await route.continue(); });
      await page.addInitScript(() => {
        window.heroFrames = [];
        const sample = () => {
          const image = document.querySelector('section[aria-label="首頁輪播"] img');
          if (image) {
            const box = image.parentElement.getBoundingClientRect();
            if (box.width > 100 && box.height > 0) window.heroFrames.push({ width: box.width, height: box.height });
          }
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      const hero = page.getByRole('region', { name: '首頁輪播', exact: true });
      const validate = async () => {
        await page.waitForFunction(() => document.querySelectorAll('section[aria-label="首頁輪播"] img').length > 0);
        const frames = await page.evaluate(() => window.heroFrames);
        assert.ok(frames.length > 0);
        assert.ok(frames.every((box) => Math.abs(box.width / box.height - 16 / 9) < .015), `Transient wrong-size frames: ${JSON.stringify(frames.filter((b) => Math.abs(b.width / b.height - 16 / 9) > .015).slice(0, 3))}`);
        const first = hero.locator('img').nth(1);
        assert.equal(await first.getAttribute('loading'), 'eager');
        assert.equal(await first.getAttribute('fetchpriority'), 'high');
        assert.ok((await first.getAttribute('srcset')).includes('/_next/image?'));
        assert.equal(await first.evaluate((img) => getComputedStyle(img).position), 'absolute');
        assert.equal(await hero.locator('img[fetchpriority="high"]').count(), 1);
        await page.waitForFunction(() => [...document.querySelectorAll('section[aria-label="首頁輪播"] img')].some((img) => img.naturalWidth > 0));
      };
      for (let refresh = 0; refresh < 2; refresh++) {
        gate = deferred(); settingsSeen = deferred();
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await hero.waitFor();
        await settingsSeen.promise;
        await delay(1000);
        await validate();
        assert.equal(bannerReads, 0, 'SSR bootstrap avoids a second, possibly stale banner request');
        gate.release();
        await delay(150);
        await validate();
        assert.ok((await page.locator('.product-card img[data-nimg]').first().getAttribute('srcset')).includes('/_next/image?'));
        const productFrame = await page.locator('.product-card img[data-nimg]').first().evaluate((img) => { const rect = img.parentElement.getBoundingClientRect(); return { width: rect.width, height: rect.height }; });
        assert.ok(productFrame.width > 0 && Math.abs(productFrame.width / productFrame.height - .8) < .015);
        assert.equal(await page.locator('.favorite-fold image').count(), 0, 'Invisible favorite corners must not download original product images');
      }
      await page.screenshot({ path: path.join(os.tmpdir(), `urbanite-home-loading-${engine.name()}-${width}.png`) });
      gate = deferred(); settingsSeen = deferred();
      await page.goto(`${url}?mode=client`, { waitUntil: 'domcontentloaded' });
      await settingsSeen.promise;
      await delay(600);
      assert.equal(await hero.count(), 0, 'Client fallback must not paint a default portrait while settings are pending');
      gate.release();
      await hero.waitFor();
      await delay(200);
      await validate();
      gate = deferred(); settingsSeen = deferred(); fail = true;
      await page.goto(`${url}?mode=client&failure=1`, { waitUntil: 'domcontentloaded' });
      await settingsSeen.promise;
      gate.release();
      await page.getByRole('button', { name: '重新載入', exact: true }).waitFor();
      assert.equal(await hero.count(), 0);
      assert.deepEqual(errors, []);
      console.log(`${engine.name()} ${width}: SSR hero before settings, repeated refresh frame checks, delayed images/settings, optimized/eager first image, safe client fallback and failure UI passed.`);
    } finally { gate.release(); await browser.close(); }
  }
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const page = await browser.newPage({ javaScriptEnabled: false, viewport: { width: 390, height: 900 } });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const hero = page.getByRole('region', { name: '首頁輪播', exact: true });
    assert.equal(await hero.locator('img[fetchpriority="high"]').count(), 1);
    const box = await hero.boundingBox();
    assert.ok(Math.abs(box.width / box.height - 16 / 9) < .015);
    console.log('JavaScript disabled: correctly sized carousel and first-image request are present in the server HTML.');
  } finally { await browser.close(); }
  const origin = new URL(url).origin;
  const original = await fetch(`${origin}/card/demo-fashion.webp`);
  const optimized = await fetch(`${origin}/_next/image?url=%2Fcard%2Fdemo-fashion.webp&w=640&q=75`, { headers: { Accept: 'image/webp' } });
  assert.equal(optimized.status, 200);
  const originalBytes = (await original.arrayBuffer()).byteLength;
  const optimizedBytes = (await optimized.arrayBuffer()).byteLength;
  assert.ok(optimizedBytes < originalBytes);
  console.log(`Responsive image byte check: ${originalBytes} -> ${optimizedBytes} bytes at 640px.`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
