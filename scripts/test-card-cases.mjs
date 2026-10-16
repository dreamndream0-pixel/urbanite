import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href : 'playwright');
const base = process.env.CARD_TEST_ORIGIN || 'http://localhost:3013';
const output = resolve('outputs/customer-cases');
await mkdir(output, { recursive: true });
const failures = [];
const getY = () => ['ios-chrome', 'ios-other'].includes(document.documentElement.dataset.browser) ? document.body.scrollTop : window.scrollY;

async function check(page, width, height, name) {
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/card`, { waitUntil: 'networkidle' });
  const support = page.getByRole('link', { name: '透過 LINE 聯繫客服專員' });
  assert.equal(await support.getAttribute('href'), 'https://lin.ee/TcCrcXY');
  assert.equal(await support.getAttribute('target'), '_blank');
  assert.match(await support.innerText(), /聯繫客服專員[\s\S]*LINE/);
  const before = await support.boundingBox();
  assert.ok(before.x >= 0 && before.x + before.width <= width && before.y + before.height <= height, `${name}: support clipped`);
  await page.evaluate(() => {
    if (['ios-chrome', 'ios-other'].includes(document.documentElement.dataset.browser)) document.body.scrollTo(0, 900);
    else window.scrollTo(0, 900);
  });
  await page.waitForTimeout(150);
  const after = await support.boundingBox();
  assert.ok(Math.abs(after.y - before.y) < 1, `${name}: support is not fixed`);
  await page.getByRole('button', { name: '開啟選單', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: '探索 URBANLINKS' });
  await drawer.waitFor();
  await page.waitForTimeout(380);
  const box = await drawer.boundingBox();
  assert.ok(Math.abs(box.width - width * 2 / 3) < 1 && Math.abs(box.x - width / 3) < 1, `${name}: drawer is not two thirds of viewport`);
  assert.ok(Math.abs(box.height - height) < 1 && box.y === 0, `${name}: drawer is not full height`);
  assert.equal(await drawer.getByRole('navigation', { name: '主要導覽' }).getByRole('link', { name: /客戶案例/ }).count(), 1);
  assert.ok(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog'))), `${name}: focus outside drawer`);
  for (let i = 0; i < 16; i++) {
    await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog'))), `${name}: focus escaped drawer`);
  }
  await page.screenshot({ path: `${output}/${name}-drawer.png` });
  await page.keyboard.press('Escape');
  await drawer.waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '開啟選單');
  assert.ok(await page.getByRole('button', { name: '開啟選單', exact: true }).evaluate(button => button === document.activeElement));
  await page.getByRole('button', { name: '開啟選單', exact: true }).click();
  await page.waitForTimeout(380);
  await page.mouse.click(width / 8, height / 2);
  await drawer.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '開啟選單', exact: true }).click();
  await drawer.getByRole('link', { name: /產品服務/ }).click();
  await drawer.waitFor({ state: 'hidden' });
  await page.waitForTimeout(1200);
  assert.ok(await page.evaluate(getY) > 0, `${name}: same-page navigation did not scroll`);
  assert.ok(await page.locator('#spaces').evaluate(element => element.getBoundingClientRect().top < innerHeight / 2));
  await page.getByRole('button', { name: '開啟選單', exact: true }).click();
  await drawer.getByRole('navigation', { name: '主要導覽' }).getByRole('link', { name: /客戶案例/ }).click();
  await page.waitForURL(`${base}/card/cases`);
  await page.getByRole('heading', { name: '客戶案例', exact: true, level: 1 }).waitFor();
  assert.equal(await page.locator('article').count(), 9);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  for (const article of await page.locator('article').all()) {
    const image = article.locator('img').first();
    await image.scrollIntoViewIfNeeded();
    assert.ok(await image.evaluate(async image => { await image.decode(); return image.naturalWidth > 0; }), `${name}: missing case image`);
  }
  await page.getByRole('heading', { name: '客戶案例', level: 1, exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/${name}-cases.png`, fullPage: true });
  for (const [label, count] of [['服飾電商', 2], ['租屋與代管', 2], ['美業預約', 3], ['LINE AI', 2], ['全部', 9]]) {
    await page.getByRole('button', { name: new RegExp(`^${label}`) }).click();
    assert.equal(await page.locator('article').count(), count, `${name}: incorrect ${label} filter`);
  }
  const liveLinks = await page.locator('article a[target="_blank"]').evaluateAll(links => links.map(link => link.href));
  assert.deepEqual(liveLinks, ['https://www.urbanite.com.tw/', 'https://chue.urbanite.com.tw/promo/second-hand', 'https://xiaowo-rental.vercel.app/']);
  assert.match(await page.locator('#rental-management').innerText(), /非代管後台畫面/);
  await page.getByRole('button', { name: /^美業預約/ }).click();
  for (const card of await page.locator('article').all()) assert.match(await card.innerText(), /示意設計/);
  const previewButton = page.getByRole('button', { name: '預覽 MORI NAIL', exact: true });
  await previewButton.click();
  const preview = page.getByRole('dialog', { name: 'MORI NAIL' });
  await preview.waitFor();
  assert.ok(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog'))));
  await page.keyboard.press('ArrowRight');
  const next = page.getByRole('dialog', { name: 'DAY HAIR' });
  await next.waitFor();
  await next.locator('img').evaluate(image => image.decode());
  await page.screenshot({ path: `${output}/${name}-preview.png` });
  await page.keyboard.press('ArrowLeft');
  await preview.waitFor();
  await page.keyboard.press('Escape');
  await preview.waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '預覽 MORI NAIL');
  assert.ok(await previewButton.evaluate(button => button === document.activeElement), `${name}: case focus was not restored`);
  await page.getByRole('button', { name: '開啟選單', exact: true }).click();
  await drawer.getByRole('complementary', { name: '精選客戶案例' }).getByRole('link', { name: /URBANITE/ }).click();
  await drawer.waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.querySelectorAll('article').length === 9 && location.hash === '#urbanite');
  assert.ok(await page.locator('#urbanite').evaluate(element => element.getBoundingClientRect().top < innerHeight / 2), `${name}: case deep link did not reset filter`);
  await page.getByRole('button', { name: /^全部/ }).click();
  await page.locator('#line-ai').scrollIntoViewIfNeeded();
  assert.ok(await page.evaluate(getY) > 0, `${name}: page stuck after preview`);
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log(`PASS ${name}: drawer, focus, scroll, filters, preview, support, images`);
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const [width, height] of [[320, 740], [390, 844], [768, 1024], [1440, 960]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    try { await check(page, width, height, `chromium-${width}`); }
    catch (error) { failures.push(error); console.error(error.stack); }
    await page.close();
  }
  const iphone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1' });
  try { await check(iphone, 390, 844, 'ios-chrome-emulated'); }
  catch (error) { failures.push(error); console.error(error.stack); }
  await iphone.close();
  const reduced = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await reduced.goto(`${base}/card`, { waitUntil: 'networkidle' });
  await reduced.getByRole('button', { name: '開啟選單', exact: true }).click();
  assert.equal(await reduced.getByRole('dialog', { name: '探索 URBANLINKS' }).evaluate(element => getComputedStyle(element).animationName), 'none');
  await reduced.getByRole('button', { name: '關閉選單', exact: true }).click();
  await reduced.getByRole('dialog', { name: '探索 URBANLINKS' }).waitFor({ state: 'hidden' });
  await reduced.close();
} finally { await browser.close(); }

if (process.env.TEST_WEBKIT === '1') {
  const safari = await webkit.launch({ headless: true });
  try {
    const page = await safari.newPage({ viewport: { width: 390, height: 844 } });
    await check(page, 390, 844, 'webkit-390');
  } catch (error) { failures.push(error); console.error(error.stack); }
  finally { await safari.close(); }
}
assert.equal(failures.length, 0, failures.map(error => error.stack).join('\n'));
