const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const crypto = require('node:crypto');
let checks = 0;
const equal = (a, b) => { assert.deepEqual(a, b); checks++; };
const rejects = async fn => { await assert.rejects(fn); checks++; };
function load(path, mocks) {
  const js = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', js)(key => {
    if (!(key in mocks)) throw new Error(`Unexpected import ${key}`);
    return mocks[key];
  }, mod, mod.exports);
  return mod.exports;
}
const login = load('lib/line-login.ts', { crypto, '@/lib/integrations': {}, '@/lib/shop': {} });
const helper = load('lib/shop-line-login.ts', { '@/lib/line-login': login });
const secret = 'a'.repeat(32);
let shop = { id: 'tenant', slug: 'tenant', status: 'active' }, user = { id: 'buyer', email: 'buyer@example.test' };
let cfg = { accessToken: 'bot', loginChannelId: '123456', loginChannelSecret: secret };
let bound = [], exchanges = 0, friend = true, botId = 'line-buyer';
const responseMock = {
  json: (data, init) => Response.json(data, init),
  redirect: url => {
    const response = new Response(null, { status: 307, headers: { location: String(url) } });
    response.cookies = { set: (name, value, options) => { response.savedCookie = { name, value, options }; } };
    return response;
  },
};
const mocks = {
  'next/server': { NextResponse: responseMock },
  '@/lib/supabase/server': { getSessionUser: async () => user },
  '@/lib/shop': { getCurrentShop: async () => shop, isPlatformShop: s => s.id === 'platform', shopUrl: (slug, path) => `https://${slug}.example.test${path}` },
  '@/lib/shop-line': { getShopLineConfig: async () => cfg, bindShopLine: async (...args) => { bound.push(args); } },
  '@/lib/shop-line-login': helper,
  '@/lib/line-login': { exchangeLineCode: async () => { exchanges++; return 'oauth'; }, fetchLineProfile: async () => ({ userId: 'line-buyer' }) },
  '@/lib/line-messaging': { fetchBotProfile: async () => botId ? { userId: botId } : null },
};
const start = load('app/auth/line/shop/start/route.ts', mocks);
const callback = load('app/auth/line/shop/callback/route.ts', mocks);
global.fetch = async url => {
  assert.equal(url, 'https://api.line.me/friendship/v1/status');
  return Response.json({ friendFlag: friend });
};
const request = (state, cookie = state, extra = '') => ({ nextUrl: new URL(`https://tenant.example.test/auth/line/shop/callback?code=code&state=${encodeURIComponent(state)}${extra}`), cookies: { get: () => cookie ? { value: cookie } : undefined } });
(async () => {
  const state = helper.createShopLineState('tenant', 'buyer', secret);
  helper.verifyShopLineState(state, state, 'tenant', 'buyer', secret); checks++;
  for (const args of [[state, undefined, 'tenant', 'buyer', secret], [state, state, 'other', 'buyer', secret], [state, state, 'tenant', 'other', secret], [state + 'x', state + 'x', 'tenant', 'buyer', secret]]) {
    await rejects(async () => helper.verifyShopLineState(...args));
  }
  const now = Date.now;
  try {
    Date.now = () => now() - 660000;
    const expired = helper.createShopLineState('tenant', 'buyer', secret);
    Date.now = now;
    await rejects(async () => helper.verifyShopLineState(expired, expired, 'tenant', 'buyer', secret));
    Date.now = () => now() + 60000;
    const future = helper.createShopLineState('tenant', 'buyer', secret);
    Date.now = now;
    await rejects(async () => helper.verifyShopLineState(future, future, 'tenant', 'buyer', secret));
  } finally { Date.now = now; }
  let result = await start.GET(new Request('https://tenant.example.test/auth/line/shop/start'));
  const authorize = new URL(result.headers.get('location'));
  equal(authorize.origin, 'https://access.line.me'); equal(authorize.searchParams.get('bot_prompt'), 'aggressive');
  equal(authorize.searchParams.get('client_id'), '123456'); equal(result.savedCookie.options.httpOnly, true);
  equal(result.savedCookie.options.secure, true); equal(result.savedCookie.options.maxAge, 600);
  result = await callback.GET(request(state));
  equal(new URL(result.headers.get('location')).searchParams.get('line'), 'linked');
  equal(bound.length, 1); equal(bound[0][0].id, 'tenant'); equal(bound[0][2], 'buyer'); equal(bound[0][4], 'line-buyer');
  equal(result.savedCookie.options.maxAge, 0);
  bound = []; exchanges = 0;
  await callback.GET(request(state, '')); equal(exchanges, 0); equal(bound.length, 0);
  await callback.GET(request(state, state, '&error=access_denied')); equal(exchanges, 0);
  friend = false; await callback.GET(request(state)); equal(bound.length, 0);
  friend = true; botId = 'other-provider'; await callback.GET(request(state)); equal(bound.length, 0);
  botId = null; await callback.GET(request(state)); equal(bound.length, 0);
  user = { id: 'other' }; await callback.GET(request(state)); equal(bound.length, 0);
  user = null; result = await start.GET(new Request('https://tenant.example.test/auth/line/shop/start')); equal(new URL(result.headers.get('location')).pathname, '/login');
  await callback.GET(request(state)); equal(bound.length, 0);
  user = { id: 'buyer' }; cfg = { accessToken: 'bot' };
  result = await start.GET(new Request('https://tenant.example.test/auth/line/shop/start')); equal(new URL(result.headers.get('location')).searchParams.has('line_error'), true);
  shop.status = 'suspended'; equal((await callback.GET(request(state))).status, 404);
  shop.status = 'active';
  let admin = { email: 'admin@example.test' }, unlocked = true, saved;
  cfg = { channelSecret: secret, accessToken: 'b'.repeat(30), loginChannelId: '123456', loginChannelSecret: secret };
  const adminRoute = load('app/api/admin/shop-line/route.ts', {
    'next/server': mocks['next/server'], '@/lib/shop': mocks['@/lib/shop'],
    '@/lib/supabase/server': { getAdminUser: async () => admin },
    '@/lib/integrations': { PANEL_UNLOCK_COOKIE: 'unlock', verifyUnlockToken: () => unlocked },
    '@/lib/shop-line': { getShopLineConfig: async () => cfg, fetchBotInfo: async () => ({ displayName: 'Shop' }), saveShopLineConfig: async (id, value) => { saved = { id, value }; } },
  });
  const adminRequest = body => ({ cookies: { get: () => ({ value: 'unlock' }) }, json: async () => body });
  result = await adminRoute.GET(adminRequest({}));
  let status = await result.json(); equal(status.loginConfigured, true); equal(status.loginChannelSecret, undefined); equal(status.accessToken, undefined);
  result = await adminRoute.PUT(adminRequest({ loginChannelId: '987654', loginChannelSecret: 'c'.repeat(32) }));
  equal(result.status, 200); equal(saved.id, 'tenant'); equal(saved.value.accessToken, cfg.accessToken); equal(saved.value.loginChannelId, '987654');
  result = await adminRoute.PUT(adminRequest({ accessToken: 'd'.repeat(30) }));
  equal(result.status, 200); equal(saved.value.loginChannelSecret, secret);
  equal((await adminRoute.PUT(adminRequest({ loginChannelId: '999999' }))).status, 400);
  equal((await adminRoute.PUT(adminRequest({ loginChannelId: 'bad', loginChannelSecret: secret }))).status, 400);
  unlocked = false; equal((await adminRoute.PUT(adminRequest({}))).status, 423);
  admin = null; equal((await adminRoute.GET(adminRequest({}))).status, 401);
  console.log(`Passed ${checks} shop LINE OAuth checks; no live LINE messages or bindings.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
