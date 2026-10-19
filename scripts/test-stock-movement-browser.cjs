/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { chromium, webkit } = require(process.argv[2] || 'playwright');
const url = process.argv[3];
if (!url) throw new Error('Provide a temporary local route mounting scripts/fixtures/StockMovementFixture.tsx');

(async () => {
  for (const [engine, width] of [[chromium, 390], [webkit, 390], [chromium, 1440]]) {
    const browser = await engine.launch({ headless: true, ...(engine === chromium ? { channel: 'chrome' } : {}) });
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    try {
      const errors = [];
      const submitted = [];
      let fail = false;
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/api/**', async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        if (pathname === '/api/stock-movements' && request.method() === 'POST') {
          const body = request.postDataJSON();
          submitted.push(body);
          return fail ? route.fulfill({ status: 400, json: { error: '品項已變更，請重新選擇' } })
            : route.fulfill({ status: 201, json: { id: `movement-${submitted.length}`, created_at: new Date().toISOString(), ...body } });
        }
        return route.fulfill({ json: pathname === '/api/me' ? null : [] });
      });
      const click = (name) => page.getByRole('button', { name, exact: true }).click();
      const table = page.locator('table').filter({ has: page.getByRole('columnheader', { name: '型號', exact: true }) });
      const row = table.locator('tbody tr').first();
      const variant = row.getByRole('button', { name: '選擇規格 / 尺寸', exact: true });
      const choose = async (id) => {
        await row.getByRole('button').first().click();
        await page.getByRole('button', { name: new RegExp(`^${id}\\s`) }).click();
        assert.equal(await row.getByRole('button').first().innerText(), id);
      };
      const submit = async () => {
        await row.getByRole('spinbutton').first().fill('4');
        await click('登錄入庫單');
        await row.getByRole('button', { name: '選擇型號', exact: true }).waitFor();
      };
      await page.goto(`${url}?section=inventory`);
      await click('入庫 / 出庫');
      await page.getByLabel('* 入庫人', { exact: true }).fill('Test operator');
      for (const [id, key] of [['plain', ''], ['default-variant', ''], ['single', '100ml'], ['color-only', '藍'], ['size-only', 'M'], ['complex', '紅 / M / 麻'], ['same-b', '']]) {
        await choose(id);
        if (id === 'plain' || id === 'same-b') assert.equal(await variant.isDisabled(), true);
        if (['color-only', 'size-only', 'complex'].includes(id)) {
          const before = submitted.length;
          await click('登錄入庫單');
          await page.getByText(new RegExp('請選擇 .* 的完整規格 / 尺寸')).waitFor();
          await click('確定');
          assert.equal(submitted.length, before, 'Ambiguous variant must not submit');
          await variant.click();
          await page.getByRole('button').filter({ has: page.getByText(key, { exact: true }) }).click();
        }
        await submit();
        assert.equal(submitted.at(-1).product_id, id);
        assert.equal(submitted.at(-1).variant_key, key);
        assert.equal(submitted.at(-1).quantity, 4);
      }
      await choose('same-a');
      assert.match(await row.innerText(), /庫存 5/);
      await choose('default-variant');
      assert.match(await row.innerText(), /庫存 9/, 'Empty-options default variant stock must also update');
      await choose('size-only');
      await variant.click();
      await page.getByRole('button').filter({ has: page.getByText('M', { exact: true }) }).click();
      assert.match(await row.innerText(), /庫存 7/);
      await choose('single');
      fail = true;
      await click('登錄入庫單');
      await page.getByText('品項已變更，請重新選擇', { exact: true }).waitFor();
      await click('確定');
      assert.equal(await row.getByRole('button').first().innerText(), 'single');
      assert.equal(await variant.innerText(), '100ml');
      await variant.scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(os.tmpdir(), `urbanite-stock-movement-${engine.name()}-${width}.png`) });
      assert.deepEqual(errors, []);
      console.log(`${engine.name()} ${width}: no specs/default/single/color-only/size-only/multi-dimension, exact same-name IDs, ambiguity blocking, stock feedback and API rejection retention passed. API writes mocked.`);
    } catch (error) {
      console.error((await page.locator('body').innerText()).slice(-5000));
      throw error;
    } finally { await browser.close(); }
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
