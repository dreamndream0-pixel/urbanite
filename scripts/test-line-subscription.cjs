const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
let shop = { id: 'tenant', status: 'active' }, user = { id: 'buyer' }, configured = true;
let scopes = [], menuCalls = 0, checks = 0;
const equal = (a, b) => { assert.deepEqual(a, b); checks++; };
const mocks = {
  'next/server': { NextResponse: { json: (data, init) => Response.json(data, init) } },
  '@/lib/supabase/server': { getSessionUser: async () => user },
  '@/lib/checkout-line': { getCheckoutLine: () => ({ id: '@tenant', url: '' }), lineAddFriendUrl: line => `https://line.me/${line.id}` },
  '@/lib/line-messaging': {},
  '@/lib/line-login': { getLineLoginConfig: async () => ({ channelSecret: 'fake' }), createLinkToken: () => 'test-token' },
  '@/lib/line-bot': { syncMemberMenu: async () => { menuCalls++; } },
  '@/lib/shop-line': { getShopLineConfig: async () => configured ? { accessToken: 'fake' } : null },
  '@/lib/shop': {
    getCurrentShop: async () => shop, isPlatformShop: s => s.id === 'platform',
    scopedClient: id => { scopes.push(id); return { from: table => {
      const result = { data: table === 'customers' ? { line_user_id: 'bound-id', line_display_name: 'Buyer' } : { footer_sections: [] } };
      const q = { select: () => q, eq: column => { if (table === 'site_settings' && column === 'id') throw new Error('Shop settings must not assume id=1'); return q; }, update: () => q, maybeSingle: async () => result, then: fn => Promise.resolve(result).then(fn) }; return q;
    } }; },
  },
};
const js = ts.transpileModule(fs.readFileSync('app/api/me/line/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
new Function('require', 'module', 'exports', js)(key => { if (!(key in mocks)) throw new Error(key); return mocks[key]; }, mod, mod.exports);
(async () => {
  const req = new Request('https://tenant.example.test/api/me/line');
  let data = await (await mod.exports.GET(req)).json();
  equal(scopes, ['tenant']); equal(data.bindingMode, 'chat'); equal(data.available, true); equal(data.linkUrl, 'https://line.me/@tenant');
  equal((await mod.exports.DELETE()).status, 200); equal(menuCalls, 0); equal(scopes.at(-1), 'tenant');
  configured = false; data = await (await mod.exports.GET(req)).json(); equal(data.available, false); equal(data.linkUrl, '');
  shop = { id: 'platform', status: 'active' };
  data = await (await mod.exports.GET(req)).json(); equal(data.bindingMode, 'login'); equal(data.linkUrl.startsWith('/auth/line/start?mode=link'), true);
  await mod.exports.DELETE(); equal(menuCalls, 1); equal(scopes.at(-1), 'platform');
  user = null; equal((await mod.exports.GET(req)).status, 401); equal((await mod.exports.DELETE()).status, 401);
  console.log(`Passed ${checks} LINE subscription shop-isolation checks; no live LINE requests.`);
})().catch(e => { console.error(e); process.exitCode = 1; });
