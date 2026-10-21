/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const playwright = require(process.argv[2] || 'playwright');
const url = process.argv[3] || 'http://localhost:3014/membership-card-test';
const credit = (design = 'silver', balance = 80, image = true) => ({
  enabled: true, balance, pending: 10, expiringSoon: 0, nextAvailableAt: null, entries: [],
  tier: { key: 'normal', name: '一般會員', threshold: 0, rate: 1, cardDesign: design },
  next: { key: 'gold', name: '金卡會員', threshold: 3000, rate: 2 }, spend: 1500, toNext: 1500, keptUntil: null,
  rules: { tiers: [{ key: 'normal', name: '一般會員', threshold: 0, rate: 1 }], keepMonths: 12, delayDays: 14, validDays: 180, maxRedeemPct: 20 },
  card: { settings: { enabled: image, title: 'VIP membership', subtitle: '每一次相遇，都值得珍藏', actionLabel: '查看權益' }, brandName: '測試品牌', memberName: '王小美' },
});
(async () => {
  for (const [engine, width] of [['chromium', 320], ['chromium', 390], ['webkit', 390], ['chromium', 1440]]) {
    const browser = await playwright[engine].launch({ headless: true, ...(engine === 'chromium' ? { channel: 'chrome' } : {}) });
    try {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, ...(engine === 'webkit' ? { isMobile: true, hasTouch: true } : {}) });
      const errors = []; page.on('pageerror', (error) => errors.push(error.message));
      let mode = 'success', payload = credit(), gate = Promise.withResolvers();
      await page.addInitScript(() => {
        window.__creditModes = [];
        new MutationObserver(() => {
          const mode = document.querySelector('[aria-label="會員中心"] [data-rewards-hero]')?.getAttribute('data-rewards-hero');
          if (mode && window.__creditModes.at(-1) !== mode) window.__creditModes.push(mode);
        }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-rewards-hero'] });
      });
      await page.route('**/api/**', async (route) => {
        if (new URL(route.request().url()).pathname !== '/api/me/credit') return route.fulfill({ json: {} });
        const responseMode = mode, responsePayload = payload, wait = gate;
        if (wait) await wait.promise;
        try {
          if (responseMode === 'network') return await route.abort('failed');
          if (responseMode === 'failure' || responseMode === 'unauthorized') return await route.fulfill({ status: responseMode === 'unauthorized' ? 401 : 503, json: { error: '讀取失敗' } });
          return await route.fulfill({ json: responseMode === 'malformed' ? {} : responsePayload });
        } catch { /* Superseded requests may already be aborted by the browser. */ }
      });
      const customer = page.getByRole('region', { name: '會員中心', exact: true });
      const card = customer.locator('[data-membership-card]');
      const noFalseEmpty = async () => {
        assert.equal(await customer.getByText('NT$0', { exact: true }).count(), 0);
        assert.equal(await customer.getByText('目前尚無回饋金。', { exact: true }).count(), 0);
        assert.equal(await customer.locator('[data-rewards-hero="classic"]').count(), 0);
        for (const text of ['我的優惠', 'MY COUPONS', '收藏喜歡的優惠，享受更好的購物體驗。']) assert.equal(await customer.getByText(text, { exact: true }).count(), 0);
      };
      await page.goto(url);
      await customer.locator('[data-rewards-hero="loading"]').waitFor();
      const placeholder = await customer.locator('[data-credit-placeholder]').boundingBox();
      assert.ok(Math.abs(placeholder.height / placeholder.width - .75) < .005);
      assert.equal(await card.count(), 0);
      await noFalseEmpty();
      await customer.screenshot({ path: path.join(os.tmpdir(), `urbanite-credit-loading-${engine}-${width}.png`) });
      gate.resolve(); gate = null;
      await customer.locator('[data-rewards-hero="silver"]').waitFor();
      assert.equal(await card.locator('[data-card-amount]').innerText(), 'NT$80');
      assert.ok(!(await page.evaluate(() => window.__creditModes)).includes('classic'), 'No classic theme frame before the real card');
      const loaded = await card.boundingBox();
      assert.ok(Math.abs(loaded.width - placeholder.width) < 1 && Math.abs(loaded.height - placeholder.height) < 1, 'Reserve the final card dimensions during slow reads');
      await card.locator('img').first().evaluate((image) => image.decode());
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await customer.screenshot({ path: path.join(os.tmpdir(), `urbanite-credit-ready-${engine}-${width}.png`) });
      gate = Promise.withResolvers(); mode = 'failure';
      const refreshing = page.waitForRequest('**/api/me/credit');
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await refreshing;
      await noFalseEmpty();
      assert.equal(await card.locator('[data-card-amount]').innerText(), 'NT$80', 'A pending background refresh keeps the current card');
      const completed = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/me/credit' && response.status() === 503);
      gate.resolve(); gate = null; await completed;
      assert.equal(await card.locator('[data-card-amount]').innerText(), 'NT$80', 'A failed background refresh must not replace real data with zero');
      await noFalseEmpty();
      for (const failure of ['failure', 'network', 'malformed', 'unauthorized']) {
        mode = failure; await page.reload();
        await customer.locator('[data-rewards-hero="error"]').waitFor();
        await noFalseEmpty();
        assert.equal(await card.count(), 0);
        await customer.getByRole('button', { name: '重新載入會員卡', exact: true }).waitFor();
      }
      mode = 'success'; payload = credit('emerald', 125); gate = Promise.withResolvers();
      await customer.getByRole('button', { name: '重新載入會員卡', exact: true }).click();
      await customer.locator('[data-rewards-hero="loading"]').waitFor(); await noFalseEmpty();
      gate.resolve(); gate = null;
      await customer.locator('[data-rewards-hero="emerald"]').waitFor();
      assert.equal(await card.locator('[data-card-amount]').innerText(), 'NT$125');
      gate = Promise.withResolvers(); const staleGate = gate; payload = credit('silver', 80);
      const staleRequest = page.waitForRequest('**/api/me/credit');
      await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await staleRequest;
      payload = credit('royal-blue', 200); gate = null;
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await customer.locator('[data-rewards-hero="royal-blue"]').waitFor(); staleGate.resolve();
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await card.locator('[data-card-amount]').innerText(), 'NT$200', 'A superseded response cannot restore stale card data');
      mode = 'unauthorized'; await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await customer.locator('[data-rewards-hero="error"]').waitFor();
      assert.equal(await card.count(), 0, 'Authorization failures clear the last private balance');
      await noFalseEmpty(); mode = 'success';
      payload = { enabled: false }; await page.reload();
      await customer.locator('[data-rewards-hero]').waitFor({ state: 'detached' });
      await noFalseEmpty();
      payload = credit('silver', 80, false); gate = Promise.withResolvers(); await page.reload();
      await customer.locator('[data-rewards-hero="loading"]').waitFor(); await noFalseEmpty();
      gate.resolve(); gate = null;
      await customer.locator('[data-rewards-hero="classic"]').waitFor();
      assert.equal(await customer.getByText('NT$80', { exact: true }).isVisible(), true, 'Classic rewards require an explicit successful response with image cards disabled');
      assert.deepEqual(errors, []);
      console.log(`${engine} ${width}: delayed first load, synchronized theme, reserved dimensions, refresh failures, initial HTTP/network/malformed/auth errors, retry, disabled loyalty and explicit classic mode passed. All reads mocked.`);
    } finally { await browser.close(); }
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
