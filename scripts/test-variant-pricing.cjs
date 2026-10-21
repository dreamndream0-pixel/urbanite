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
const pricing = load('lib/product-price.ts');
const product = { id: 'pack', name: 'Pack', price: 100, inventory: 40, specs: [{ name: '入數', options: ['1入', '5入', '10入', '贈品'] }], variants: [
  { options: ['1入'], inventory: 10, price: 100 }, { options: ['5入'], inventory: 10, price: 450, cost: 200, location: 'A1' },
  { options: ['10入'], inventory: 10 }, { options: ['贈品'], inventory: 10, price: 0 },
] };
assert.equal(pricing.productPrice(product, '5入'), 450);
assert.equal(pricing.productPrice(product, '10入'), 100);
assert.equal(pricing.productPrice(product, '贈品'), 0);
assert.equal(pricing.variantPrice(product, { price: null }), 100);
assert.equal(pricing.formatProductPrice(product, String), '0 起');
assert.equal(pricing.formatProductPrice({ price: 100, variants: [] }, String), '100');
assert.equal(pricing.productPrice({ ...product, variants: [{ options: ['標準款'], price: 90 }] }, '標準款'), 90);
assert.equal(pricing.productPrice({ ...product, variants: [{ options: [], price: 90 }] }, '標準款'), 90);
assert.deepEqual(pricing.repriceCart([{ productId: 'pack', variant: '5入', price: 1, quantity: 2 }], [product]), [{ productId: 'pack', variant: '5入', price: 450, quantity: 2 }]);
for (const price of [-1, NaN, Infinity, '', '100', false, Number.MAX_SAFE_INTEGER + 1]) {
  assert.ok(pricing.productPriceError({ price }));
  assert.ok(pricing.productPriceError({ variants: [{ options: ['5入'], price }] }));
}
for (const price of [0, 100, 450]) assert.equal(pricing.productPriceError({ price, variants: [{ options: ['5入'], price }] }), null);
assert.equal(pricing.productPriceError({ variants: [{ options: ['1入'] }, { options: ['5入'], price: null }] }), null);

