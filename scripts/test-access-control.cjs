const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const crypto = require('node:crypto');
let checks = 0;
function equal(actual, expected) { assert.deepEqual(actual, expected); checks++; }
function load(file, mocks) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', js)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    throw new Error(`Unexpected dependency ${name} in ${file}`);
  }, mod, mod.exports);
  return mod.exports;
}
const next = { NextResponse: { json: (data, init) => Response.json(data, init) } };
const unexpected = new Proxy({}, { get: () => () => { throw new Error('Protected operation reached before authorization'); } });

async function main() {
  let user = null, error = null, allow = [], fail = false;
  const auth = load('lib/supabase/server.ts', {
    '@supabase/ssr': { createServerClient: () => ({ auth: { getUser: async () => ({ data: { user }, error }) } }) },
    'next/headers': { cookies: async () => ({ getAll: () => [] }) },
    '@/lib/integrations': { getAdminEmails: async () => { if (fail) throw new Error('unavailable'); return allow; } },
  });
  equal(await auth.getAdminUser(), null);
  user = { id: 'member', email: 'member@example.test' };
  equal(await auth.getAdminUser(), null);
  allow = ['admin@example.test'];
  equal(await auth.getAdminUser(), null);
  user = { id: 'admin', email: 'ADMIN@example.test' };
  equal(await auth.getAdminUser(), user);
  error = new Error('invalid session');
  equal(await auth.getAdminUser(), null);
  equal(await auth.getSessionUser(), null);
  error = null; fail = true;
  equal(await auth.getAdminUser(), null);
  fail = false; allow = [];
  equal(await auth.getAdminUser(), null);

  let result = { data: null, error: null };
  const oldKey = process.env.SETTINGS_ENCRYPTION_KEY;
  const oldEmails = process.env.ADMIN_EMAILS;
  process.env.SETTINGS_ENCRYPTION_KEY = 'test-only-not-a-real-key';
  process.env.ADMIN_EMAILS = 'Admin@example.test';
  try {
    const integration = load('lib/integrations.ts', {
      crypto,
      '@/lib/integration-fields': { INTEGRATION_FIELDS: [] },
      '@/lib/supabase/admin': { createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => result }) }) }) }) },
    });
    equal(await integration.getAdminEmails(), ['admin@example.test']);
    const key = crypto.createHash('sha256').update(`urbanite-integrations:${process.env.SETTINGS_ENCRYPTION_KEY}`).digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update('Second@example.test, admin@example.test'), cipher.final()]);
    result = { data: { value: `v1:${Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64')}` }, error: null };
    equal(await integration.getAdminEmails(), ['admin@example.test', 'second@example.test']);
    result = { data: null, error: new Error('database unavailable') };
    await assert.rejects(integration.getAdminEmails()); checks++;
    result = { data: { value: 'broken' }, error: null };
    await assert.rejects(integration.getAdminEmails()); checks++;
    result = { data: { value: 'v1:corrupt' }, error: null };
    await assert.rejects(integration.getAdminEmails()); checks++;
  } finally {
    if (oldKey === undefined) delete process.env.SETTINGS_ENCRYPTION_KEY; else process.env.SETTINGS_ENCRYPTION_KEY = oldKey;
    if (oldEmails === undefined) delete process.env.ADMIN_EMAILS; else process.env.ADMIN_EMAILS = oldEmails;
  }

  // Exercise actual protected route handlers; unexpected database calls fail tests.
  const routes = [
    ['app/api/admin/card-promo/route.ts', ['GET', 'PUT']],
    ['app/api/admin/card-members/route.ts', ['GET', 'POST']],
    ['app/api/admin/user-coupons/route.ts', ['POST', 'PATCH']],
    ['app/api/stock-movements/route.ts', ['GET', 'POST', 'DELETE']],
    ['app/api/campaigns/route.ts', ['GET', 'POST']],
    ['app/api/orders/[id]/history/route.ts', ['GET']],
  ];
  for (const [file, methods] of routes) {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const imports = [...source.matchAll(/from ['"]([^'"]+)['"]/g)].map(match => match[1]);
    const mocks = Object.fromEntries(imports.map(name => [name, unexpected]));
    mocks['next/server'] = next;
    mocks['@/lib/supabase/server'] = { getAdminUser: async () => null, getSessionUser: async () => null };
    const handlers = load(file, mocks);
    for (const method of methods) {
      const response = await handlers[method](new Request('https://example.test/api', { method }), { params: Promise.resolve({ id: 'foreign' }) });
      equal(response.status, 401);
    }
  }

  let owner = { card: { id: 'my-card' }, plan: { isAdmin: false, limits: {} } };
  let foreign = true;
  const mutations = [];
  const db = { from: () => {
    let mutation = null;
    const filters = [];
    const query = {
      select: () => query, update: () => { mutation = 'update'; return query; }, delete: () => { mutation = 'delete'; return query; },
      eq: (key, value) => { filters.push([key, value]); return query; },
      maybeSingle: async () => ({ data: !foreign && filters.some(([key, value]) => key === 'card_id' && value === 'my-card') ? { id: 'block' } : null }),
      single: async () => { mutations.push({ mutation, filters }); return { data: { id: 'block' }, error: null }; },
      then: resolve => { mutations.push({ mutation, filters }); return resolve({ error: null }); },
    };
    return query;
  } };
  const blocks = load('app/api/profile-card/blocks/[id]/route.ts', {
    'next/server': next, '@/lib/supabase/admin': { createAdminClient: () => db },
    '@/lib/card-access': { requireCardOwner: async () => owner },
    '@/lib/profile-card': { BLOCK_TYPES: [], LINK_TITLE_LIMIT: 100, IMAGE_LIMIT: 10 },
  });
  const params = { params: Promise.resolve({ id: 'block' }) };
  const request = () => new Request('https://example.test/api', { method: 'PATCH', body: JSON.stringify({ title: 'Updated' }) });
  equal((await blocks.PATCH(request(), params)).status, 401);
  equal((await blocks.DELETE(request(), params)).status, 401);
  equal(mutations.length, 0);
  foreign = false;
  equal((await blocks.PATCH(request(), params)).status, 200);
  equal((await blocks.DELETE(request(), params)).status, 200);
  for (const mutation of mutations) equal(mutation.filters, [['id', 'block'], ['card_id', 'my-card']]);
  owner = null;
  equal((await blocks.PATCH(request(), params)).status, 401);

  let orderOwner = 'another-member';
  let historyReads = 0;
  const history = load('app/api/orders/[id]/history/route.ts', {
    'next/server': next,
    '@/lib/supabase/server': { getSessionUser: async () => ({ id: 'member' }) },
    '@/lib/supabase/admin': { createAdminClient: () => ({ from: table => {
      if (table === 'orders') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'order', user_id: orderOwner } }) }) }) };
      historyReads++;
      return { select: () => ({ eq: (key, value) => {
        equal([key, value], ['order_id', 'order']);
        return { order: async () => ({ data: [], error: null }) };
      } }) };
    } }) },
  });
  const orderParams = { params: Promise.resolve({ id: 'order' }) };
  equal((await history.GET(request(), orderParams)).status, 404);
  equal(historyReads, 0);
  orderOwner = 'member';
  equal((await history.GET(request(), orderParams)).status, 200);
  equal(historyReads, 1);
  console.log(`Passed ${checks} access-control checks (mocked auth/database, no production writes).`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
