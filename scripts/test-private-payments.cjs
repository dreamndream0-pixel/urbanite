const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
let checks = 0;
const equal = (a, b) => { assert.deepEqual(a, b); checks++; };
function load(file, mocks = {}) {
  const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', js)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.startsWith('@/')) throw new Error(`Unmocked ${name}`);
    return require(name);
  }, mod, mod.exports);
  return mod.exports;
}
async function main() {
  const proof = load('lib/payment-proof.ts');
  const reference = 'private:payment-proofs/shop-a/order-a/random.png';
  equal(proof.paymentProofPath(reference, 'shop-a', 'order-a'), 'shop-a/order-a/random.png');
  equal(proof.paymentProofPath(reference, 'shop-b', 'order-a'), null);
  equal(proof.paymentProofPath(reference, 'shop-a', 'order-b'), null);
  for (const suffix of ['../evil.png', '%2fsecret.png', 'x.png?x=1', 'x.svg']) equal(proof.paymentProofPath(`private:payment-proofs/shop-a/order-a/${suffix}`, 'shop-a', 'order-a'), null);
  equal(proof.legacyPaymentProofPath('https://db.test/storage/v1/object/public/assets/payment-proofs/order-a-123.png', 'order-a', 'https://db.test'), 'payment-proofs/order-a-123.png');
  equal(proof.legacyPaymentProofPath('https://evil.test/storage/v1/object/public/assets/payment-proofs/order-a-123.png', 'order-a', 'https://db.test'), null);

  let user = null, admin = null, downloads = 0, visible = true;
  let order = { id: 'order-a', shop_id: 'shop-a', user_id: 'owner', payment_proof_url: reference };
  const db = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: visible ? order : null }) }) }) }),
    storage: { from: bucket => ({ download: async value => { equal(bucket, 'payment-proofs'); equal(value, 'shop-a/order-a/random.png'); downloads++; return { data: new Blob(['image'], { type: 'image/png' }) }; } }) },
  };
  const route = load('app/api/orders/[id]/payment-proof/route.ts', {
    'next/server': { NextResponse: { json: (data, options) => Response.json(data, options) } },
    '@/lib/supabase/server': { getSessionUser: async () => user, getAdminUser: async () => admin },
    '@/lib/shop': { shopAdminClient: async () => db },
    '@/lib/payment-proof': proof, '@/lib/safe-image': {}, '@/lib/limited-form': {},
  });
  const get = () => route.GET(new Request('https://shop-a.test/api'), { params: Promise.resolve({ id: 'order-a' }) });
  equal((await get()).status, 404);
  user = { id: 'stranger' };
  equal((await get()).status, 404);
  equal(downloads, 0);
  user = { id: 'owner' };
  const response = await get();
  equal(response.status, 200); equal(response.headers.get('cache-control'), 'private, no-store');
  equal(response.headers.get('content-type'), 'image/png');
  user = { id: 'staff' }; admin = user;
  equal((await get()).status, 200);
  visible = false;
  equal((await get()).status, 404);
  equal(downloads, 2);
  visible = true; order = { ...order, payment_proof_url: 'private:payment-proofs/shop-b/order-a/random.png' };
  equal((await get()).status, 404);
  equal(downloads, 2);

  let rpcData = true, rpcError = null, calls = 0;
  const payments = load('lib/card-payment.ts', {
    '@/lib/payment-amount': load('lib/payment-amount.ts'),
    '@/lib/supabase/admin': { createAdminClient: () => ({ rpc: async (name, args) => {
      calls++;
      if (name === 'settle_card_payment_v1') equal(args, { p_order_no: 'CP123', p_amount: 39, p_trade_no: 'TRADE1' });
      return { data: rpcData, error: rpcError };
    } }) },
  });
  const payload = { Status: 'SUCCESS', Result: { MerchantOrderNo: 'CP123', Amt: 39, TradeNo: 'TRADE1' } };
  equal((await payments.settleCardPayment(payload)).ok, true);
  rpcError = { message: 'RPC unavailable' };
  equal((await payments.settleCardPayment(payload)).ok, false);
  equal(await payments.cardSettlementReady(), false);
  rpcError = null; rpcData = 1;
  equal(await payments.cardSettlementReady(), true);
  const previous = calls;
  equal((await payments.settleCardPayment({ ...payload, Result: { ...payload.Result, Amt: null } })).ok, false);
  equal((await payments.settleCardPayment({ ...payload, Result: { ...payload.Result, TradeNo: '' } })).ok, false);
  equal(calls, previous);
  equal(new Set(Array.from({ length: 100 }, () => payments.newCardOrderNo())).size, 100);

  const mutations = [];
  const base = { from: () => ({
    update: value => { mutations.push(value); return { eq: (key, value) => { equal([key, value], ['shop_id', 'shop-a']); return {}; } }; },
  }) };
  const shop = load('lib/shop.ts', {
    react: { cache: fn => fn }, 'next/headers': {},
    '@/lib/supabase/admin': { createAdminClient: () => base },
    '@/lib/shop-host': { ROOT_DOMAIN: 'site.test', shopSlugFromHost: () => '' },
  });
  shop.scopedClient('shop-a', base).from('orders').update({ shop_id: 'shop-b', paid: true });
  equal(mutations, [{ shop_id: 'shop-a', paid: true }]);

  let coupon = { id: 'coupon-a', active: true }, inserts = 0;
  const couponDb = { from: table => {
    const query = {
      select: () => query, eq: () => query,
      maybeSingle: async () => ({ data: coupon }),
      single: async () => ({ data: { id: 'owned', status: 'used' } }),
      upsert: (_values, options) => { inserts++; equal(options.ignoreDuplicates, true); return Promise.resolve({ error: null }); },
    };
    equal(['discounts', 'user_coupons'].includes(table), true);
    return query;
  } };
  const couponMocks = {
    'next/server': { NextResponse: { json: (data, options) => Response.json(data, options) } },
    '@/lib/shop': { shopAdminClient: async () => couponDb },
    '@/lib/supabase/server': { getSessionUser: async () => ({ id: 'owner' }), getAdminUser: async () => ({ id: 'admin' }) },
  };
  const claim = load('app/api/user-coupons/route.ts', couponMocks);
  const claimRequest = () => new Request('https://site.test/api', { method: 'POST', body: JSON.stringify({ user_id: 'owner', coupon_id: 'coupon-a' }) });
  const claimed = await claim.POST(claimRequest());
  equal(claimed.status, 201); equal((await claimed.json()).status, 'used');
  coupon = null;
  equal((await claim.POST(claimRequest())).status, 404);
  const grant = load('app/api/admin/user-coupons/route.ts', couponMocks);
  equal((await grant.POST(claimRequest())).status, 404);
  equal(inserts, 1);
  const callback = load('app/api/card-plan/return/route.ts', {
    '@/lib/newebpay': { getNewebpayConfig: async () => ({ siteUrl: 'https://site.test' }), verifyTradeSha: () => true, aesDecrypt: () => JSON.stringify({ Status: 'SUCCESS' }) },
    '@/lib/card-payment': { settleCardPayment: async () => ({ ok: false }) },
  });
  const returned = await callback.POST(new Request('https://site.test', { method: 'POST', body: new URLSearchParams({ TradeInfo: 'encrypted', TradeSha: 'valid' }) }));
  equal(returned.headers.get('location'), 'https://site.test/mycard/upgrade?result=pending');
  console.log(`Passed ${checks} private-proof and atomic-payment adapter checks.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
