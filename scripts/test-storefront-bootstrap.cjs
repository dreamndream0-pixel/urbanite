/* eslint-disable @typescript-eslint/no-require-imports */
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
const ratios = load('lib/banner-ratio.ts');
const blocks = load('lib/storefront-blocks.ts');
const design = load('lib/storefront-template.ts', { './storefront-blocks': blocks });
const theme = load('lib/site-theme.ts', { './storefront-template': design, './banner-ratio': ratios });
const images = load('lib/store-image.ts');
const prior = process.env.NEXT_PUBLIC_SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://storage.example.test';
for (const url of ['/card/demo-fashion.webp', '/image.jpg?updated=1', 'https://storage.example.test/storage/v1/object/public/assets/banners/x.jpg']) assert.equal(images.canOptimizeStoreImage(url), true);
for (const url of ['//evil.test/image.jpg', '/api/private.jpg', '/account', 'https://other.example.test/image.jpg', 'http://storage.example.test/storage/v1/object/public/assets/x.jpg', 'https://storage.example.test/storage/v1/object/public/payment-proofs/x.jpg', 'data:image/png;base64,AA==']) assert.equal(images.canOptimizeStoreImage(url), false);
if (prior === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = prior;

(async () => {
  let shop = { id: 'shop-A', slug: 'shop-a', name: 'Shop A', status: 'active' };
  let failure = false;
  const calls = [];
  const snapshot = { id: 1, logo_url: '/logo.png', category_image_style: 'circle', site_theme: { bannerRatios: { 1: 'wide' }, draft: { storefront: { title: 'PRIVATE DRAFT' } } }, secret: 'DO NOT SERIALIZE' };
  const bootstrap = load('lib/storefront-bootstrap.ts', {
    'server-only': {}, './site-theme': theme,
    './shop': {
      getCurrentShop: async () => shop, isPlatformShop: () => false,
      scopedClient: (id) => { assert.equal(id, shop.id); return { from(table) {
        const chain = {
          select: (columns) => { calls.push({ table, columns, shop: id }); return chain; },
          eq: (field, value) => { assert.equal(field, 'active'); assert.equal(value, true); return chain; },
          order: async () => ({ data: [{ id: 'banner', image: '/banner.webp', active: true }], error: failure ? { message: 'failed' } : null }),
          maybeSingle: async () => ({ data: snapshot, error: failure ? { message: 'failed' } : null }),
        };
        return chain;
      } }; },
    },
  });
  const result = await bootstrap.getStorefrontBootstrap();
  assert.equal(result.settings.shop_name, 'Shop A');
  assert.equal(result.settings.site_theme.bannerRatios[1], 'wide');
  assert.equal(result.banners.length, 1);
  assert.equal(JSON.stringify(result).includes('PRIVATE DRAFT'), false);
  assert.equal(JSON.stringify(result).includes('DO NOT SERIALIZE'), false);
  assert.equal(calls.length, 2);
  failure = true;
  assert.equal(await bootstrap.getStorefrontBootstrap(), null);
  const count = calls.length;
  shop = { ...shop, status: 'suspended' };
  assert.equal(await bootstrap.getStorefrontBootstrap(), null);
  shop = null;
  assert.equal(await bootstrap.getStorefrontBootstrap(), null);
  assert.equal(calls.length, count);
  console.log('Storefront bootstrap: scoped public SSR fields, published theme only, failure/missing/suspended shop handling; image optimization allowlist passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
