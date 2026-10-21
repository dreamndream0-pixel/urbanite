/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const { chromium, webkit } = require(process.argv[2] || 'playwright');
const url = process.argv[3];
if (!url) throw new Error('Provide a temporary local route mounting CheckoutStockFixture');
const product = require('./fixtures/variant-pricing.json');
const products = [
  { ...product, id: 'portrait', name: '直式商品完整圖片測試 長商品名稱不應將縮圖撐高', specs: [], variants: [], inventory: 10, image: '/thumb-portrait.svg' },
  { ...product, id: 'landscape', name: '橫式商品完整圖片測試', specs: [], variants: [], inventory: 10, image: '/thumb-landscape.svg' },
];
const cart = products.map((p) => ({ id: `${p.id}-標準款`, productId: p.id, name: p.name, variant: '標準款', price: 100, quantity: 2 }));
const frame = (width, height) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="white"/><path fill="#f00" d="M0 0h${width}v8H0z"/><path fill="#00f" d="M0 ${height - 8}h${width}v8H0z"/><path fill="#0f0" d="M0 8h8v${height - 16}H0z"/><path fill="#ff0" d="M${width - 8} 8h8v${height - 16}h-8z"/></svg>`;

(async () => {
  for (const [engine, width] of [[chromium, 320], [webkit, 390], [chromium, 1440]]) {
    const browser = await engine.launch({ headless: true, ...(engine === chromium ? { channel: 'chrome' } : {}) });
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript((items) => localStorage.setItem('cart', JSON.stringify(items)), cart);
    await page.route('**/thumb-*.svg', (route) => route.fulfill({ contentType: 'image/svg+xml', body: route.request().url().includes('portrait') ? frame(100, 200) : frame(200, 100) }));
    await page.route('**/api/**', (route) => {
      const req = route.request();
      assert.equal(req.method(), 'GET', 'Thumbnail tests must never create orders or modify data');
      const pathname = new URL(req.url()).pathname;
      const data = pathname === '/api/products' ? products
        : pathname === '/api/settings' ? { enabled_shipping_methods: ['宅配到府'], enabled_payment_methods: ['轉帳匯款'] }
          : pathname === '/api/me' ? { email: 'fixture@example.invalid', name: 'Fixture' }
            : pathname === '/api/user-coupons' ? { owned: [] } : [];
      return route.fulfill({ json: data });
    });
    const check = async (mode) => {
      const thumbnails = page.locator('[data-cart-thumbnail]');
      assert.equal(await thumbnails.count(), 2);
      await page.waitForFunction(() => [...document.querySelectorAll('[data-cart-thumbnail] img')].every((img) => img.complete && img.naturalWidth > 0));
      for (let i = 0; i < 2; i++) {
        const thumbnail = thumbnails.nth(i);
        const info = await thumbnail.evaluate((el) => {
          const img = el.querySelector('img'); const box = el.getBoundingClientRect(); const css = getComputedStyle(img);
          return { width: box.width, height: box.height, fit: css.objectFit, position: css.objectPosition, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight };
        });
        assert.equal(info.width, 64); assert.equal(info.height, 64, `${mode}: long text must not stretch the square`);
        assert.equal(info.fit, 'contain'); assert.equal(info.position, '50% 50%');
        assert.equal(info.naturalWidth / info.naturalHeight, i === 0 ? 0.5 : 2);
        const pixels = await sharp(await thumbnail.screenshot()).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        const at = (x, y) => [...pixels.data.subarray((y * pixels.info.width + x) * 3, (y * pixels.info.width + x) * 3 + 3)];
        const samples = i === 0 ? [[32, 1], [32, 62], [17, 32], [46, 32]] : [[32, 17], [32, 46], [1, 32], [62, 32]];
        for (const [index, rgb] of [[255, 0, 0], [0, 0, 255], [0, 255, 0], [255, 255, 0]].entries()) {
          const actual = at(...samples[index]);
          assert.ok(actual.every((channel, c) => Math.abs(channel - rgb[c]) < 15), `${mode} ${i}: source edge ${index} must remain visible, got ${actual}`);
        }
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.screenshot({ path: path.join(os.tmpdir(), `urbanite-cart-thumbnails-${mode}-${engine.name()}-${width}.png`) });
    };
    try {
      await page.goto(`${url}?mode=checkout`);
      await page.locator('[data-checkout-items]').waitFor();
      await check('checkout');
      await page.waitForLoadState('networkidle');
      await page.goto(`${url}?mode=store`);
      await page.getByRole('button', { name: '購物車', exact: true }).click();
      await page.waitForFunction(() => [...document.querySelectorAll('aside')].some((el) => !el.inert && el.getBoundingClientRect().right <= innerWidth + 1));
      await check('drawer');
      assert.deepEqual(errors, []);
      console.log(`${engine.name()} ${width}: checkout and cart drawer stay 64x64, portrait/landscape images remain centered and all four image edges are visible. No API writes.`);
    } finally { await browser.close(); }
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
