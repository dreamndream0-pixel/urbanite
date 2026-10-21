/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const ts = require('typescript');
const cardModule = { exports: {} };
new Function('exports', ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib/membership-card.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(cardModule.exports);
const circles = cardModule.exports.MEMBERSHIP_BENEFIT_CIRCLES;
const playwright = require(process.argv[2] || 'playwright');
const url = process.argv[3] || 'http://localhost:3014/membership-card-test';
async function chooseDesign(admin, name) {
  const viewport = admin.getByRole('group', { name: '選擇會員卡面', exact: true });
  const option = admin.getByRole('button', { name: `選擇${name}卡面`, exact: true });
  await viewport.focus(); await viewport.press('Home');
  for (let i = 0; i < 10; i++) {
    if (await option.evaluate((el) => { const box = el.getBoundingClientRect(), view = el.closest('[role="group"]').getBoundingClientRect(); return box.left >= view.left - 1 && box.right <= view.right + 1; })) break;
    await admin.getByRole('button', { name: '向右滑動會員卡', exact: true }).click();
  }
  await option.click();
}
async function expandBenefit(admin, index, icons = false) {
  const benefit = admin.locator(`[data-membership-benefit="${index}"]`);
  if (!(await benefit.evaluate((el) => el.open))) await benefit.locator('> summary').click();
  if (icons) {
    const picker = benefit.locator('[data-membership-icon-picker]');
    if (!(await picker.evaluate((el) => el.open))) await picker.locator('> summary').click();
  }
}
const initial = () => ({ enabled: true, delayDays: 14, validDays: 180, maxRedeemPct: 20, keepMonths: 12,
  tiers: [{ key: 'normal', name: '一般會員', threshold: 0, rate: 1, cardDesign: 'champagne' }, { key: 'silver', name: '銀卡會員', threshold: 3000, rate: 2, cardDesign: 'silver' }, { key: 'gold', name: '金卡會員', threshold: 10000, rate: 3, cardDesign: 'gold' }],
  card: { enabled: true, title: '會員專屬禮遇', subtitle: '每一次相遇，都值得珍藏', actionLabel: '查看權益' },
});
(async () => {
  for (const [engine, width] of [['chromium', 320], ['chromium', 390], ['webkit', 390], ['chromium', 768], ['chromium', 1440]]) {
    const browser = await playwright[engine].launch({ headless: true, ...(engine === 'chromium' ? { channel: 'chrome' } : {}) });
    try {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, deviceScaleFactor: 1,
        ...(engine === 'webkit' ? { isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1' } : {}) });
      const errors = []; page.on('pageerror', (error) => errors.push(error.message));
      let settings = initial(); let saves = 0; let failSettings = false;
      let spend = 1500;
      await page.route('**/api/**', async (route) => {
        const request = route.request(); const pathname = new URL(request.url()).pathname;
        if (pathname === '/api/admin/loyalty/members') return route.fulfill({ json: { enabled: true, members: [] } });
        if (pathname === '/api/admin/loyalty') {
          if (failSettings) return route.fulfill({ status: 503, json: { error: '設定暫時無法讀取' } });
          if (request.method() === 'PUT') { settings = request.postDataJSON().settings; saves++; }
          return route.fulfill({ json: { settings, ownerName: '測試店主' } });
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
      for (const text of ['我的優惠', 'MY COUPONS', '收藏喜歡的優惠，享受更好的購物體驗。']) {
        assert.equal(await customer.getByText(text, { exact: true }).count(), 0, 'Remove the header copy above the membership card');
      }
      assert.ok(await customerCard.evaluate((card) => {
        const hero = card.closest('[data-rewards-hero]');
        const gap = card.getBoundingClientRect().top - hero.getBoundingClientRect().top;
        return gap >= 0 && gap <= 16;
      }), 'Card starts directly below the tabs without the old heading gap');
      const typography = await customerCard.evaluate((card) => {
        const art = card.firstElementChild;
        const size = (el) => parseFloat(getComputedStyle(el).fontSize);
        const width = card.getBoundingClientRect().width;
        const paragraphs = art.querySelectorAll('p');
        return { width, brand: size(art.querySelector('p')), member: size(art.querySelector('h3')),
          amount: size(art.querySelector('[data-card-amount]')), action: size(art.querySelector('button')),
          name: size(paragraphs[1]), upgrade: size(paragraphs[2]), subtitle: size(paragraphs[3]),
          benefit: size(art.querySelector('[data-card-benefit] strong')),
          spendLabel: size(art.querySelector('[data-card-amount]').parentElement.parentElement.firstElementChild),
          remaining: size(art.querySelector('[role="progressbar"]').parentElement.querySelector('small')),
          hitHeight: art.querySelector('button').getBoundingClientRect().height };
      });
      const desktop = typography.width >= 480, narrow = typography.width <= 310;
      for (const [key, expected] of Object.entries({ brand: desktop ? 8.4 : 7,
        amount: desktop ? 22.4 : narrow ? 9.8 : 14.7, action: desktop ? 10.5 : narrow ? 7 : 7.7,
        name: desktop ? 11.2 : 8.4, upgrade: desktop ? 9.1 : 7, subtitle: desktop ? 9.1 : 7,
        benefit: desktop ? 9.1 : 6.3, spendLabel: desktop ? 9.1 : 7, remaining: desktop ? 9.1 : 7 })) {
        assert.ok(Math.abs(typography[key] - expected) < .05, `${key} font must match the 70% card scale (outside caption unchanged)`);
      }
      assert.ok(typography.hitHeight >= 44, 'Smaller text must not shrink the touch target');
      assert.ok(typography.member > typography.name * 1.5, 'Member name is the prominent heading');
      assert.equal(await customerCard.locator('h3').innerText(), '王小美');
      assert.equal(await customerCard.locator('[data-card-badge]').innerText(), 'CHAMPAGNE');
      assert.equal(await customerCard.locator('[data-card-credit] [data-card-amount]').innerText(), 'NT$80');
      assert.ok((await customerCard.locator('[data-card-credit]').innerText()).includes('待入帳 NT$10'));
      assert.ok(!(await customer.innerText()).includes('累積消費門檻'), 'The old card threshold is removed');
      assert.equal(await customer.getByText('VIP membership', { exact: true }).count(), 1, 'No external duplicate VIP benefit section');
      assert.equal(await customer.getByText('NT$80', { exact: true }).count(), 1, 'Balance appears only inside the card before expanding details');
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
      await page.getByRole('button', { name: '金卡會員卡片顏色', exact: true }).waitFor();
      assert.equal(await page.locator('html').getAttribute('data-document-form'), 'membership');
      if (engine === 'webkit') {
        assert.equal(await page.locator('html').getAttribute('data-browser'), 'ios-chrome');
        assert.equal(await page.locator('body').evaluate((el) => getComputedStyle(el).overflowY), 'visible', 'iPhone editor must not keep a nested body scroller');
        await page.getByRole('button', { name: '會員列表', exact: true }).click();
        assert.equal(await page.locator('html').getAttribute('data-document-form'), null, 'Restore scrolling when leaving the form');
        assert.equal(await page.locator('html').evaluate((el) => getComputedStyle(el).overflowY), 'hidden');
        await page.getByRole('button', { name: '等級與回饋設定', exact: true }).click();
      }
      await page.getByRole('button', { name: '金卡會員卡片顏色', exact: true }).click();
      const admin = page.getByRole('region', { name: '會員卡樣式設定', exact: true });
      await chooseDesign(admin, '皇家藍');
      await page.locator('[data-membership-tier="normal"]').getByRole('button', { name: /卡片顏色/ }).click();
      const tierName = page.locator('[data-membership-tier="normal"] input').first();
      await tierName.fill('尊榮會員');
      await tierName.pressSequentially(' VIP');
      assert.equal(await tierName.inputValue(), '尊榮會員 VIP');
      assert.equal(await tierName.evaluate((el) => document.activeElement === el), true);
      assert.equal(await admin.locator('h3').innerText(), '測試店主', 'Tier edits must not replace the store owner preview name');
      assert.equal(await page.getByRole('button', { name: '金卡會員卡片顏色', exact: true }).getAttribute('aria-expanded'), 'false');
      assert.equal(await page.getByLabel('會員卡編輯等級', { exact: true }).count(), 0, 'Edit directly inside the tier, without a second tier selector');
      await admin.getByRole('button', { name: '選擇黑金卡面', exact: true }).waitFor();
      assert.equal(await admin.getByRole('group', { name: '選擇會員卡面' }).getByRole('button').count(), 10);
      const viewport = admin.getByRole('group', { name: '選擇會員卡面', exact: true });
      await viewport.focus(); await viewport.press('Home');
      const transform = await admin.locator('[data-membership-carousel-track]').evaluate((el) => getComputedStyle(el).transform);
      await admin.getByRole('button', { name: '向右滑動會員卡', exact: true }).click();
      await page.waitForFunction((previous) => getComputedStyle(document.querySelector('[data-membership-carousel-track]')).transform !== previous, transform);
      assert.equal(await admin.getByRole('button', { name: '選擇香檳金卡面', exact: true }).getAttribute('aria-pressed'), 'true', 'Browsing must not change the selected card');
      await viewport.focus(); await viewport.press('Home'); await viewport.scrollIntoViewIfNeeded();
      assert.equal(await viewport.locator('button').evaluateAll((buttons) => new Set(buttons.map((button) => Math.round(button.getBoundingClientRect().top))).size), 1, 'All ten card thumbnails stay in one horizontal row');
      const beforeDrag = await admin.locator('[data-membership-carousel-track]').evaluate((el) => getComputedStyle(el).transform);
      const dragBox = await viewport.boundingBox();
      await page.mouse.move(dragBox.x + dragBox.width * .65, dragBox.y + dragBox.height * .35);
      await page.mouse.down();
      await page.mouse.move(dragBox.x + dragBox.width * .2, dragBox.y + dragBox.height * .35, { steps: 12 });
      await page.mouse.up();
      await page.waitForFunction((previous) => getComputedStyle(document.querySelector('[data-membership-carousel-track]')).transform !== previous, beforeDrag);
      assert.equal(await admin.getByRole('button', { name: '選擇香檳金卡面', exact: true }).getAttribute('aria-pressed'), 'true', 'Dragging browses without accidentally selecting a card');
      await chooseDesign(admin, '翡翠綠');
      assert.equal(await admin.locator('select').count(), 0, 'Icons use an expandable visual grid, not a native select');
      assert.equal(await admin.locator('[data-membership-benefit]').count(), 3);
      assert.equal(await admin.locator('[data-membership-benefit][open]').count(), 0);
      for (const label of ['預覽會員姓名', '預覽消費金額', '預覽回饋金']) assert.equal(await admin.getByLabel(label, { exact: true }).count(), 0);
      assert.equal(await admin.getByRole('button', { name: '預覽會員卡金光', exact: true }).count(), 0);
      assert.equal(await admin.locator('[data-card-shine]').count(), 0, 'Removing admin gold preview does not remove the customer reveal');
      await admin.getByLabel('累積消費門檻週期(月)', { exact: true }).fill('6');
      assert.ok((await admin.locator('[data-card-spend]').innerText()).includes('近 6 個月'));
      const heading = admin.getByLabel('權益區標題', { exact: true });
      await heading.fill(''); await heading.pressSequentially('VIP membership');
      assert.equal(await heading.inputValue(), 'VIP membership', 'English spaces must remain editable without resetting the caret');
      await expandBenefit(admin, 0, true);
      assert.equal(await admin.getByRole('group', { name: '權益 1 圖示選擇', exact: true }).getByRole('button').count(), 9);
      if (width === 390) await admin.locator('[data-membership-benefit="0"]').screenshot({ path: path.join(os.tmpdir(), `urbanite-membership-icon-grid-${engine}.png`) });
      await admin.getByRole('button', { name: '權益 1 圖示：愛心', exact: true }).click();
      const benefitLabel = admin.getByLabel('權益 1 文字', { exact: true });
      await benefitLabel.fill(''); await benefitLabel.pressSequentially('VIP reward');
      assert.equal(await benefitLabel.inputValue(), 'VIP reward', 'Benefit drafts must retain spaces');
      await benefitLabel.fill('消費回饋 {rate}%');
      const benefitDescription = admin.getByLabel('權益 1 說明', { exact: true });
      await benefitDescription.fill('消費享專屬回饋');
      await admin.getByLabel('會員副標語', { exact: true }).fill('專屬會員・美好日常');
      await admin.getByLabel('卡片標語', { exact: true }).fill('為你珍藏的每一刻');
      await benefitDescription.press('End');
      await benefitDescription.pressSequentially('ABC');
      assert.equal(await benefitDescription.inputValue(), '消費享專屬回饋ABC');
      assert.equal(await benefitDescription.evaluate((el) => document.activeElement === el), true, 'Typing must retain focus and caret');
      if (width < 768) {
        assert.ok(await benefitDescription.evaluate((el) => parseFloat(getComputedStyle(el).fontSize) >= 16), 'No iPhone input auto-zoom');
        assert.equal(await page.locator('[data-membership-save]').evaluate((el) => getComputedStyle(el).position), 'static', 'Save button must not float over focused fields');
        await page.setViewportSize({ width, height: 500 });
        await page.waitForFunction(() => {
          const box = document.querySelector('input[aria-label="權益 1 說明"]').getBoundingClientRect();
          const view = window.visualViewport;
          return box.top >= (view?.offsetTop ?? 0) && box.bottom <= (view?.offsetTop ?? 0) + (view?.height ?? innerHeight);
        });
        const visible = await benefitDescription.boundingBox();
        assert.ok(visible.y >= 0 && visible.y + visible.height <= 500, 'Field stays reachable in a keyboard-sized viewport');
        if (width === 390) await page.screenshot({ path: path.join(os.tmpdir(), `urbanite-membership-keyboard-${engine}.png`) });
        await page.setViewportSize({ width, height: 1000 });
      }
      await benefitDescription.fill('消費享專屬回饋');
      assert.equal(await admin.locator('[data-card-amount]').innerText(), 'NT$10,000');
      assert.ok((await admin.locator('[data-card-spend]').innerText()).includes('NT$10,000'));
      assert.equal(await admin.getByRole('progressbar').getAttribute('aria-valuenow'), '100');
      assert.equal(await admin.locator('[data-membership-card]').getAttribute('data-membership-card'), 'emerald');
      assert.equal(await admin.locator('[data-membership-card] img[src="/membership/icons/heart.svg"]').count(), 1);
      await admin.locator('[data-membership-benefit="0"] > summary').click();
      await expandBenefit(admin, 1);
      assert.equal(await admin.getByLabel('權益 1 文字', { exact: true }).isVisible(), false);
      assert.equal(await admin.getByLabel('權益 2 文字', { exact: true }).isVisible(), true);
      assert.equal(await benefitLabel.inputValue(), '消費回饋 {rate}%', 'Collapsed benefit edits are retained');
      await expandBenefit(admin, 2);
      assert.equal(await admin.locator('[data-membership-benefit][open]').count(), 2, 'Benefits 2 and 3 expand independently');
      await admin.locator('[data-membership-benefit="2"] > summary').click();
      await admin.screenshot({ path: path.join(os.tmpdir(), `urbanite-membership-editor-${engine}-${width}.png`) });
      await page.getByRole('button', { name: '儲存設定', exact: true }).click();
      await page.getByText('已儲存', { exact: true }).waitFor();
      assert.equal(saves, 1); assert.equal(settings.tiers[0].cardDesign, 'emerald');
      assert.equal(settings.tiers[0].name, '尊榮會員 VIP');
      assert.equal(settings.keepMonths, 6);
      await customer.locator('[data-membership-card="emerald"]').waitFor();
      assert.equal(await customerCard.locator('h3').innerText(), '王小美', 'Tier rename must not replace the real member name');
      assert.ok((await customer.innerText()).includes('尊榮會員 VIP'), 'Saved tier names update the visible member reward badge');
      assert.ok((await customerCard.locator('[data-card-spend]').innerText()).includes('近 6 個月'), 'Mounted member view refreshes after saving');
      assert.equal(settings.tiers[0].benefits[0].icon, 'heart');
      assert.equal(settings.tiers[2].cardDesign, 'royal-blue');
      assert.equal(settings.tiers[1].threshold, 3000); assert.equal(settings.tiers[1].rate, 2);
      assert.equal('ownerName' in settings, false, 'Preview identity is not persisted as loyalty settings');
      await page.reload(); await customerCard.waitFor();
      assert.equal(await customerCard.getAttribute('data-membership-card'), 'emerald');
      assert.ok((await customerCard.innerText()).includes('王小美'));
      assert.equal(await customer.getByRole('progressbar').getAttribute('aria-valuenow'), '50');
      spend = 12000;
      await page.reload(); await customerCard.waitFor();
      assert.equal(await customerCard.getAttribute('data-membership-card'), 'royal-blue', 'Highest tier must follow its chosen color, not the tier name');
      assert.equal(await customer.getByRole('progressbar').getAttribute('aria-valuenow'), '100');
      spend = 0;
      await page.reload(); await customerCard.waitFor();
      assert.equal(await customer.getByRole('progressbar').getAttribute('aria-valuenow'), '0');
      assert.equal(await customer.locator('[role="progressbar"] > span').evaluate((el) => el.getBoundingClientRect().width), 0);
      spend = 1500;
      await page.reload(); await customerCard.waitFor();
      await page.getByRole('button', { name: '等級與回饋設定', exact: true }).click();
      await page.locator('[data-membership-tier="normal"]').getByRole('button', { name: /卡片顏色/ }).click();
      await expandBenefit(admin, 0, true);
      await admin.getByLabel('上傳權益 1 圖示', { exact: true }).setInputFiles({ name: 'icon.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/L9sAAAAASUVORK5CYII=', 'base64') });
      await admin.getByRole('button', { name: '移除權益 1 自訂圖示', exact: true }).waitFor();
      assert.equal(await admin.locator('[data-membership-card] img[src="https://assets.example/custom-icon.png"]').count(), 1);
      await admin.getByRole('button', { name: '移除權益 1 自訂圖示', exact: true }).click();
      assert.equal(await admin.locator('[data-membership-card] img[src="/membership/icons/heart.svg"]').count(), 1);
      await admin.getByLabel('啟用圖片會員卡', { exact: true }).uncheck();
      await page.getByRole('button', { name: '儲存設定', exact: true }).click();
      await page.getByText('已儲存', { exact: true }).waitFor();
      await page.reload(); await customer.getByText('NT$80', { exact: true }).waitFor();
      assert.equal(await customer.locator('[data-membership-card]').count(), 0, 'Classic credit view remains available');
      settings.card.enabled = true;
      await page.reload(); await customerCard.waitFor();
      if (engine === 'chromium' && width === 390) {
        const backdrops = new Set();
        for (const id of ['black-gold', 'silver', 'gold', 'platinum', 'diamond', 'royal-blue', 'emerald', 'rose-gold', 'amethyst', 'champagne']) {
          settings.tiers[0].cardDesign = id;
          await page.evaluate(() => window.dispatchEvent(new Event('focus')));
          await customer.locator(`[data-rewards-hero="${id}"]`).waitFor();
          const backdrop = await customer.locator('[data-rewards-hero]').evaluate((el) => {
            const box = el.getBoundingClientRect();
            return { color: getComputedStyle(el).backgroundColor, width: box.width, left: box.left };
          });
          assert.ok(Math.abs(backdrop.left) < 1 && Math.abs(backdrop.width - width) < 1, 'Theme fills the entire upper band to both mobile edges');
          backdrops.add(backdrop.color);
          await customerCard.locator('img').first().evaluate((el) => el.decode());
          await customer.screenshot({ path: path.join(os.tmpdir(), `urbanite-rewards-${id}.png`) });
        }
        assert.equal(backdrops.size, 10, 'All ten card colors have a corresponding full-width backdrop');
        settings.tiers[0].cardDesign = 'emerald';
        await page.evaluate(() => window.dispatchEvent(new Event('focus')));
        await customer.locator('[data-rewards-hero="emerald"]').waitFor();
      }
      const gallery = page.getByRole('region', { name: '十款卡面預覽', exact: true });
      for (const image of await gallery.locator('[data-membership-card] > div:first-child > img').all()) {
        await image.scrollIntoViewIfNeeded();
        await image.evaluate((element) => element.decode());
      }
      await customerCard.locator('img').first().evaluate((element) => element.decode());
      await page.evaluate(() => document.fonts.ready);
      assert.equal(new Set(await gallery.locator('[data-card-icon] img').evaluateAll((images) => images.map((el) => el.getAttribute('src')))).size, 9, 'Exercise every available SVG icon');
      const geometry = await page.locator('[data-membership-card]').evaluateAll((cards, circles) => cards.map((card) => {
        const art = card.firstElementChild, heading = card.querySelector('h3'), amount = card.querySelector('[data-card-amount]');
        const meter = card.querySelector('[role="progressbar"]');
        const panel = meter.parentElement.parentElement;
        const box = art.getBoundingClientRect(), cover = panel.getBoundingClientRect();
        const credit = art.querySelector('[data-card-credit]').getBoundingClientRect();
        const action = art.querySelector('button') || art.lastElementChild;
        const button = action.getBoundingClientRect();
        const perks = [...art.querySelectorAll('[data-card-benefit]')].every((perk) => {
          const [icon, copy] = [...perk.children].map((el) => el.getBoundingClientRect());
          return Math.abs(icon.y + icon.height / 2 - copy.y - copy.height / 2) < 1;
        });
        const iconsCentered = [...art.querySelectorAll('[data-card-icon]')].every((icon, index) => {
          const [x, y, radius] = circles[card.dataset.membershipCard][index];
          const mask = icon.getBoundingClientRect(), image = icon.querySelector('img').getBoundingClientRect();
          return Math.abs(mask.x + mask.width / 2 - box.x - box.width * x / 1448) < .08
            && Math.abs(mask.y + mask.height / 2 - box.y - box.height * y / 1086) < .08
            && Math.abs(mask.width - box.width * (radius - 3) * 2 / 1448) < .08
            && Math.abs(mask.width - mask.height) < .05
            && Math.abs(image.x + image.width / 2 - mask.x - mask.width / 2) < .05
            && Math.abs(image.y + image.height / 2 - mask.y - mask.height / 2) < .05;
        });
        const footer = art.querySelector('[data-card-footer]');
        const [emblem, slogan] = [...footer.children].map((el) => el.getBoundingClientRect());
        return { titleFits: heading.scrollHeight <= heading.clientHeight + 1 && heading.scrollWidth <= heading.clientWidth + 1,
          serif: getComputedStyle(heading).fontFamily.includes('Noto Serif TC'),
          actionCentered: Math.abs((button.y + button.height / 2 - box.y) / box.height - .8) < .005,
          heading: art.querySelector('p').textContent,
          perksAligned: perks, iconsCentered, creditFits: credit.top >= cover.top && credit.bottom <= cover.bottom,
          footerAligned: Math.abs(emblem.y + emblem.height / 2 - slogan.y - slogan.height / 2) < 1,
          badge: art.querySelector('[data-card-badge]').textContent,
          amountFits: amount.scrollHeight <= amount.clientHeight + 1 && amount.scrollWidth <= amount.clientWidth + 1,
          originalMeterCovered: cover.top <= box.top + box.height * .63 && cover.bottom >= box.top + box.height * .66 && cover.left <= box.left + box.width * .49 && cover.right >= box.left + box.width * .9 };
      }), circles);
      assert.ok(geometry.every((card) => card.iconsCentered), 'Every icon and mask must be centered on its own source-artwork ring at every viewport width');
      assert.ok(geometry.every((card) => card.creditFits), 'Credit balance and status must stay inside their panel, including mid-width desktop cards');
      assert.ok(geometry.every((card) => card.titleFits), 'Long tier names must fit the artwork');
      assert.ok(geometry.every((card) => card.serif), 'Card typography uses the existing Chinese serif font');
      assert.ok(geometry.every((card) => card.perksAligned && card.footerAligned), 'Perk and footer icon/copy must share horizontal centerlines');
      assert.equal(new Set(geometry.map((card) => card.badge)).size, 10, 'All ten artwork badge names are preserved');
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