(async () => {
  let admin = { id: 'admin' };
  let rows = [structuredClone(product)];
  let writes = [];
  const db = { from(table) {
    let data;
    let patch;
    const chain = {
      select: () => chain, eq: () => chain, in: () => chain, like: () => chain, order: () => chain, limit: () => chain, is: () => chain,
      insert: (value) => { data = value; writes.push({ table, value }); return chain; },
      update: (value) => { patch = value; writes.push({ table, value }); return chain; },
      maybeSingle: async () => ({ data: table === 'site_settings' ? { shipping_fees: [] } : null, error: null }),
      single: async () => ({ data: { id: 'created', ...data, ...patch }, error: null }),
      then: (done) => Promise.resolve({ data: table === 'products' && !patch ? rows : [], count: 0, error: null }).then(done),
    };
    return chain;
  } };
  const json = (data, init) => { const res = Response.json(data, init); res.cookies = { set() {} }; return res; };
  const shared = {
    'next/server': { NextResponse: { json }, after: () => {} },
    '@/lib/supabase/server': { getAdminUser: async () => admin, getSessionUser: async () => null },
    '@/lib/shop': { shopAdminClient: async () => db, requireCurrentShop: async () => ({ slug: 'shop' }), isPlatformShop: () => true, getCurrentShop: async () => ({ id: 'shop' }), shopUrl: () => '' },
    '@/lib/campaign': { isCampaignLive: () => true },
    '@/lib/product-price': pricing,
    '@/lib/product-order': load('lib/product-order.ts'),
  };
  const create = load('app/api/products/route.ts', shared);
  const edit = load('app/api/products/[id]/route.ts', shared);
  const req = (body) => new Request('https://shop.test/api/products', { method: 'POST', body: JSON.stringify(body) });
  assert.equal((await create.POST(req(product))).status, 201);
  assert.equal(writes.at(-1).value.variants[1].price, 450);
  assert.equal((await edit.PATCH(req({ variants: product.variants }), { params: Promise.resolve({ id: 'pack' }) })).status, 200);
  assert.equal(writes.at(-1).value.variants[1].price, 450);
  const before = writes.length;
  for (const price of [-1, '450']) {
    const invalid = { ...product, variants: [{ options: ['5入'], price }] };
    assert.equal((await create.POST(req(invalid))).status, 400);
    assert.equal((await edit.PATCH(req(invalid), { params: Promise.resolve({ id: 'pack' }) })).status, 400);
  }
  assert.equal(writes.length, before);
  admin = null;
  assert.equal((await create.POST(req(product))).status, 401);
  assert.equal((await edit.PATCH(req(product), { params: Promise.resolve({ id: 'pack' }) })).status, 401);

  const orders = load('app/api/orders/route.ts', { ...shared,
    '@/lib/discount': { evaluateCoupon: () => { throw new Error('No coupon in test'); } },
    '@/lib/loyalty': { consumeCredit() {}, creditQuote: async () => null },
    '@/lib/newebpay-logistics': { isStorePickup: () => false, shipTypeFromMethod: () => '' },
    '@/lib/order-status': { deriveStatuses: () => ({}) },
    '@/lib/payment': { initialOrderStatus: () => '待出貨', isCollectOnDelivery: () => false, isOnlinePayment: () => false },
    '@/lib/order-access-token': { createOrderAccessToken: () => 'token', orderAccessCookieName: () => 'access', ORDER_ACCESS_MAX_AGE: 60 },
    '@/lib/shipping': { computeShipping: () => 0, resolveMethodFee: () => 0 },
    '@/lib/supabase/admin': { createAdminClient: () => db },
    '@/lib/order-email': { sendOrderEmails() {} }, '@/lib/shop-line': { notifyShopOrder() {} },
    '@/lib/site-url': { getConfiguredSiteUrl: () => 'https://shop.test' }, '@/lib/order-notification-kick': { kickOrderNotifications() {} },
  });
  const orderReq = (items) => req({ customer_name: 'Buyer', email: 'buyer@example.invalid', shipping_method: '宅配到府', payment_method: '轉帳匯款', items });
  writes = [];
  const response = await orders.POST(orderReq([
    { productId: 'pack', variant: '1入', quantity: 1, price: 1 },
    { productId: 'pack', variant: '5入', quantity: 2, price: 1 },
    { productId: 'pack', variant: '10入', quantity: 1, price: 1 },
    { productId: 'pack', variant: '贈品', quantity: 1, price: 999 },
  ]));
  assert.equal(response.status, 201);
  const order = await response.json();
  assert.equal(order.subtotal, 1100);
  assert.equal(order.total, 1100);
  assert.deepEqual(order.items.map((item) => item.price), [100, 450, 100, 0]);
  const stock = writes.find((w) => w.table === 'products').value;
  assert.equal(stock.variants[1].price, 450);
  assert.equal(stock.variants[1].location, 'A1');
  assert.equal(stock.variants[1].cost, 200);
  assert.deepEqual(stock.variants.map((v) => v.inventory), [9, 8, 9, 9]);
  assert.deepEqual(writes.find((w) => w.table === 'stock_movements').value.map((m) => m.unit_price), [100, 450, 100, 0]);
  for (const variant of ['', '不存在', '5入 / M']) assert.equal((await orders.POST(orderReq([{ productId: 'pack', variant, quantity: 1 }]))).status, 409);
  rows = [{ ...product, variants: [product.variants[1], product.variants[1]] }];
  assert.equal((await orders.POST(orderReq([{ productId: 'pack', variant: '5入', quantity: 1 }]))).status, 409);
  rows = [{ ...product, variants: [], specs: [] }];
  const legacy = await orders.POST(orderReq([{ productId: 'pack', variant: '標準款', quantity: 2, price: 1 }]));
  assert.equal((await legacy.json()).total, 200);

  const restored = [];
  const restoreDb = { from(table) {
    let patch;
    const chain = {
      select: () => chain, eq: () => chain, in: () => chain,
      update: (value) => { patch = value; restored.push({ table, value }); return chain; },
      insert: (value) => { restored.push({ table, value }); return chain; },
      maybeSingle: async () => ({ data: { ...order, stock_committed: true } }),
      then: (done) => Promise.resolve({ data: table === 'products' && !patch ? [{ ...product, price: 999, variants: stock.variants }] : [], error: null }).then(done),
    }; return chain;
  } };
  await load('lib/inventory.ts').restoreOrderStock(restoreDb, 'created');
  const reversed = restored.find((w) => w.table === 'products').value;
  assert.deepEqual(reversed.variants.map((v) => v.inventory), [10, 10, 10, 10]);
  assert.equal(reversed.variants[1].price, 450);
  assert.deepEqual(restored.find((w) => w.table === 'stock_movements').value.map((m) => m.unit_price), [100, 450, 100, 0]);
  console.log('Variant pricing: base fallback, explicit zero, invalid values, authenticated product create/edit, tampered order prices, exact variant matching, totals, stock and metadata preservation passed. Database writes mocked.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
