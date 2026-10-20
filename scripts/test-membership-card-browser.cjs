/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const playwright = require(process.argv[2] || 'playwright');
const url = process.argv[3] || 'http://localhost:3014/membership-card-test';
const initial = () => ({ enabled: true, delayDays: 14, validDays: 180, maxRedeemPct: 20, keepMonths: 12,
  tiers: [{ key: 'normal', name: '一般會員', threshold: 0, rate: 1, cardDesign: 'champagne' }, { key: 'silver', name: '銀卡會員', threshold: 3000, rate: 2, cardDesign: 'silver' }, { key: 'gold', name: '金卡會員', threshold: 10000, rate: 3, cardDesign: 'gold' }],
  card: { enabled: true, title: '會員專屬禮遇', subtitle: '每一次相遇，都值得珍藏', actionLabel: '查看權益' },
});
(async () => {
  for (const [engine, width] of [['chromium', 320], ['chromium', 390], ['webkit', 390], ['chromium', 768], ['chromium', 1440]]) {
    const browser = await playwright[engine].launch({ headless: true, ...(engine === 'chromium' ? { channel: 'chrome' } : {}) });
    try {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, deviceScaleFactor: 1 });
      const errors = []; page.on('pageerror', (error) => errors.push(error.message));
      let settings = initial(); let saves = 0; let failSettings = false;
      let spend = 1500;
      await page.route('**/api/**', async (route) => {
        const request = route.request(); const pathname = new URL(request.url()).pathname;
        if (pathname === '/api/admin/loyalty/members') return route.fulfill({ json: { enabled: true, members: [] } });
        if (pathname === '/api/admin/loyalty') {
          if (failSettings) return route.fulfill({ status: 503, json: { error: '設定暫時無法讀取' } });
          if (request.method() === 'PUT') { settings = request.postDataJSON().settings; saves++; }
          return route.fulfill({ json: { settings } });
        }
        if (pathname === '/api/products/image') return route.fulfill({ json: { image_url: 'https://assets.example/custom-icon.png' } });
        if (pathname === '/api/me/credit') {
          const tier = settings.tiers.filter((tier) => spend >= tier.threshold).at(-1);
          const next = settings.tiers[settings.tiers.indexOf(tier) + 1] ?? null;
          return route.fulfill({ json: { enabled: true, balance: 80, pending: 10, expiringSoon: 0, nextAvailableAt: null, entries: [], tier, next, spend, toNext: next ? Math.max(0, next.threshold - spend) : 0, keptUntil: null, rules: settings, card: { settings: settings.card, brandName: '測試品牌', memberName: '王小美' } } });
        }
        return route.fulfill({ json: {} });
      });
      await page.route('https://assets.example/**', (route) => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/L9sAAAAASUVORK5CYII=', 'base64') }));
      await page.goto(url);
      const customer = page.getByRole('region', { name: '會員中心', exact: true });
      const customerCard = customer.locator('[data-membership-card]');
      await customerCard.waitFor();
      const shine = customerCard.locator('[data-card-shine]');
      assert.equal(await shine.evaluate((el) => getComputedStyle(el).pointerEvents), 'none');
      assert.notEqual(await shine.evaluate((el) => getComputedStyle(el).animationName), 'none');
      if (engine === 'chromium' && width === 390) {
        await customerCard.locator('img').first().evaluate((image) => image.decode());
        await shine.evaluate((el) => el.getAnimations({ subtree: true }).forEach((animation) => { animation.pause(); animation.currentTime = 350; }));
        const early = await customerCard.screenshot({ animations: 'allow' });
        await shine.evaluate((el) => el.getAnimations({ subtree: true }).forEach((animation) => { animation.currentTime = 1100; }));
        const late = await customerCard.screenshot({ animations: 'allow', path: path.join(os.tmpdir(), 'urbanite-membership-gold-shine.png') });
        assert.ok(!early.equals(late), 'Gold reveal must visibly move, not just declare an animation');
      }
      await page.emulateMedia({ reducedMotion: 'reduce' });
      assert.equal(await shine.evaluate((el) => getComputedStyle(el).display), 'none', 'Respect reduced motion');
      assert.equal(await customer.getByRole('progressbar').getAttribute('aria-valuenow'), '50');
      await customer.getByRole('button', { name: '查看權益', exact: true }).click();
      assert.equal(await customer.getByText('回饋金明細', { exact: true }).isVisible(), true);
      await page.getByRole('button', { name: '等級與回饋設定', exact: true }).click();
      await page.getByRole('button', { name: '金卡會員卡片顏色', exact: true }).click();
      const admin = page.getByRole('region', { name: '會員卡樣式設定', exact: true });
      await admin.getByRole('button', { name: '選擇皇家藍卡面', exact: true }).click();
      await page.getByRole('button', { name: '一般會員卡片顏色', exact: true }).click();
      assert.equal(await page.getByRole('button', { name: '金卡會員卡片顏色', exact: true }).getAttribute('aria-expanded'), 'false');
      assert.equal(await page.getByLabel('會員卡編輯等級', { exact: true }).count(), 0, 'Edit directly inside the tier, without a second tier selector');
      await admin.getByRole('button', { name: '選擇黑金卡面', exact: true }).waitFor();
      assert.equal(await admin.getByRole('group', { name: '選擇會員卡面' }).getByRole('button').count(), 10);
      await admin.getByRole('button', { name: '選擇翡翠綠卡面', exact: true }).click();
      const heading = admin.getByLabel('權益區標題', { exact: true });
      await heading.fill(''); await heading.pressSequentially('VIP membership');
      assert.equal(await heading.inputValue(), 'VIP membership', 'English spaces must remain editable without resetting the caret');
      await admin.getByLabel('權益 1 SVG 圖示', { exact: true }).selectOption('heart');
      const benefitLabel = admin.getByLabel('權益 1 文字', { exact: true });
      await benefitLabel.fill(''); await benefitLabel.pressSequentially('VIP reward');
      assert.equal(await benefitLabel.inputValue(), 'VIP reward', 'Benefit drafts must retain spaces');
      await benefitLabel.fill('消費回饋 {rate}%');
      await admin.getByLabel('卡片標語', { exact: true }).fill('為你珍藏的每一刻');
      const previewName = admin.getByLabel('預覽會員姓名', { exact: true });
      await previewName.fill('測試');
      await previewName.press('End');
      await previewName.pressSequentially('ABC');
      assert.equal(await previewName.inputValue(), '測試ABC');
      assert.equal(await previewName.evaluate((el) => document.activeElement === el), true, 'Typing must retain focus and caret');
      if (width < 768) {
        assert.ok(await previewName.evaluate((el) => parseFloat(getComputedStyle(el).fontSize) >= 16), 'No iPhone input auto-zoom');
        assert.equal(await page.locator('[data-membership-save]').evaluate((el) => getComputedStyle(el).position), 'static', 'Save button must not float over focused fields');
        await page.setViewportSize({ width, height: 500 });
        await previewName.scrollIntoViewIfNeeded();
        const visible = await previewName.boundingBox();
        assert.ok(visible.y >= 0 && visible.y + visible.height <= 500, 'Field stays reachable in a keyboard-sized viewport');
        if (width === 390) await page.screenshot({ path: path.join(os.tmpdir(), `urbanite-membership-keyboard-${engine}.png`) });
        await page.setViewportSize({ width, height: 1000 });
      }
      await admin.getByLabel('預覽消費金額', { exact: true }).fill('0');
      assert.equal(await admin.getByRole('progressbar').getAttribute('aria-valuenow'), '0');
      assert.equal(await admin.locator('[role="progressbar"] > span').evaluate((el) => el.getBoundingClientRect().width), 0);
      assert.equal(await admin.locator('[data-membership-card]').getAttribute('data-membership-card'), 'emerald');
      assert.ok(await admin.locator('img[src="/membership/icons/heart.svg"]').count() >= 1);
      await admin.getByRole('button', { name: '預覽會員卡金光', exact: true }).focus();
      await admin.screenshot({ path: path.join(os.tmpdir(), `urbanite-membership-editor-${engine}-${width}.png`) });
      await page.getByRole('button', { name: '儲存設定', exact: true }).click();
      await page.getByText('已儲存', { exact: true }).waitFor();
      assert.equal(saves, 1); assert.equal(settings.tiers[0].cardDesign, 'emerald');
      assert.equal(settings.tiers[0].benefits[0].icon, 'heart');
      assert.equal(settings.tiers[2].cardDesign, 'royal-blue');
      assert.equal(settings.tiers[1].threshold, 3000); assert.equal(settings.tiers[1].rate, 2);
      await page.reload(); await customerCard.waitFor();
      assert.equal(await customerCard.getAttribute('data-membership-card'), 'emerald');
      assert.ok((await customerCard.innerText()).includes('王小美'));
      assert.equal(await customer.getByRole('progressbar').getAttribute('aria-valuenow'), '50');
      spend = 12000;
      await page.reload(); await customerCard.waitFor();
      assert.equal(await customerCard.getAttribute('data-membership-card'), 'royal-blue', 'Highest tier must follow its chosen color, not the tier name');
      assert.equal(await customer.getByRole('progressbar').getAttribute('aria-valuenow'), '100');
      spend = 1500;
      await page.reload(); await customerCard.waitFor();
      await page.getByRole('button', { name: '等級與回饋設定', exact: true }).click();
      await page.getByRole('button', { name: '一般會員卡片顏色', exact: true }).click();
      await admin.getByLabel('上傳權益 1 圖示', { exact: true }).setInputFiles({ name: 'icon.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/L9sAAAAASUVORK5CYII=', 'base64') });
      await admin.getByRole('button', { name: '移除權益 1 自訂圖示', exact: true }).waitFor();
      assert.ok(await admin.locator('img[src="https://assets.example/custom-icon.png"]').count() >= 1);
      await admin.getByRole('button', { name: '移除權益 1 自訂圖示', exact: true }).click();
      assert.ok(await admin.locator('img[src="/membership/icons/heart.svg"]').count() >= 1);
      await admin.getByLabel('啟用圖片會員卡', { exact: true }).uncheck();
      await page.getByRole('button', { name: '儲存設定', exact: true }).click();
      await page.getByText('已儲存', { exact: true }).waitFor();
      await page.reload(); await customer.getByText('NT$80', { exact: true }).waitFor();
      assert.equal(await customer.locator('[data-membership-card]').count(), 0, 'Classic credit view remains available');
      settings.card.enabled = true;
      await page.reload(); await customerCard.waitFor();
      const gallery = page.getByRole('region', { name: '十款卡面預覽', exact: true });
      for (const image of await gallery.locator('[data-membership-card] > div:first-child > img').all()) {
        await image.scrollIntoViewIfNeeded();
        await image.evaluate((element) => element.decode());
      }
      await customerCard.locator('img').first().evaluate((element) => element.decode());
      await page.evaluate(() => document.fonts.ready);
      const geometry = await page.locator('[data-membership-card]').evaluateAll((cards) => cards.map((card) => {
        const art = card.firstElementChild, heading = card.querySelector('h3'), amount = card.querySelector('strong');
        const meter = card.querySelector('[role="progressbar"]');
        const panel = meter.parentElement.parentElement;
        const box = art.getBoundingClientRect(), cover = panel.getBoundingClientRect();
        const action = art.querySelector('button') || art.lastElementChild;
        const button = action.getBoundingClientRect();
        return { titleFits: heading.scrollHeight <= heading.clientHeight + 1 && heading.scrollWidth <= heading.clientWidth + 1,
          serif: getComputedStyle(heading).fontFamily.includes('Noto Serif TC'),
          actionCentered: Math.abs((button.y + button.height / 2 - box.y) / box.height - .8) < .005,
          heading: art.querySelector('p').textContent,
          amountFits: amount.scrollHeight <= amount.clientHeight + 1 && amount.scrollWidth <= amount.clientWidth + 1,
          originalMeterCovered: cover.top <= box.top + box.height * .63 && cover.bottom >= box.top + box.height * .66 && cover.left <= box.left + box.width * .49 && cover.right >= box.left + box.width * .9 };
      }));
      assert.ok(geometry.every((card) => card.titleFits), 'Long tier names must fit the artwork');
      assert.ok(geometry.every((card) => card.serif), 'Card typography uses the existing Chinese serif font');
      assert.ok(geometry.every((card) => card.actionCentered), 'Action stays centered on the artwork button at every width');
      assert.ok(geometry.every((card) => card.heading === 'VIP membership'), 'Legacy headings migrate to VIP membership');
      assert.ok(geometry.every((card) => card.amountFits), 'Large spending amounts must fit without wrapping');
      assert.ok(geometry.every((card) => card.originalMeterCovered), 'Baked-in progress must never remain visible');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'No page overflow');
      await customer.screenshot({ path: path.join(os.tmpdir(), `urbanite-membership-${engine}-${width}.png`) });
      await page.getByRole('region', { name: '十款卡面預覽', exact: true }).screenshot({ path: path.join(os.tmpdir(), `urbanite-membership-gallery-${engine}-${width}.png`) });
      failSettings = true;
      await page.reload(); await page.getByRole('button', { name: '等級與回饋設定', exact: true }).click();
      await page.getByRole('alert').getByText('設定暫時無法讀取', { exact: true }).waitFor();
      assert.equal(await page.getByRole('button', { name: '儲存設定', exact: true }).count(), 0, 'Failed reads must not overwrite saved settings with defaults');
      assert.deepEqual(errors, []);
      console.log(`${engine} ${width}: persisted style/SVG/copy, custom icons, zero/partial/top progress, old rewards, mobile geometry and read-error protection passed (all API writes intercepted).`);
    } finally { await browser.close(); }
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
