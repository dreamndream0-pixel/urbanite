import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Supply PLAYWRIGHT_MODULE when using the bundled desktop runtime instead of a local install.
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href : 'playwright');
const url = process.env.HERO_URL || 'http://localhost:3013/card';
const output = resolve('outputs/urbanlinks-hero');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const failures = [];

async function check(page, width, height, name) {
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  const hero = page.locator('section[aria-labelledby="urbanlinks-hero-title"]');
  await hero.locator('img').evaluateAll(async images => {
    await Promise.all(images.map(image => image.decode().catch(() => {})));
  });
  await page.waitForTimeout(900);
  assert.equal(await hero.getByRole('heading', { level: 1 }).innerText(), '3分鐘就開店\n打造質感網店');
  const geometry = await hero.evaluate(element => {
    const rectangle = element.getBoundingClientRect();
    return {
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      broken: [...element.querySelectorAll('img')].filter(image => !image.complete || !image.naturalWidth).length,
      headingFits: [...element.querySelectorAll('h1 > span')].every(span => span.getBoundingClientRect().right <= window.innerWidth),
      bottom: rectangle.bottom,
      phoneScreens: [...element.querySelectorAll('[class*="profileScreen"]')].map(screen => ({ height: screen.clientHeight, content: screen.scrollHeight })),
    };
  });
  assert.equal(geometry.overflow, false, `${name}: horizontal overflow`);
  assert.equal(geometry.broken, 0, `${name}: missing hero image`);
  assert.equal(geometry.headingFits, true, `${name}: heading clipped`);
  assert.ok(geometry.phoneScreens.every(screen => screen.content <= screen.height + 1), `${name}: profile screen content clipped`);
  await page.screenshot({ path: `${output}/${name}.png` });

  await hero.getByRole('tab', { name: '預約系統' }).click();
  assert.equal(await hero.getByRole('tab', { name: '預約系統' }).getAttribute('aria-selected'), 'true');
  await hero.getByLabel('示範預約時段', { exact: true }).getByRole('button', { name: '14:00' }).click();
  await page.waitForTimeout(500);
  assert.ok(await hero.locator('[class*="profileScreen"]').evaluate(screen => screen.scrollHeight <= screen.clientHeight + 1), `${name}: booking screen content clipped`);
  await hero.getByRole('button', { name: '示範預約', exact: true }).click();
  assert.match(await hero.getByTitle('查看預約示範').innerText(), /預約已確認[\s\S]*14:00/);
  await hero.getByLabel('示範預約時段', { exact: true }).getByRole('button', { name: '10:00' }).click();
  assert.match(await hero.getByTitle('查看預約示範').innerText(), /新訂單/);
  await page.screenshot({ path: `${output}/${name}-booking.png` });
  await hero.getByRole('button', { name: '預覽 LINE 整合' }).click();
  assert.equal(await hero.getByRole('tab', { name: '社群整合' }).getAttribute('aria-selected'), 'true');
  assert.equal(await hero.getByRole('button', { name: 'LINE', exact: true }).getAttribute('aria-pressed'), 'true');
  await hero.getByRole('tab', { name: '社群整合' }).focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await hero.getByRole('tab', { name: '品牌官網' }).getAttribute('aria-selected'), 'true');
  await hero.getByRole('button', { name: '本週', exact: true }).click();
  assert.equal(await hero.getByText('+48%', { exact: true }).count(), 1);
  await hero.getByRole('button', { name: '一鍵搬家', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '把你的世界搬過來' });
  assert.equal(await dialog.isVisible(), true);
  const form = dialog.locator('form');
  const formBox = await form.boundingBox();
  const dialogBox = await dialog.boundingBox();
  assert.ok(formBox.x >= dialogBox.x && formBox.x + formBox.width <= dialogBox.x + dialogBox.width, `${name}: import form clipped`);
  await page.route('**/api/card-import/preview', route => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: '測試網址無法讀取' }) }));
  await dialog.getByRole('textbox').fill('https://example.com/demo');
  await dialog.getByRole('button', { name: '預覽搬家效果' }).click();
  await dialog.getByText('測試網址無法讀取').waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await dialog.isVisible(), false);
  assert.equal(await hero.getByRole('button', { name: '一鍵搬家', exact: true }).evaluate(element => element === document.activeElement), true);
  await hero.getByRole('button', { name: '往下探索產品服務' }).click();
  await page.waitForTimeout(1200);
  assert.ok(await page.locator('#spaces').evaluate(element => element.getBoundingClientRect().top < window.innerHeight / 2), `${name}: scroll action failed`);
  assert.equal(errors.length, 0, `${name}: ${errors.join('; ')}`);
  console.log(`PASS ${name} ${width}x${height}`, JSON.stringify(geometry));
}

