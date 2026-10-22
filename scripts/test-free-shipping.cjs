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
const shipping = load('lib/shipping.ts');
const { computeShipping, resolveFreeShippingThreshold: resolve, freeShippingNotice, isFreeShippingThreshold: valid } = shipping;
assert.equal(resolve(null), 2000); assert.equal(resolve({}), 2000);
assert.equal(resolve({ free_shipping_threshold: null }), null);
assert.equal(resolve({ free_shipping_threshold: 0 }), 0);
assert.equal(resolve({ free_shipping_threshold: 1500 }), 1500);
for (const value of [-1, 1.5, '1500', true, {}, [], NaN, Infinity, 1_000_000_001]) {
  assert.equal(valid(value), false); assert.equal(resolve({ free_shipping_threshold: value }), 2000);
}
const products = [{ id: 'paid', shipping_fee_overrides: { home: 80 } }, { id: 'free', available_shipping_methods: ['免運'] }];
const cart = [{ productId: 'paid' }, { productId: 'free' }];
for (const [threshold, below, at] of [[1500, 1499, 1500], [3000, 2999, 3000], [1, .5, 1]]) {
  assert.equal(computeShipping(below, cart, products, 'home', 120, threshold), 80);
  assert.equal(computeShipping(at, cart, products, 'home', 120, threshold), 0);
}
assert.equal(computeShipping(2000, cart, products), 0);
assert.equal(computeShipping(2000, cart, products, 'home', 120, 3000), 80);
assert.equal(computeShipping(9000, cart, products, 'home', 120, null), 80);
assert.equal(computeShipping(1, cart, products, 'home', 120, 0), 0);
assert.equal(computeShipping(0, cart, products, 'home', 120, null), 0);
assert.equal(computeShipping(1, [{ productId: 'free' }], products, 'home', 120, null), 0);
assert.equal(freeShippingNotice({ free_shipping_threshold: 1500 }), '全店消費滿 $1,500 免運費');
assert.equal(freeShippingNotice({ free_shipping_threshold: 0 }), '全店免運費');
assert.equal(freeShippingNotice({ free_shipping_threshold: null }), '');

(async () => {
  const blocks = load('lib/storefront-blocks.ts');
  const templates = load('lib/storefront-template.ts', { './storefront-blocks': blocks });
  const ratios = load('lib/banner-ratio.ts');
  const theme = load('lib/site-theme.ts', { './storefront-template': templates, './banner-ratio': ratios });
  const state = load('lib/site-theme-state.ts', { './site-theme': theme });
  const rows = new Map([['a', { id: 1, logo_url: 'a-logo', free_shipping_threshold: 2000 }], ['b', { id: 2, logo_url: 'b-logo', free_shipping_threshold: 5000 }]]);
  let admin = null, shop = 'a', fail = false, writes = 0;
  const route = load('app/api/settings/route.ts', {
    'next/server': { NextResponse: { json: (data, init) => Response.json(data, init) } },
    'next/cache': { revalidateTag() {} }, '@/lib/supabase/server': { getAdminUser: async () => admin },
    '@/lib/promo-notices': load('lib/promo-notices.ts'), '@/lib/shipping': shipping,
    '@/lib/site-theme': theme, '@/lib/site-theme-state': state, '@/lib/banner-ratio': ratios,
    '@/lib/shop': {
      getCurrentShop: async () => ({ name: shop, slug: shop }), isPlatformShop: () => false,
      shopAdminClient: async () => ({ from(table) {
        assert.equal(table, 'site_settings'); let update;
        const chain = { select: () => chain,
          upsert: (value, options) => { assert.equal(options.onConflict, 'shop_id'); update = value; return chain; },
          maybeSingle: async () => ({ data: rows.get(shop), error: fail ? { message: 'offline' } : null }),
          single: async () => { if (fail) return { error: { message: 'offline' } }; writes++; rows.set(shop, { ...rows.get(shop), ...update }); return { data: rows.get(shop) }; },
        }; return chain;
      } }),
    },
  });
  const request = body => new Request('https://shop.test/api/settings', { method: 'PATCH', body: JSON.stringify(body) });
  assert.equal((await route.PATCH(request({ free_shipping_threshold: 0 }))).status, 401); assert.equal(writes, 0);
  admin = { id: 'owner' };
  for (const value of [-1, 1.5, '0', true, {}, 1_000_000_001]) assert.equal((await route.PATCH(request({ free_shipping_threshold: value }))).status, 400);
  assert.equal(writes, 0);
  for (const value of [1500, 0, null]) {
    assert.equal((await route.PATCH(request({ free_shipping_threshold: value, shop_id: 'b' }))).status, 200);
    assert.equal((await (await route.GET()).json()).free_shipping_threshold, value);
    assert.equal(rows.get('a').logo_url, 'a-logo'); assert.equal(rows.get('b').free_shipping_threshold, 5000);
  }
  fail = true;
  assert.equal((await route.PATCH(request({ free_shipping_threshold: 3000 }))).status, 400);
  assert.equal(rows.get('a').free_shipping_threshold, null);
  assert.equal((await route.GET()).status, 503);
  console.log('Free shipping: defaults, thresholds, disabled/zero, mixed-item fees, validation, admin-only per-shop settings, persistence and read/write errors passed. Database mocked.');
})().catch(error => { console.error(error); process.exitCode = 1; });
