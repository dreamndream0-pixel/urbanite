import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href : 'playwright');
const captures = [
  ['urbanite', 'https://www.urbanite.com.tw/'],
  ['chue', 'https://chue.urbanite.com.tw/promo/second-hand'],
  ['snail-rental', 'https://xiaowo-rental.vercel.app/'],
];
await mkdir('public/card/cases', { recursive: true });
await mkdir('outputs/customer-cases', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const sources = [];
try {
  for (const [name, url] of captures) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => [...document.images].filter(image => {
      const box = image.getBoundingClientRect();
      return box.top < innerHeight && box.bottom > 0 && box.width > 0;
    }).every(image => image.complete), undefined, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(4000);
    const firstSlide = page.getByRole('button', { name: '第 1 張', exact: true });
    if (name === 'urbanite' && await firstSlide.count()) {
      await firstSlide.click();
      await page.waitForTimeout(600);
    }
    const screenshot = await page.screenshot({ path: `outputs/customer-cases/${name}-source.png`, animations: 'disabled' });
    const filename = name === 'urbanite' ? 'urbanite-live.webp' : `${name}.webp`;
    await sharp(screenshot).resize({ width: 1440, withoutEnlargement: true }).webp({ quality: 86 }).toFile(`public/card/cases/${filename}`);
    sources.push({ name, source: page.url(), title: await page.title(), capturedAt: new Date().toISOString(), image: `/card/cases/${filename}` });
    console.log(`Captured ${name}: ${page.url()}`);
    await page.close();
  }
} finally {
  await browser.close();
}
await writeFile(resolve('outputs/customer-cases/capture-sources.json'), JSON.stringify(sources, null, 2));
