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
const helper = load('lib/shop-line-login.ts', { '@/lib/line-login': login, 'node:crypto': crypto });
const secret = 'a'.repeat(32);
let shop = { id: 'tenant', slug: 'tenant', status: 'active' }, user = { id: 'buyer', email: 'buyer@example.test' };
let cfg = { accessToken: 'bot', loginChannelId: '123456', loginChannelSecret: secret };
let bound = [], exchanges = 0, friend = true, botId = 'line-buyer', lastExchange, boundAt = null, memberExists = true, usedCode = false;
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
  '@/lib/shop': { getCurrentShop: async () => shop, isPlatformShop: s => s.id === 'platform', shopUrl: (slug, path) => `https://${slug}.example.test${path}`,
    scopedClient: id => {
      assert.equal(id, 'tenant');
      const q = { select: () => q, eq: (key, value) => { assert.equal(key, 'user_id'); assert.equal(value, 'buyer'); return q; }, maybeSingle: async () => ({ data: { line_bound_at: boundAt } }) };
      return { auth: { admin: { getUserById: async id => { assert.equal(id, 'buyer'); return { data: { user: memberExists ? { id, email: 'buyer@example.test' } : null } }; } } }, from: () => q };
    } },
  '@/lib/shop-line': { getShopLineConfig: async () => cfg, bindShopLine: async (...args) => { bound.push(args); } },
  '@/lib/shop-line-login': helper,
  '@/lib/line-login': { exchangeLineCode: async args => { exchanges++; lastExchange = args; if (usedCode) throw new Error('invalid_grant'); return 'oauth'; }, fetchLineProfile: async () => ({ userId: 'line-buyer' }) },
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
  equal(helper.verifyShopLineState(state, 'tenant', secret).userId, 'buyer');
  for (const args of [['', 'tenant', secret], [state, 'other', secret], [state, 'tenant', secret, 'other'], [state + 'x', 'tenant', secret]]) {
    await rejects(async () => helper.verifyShopLineState(...args));
  }
  const now = Date.now;
  try {
    Date.now = () => now() - 660000;
    const expired = helper.createShopLineState('tenant', 'buyer', secret);
    Date.now = now;
    await rejects(async () => helper.verifyShopLineState(expired, 'tenant', secret));
    Date.now = () => now() + 60000;
    const future = helper.createShopLineState('tenant', 'buyer', secret);
    Date.now = now;
    await rejects(async () => helper.verifyShopLineState(future, 'tenant', secret));
  } finally { Date.now = now; }
  let result = await start.GET(new Request('https://tenant.example.test/auth/line/shop/start'));
  const authorize = new URL(result.headers.get('location'));
  equal(authorize.origin, 'https://access.line.me'); equal(authorize.searchParams.get('bot_prompt'), 'aggressive');
  equal(authorize.searchParams.get('client_id'), '123456');
  equal(authorize.searchParams.get('code_challenge_method'), 'S256');
  equal(authorize.searchParams.get('code_challenge'), helper.shopLinePkce(authorize.searchParams.get('state'), 'tenant', secret).challenge);
  equal(authorize.searchParams.has('code_verifier'), false);
  const pkce = helper.shopLinePkce(state, 'tenant', secret);
  equal(pkce.challenge, crypto.createHash('sha256').update(pkce.verifier).digest('base64url'));
  equal(pkce.verifier.length, 43);
  equal(pkce.verifier === helper.shopLinePkce(state, 'other', secret).verifier, false);
  equal(pkce.verifier === helper.shopLinePkce(state, 'tenant', 'other-secret').verifier, false);
  await rejects(async () => helper.verifyShopLineState(login.createLineState('/account', `shop-line:tenant:${secret}`, { uid: 'buyer', since: Date.now() }), 'tenant', secret));
  result = await callback.GET(request(state));
  equal(new URL(result.headers.get('location')).searchParams.get('ok'), '1');
  equal(new URL(result.headers.get('location')).pathname, '/auth/line/shop/result');
  equal(lastExchange.codeVerifier, pkce.verifier);
  equal(bound.length, 1); equal(bound[0][0].id, 'tenant'); equal(bound[0][2], 'buyer'); equal(bound[0][4], 'line-buyer');
  equal(result.savedCookie.options.maxAge, 0);
  bound = []; exchanges = 0;
  user = null;
  result = await callback.GET(request(state, '')); equal(exchanges, 1); equal(bound.length, 1);
  equal(bound[0][2], 'buyer'); equal(new URL(result.headers.get('location')).searchParams.get('ok'), '1');
  bound = []; exchanges = 0;
  await callback.GET(request(state, state, '&error=access_denied')); equal(exchanges, 0);
  friend = false; await callback.GET(request(state)); equal(bound.length, 0);
  friend = true; botId = 'other-provider'; await callback.GET(request(state)); equal(bound.length, 0);
  botId = null; await callback.GET(request(state)); equal(bound.length, 0);
  user = { id: 'other' }; await callback.GET(request(state)); equal(bound.length, 0);
  user = null; result = await start.GET(new Request('https://tenant.example.test/auth/line/shop/start')); equal(new URL(result.headers.get('location')).pathname, '/login');
  usedCode = true; await callback.GET(request(state, '')); equal(bound.length, 0); usedCode = false;
  boundAt = new Date(Date.now() + 1000).toISOString(); await callback.GET(request(state, '')); equal(bound.length, 0); boundAt = null;
  memberExists = false; await callback.GET(request(state, '')); equal(bound.length, 0); memberExists = true;
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
  let tokenBody;
  global.fetch = async (url, options) => {
    assert.equal(url, 'https://api.line.me/oauth2/v2.1/token');
    tokenBody = options.body;
    return tokenBody.get('code_verifier') === pkce.verifier
      ? Response.json({ access_token: 'verified' })
      : Response.json({ error_description: 'invalid_grant' }, { status: 400 });
  };
  const exchange = { code: 'code', redirectUri: 'https://tenant.example.test/auth/line/shop/callback', channelId: '123456', channelSecret: secret };
  equal(await login.exchangeLineCode({ ...exchange, codeVerifier: pkce.verifier }), 'verified');
  equal(tokenBody.get('code_verifier'), pkce.verifier);
  await rejects(() => login.exchangeLineCode({ ...exchange, codeVerifier: helper.shopLinePkce('other-state', 'tenant', secret).verifier }));
  await rejects(() => login.exchangeLineCode(exchange));
  console.log(`Passed ${checks} shop LINE OAuth checks; no live LINE messages or bindings.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
