const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { EventEmitter } = require('node:events');
let checks = 0;
const equal = (a, b) => { assert.deepEqual(a, b); checks++; };
async function rejects(fn) { await assert.rejects(fn); checks++; }
function load(file, mocks = {}) {
  const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', js)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.startsWith('@/')) throw new Error(`Unmocked import ${name}`);
    return require(name);
  }, mod, mod.exports);
  return mod.exports;
}
async function main() {
  const amount = load('lib/payment-amount.ts');
  for (const value of [undefined, null, '', ' ', false, true, [], {}, NaN, Infinity, -1, 0, '1e2', '100.0', '0x64', 100.1, 101]) equal(amount.matchesPaymentAmount(value, 100), false);
  equal(amount.matchesPaymentAmount('100', 100), true);
  equal(amount.matchesPaymentAmount(100, '100'), true);
  equal(amount.matchesPaymentAmount(0, 0), false);

  const boundary = load('lib/request-security.ts');
  const req = (pathname, headers = {}, method = 'POST') => new Request(`https://site.test${pathname}`, { method, headers });
  equal(boundary.requestSecurityError(req('/api/orders', { origin: 'https://site.test' })), null);
  for (const origin of ['null', 'https://evil.test', 'https://site.test.evil.test', 'http://site.test']) equal(boundary.requestSecurityError(req('/api/orders', { origin })), 403);
  equal(boundary.requestSecurityError(req('/api/orders', { 'sec-fetch-site': 'cross-site' })), 403);
  equal(boundary.requestSecurityError(req('/api/orders')), 403);
  equal(boundary.requestSecurityError(req('/api/orders', { 'sec-fetch-site': 'same-origin' })), null);
  equal(boundary.requestSecurityError(req('/api/orders', { 'content-length': '9000000' })), 413);
  equal(boundary.requestSecurityError(req('/api/payment/newebpay/notify', { origin: 'https://gateway.test' })), null);
  equal(boundary.requestSecurityError(req('/api/payment/newebpay/notify/evil', { origin: 'https://gateway.test' })), 403);
  equal(boundary.requestSecurityError(req('/api/payment/newebpay/notify', { origin: 'https://gateway.test' }, 'DELETE')), 403);

  let addresses = [{ address: '93.184.216.34', family: 4 }], calls = 0, responseHeaders = {}, body = 'hello';
  const transport = (_url, options, receive) => {
    calls++;
    options.lookup('ignored', {}, (_error, address, family) => { equal(address, addresses[0].address); equal(family, 4); });
    const request = new EventEmitter();
    request.end = () => {
      const response = new EventEmitter();
      response.statusCode = responseHeaders.location ? 302 : 200;
      response.headers = responseHeaders;
      response.destroy = () => { response.destroyed = true; };
      receive(response);
      if (!response.destroyed) { response.emit('data', Buffer.from(body)); response.emit('end'); }
    };
    return request;
  };
  const fetcher = load('lib/public-fetch.ts', {
    'node:dns/promises': { lookup: async () => addresses },
    'node:http': { request: transport }, 'node:https': { request: transport },
  });
  for (const ip of ['127.0.0.1', '10.1.1.1', '169.254.169.254', '172.16.0.1', '192.168.0.1', '100.64.0.1', '198.18.0.1', '224.0.0.1', '::1', '::ffff:7f00:1']) equal(fetcher.publicIpv4(ip), false);
  for (const url of ['http://127.1', 'http://2130706433', 'http://[::ffff:7f00:1]', 'file:///tmp/a', 'https://user:pass@example.com', 'https://example.com:8080', 'http://host.local']) {
    assert.throws(() => fetcher.publicUrl(url)); checks++;
  }
  equal(await (await fetcher.fetchPublic('https://example.com')).res.text(), 'hello');
  addresses = [{ address: '127.0.0.1', family: 4 }];
  const before = calls;
  await rejects(() => fetcher.fetchPublic('https://example.com'));
  equal(calls, before);
  addresses = [{ address: '93.184.216.34', family: 4 }];
  responseHeaders = { location: 'http://169.254.169.254/latest' };
  await rejects(() => fetcher.fetchPublic('https://example.com'));
  responseHeaders = {};
  await rejects(() => fetcher.fetchPublic('https://example.com', 2));
  responseHeaders = { 'content-encoding': 'gzip' };
  await rejects(() => fetcher.fetchPublic('https://example.com'));

  let settlements = 0;
  const paymentReturn = load('app/api/payment/newebpay/return/route.ts', {
    '@/lib/newebpay': { getNewebpayConfig: async () => ({ siteUrl: 'https://site.test' }), verifyTradeSha: (_info, sha) => sha === 'valid', aesDecrypt: () => JSON.stringify({ Status: 'SUCCESS', Result: { MerchantOrderNo: 'ORDER1' } }) },
    '@/lib/newebpay-settle': { settleNewebpayPayment: async () => { settlements++; return { ok: true }; } },
  });
  for (const sha of ['', 'invalid', 'valid']) {
    const response = await paymentReturn.POST(new Request('https://site.test/api/payment/newebpay/return', { method: 'POST', body: new URLSearchParams({ TradeInfo: 'encrypted', TradeSha: sha }) }));
    equal(response.status, 303);
    equal(response.headers.get('location').includes('ORDER1'), sha === 'valid');
  }
  equal(settlements, 1);

  let writes = 0;
  const db = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'test', total: 100, amount: 100, status: 'paid' } }) }) }), update: () => { writes++; throw new Error('Unexpected write'); } }) };
  const paymentMocks = { '@/lib/supabase/admin': { createAdminClient: () => db }, '@/lib/payment-amount': amount };
  const card = load('lib/card-payment.ts', { ...paymentMocks, '@/lib/card-plan': { PERIODS: {}, tierRank: () => 0 } });
  const order = load('lib/newebpay-settle.ts', { ...paymentMocks, '@/lib/card-payment': card, '@/lib/shop': { scopedClient: () => db, URBANITE_SHOP_ID: 'platform' } });
  for (const Amt of [undefined, null, '', false, {}, 'invalid', 101]) {
    equal((await order.settleNewebpayPayment({ Status: 'SUCCESS', Result: { MerchantOrderNo: 'ORDER1', Amt } })).ok, false);
    equal((await card.settleCardPayment({ Status: 'SUCCESS', Result: { MerchantOrderNo: 'CP1', Amt } })).ok, false);
  }
  equal(writes, 0);

  const limiter = load('lib/account-rate-limit.ts');
  equal(limiter.accountRateLimit('a', 'upload', 2, 100), true);
  equal(limiter.accountRateLimit('a', 'upload', 2, 100), true);
  equal(limiter.accountRateLimit('a', 'upload', 2, 100), false);
  equal(limiter.accountRateLimit('b', 'upload', 2, 100), true);
  equal(limiter.accountRateLimit('a', 'other', 2, 100), true);
  equal(limiter.accountRateLimit('a', 'upload', 2, 60100), true);
  equal(limiter.rateLimitResponse().status, 429);

  const forms = load('lib/limited-form.ts');
  const form = new FormData(); form.set('test', 'ok');
  equal((await forms.limitedFormData(new Request('https://site.test', { method: 'POST', body: form }))).get('test'), 'ok');
  await rejects(() => forms.limitedFormData(new Request('https://site.test', { method: 'POST', body: new Uint8Array(10) }), 1));

  let stored = null, lookupError = null;
  const original = process.env.INTEGRATIONS_PANEL_PASSWORD;
  try {
    delete process.env.INTEGRATIONS_PANEL_PASSWORD;
    const integrations = load('lib/integrations.ts', {
      '@/lib/integration-fields': { INTEGRATION_FIELDS: [] },
      '@/lib/supabase/admin': { createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: stored, error: lookupError }) }) }) }) }) },
    });
    equal(await integrations.verifyPanelPassword('000000'), false);
    process.env.INTEGRATIONS_PANEL_PASSWORD = 'test-bootstrap-password';
    equal(await integrations.verifyPanelPassword('test-bootstrap-password'), true);
    lookupError = { message: 'offline' };
    equal(await integrations.verifyPanelPassword('test-bootstrap-password'), false);
    lookupError = null; stored = { value: 'corrupted' };
    equal(await integrations.verifyPanelPassword('test-bootstrap-password'), false);
  } finally {
    if (original === undefined) delete process.env.INTEGRATIONS_PANEL_PASSWORD;
    else process.env.INTEGRATIONS_PANEL_PASSWORD = original;
  }

  const image = load('lib/safe-image.ts');
  const sharp = require('sharp');
  const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#ffffff' } }).png().toBuffer();
  equal((await sharp(await image.sanitizeImage(png, 'image/png')).metadata()).format, 'png');
  await rejects(() => image.sanitizeImage(png, 'image/jpeg'));
  await rejects(() => image.sanitizeImage(Buffer.from('<script>alert(1)</script>'), 'image/png'));
  await rejects(() => image.sanitizeImage(Buffer.alloc(6 * 1024 * 1024), 'image/png'));
  await rejects(() => image.sanitizeImage(Buffer.from('<svg/>'), 'image/svg+xml'));
  console.log(`Passed ${checks} hardening checks; no live payments, database writes or network probes.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
