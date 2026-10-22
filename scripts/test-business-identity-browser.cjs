/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium, webkit } = require('C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = process.env.TEST_ORIGIN || 'http://localhost:3015';
const out = path.join(__dirname, '../outputs/business-identity');
fs.mkdirSync(out, { recursive: true });
(async () => {
  for (const engine of ['chrome','webkit']) {
    const browser = engine === 'chrome' ? await chromium.launch({ channel: 'chrome', headless: true }) : await webkit.launch({ headless: true });
    for (const width of engine === 'chrome' ? [320,390,1440] : [390]) {
      const page = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
      let owned = [], isAdmin = false, loggedIn = true, saved = null;
      await page.route('**/api/me', route => route.fulfill({ json: loggedIn ? { email:'owner@example.invalid',name:'店主',isAdmin,shops:owned } : { user:null } }));
      await page.route('**/api/profile-card/setup**', async route => {
        if (route.request().method() === 'POST') { saved = route.request().postDataJSON(); await route.fulfill({ status:400, json:{ error:'測試儲存，未寫入資料庫' } }); }
        else await route.fulfill({ json:{ok:true} });
      });
      for (const app of [false,true]) {
        for (const mode of ['none','current','other','admin']) {
          isAdmin = mode === 'admin';
          owned = ['current','other'].includes(mode) ? [{slug:'my-store',name:'我的店',current:mode==='current',adminUrl:'https://my-store.urbanite.com.tw/admin'}] : [];
          await page.goto(`${origin}/business-identity-test${app?'?app=1':''}`);
          await page.waitForLoadState('networkidle');
          await page.getByRole('button',{name:'開啟選單'}).click();
          const drawer = page.getByRole('dialog');
          if (mode === 'none') {
            await drawer.getByRole('link',{name:'升級官網',exact:true}).waitFor();
            assert.equal(await drawer.getByRole('link',{name:'升級官網',exact:true}).getAttribute('href'),'/card/pricing');
            assert.equal(await drawer.getByRole('link',{name:/進入官網後台/}).count(),0);
          } else {
            assert.equal(await drawer.getByRole('link',{name:/進入官網後台/}).count(),1);
            assert.equal(await drawer.getByRole('link',{name:'升級官網',exact:true}).count(),0);
            assert.equal(await drawer.getByRole('link',{name:/進入官網後台/}).getAttribute('href'),mode==='admin'?'/admin':'https://my-store.urbanite.com.tw/admin');
          }
          const overflow = await drawer.evaluate(el=>el.scrollWidth>el.clientWidth);
          assert.equal(overflow,false);
          if (engine==='chrome' && width===390 && !app && ['none','current'].includes(mode)) await page.screenshot({path:path.join(out,`menu-${mode}.png`)});
          await page.keyboard.press('Escape');
          await page.waitForFunction(()=>document.querySelector('[aria-label="開啟選單"]')?.getAttribute('aria-expanded')==='false');
          assert.equal(await page.getByRole('button',{name:'開啟選單'}).getAttribute('aria-expanded'),'false');
        }
      }
      await page.getByRole('heading',{name:'確認店家名稱與網址'}).waitFor();
      const name = page.getByPlaceholder('輸入店家名稱');
      await name.fill('新的店名');
      assert.equal(await name.evaluate(el=>getComputedStyle(el).fontSize),'16px');
      const slug = page.getByPlaceholder('shop-name');
      await slug.fill('new-store');
      await page.getByText('可以使用',{exact:true}).waitFor();
      for (const text of ['urbanite.com.tw/@new-store','urbanite.com.tw/@new-store/book','new-store.urbanite.com.tw']) assert.ok(await page.getByText(text,{exact:true}).isVisible());
      await page.getByRole('button',{name:'下一步'}).click();
      await page.getByText('測試儲存，未寫入資料庫').waitFor();
      assert.equal(saved.display_name,'新的店名'); assert.equal(saved.slug,'new-store');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      if(engine==='chrome' && width===390) await page.screenshot({path:path.join(out,'setup-mobile.png'),fullPage:true});
      loggedIn=false;
      await page.goto(`${origin}/business-identity-test`); await page.waitForLoadState('networkidle');
      await page.getByRole('button',{name:'開啟選單'}).click();
      assert.equal(await page.getByRole('dialog').getByRole('link',{name:'升級官網',exact:true}).count(),0);
      await page.close();
    }
    await browser.close();
  }
  console.log('Shared identity browser passed: Chrome 320/390/1440, WebKit390, both menus, own/current shop, admin, upgrade, signed-out, Escape, shared URL previews and mocked submit.');
})().catch(error=>{console.error(error);process.exit(1);});
