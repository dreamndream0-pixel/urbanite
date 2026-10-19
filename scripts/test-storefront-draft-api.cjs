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
  const ratios = load('lib/banner-ratio.ts');
  const theme = load('lib/site-theme.ts', { './storefront-template': design, './banner-ratio': ratios });
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
    '@/lib/promo-notices': load('lib/promo-notices.ts'),
    '@/lib/banner-ratio': ratios,
    '@/lib/shop': { shopAdminClient: async () => db, getCurrentShop: async () => ({ name: 'Shop', slug: 'shop' }), isPlatformShop: () => false },
  });
  const request = (body) => new Request('https://shop.test/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const draft = { storefront: { enabled: true, title: 'Secret', blocks: [{ ...blocks.createBlock('announcement', 'a'), title: 'Private', href: 'javascript:alert(1)' }, { ...blocks.createBlock('carousel', 'c'), carouselRatio: 'square' }] } };
  assert.equal((await route.PATCH(request({ site_theme_draft: draft }))).status, 401);
  assert.equal((await route.PATCH(request({ banner_ratio: { group: 1, ratio: 'square' } }))).status, 401);
  assert.equal(writes, 0);
  admin = { id: 'owner' };
  assert.equal((await route.PATCH(request({ site_theme_draft: draft }))).status, 200);
  assert.equal(row.site_theme.storefront.title, 'Public');
  assert.equal(row.site_theme.draft.storefront.title, 'Secret');
  assert.equal(row.site_theme.draft.storefront.blocks[0].href, '');
  assert.equal(row.site_theme.draft.storefront.blocks[1].carouselRatio, 'square');
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
  assert.equal((await (await route.GET()).json()).site_theme.storefront.blocks[1].carouselRatio, 'square');
  row.site_theme = state.draftSiteTheme(
    { ...row.site_theme, bannerRatios: { 2: 'wide' } },
    { storefront: { enabled: true, title: 'Unsaved template draft' } },
  );
  for (const patch of [null, {}, { group: 0, ratio: 'wide' }, { group: 10, ratio: 'wide' }, { group: '1', ratio: 'wide' }, { group: 1, ratio: 'invalid' }]) {
    assert.equal((await route.PATCH(request({ banner_ratio: patch }))).status, 400);
  }
  assert.equal((await route.PATCH(request({ banner_ratio: { group: 1, ratio: 'square' }, site_theme: draft }))).status, 400);
  const before = writes;
  readsFail = true;
  assert.equal((await route.PATCH(request({ banner_ratio: { group: 1, ratio: 'square' } }))).status, 500);
  assert.equal(writes, before);
  readsFail = false;
  assert.equal((await route.PATCH(request({ banner_ratio: { group: 1, ratio: 'square' } }))).status, 200);
  assert.deepEqual(row.site_theme.bannerRatios, { 1: 'square', 2: 'wide' });
  assert.deepEqual(row.site_theme.draft.bannerRatios, { 1: 'square', 2: 'wide' });
  assert.equal(row.site_theme.storefront.title, 'Secret');
  assert.equal(row.site_theme.draft.storefront.title, 'Unsaved template draft');
  assert.equal((await route.PATCH(request({ site_theme_draft: draft }))).status, 200);
  assert.deepEqual(row.site_theme.draft.bannerRatios, { 1: 'square', 2: 'wide' });
  assert.equal((await route.PATCH(request({ site_theme: { ...draft, bannerRatios: { 1: 'portrait' } } }))).status, 200);
  assert.deepEqual(row.site_theme.bannerRatios, { 1: 'square', 2: 'wide' });
  assert.equal(row.site_theme.draft, undefined);
  assert.equal((await route.PATCH(request({ banner_ratio: { group: 1, ratio: 'auto' } }))).status, 200);
  assert.equal(row.site_theme.bannerRatios[1], 'auto');
  assert.equal(row.site_theme.bannerRatios[2], 'wide');
  console.log('Draft settings API: authorization, sanitization, public isolation, read failures and publication passed.');
  console.log('System banner ratios: authorization, validation, independent groups, failure safety and draft/publication preservation passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
