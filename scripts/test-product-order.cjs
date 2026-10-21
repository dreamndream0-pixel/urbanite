/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file, mocks = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', code)((name) => { if (name in mocks) return mocks[name]; throw new Error(`Unexpected import ${name}`); }, mod, mod.exports);
  return mod.exports;
}
const order = load('lib/product-order.ts');
const prices = load('lib/product-price.ts');
const rows = [
  { id: 'old-main', sort_order: 0, campaign_id: null, created_at: '2026-01-01T00:00:00Z' },
  { id: 'manual', sort_order: -5, campaign_id: null, created_at: '2025-01-01T00:00:00Z' },
  { id: 'campaign-a', sort_order: -2, campaign_id: 'a' },
  { id: 'campaign-b', sort_order: -100, campaign_id: 'b' },
];
assert.equal(order.nextProductSortOrder([]), 0);
assert.equal(order.nextProductSortOrder(rows), -6);
assert.equal(order.nextProductSortOrder(rows, 'a'), -3);
assert.equal(order.nextProductSortOrder(rows, 'new'), 0);
assert.equal([...rows.slice(0, 2)].sort(order.compareProductOrder)[0].id, 'manual');
assert.ok(order.compareProductOrder({ sort_order: 0, created_at: '2026-02-01' }, rows[0]) < 0);

(async () => {
  let admin = null; let failure = false; let reads = 0; const inserted = [];
  const db = { from(table) {
    assert.equal(table, 'products'); let campaignId = null; let payload;
    const chain = { select: () => chain, order: () => chain, limit: () => chain,
      eq: (key, value) => { assert.equal(key, 'campaign_id'); campaignId = value; return chain; },
      is: (key, value) => { assert.equal(key, 'campaign_id'); assert.equal(value, null); campaignId = null; return chain; },
      insert: (value) => { payload = value; return chain; },
      single: async () => { inserted.push(payload); rows.push(payload); return { data: payload, error: null }; },
      then: (done) => { reads++; return Promise.resolve({ data: rows.filter((row) => row.campaign_id === campaignId).sort(order.compareProductOrder).slice(0, 1), error: failure ? { message: 'Database unavailable' } : null }).then(done); },
    }; return chain;
  } };
  const route = load('app/api/products/route.ts', {
    'next/server': { NextResponse: { json: (data, init) => Response.json(data, init) } },
    '@/lib/supabase/server': { getAdminUser: async () => admin }, '@/lib/campaign': { isCampaignLive: () => true },
    '@/lib/product-price': prices, '@/lib/product-order': order,
    '@/lib/shop': { shopAdminClient: async () => db, requireCurrentShop: async () => ({ id: 'shop-a', slug: 'shop-a' }), isPlatformShop: () => false },
  });
  const request = (body) => new Request('https://shop.invalid/api/products', { method: 'POST', body: JSON.stringify({ id: 'new', name: 'New product', price: 10, ...body }) });
  assert.equal((await route.POST(request({}))).status, 401); assert.equal(reads, 0);
  admin = { id: 'owner' };
  assert.equal((await route.POST(request({ sort_order: 0, insert_at_start: true }))).status, 201);
  assert.equal(inserted.at(-1).sort_order, -6); assert.equal(inserted.at(-1).id, 'shop-a-new');
  assert.equal((await route.POST(request({ id: 'new-a', campaign_id: 'a' }))).status, 201);
  assert.equal(inserted.at(-1).sort_order, -3);
  assert.equal((await route.POST(request({ id: 'manual-new', sort_order: 42 }))).status, 201);
  assert.equal(inserted.at(-1).sort_order, 42, 'An explicit manual position remains authoritative');
  failure = true;
  assert.equal((await route.POST(request({ id: 'fail', insert_at_start: true }))).status, 500);
  assert.equal(inserted.length, 3, 'A failed rank lookup must not insert at an arbitrary position');
  console.log('Product order: main/campaign head insertion, explicit manual ranks, tie dates, tenant ID prefix, authorization and read-failure no-write passed. Database operations mocked.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
