const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
let checks = 0;
const equal = (a, b) => { assert.deepEqual(a, b); checks++; };
function load(file, mocks = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', js)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    throw new Error(`Unexpected dependency ${name}`);
  }, mod, mod.exports);
  return mod.exports;
}
async function main() {
  const settings = load('lib/order-notification-settings.ts');
  const defaults = settings.resolveOrderNotificationSettings(null);
  equal(defaults.enabled.email, false);
  equal(settings.noticeEnabled(defaults, 'created', 'buyer', 'email'), false);
  equal(settings.resolveOrderNotificationSettings({ enabled: { email: 'true' } }).enabled.email, false);
  const config = settings.resolveOrderNotificationSettings({ enabled: { email: true, line: true }, rules: { shipped: { buyer: { email: true, line: true } } } });
  equal(settings.noticeEnabled(config, 'shipped', 'buyer', 'email'), true);
  equal(settings.noticeEnabled(config, 'shipped', 'seller', 'email'), false);
  const manual = load('lib/manual-order.ts');
  const order = { status: '已出貨', fulfillment_status: 'SHIPPED', order_status: 'PROCESSING' };
  const shipments = [{ status: 'SHIPPED', provider: '黑貓' }];
  equal(manual.manualOrderActions(order, shipments, false), { arrived: true, complete: true });
  equal(manual.manualOrderActions(order, [{ ...shipments[0], lgs_type: 'C2C' }], false).complete, false);
  equal(manual.manualOrderActions(order, shipments, true).complete, false);
  equal(manual.manualOrderActions({ ...order, cancel_status: 'REQUESTED' }, shipments, false).complete, false);

  let user = null, admin = null, current = null, transitionCalls = 0;
  const id = '00000000-0000-0000-0000-000000000009';
  const db = { from: () => { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: current }) }; return q; }, rpc: async name => {
    if (name === 'order_workflow_version') return { data: 1 };
    transitionCalls++; return { data: { ...current, status: '已完成' } };
  } };
  const route = load('app/api/orders/[id]/manual-fulfillment/route.ts', {
    'next/server': { NextResponse: { json: (data, init) => Response.json(data, init) } },
    '@/lib/supabase/server': { getSessionUser: async () => user, getAdminUser: async () => admin },
    '@/lib/shop': { getCurrentShop: async () => ({ id: 'shop', status: 'active' }) },
    '@/lib/supabase/admin': { createAdminClient: () => db }, '@/lib/manual-order': manual, '@/lib/order-notification-kick': { kickOrderNotifications: () => {} },
  });
  const request = action => new Request('https://example.test/api', { method: 'POST', body: JSON.stringify({ action }) });
  const context = { params: Promise.resolve({ id }) };
  equal((await route.POST(request('complete'), context)).status, 401);
  user = { id: 'buyer' }; current = { id, user_id: 'someone-else' };
  equal((await route.POST(request('complete'), context)).status, 404);
  current.user_id = 'buyer';
  equal((await route.POST(request('arrived'), context)).status, 403);
  equal((await route.POST(request('unknown'), context)).status, 400);
  equal(transitionCalls, 0);
  equal((await route.POST(request('complete'), context)).status, 200);
  equal(transitionCalls, 1);
  admin = user; current.user_id = 'different-buyer';
  equal((await route.POST(request('complete'), context)).status, 403);
  equal((await route.POST(request('arrived'), context)).status, 200);

  const originalFetch = global.fetch;
  try {
    let activeConfig = { settings: config, since: '2026-01-01T00:00:00Z' }, job, pending, patches, calls, response;
    const workerDb = { rpc: async () => ({ data: pending ? (pending = false, [job]) : [] }), from: () => {
      const q = { update: patch => { patches.push(patch); return q; }, eq: () => q, select: async () => ({ data: [{ id: job.id }] }) }; return q;
    } };
    const worker = load('lib/order-notifications.ts', {
      '@/lib/supabase/admin': { createAdminClient: () => workerDb },
      '@/lib/integrations': { getIntegrations: async () => ({ RESEND_API_KEY: 'fake', EMAIL_FROM: 'test@example.test', ORDER_NOTIFY_EMAILS: '' }) },
      '@/lib/order-notification-config': { getOrderNotificationConfig: async () => activeConfig },
      '@/lib/order-notification-settings': settings,
      '@/lib/line-messaging': { getMessagingConfig: async () => ({ accessToken: 'fake' }) },
      '@/lib/shop-line': { getShopLineConfig: async () => ({ accessToken: 'fake' }) },
      '@/lib/order-email': {}, '@/lib/order-flex': load('lib/order-flex.ts'), '@/lib/shop': { URBANITE_SHOP_ID: 'shop' },
    });
    global.fetch = async (url, options) => { calls.push({ url, options }); return response; };
    const run = async (overrides = {}, res = new Response('{}', { status: 200 })) => {
      job = { id, shop_id: 'shop', order_id: 'order', event: 'shipped', audience: 'buyer', channel: 'email', attempts: 1, lease_token: 'lease', created_at: new Date().toISOString(), first_send_at: null,
        payload: { endpoint: 'email', body: { to: ['buyer@example.test'], subject: 'same subject', html: 'same body' } }, ...overrides };
      pending = true; patches = []; calls = []; response = res;
      return worker.processOrderNotificationQueue();
    };
    equal((await run()).sent, 1); equal(calls.length, 1);
    equal(calls[0].options.headers['Idempotency-Key'], id);
    equal(patches[0].payload, job.payload);
    equal((await run({}, new Response('{}', { status: 500 }))).retried, 1);
    equal(patches.at(-1).status, 'pending');
    equal((await run({ attempts: 6 }, new Response('{}', { status: 500 }))).failed, 1);
    equal((await run({}, new Response('{}', { status: 401 }))).failed, 1);
    equal((await run({ first_send_at: new Date(Date.now() - 24 * 3600000).toISOString() })).failed, 1); equal(calls.length, 0);
    equal((await run({ channel: 'line', payload: { endpoint: 'push', body: { to: 'bound-id', messages: [] } } }, new Response('{}', { status: 409, headers: { 'x-line-accepted-request-id': 'accepted' } }))).sent, 1);
    equal(calls[0].options.headers['X-Line-Retry-Key'], id);
    activeConfig = null;
    equal((await run()).skipped, 1); equal(calls.length, 0);
    activeConfig = { settings: defaults, since: '2026-01-01' };
    equal((await run()).skipped, 1); equal(calls.length, 0);
  } finally { global.fetch = originalFetch; }
  console.log(`Passed ${checks} notification, authorization and retry checks; no live messages sent.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