try {
  for (const [width, height] of [[320, 740], [390, 844], [430, 932], [768, 1024], [1440, 960], [390, 667]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    try { await check(page, width, height, `chromium-${width}-${height}`); }
    catch (error) { failures.push(error); console.error(error.message); }
    await page.close();
  }
  const reducedPage = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await reducedPage.goto(url, { waitUntil: 'networkidle' });
  assert.equal(await reducedPage.locator('[aria-label="示範預約時段"]').evaluate(element => getComputedStyle(element.parentElement).animationName), 'none');
  await reducedPage.close();

  const importPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const mockPreview = {
    source: '測試來源', url: 'https://example.com/demo', blocks: [], freeBlocks: 8, template: 'blank', allTemplates: true,
    card: { id: 'hero-test', slug: 'hero-test', display_name: '搬家測試', avatar_url: '', email: '', show_email: false,
      bio: '', show_bio: false, socials: [], show_socials: true, tags: [], show_tags: true, theme: {}, published: true,
      seo_title: '', seo_description: '', seo_image: '', show_footer_logo: true },
  };
  await importPage.route('**/api/card-import/preview', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(mockPreview) }));
  await importPage.goto(url, { waitUntil: 'networkidle' });
  await importPage.getByRole('button', { name: '一鍵搬家', exact: true }).click();
  await importPage.getByRole('dialog').getByRole('textbox').fill('https://example.com/demo');
  await importPage.getByRole('button', { name: '預覽搬家效果' }).click();
  await importPage.getByText('一鍵搬家預覽 · 測試來源').waitFor();
  assert.equal(await importPage.getByRole('dialog').isVisible(), false, 'native dialog must not cover the portal preview');
  await importPage.getByRole('button', { name: '關閉', exact: true }).click();
  await importPage.goto(`${url}?move=${encodeURIComponent('https://example.com/demo')}`, { waitUntil: 'networkidle' });
  await importPage.getByText('一鍵搬家預覽 · 測試來源').waitFor();
  await importPage.getByRole('button', { name: '關閉', exact: true }).click();
  await importPage.close();
  console.log('PASS embedded import preview and shared import URL (mocked; no data written)');

  const iphone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1' });
  await iphone.goto(url, { waitUntil: 'networkidle' });
  assert.equal(await iphone.locator('html').getAttribute('data-browser'), 'ios-chrome');
  await iphone.evaluate(() => document.body.scrollTo(0, 1000));
  await iphone.waitForTimeout(300);
  assert.ok(await iphone.evaluate(() => document.body.scrollTop > 0));
  await iphone.evaluate(() => document.body.scrollTo(0, 0));
  await iphone.waitForTimeout(300);
  assert.equal(await iphone.evaluate(() => document.body.scrollTop), 0);
  await iphone.getByRole('button', { name: '一鍵搬家', exact: true }).click();
  await iphone.getByRole('button', { name: '關閉一鍵搬家' }).click();
  await iphone.evaluate(() => document.body.scrollTo(0, 800));
  assert.ok(await iphone.evaluate(() => document.body.scrollTop > 0), 'iOS Chrome: stuck after closing dialog');
  await iphone.close();
  console.log('PASS reduced motion and iPhone Chrome body-scroll path (emulated)');
} finally {
  await browser.close();
}

if (process.env.TEST_WEBKIT === '1') {
  const safari = await webkit.launch({ headless: true });
  try {
    const page = await safari.newPage({ viewport: { width: 390, height: 844 } });
    await check(page, 390, 844, 'webkit-390-844');
  } catch (error) { failures.push(error); }
  finally { await safari.close(); }
}
assert.equal(failures.length, 0, failures.map(error => error.stack).join('\n'));
