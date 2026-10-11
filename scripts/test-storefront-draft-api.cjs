const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file, imports = {}) {
  const mod = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', js)((name) => { if (name in imports) return imports[name]; throw new Error(`Unexpected import ${name}`); }, mod, mod.exports);
  return mod.exports;
}
(async () => {
  const blocks = load('lib/storefront-blocks.ts');
  const design = load('lib/storefront-template.ts', { './storefront-blocks': blocks });
  const theme = load('lib/site-theme.ts', { './storefront-template': design });
  const state = load('lib/site-theme-state.ts', { './site-theme': theme });
  let admin = null, readsFail = false, writes = 0, invalidations = 0;
  let row = { site_theme: theme.resolveSiteTheme({ storefront: { enabled: true, title: 'Public' } }) };
  const db = { from: (table) => {
    assert.equal(table, 'site_settings');
    const chain = {
      select: () => chain,
      single: async () => ({ data: row, error: null }),
      maybeSingle: async () => ({ data: row, error: readsFail ? { message: 'failed' } : null }),
      upsert: (update, options) => { assert.equal(options.onConflict, 'shop_id'); row = { ...row, ...update }; writes++; return chain; },
    };
    return chain;
  } };
  const route = load('app/api/settings/route.ts', {
    'next/server': { NextResponse: { json: (data, options) => Response.json(data, options) } },
    '@/lib/supabase/server': { getAdminUser: async () => admin },
    'next/cache': { revalidateTag: () => { invalidations++; } },
    '@/lib/site-theme': theme, '@/lib/site-theme-state': state,
    '@/lib/shop': { shopAdminClient: async () => db, getCurrentShop: async () => ({ name: 'Shop', slug: 'shop' }), isPlatformShop: () => false },
  });
  const request = (body) => new Request('https://shop.test/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const draft = { storefront: { enabled: true, title: 'Secret', blocks: [{ ...blocks.createBlock('announcement', 'a'), title: 'Private', href: 'javascript:alert(1)' }] } };
  assert.equal((await route.PATCH(request({ site_theme_draft: draft }))).status, 401);
  assert.equal(writes, 0);
  admin = { id: 'owner' };
  assert.equal((await route.PATCH(request({ site_theme_draft: draft }))).status, 200);
  assert.equal(row.site_theme.storefront.title, 'Public');
  assert.equal(row.site_theme.draft.storefront.title, 'Secret');
  assert.equal(row.site_theme.draft.storefront.blocks[0].href, '');
  assert.equal(invalidations, 0);
  const publicData = await (await route.GET()).json();
  assert.equal(publicData.site_theme.storefront.title, 'Public');
  assert.equal('draft' in publicData.site_theme, false);
  readsFail = true;
  assert.equal((await route.PATCH(request({ site_theme_draft: draft }))).status, 500);
  assert.equal(writes, 1);
  readsFail = false;
  assert.equal((await route.PATCH(request({ site_theme_draft: draft, site_theme: draft }))).status, 400);
  assert.equal((await route.PATCH(request({ site_theme: draft }))).status, 200);
  assert.equal('draft' in row.site_theme, false);
  assert.equal(invalidations, 1);
  assert.equal((await (await route.GET()).json()).site_theme.storefront.title, 'Secret');
  console.log('Draft settings API: authorization, sanitization, public isolation, read failures and publication passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
