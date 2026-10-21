/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const ts = require('typescript');
const sharp = require('sharp');
const playwright = require(process.argv[2] || 'playwright');
const url = process.argv[3] || 'http://localhost:3014/membership-card-test';
const mod = { exports: {} };
new Function('exports', ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib/membership-card.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(mod.exports);
async function lineContrast(buffer, divider) {
  const { data, info } = await sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const [x, top, bottom] = divider;
  const cx = x / 1448 * info.width, y1 = Math.ceil((top + 3) / 1086 * info.height), y2 = Math.floor((bottom - 3) / 1086 * info.height);
  const pixel = (x, y, c) => data[(y * info.width + x) * info.channels + c];
  const columns = [];
  for (let column = Math.floor(cx) - 1; column <= Math.ceil(cx) + 1; column++) {
    let total = 0;
    for (let y = y1; y <= y2; y++) for (let c = 0; c < 3; c++) total += Math.abs(pixel(column, y, c) - (pixel(column - 2, y, c) + pixel(column + 2, y, c)) / 2);
    columns.push(total / ((y2 - y1 + 1) * 3));
  }
  return Math.max(...columns);
}
(async () => {
  for (const [engine, width, scale = 1] of [['chromium', 390], ['webkit', 390], ['webkit', 390, 3], ['chromium', 1440]]) {
    const browser = await playwright[engine].launch({ headless: true, ...(engine === 'chromium' ? { channel: 'chrome' } : {}) });
    try {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, deviceScaleFactor: scale, ...(engine === 'webkit' ? { isMobile: true, hasTouch: true } : {}) });
      await page.route('**/api/**', (route) => route.fulfill({ json: { enabled: false } }));
      await page.goto(url);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const gallery = page.getByRole('region', { name: '十款卡面預覽', exact: true });
      const cards = gallery.locator('[data-membership-card]');
      await cards.first().waitFor(); assert.equal(await cards.count(), 10);
      for (const card of await cards.all()) {
        await card.scrollIntoViewIfNeeded();
        await card.locator('img').first().evaluate((image) => image.decode());
        await card.locator('[data-card-art-ready="true"]').waitFor();
        const id = await card.getAttribute('data-membership-card');
        assert.equal(await card.locator('[data-card-divider-mask]').count(), 2);
        await page.evaluate(() => document.fonts.ready);
        await card.screenshot({ path: path.join(os.tmpdir(), `urbanite-dividers-${engine}-${width}-${id}${scale > 1 ? `-${scale}x` : ''}.png`) });
        // Hide only the editable copy, then compare the original line to its repair.
        await card.locator('[data-card-benefit]').evaluateAll((nodes) => nodes.forEach((node) => { node.style.visibility = 'hidden'; }));
        await card.locator('[data-card-divider-mask]').evaluateAll((nodes) => nodes.forEach((node) => { node.style.visibility = 'hidden'; }));
        const before = await card.screenshot();
        await card.locator('[data-card-divider-mask]').evaluateAll((nodes) => nodes.forEach((node) => { node.style.visibility = ''; }));
        const after = await card.screenshot();
        for (const divider of mod.exports.MEMBERSHIP_BENEFIT_DIVIDERS[id]) {
          const original = await lineContrast(before, divider), repaired = await lineContrast(after, divider);
          assert.ok(original > 8, `${engine} ${id}: original divider must be measurable`);
          assert.ok(repaired < original * .6 + 3, `${engine} ${id} x=${divider[0]}: divider contrast ${original.toFixed(1)} -> ${repaired.toFixed(1)}`);
        }
        await card.locator('[data-card-benefit]').evaluateAll((nodes) => nodes.forEach((node) => { node.style.visibility = ''; }));
        assert.equal(await card.locator('[data-card-benefit]').count(), 3);
        assert.equal(await card.locator('[data-card-icon]').count(), 3);
      }
      console.log(`${engine} ${width} @${scale}x: all 10 cards / 20 source-artwork dividers removed by rendered-pixel checks, with editable copy and circle positions preserved.`);
    } finally { await browser.close(); }
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
