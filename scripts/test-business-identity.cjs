/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file, imports) {
  const mod = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', js)(name => { if (name in imports) return imports[name]; throw Error(`Unexpected import ${name}`); }, mod, mod.exports);
  return mod.exports;
}
let shops = [], cards = [], fail = false, writes = [], owner = null;
const db = { from(table) {
  const filters = []; let mutation;
  const result = () => ({ data: fail ? null : (table === 'shops' ? shops : cards).filter(row => filters.every(([k,v]) => row[k] === v)), error: fail ? { message: 'offline' } : null });
  const q = {
    select: () => q, limit: () => q,
    eq: (key,val) => { filters.push([key,val]); return q; },
    update: value => { mutation = value; return q; },
    maybeSingle: async () => {
      const r = result();
      if (mutation && !r.error && r.data.length) { writes.push({ table, mutation, filters }); Object.assign(r.data[0], mutation); }
      return { ...r, data: r.data?.[0] ?? null };
    },
    then: done => Promise.resolve(result()).then(done),
  }; return q;
} };
const identity = load('lib/business-identity.ts', {
  '@/lib/supabase/admin': { createAdminClient: () => db },
  '@/lib/shop': { SHOP_SLUG_PATTERN: /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/, RESERVED_SHOP_SLUGS: new Set(['admin','www','urbanite']) },
  '@/lib/card-plan': { RESERVED_SLUGS: ['mycard','booking'] },
});
const setup = load('app/api/profile-card/setup/route.ts', {
  'next/server': { NextResponse: { json: Response.json } },
  '@/lib/supabase/admin': { createAdminClient: () => db },
  '@/lib/card-access': { requireCardOwner: async () => owner },
  '@/lib/business-identity': identity,
  '@/lib/card-referral': { grantReferralRewards: async () => {} },
});
const post = data => setup.POST(new Request('https://shop.test/api/profile-card/setup', { method: 'POST', body: JSON.stringify(data) }));
(async () => {
  assert.equal((await post({})).status, 401);
  const card = { id: 'card-a', owner_user_id: 'a', slug: 'personal', onboarded: false };
  owner = { user: { id: 'a' }, card, plan: {} }; cards = [card];
  for (const slug of ['xy','bad.slug','bad_slug','-bad','admin','mycard','line-bot']) assert.ok(await identity.businessSlugProblem(slug, card.id));
  shops = [{ id: 'shop-b', owner_user_id: 'b', slug: 'taken', name: 'B' }];
  assert.ok(await identity.businessSlugProblem('taken', card.id));
  assert.equal(await identity.businessSlugProblem('available', card.id), '');
  assert.equal(await identity.identityShop('a'), null);
  assert.equal((await post({ display_name: ' ', slug: 'available' })).status, 400);
  assert.equal((await post({ display_name: 'Store', slug: 'taken' })).status, 400);
  assert.equal(writes.length, 0);
  shops.push({ id: 'shop-a', owner_user_id: 'a', slug: 'my-store', name: 'A' });
  assert.equal((await identity.identityShop('a')).id, 'shop-a');
  assert.equal((await post({ display_name: 'Store', slug: 'different' })).status, 400);
  const saved = await post({ display_name: 'My Store', slug: 'my-store', shop_id: 'shop-b', owner_user_id: 'b' });
  assert.equal(saved.status, 200);
  assert.equal(writes[0].mutation.shop_id, 'shop-a');
  assert.equal(writes[0].mutation.business_identity, true);
  assert.ok(writes[0].filters.some(([k,v]) => k === 'owner_user_id' && v === 'a'));
  assert.equal((await post({ display_name: 'Again', slug: 'my-store' })).status, 409);
  shops.push({ id: 'shop-c', owner_user_id: 'a', slug: 'second', name: 'Second' });
  assert.equal(await identity.identityShop('a'), null);
  fail = true;
  assert.ok(await identity.businessSlugProblem('available', card.id));
  await assert.rejects(identity.identityShop('a'), /讀取店家/);
  console.log('Shared identity API passed: authentication, validation, cross-table availability, existing URL preservation, no client-supplied ownership, one-time onboarding and fail-closed reads. Database mocked.');
})().catch(error => { console.error(error); process.exitCode = 1; });
