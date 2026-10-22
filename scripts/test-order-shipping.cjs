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
let threshold = 2000, fail = false, writes = [];
const product = { id: 'p', name: 'Product', price: 500, inventory: 100, variants: [], available_shipping_methods: [] };
const db = { from(table) {
  let value;
  const chain = {
    select: () => chain, eq: () => chain, in: () => chain, like: () => chain, order: () => chain, limit: () => chain, is: () => chain,
    insert: data => { value = data; writes.push({ table, data }); return chain; },
    update: data => { value = data; writes.push({ table, data }); return chain; },
    maybeSingle: async () => ({ data: table === 'site_settings' ? { free_shipping_threshold: threshold, shipping_fees: [{ name: '宅配到府', fee: 80 }] } : null, error: fail && table === 'site_settings' ? { message: 'offline' } : null }),
    single: async () => ({ data: { id: 'order', order_no: 'test', ...value }, error: null }),
    then: done => Promise.resolve({ data: table === 'products' && !value ? [product] : [], count: 0, error: null }).then(done),
  }; return chain;
} };
const json = (data, init) => { const res = Response.json(data, init); res.cookies = { set() {} }; return res; };
const route = load('app/api/orders/route.ts', {
  'next/server': { NextResponse: { json }, after() {} },
  '@/lib/supabase/server': { getAdminUser: async () => null, getSessionUser: async () => null },
  '@/lib/shop': { shopAdminClient: async () => db, getCurrentShop: async () => ({ id: 'a' }), isPlatformShop: () => true, shopUrl: () => '' },
  '@/lib/shipping': shipping, '@/lib/product-price': load('lib/product-price.ts'), '@/lib/campaign': { isCampaignLive: () => true },
  '@/lib/discount': { evaluateCoupon: () => { throw new Error('No coupon'); } },
  '@/lib/loyalty': { consumeCredit() {}, creditQuote: async () => null },
  '@/lib/newebpay-logistics': { isStorePickup: () => false, shipTypeFromMethod: () => '' },
  '@/lib/order-status': { deriveStatuses: () => ({}) },
  '@/lib/payment': { initialOrderStatus: () => '待出貨', isCollectOnDelivery: () => false, isOnlinePayment: () => false },
  '@/lib/order-access-token': { createOrderAccessToken: () => 'token', orderAccessCookieName: () => 'access', ORDER_ACCESS_MAX_AGE: 60 },
  '@/lib/supabase/admin': { createAdminClient: () => db },
  '@/lib/order-email': { sendOrderEmails() {} }, '@/lib/shop-line': { notifyShopOrder() {} },
  '@/lib/site-url': { getConfiguredSiteUrl: () => 'https://shop.test' }, '@/lib/order-notification-kick': { kickOrderNotifications() {} },
});
const request = patch => new Request('https://shop.test/api/orders', { method: 'POST', body: JSON.stringify({ customer_name: 'Buyer', email: 'buyer@example.invalid', shipping_method: '宅配到府', payment_method: '轉帳匯款', items: [{ productId: 'p', variant: '標準款', quantity: 3 }], ...patch }) });
(async () => {
  for (const [policy, expected] of [[2000, 80], [1500, 0], [3000, 80], [0, 0], [null, 80], [undefined, 80]]) {
    threshold = policy; writes = [];
    const res = await route.POST(request({ shipping: 0, free_shipping_threshold: 0, expected_shipping: expected }));
    assert.equal(res.status, 201);
    const data = await res.json(); assert.equal(data.shipping, expected); assert.equal(data.total, 1500 + expected);
  }
  threshold = 3000; writes = [];
  const stale = await route.POST(request({ expected_shipping: 0 }));
  assert.equal(stale.status, 409); assert.equal((await stale.json()).code, 'SHIPPING_CHANGED'); assert.equal(writes.length, 0);
  fail = true;
  assert.equal((await route.POST(request({ expected_shipping: 80 }))).status, 503); assert.equal(writes.length, 0);
  console.log('Order shipping: authoritative DB threshold, custom fees, zero/disabled/default policies, forged client amounts, stale quote rejection and read failure before writes passed. Database mocked.');
})().catch(error => { console.error(error); process.exitCode = 1; });
