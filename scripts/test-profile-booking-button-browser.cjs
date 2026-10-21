/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { chromium, webkit } = require(process.argv[2] || 'playwright');
const url = process.argv[3];
const fixture = require('./fixtures/profile-booking-button.json');
if (!url) throw new Error('Provide a temporary local route mounting ProfileBookingButtonFixture');
(async () => {
  for (const [engine, width] of [[chromium, 320], [chromium, 390], [webkit, 390], [chromium, 1440]]) {
    const browser = await engine.launch({ headless: true, ...(engine === chromium ? { channel: 'chrome' } : {}) });
    const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: true });
    const errors = [];
    const writes = [];
    let card = structuredClone(fixture.card);
    card.theme.bookingButton = { visible: true, after: '', label: '線上預約', style: 'accent', shape: 'inherit', color: '', textColor: '', showIcon: true, shadow: true };
    let blocks = structuredClone(fixture.blocks);
    let available = true;
    let fail = false;
    let failOrder = false;
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/api/**', async (route) => {
      const req = route.request();
      if (new URL(req.url()).pathname === '/api/profile-card/blocks' && req.method() === 'PUT') {
        const body = req.postDataJSON(); writes.push(body);
        if (failOrder) return route.fulfill({ status: 500, json: { error: '排序失敗測試' } });
        assert.ok(!body.ids.includes('__booking_button__'));
        blocks = body.ids.map((id, sort_order) => ({ ...blocks.find(b => b.id === id), sort_order }));
        card.theme.bookingButton.after = body.booking_after;
        return route.fulfill({ json: { ok: true } });
      }
      if (new URL(req.url()).pathname === '/api/profile-card') {
        if (req.method() === 'PATCH') {
          const body = req.postDataJSON(); writes.push(body);
          if (fail) return route.fulfill({ status: 500, json: { error: '儲存失敗測試' } });
          if (body.booking_button) card.theme.bookingButton = body.booking_button;
          else card = { ...card, ...body };
          return route.fulfill({ json: card });
        }
        return route.fulfill({ json: { card, blocks, bookingHref: available ? '/@booking-fixture/book' : '' } });
      }
      return route.fulfill({ json: [] });
    });
    const panel = page.getByRole('region', { name: '線上預約設定' });
    const click = (name) => panel.getByRole('button', { name, exact: true }).click();
    const save = async () => { await click('儲存預約按鈕'); await panel.getByRole('button', { name: '已儲存', exact: true }).waitFor(); };
    const publicButton = page.locator('[data-booking-button]');
    const order = () => publicButton.evaluate((el) => [...el.parentElement.children].map((child) => child.textContent.trim()));
    const rows = page.locator('[data-profile-content-id]');
    const ids = () => rows.evaluateAll(elements => elements.map(e => e.dataset.profileContentId));
    const grip = id => page.locator(`[data-profile-content-id="${id}"]`).getByRole('button', { name: '拖曳排序' });
    const idle = () => page.locator('[data-profile-content-list][aria-busy="false"]').waitFor();
    const go = async target => { await page.waitForLoadState('networkidle'); await page.goto(target); };
    const reload = async () => { await page.waitForLoadState('networkidle'); await page.reload(); };
    try {
      await go(url);
      await idle();
      assert.deepEqual(await ids(), ['__booking_button__', 'first', 'hidden', 'recommendation', 'last']);
      for (let i = 0; i < 3; i++) { await grip('__booking_button__').press('ArrowDown'); await idle(); }
      assert.equal(card.theme.bookingButton.after, 'recommendation');
      await panel.getByRole('button', { name: '編輯線上預約' }).click();
      await panel.getByLabel('按鈕文字', { exact: true }).fill('立即預約美甲');
      await panel.getByLabel('樣式', { exact: true }).selectOption('outline');
      await panel.getByLabel('圓角', { exact: true }).selectOption('square');
      await panel.getByLabel('按鈕顏色', { exact: true }).fill('#196b52');
      await panel.getByLabel('顯示日曆圖示', { exact: true }).uncheck();
      await panel.getByLabel('按鈕陰影', { exact: true }).uncheck();
      await save();
      assert.equal(writes.at(-1).booking_button.after, 'recommendation');
      assert.equal(writes.at(-1).booking_button.style, 'outline');
      assert.equal(card.theme.bgColor, '#ffffff');
      await panel.scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(os.tmpdir(), `urbanite-booking-button-editor-${engine.name()}-${width}.png`) });
      assert.ok(await panel.evaluate((el) => el.getBoundingClientRect().right <= window.innerWidth));
      if (width === 390) {
        await page.getByRole('button', { name: '預覽', exact: true }).click();
        const previewButton = page.locator('[data-booking-button]').last();
        await previewButton.scrollIntoViewIfNeeded();
        assert.equal(await previewButton.innerText(), '立即預約美甲');
        await previewButton.click();
        assert.equal(new URL(page.url()).pathname, new URL(url).pathname, 'Preview must not navigate away');
        await page.getByRole('button', { name: '關閉', exact: true }).click();
      }

      await reload(); await idle();
      assert.deepEqual(await ids(), ['first', 'hidden', 'recommendation', '__booking_button__', 'last']);
      // Moving a normal link across booking must also update the booking anchor.
      await grip('recommendation').press('ArrowDown'); await idle();
      assert.equal(card.theme.bookingButton.after, 'hidden');
      await grip('recommendation').press('ArrowUp'); await idle();
      assert.equal(card.theme.bookingButton.after, 'recommendation');
      const visibleSwitch = panel.getByRole('switch', { name: '顯示線上預約' });
      await visibleSwitch.click(); await idle(); assert.equal(card.theme.bookingButton.visible, false);
      await visibleSwitch.click(); await idle(); assert.equal(card.theme.bookingButton.visible, true);
      failOrder = true;
      const before = await ids();
      await grip('__booking_button__').press('ArrowDown');
      await page.getByText('排序失敗測試', { exact: true }).waitFor();
      assert.deepEqual(await ids(), before, 'Failed save must restore the list');
      await page.getByRole('button', { name: '確定', exact: true }).click(); failOrder = false;
      // Pointer sorting uses the same grip for the booking and standard link rows.
      await grip('__booking_button__').scrollIntoViewIfNeeded();
      await page.locator('[data-profile-content-id="last"]').scrollIntoViewIfNeeded();
      const source = await grip('__booking_button__').boundingBox();
      const target = await page.locator('[data-profile-content-id="last"]').boundingBox();
      await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
      await page.mouse.down(); await page.mouse.move(source.x + source.width / 2, target.y + target.height - 3, { steps: 8 }); await page.mouse.up();
      await idle(); assert.equal(card.theme.bookingButton.after, 'last');
      await grip('__booking_button__').press('ArrowUp'); await idle();
      if (engine === chromium && width === 390) {
        await grip('__booking_button__').scrollIntoViewIfNeeded();
        await page.locator('[data-profile-content-id="last"]').scrollIntoViewIfNeeded();
        const source = await grip('__booking_button__').boundingBox();
        const target = await page.locator('[data-profile-content-id="last"]').boundingBox();
        const session = await page.context().newCDPSession(page);
        const x = source.x + source.width / 2, start = source.y + source.height / 2, end = target.y + target.height - 3;
        await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: start }] });
        for (let i = 1; i <= 12; i++) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: start + (end - start) * i / 12 }] });
        await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await idle(); assert.equal(card.theme.bookingButton.after, 'last');
        await grip('__booking_button__').press('ArrowUp'); await idle();
      }
      await panel.getByRole('button', { name: '編輯線上預約' }).click();
      assert.equal(await panel.getByLabel('樣式', { exact: true }).inputValue(), 'outline');
      await go(`${url}?mode=public`);
      await publicButton.waitFor();
      assert.equal(await publicButton.getAttribute('href'), '/@booking-fixture/book');
      assert.deepEqual(await order(), ['官方網站', '本週推薦', '立即預約美甲', '品牌介紹']);
      assert.equal(await publicButton.locator('svg').count(), 0);
      const css = await publicButton.evaluate((el) => ({ radius: getComputedStyle(el).borderRadius, bg: getComputedStyle(el).backgroundColor, border: getComputedStyle(el).borderTopColor }));
      assert.equal(css.radius, '0px'); assert.equal(css.bg, 'rgba(0, 0, 0, 0)'); assert.equal(css.border, 'rgb(25, 107, 82)');
      await publicButton.scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(os.tmpdir(), `urbanite-booking-button-public-${engine.name()}-${width}.png`) });

      card.theme.bookingButton.after = 'hidden';
      await reload(); await publicButton.waitFor();
      assert.deepEqual(await order(), ['官方網站', '立即預約美甲', '本週推薦', '品牌介紹']);
      blocks = blocks.filter((b) => b.id !== 'hidden');
      await reload(); await publicButton.waitFor();
      assert.deepEqual(await order(), ['官方網站', '本週推薦', '品牌介紹', '立即預約美甲']);
      for (const style of ['accent', 'theme', 'soft']) {
        card.theme.bookingButton = { ...card.theme.bookingButton, after: '', style, showIcon: true, shape: 'pill', label: '預約'.repeat(40) };
        await reload(); await publicButton.waitFor();
        assert.equal((await order())[0], '預約'.repeat(40));
        assert.equal(await publicButton.locator('svg').count(), 1);
        assert.ok(await publicButton.evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
      }
      card.theme.bookingButton.visible = false;
      await reload(); await page.getByRole('link', { name: '官方網站', exact: true }).waitFor();
      assert.equal(await publicButton.count(), 0);
      card.theme.bookingButton.visible = true; available = false;
      await reload(); await page.getByRole('link', { name: '官方網站', exact: true }).waitFor();
      assert.equal(await publicButton.count(), 0, 'Unavailable bookings must remain hidden even with saved design');
      available = true;
      await go(url);
      await panel.getByRole('button', { name: '編輯線上預約' }).click();
      await panel.getByLabel('按鈕文字', { exact: true }).fill('失敗後仍保留草稿');
      fail = true;
      await click('儲存預約按鈕');
      await panel.getByRole('alert').waitFor();
      assert.equal(await panel.getByLabel('按鈕文字', { exact: true }).inputValue(), '失敗後仍保留草稿');
      fail = false; await save();
      assert.deepEqual(errors, []);
      console.log(`${engine.name()} ${width}: position, styles, colors, icon, mobile preview, save/reload, public order, hidden/deleted anchors, long labels, closed booking, visibility and failure retry passed. API writes mocked.`);
    } catch (error) { console.error((await page.locator('body').innerText()).slice(-3000)); throw error; }
    finally { await browser.close(); }
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
