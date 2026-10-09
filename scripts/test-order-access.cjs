const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const crypto = require('node:crypto');
let checks = 0;
function equal(a, b) { assert.deepEqual(a, b); checks++; }
function load(file, mocks) {
  const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', js)(name => {
    if (!Object.hasOwn(mocks, name)) throw new Error(`Unexpected import ${name}`);
    return mocks[name];
  }, mod, mod.exports);
  return mod.exports;
}
async function main() {
  const oldSecret = process.env.ORDER_ACCESS_SECRET;
  process.env.ORDER_ACCESS_SECRET = 'test-only-signing-secret';
  try {
    const tokens = load('lib/order-access-token.ts', { 'node:crypto': crypto });
    const now = Date.now();
    const token = tokens.createOrderAccessToken('ORDER-A', now);
    equal(tokens.verifyOrderAccessToken(token, 'ORDER-A', now), true);
    equal(tokens.verifyOrderAccessToken(token, 'ORDER-B', now), false);
    equal(tokens.verifyOrderAccessToken(undefined, 'ORDER-A', now), false);
    equal(tokens.verifyOrderAccessToken(`${token}x`, 'ORDER-A', now), false);
    equal(tokens.verifyOrderAccessToken(token.replace(/^./, 'x'), 'ORDER-A', now), false);
    equal(tokens.verifyOrderAccessToken(token, 'ORDER-A', now + tokens.ORDER_ACCESS_MAX_AGE * 1000), false);
    equal(tokens.verifyOrderAccessToken('x.y.z', 'ORDER-A', now), false);
    equal(tokens.verifyOrderAccessToken('x'.repeat(1025), 'ORDER-A', now), false);
    process.env.ORDER_ACCESS_SECRET = 'rotated-secret';
    equal(tokens.verifyOrderAccessToken(token, 'ORDER-A', now), false);
    process.env.ORDER_ACCESS_SECRET = 'test-only-signing-secret';
    equal(tokens.orderAccessCookieName('ORDER-A') !== tokens.orderAccessCookieName('ORDER-B'), true);

    let user = null, cookie;
    const access = load('lib/order-access.ts', {
      'next/headers': { cookies: async () => ({ get: name => cookie?.name === name ? { value: cookie.value } : undefined }) },
      '@/lib/supabase/server': { getSessionUser: async () => user },
      './order-access-token': tokens,
    });
    const guest = { order_no: 'ORDER-A', user_id: null };
    const member = { order_no: 'ORDER-A', user_id: 'member-a' };
    equal(await access.canAccessOrder(guest), false);
    cookie = { name: tokens.orderAccessCookieName('ORDER-A'), value: token };
    equal(await access.canAccessOrder(guest), true);
    equal(await access.canAccessOrder(member), false);
    user = { id: 'member-b' };
    equal(await access.canAccessOrder(member), false);
    user = { id: 'member-a' }; cookie = undefined;
    equal(await access.canAccessOrder(member), true);
    equal(await access.canAccessOrder(guest), false);

    let record = { ...guest, paid: false, status: '尚未付款', total: 100, payment_method: 'credit_card', email: 'private@example.test', items: [] };
    let builds = 0;
    const mocks = {
      '@/lib/order-access': access,
      '@/lib/shop': { getCurrentShop: async () => ({ id: 'platform' }), isPlatformShop: () => true, shopAdminClient: async () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: record }) }) }) }) }) },
      'next/server': { NextResponse: { json: (data, init) => Response.json(data, init) } },
      '@/lib/newebpay': { buildMPGParams: async () => { builds++; return { params: {}, action: 'https://example.test/gateway' }; } },
    };
    const status = load('app/api/orders/status/route.ts', mocks);
    const checkout = load('app/api/payment/newebpay/checkout/route.ts', mocks);
    const request = new Request('https://example.test/api?order_no=ORDER-A&order=ORDER-A');
    equal((await status.GET(request)).status, 404);
    equal((await checkout.GET(request)).status, 404);
    equal(builds, 0);
    cookie = { name: tokens.orderAccessCookieName('ORDER-A'), value: token };
    const response = await status.GET(request);
    equal(response.status, 200);
    equal(response.headers.get('cache-control'), 'private, no-store');
    equal(Object.keys(await response.json()).sort(), ['order_no', 'paid', 'payment_method', 'status', 'total']);
    equal((await checkout.GET(request)).status, 200);
    equal(builds, 1);
    record = { ...record, user_id: 'member-b' };
    equal((await status.GET(request)).status, 404);
    equal((await checkout.GET(request)).status, 404);
    equal(builds, 1);
    user = { id: 'member-b' }; cookie = undefined;
    equal((await status.GET(request)).status, 200);
    equal((await checkout.GET(request)).status, 200);
    equal(builds, 2);
    record = null;
    equal((await status.GET(request)).status, 404);
    equal((await checkout.GET(request)).status, 404);
    console.log(`Passed ${checks} order-access checks; no live orders or gateway requests.`);
  } finally {
    if (oldSecret === undefined) delete process.env.ORDER_ACCESS_SECRET; else process.env.ORDER_ACCESS_SECRET = oldSecret;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
