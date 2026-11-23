import test from 'node:test';
import assert from 'node:assert/strict';
import { checkKey, parseRange, computeOrders, computeLowStock, computeSubscriptions, buildReport } from '../lib/kazu-sales-core.mjs';

const KEY = 'k'.repeat(40);
const NOW = new Date('2026-11-23T02:00:00Z'); // 台北 2026-11-23 10:00

test('鑰匙:沒設 → 503 NOT_CONFIGURED', () => {
  assert.deepEqual(checkKey(undefined, `Bearer ${KEY}`), { ok: false, status: 503, error: 'NOT_CONFIGURED' });
  assert.equal(checkKey('', 'Bearer x').status, 503);
});

test('鑰匙:少於 32 字 → 503,即使帶對也拒絕', () => {
  const short = 'a'.repeat(31);
  assert.equal(checkKey(short, `Bearer ${short}`).error, 'NOT_CONFIGURED');
});

test('鑰匙:錯誤、長度不同、沒帶 → 401;正確 → ok', () => {
  assert.deepEqual(checkKey(KEY, `Bearer ${'x'.repeat(40)}`), { ok: false, status: 401, error: 'UNAUTHORIZED' });
  assert.equal(checkKey(KEY, 'Bearer short').status, 401);
  assert.equal(checkKey(KEY, null).status, 401);
  assert.equal(checkKey(KEY, KEY).status, 401);
  assert.deepEqual(checkKey(KEY, `Bearer ${KEY}`), { ok: true });
});

test('日期:預設最近 7 天含今天(固定基準時間)', () => {
  const r = parseRange(null, null, NOW);
  assert.equal(r.ok, true);
  assert.equal(r.from, '2026-11-17');
  assert.equal(r.to, '2026-11-23');
  assert.equal(r.days, 7);
  assert.equal(r.startIso, '2026-11-16T16:00:00.000Z');
  assert.equal(r.endIso, '2026-11-23T16:00:00.000Z');
});

test('日期:台北日期跨日(UTC 16:00 後已是隔天)', () => {
  assert.equal(parseRange(null, null, new Date('2026-11-23T17:00:00Z')).to, '2026-11-24');
});

test('日期:剛好 92 天通過、93 天失敗', () => {
  assert.equal(parseRange('2026-01-01', '2026-04-02', NOW).ok, true); // 31+28+31+2 = 92
  assert.equal(parseRange('2026-01-01', '2026-04-02', NOW).days, 92);
  assert.deepEqual(parseRange('2026-01-01', '2026-04-03', NOW), { ok: false, status: 400, error: 'INVALID_RANGE' });
});

test('日期:單端缺值、空值、格式錯誤、不存在、顛倒 → INVALID_RANGE', () => {
  for (const [f, t] of [['2026-11-01', null], [null, '2026-11-01'], ['', ''], ['2026/11/01', '2026-11-02'], ['2026-02-30', '2026-03-01'], ['2026-11-05', '2026-11-01']]) {
    assert.equal(parseRange(f, t, NOW).error, 'INVALID_RANGE', `${f} ${t}`);
  }
});

const range = parseRange('2026-11-01', '2026-11-07', NOW);
const inR = '2026-11-03T04:00:00Z';
const order = (o) => ({ id: String(Math.random()), status: '待出貨', paid: true, total: 100, created_at: inR, ...o });

test('訂單:營收排除取消、退貨、退款與未付款', () => {
  const rows = [
    order({ id: 'a', total: 100 }),
    order({ id: 'b', total: 200, status: '取消' }),
    order({ id: 'c', total: 300, status: '退貨' }),
    order({ id: 'd', total: 400, payment_status: 'PARTIALLY_REFUNDED' }),
    order({ id: 'e', total: 500, paid: false, status: '尚未付款' }),
    order({ id: 'f', total: 50, status: '已完成' }),
  ];
  const o = computeOrders(rows, range);
  assert.equal(o.count, 6);
  assert.equal(o.revenue, 150);
  assert.equal(o.cancelledCount, 1);
  assert.equal(o.paidCount, 5);
  assert.equal(o.byStatus['退貨'], 1);
});

test('訂單:待出貨不受期間限制、重複列只算一次、貨到付款未收款不算', () => {
  const old = order({ id: 'old', created_at: '2026-01-01T00:00:00Z' });
  const rows = [old, old, order({ id: 'in' }), order({ id: 'cod', paid: false }), order({ id: 'sh', status: '已出貨' })];
  const o = computeOrders(rows, range);
  assert.equal(o.pendingShipment, 2);
  assert.equal(o.count, 3); // 期間外的 old 不計入 count
});

test('低庫存:只含上架中;規格用安全庫存(含 0),缺值用 10', () => {
  const list = computeLowStock([
    { id: 'p1', name: 'A', status: '上架中', inventory: 10, variants: [] },
    { id: 'p2', name: 'B', status: '下架', inventory: 0, variants: [] },
    { id: 'p3', name: 'C', status: '上架中', inventory: 11, variants: [] },
    { id: 'p4', name: 'D', status: '上架中', inventory: 9, variants: [
      { options: ['紅', 'S'], inventory: 5, safety: 0 },
      { options: ['紅', 'M'], inventory: 0, safety: 0 },
      { options: ['藍', 'S'], inventory: 10 },
    ] },
  ]);
  assert.deepEqual(list.map((x) => `${x.productId}|${x.variant}|${x.stock}`), ['p1||10', 'p4|紅 / M|0', 'p4|藍 / S|10']);
});

test('訂閱:new 排除先前付過的人、cancelled 為期間內已到期、active 為未到期', () => {
  const pay = (user_id, tier, amount, paid_at) => ({ user_id, tier, amount, paid_at });
  const out = computeSubscriptions({
    range,
    now: NOW,
    payments: [pay('u1', 'plus', 39, inR), pay('u2', 'pro', 399, inR), pay('u2', 'pro', 399, '2026-11-05T00:00:00Z'), pay('u3', 'max', 699, inR), pay('u4', null, 10, inR)],
    priorUserIds: new Set(['u3']),
    subscriptions: [
      { user_id: 'u1', plan: 'plus', expires_at: '2026-12-01T00:00:00Z' },
      { user_id: 'u5', plan: 'pro', expires_at: '2026-11-04T00:00:00Z' },
      { user_id: 'u6', plan: 'max', expires_at: '2026-10-01T00:00:00Z' },
    ],
  });
  assert.deepEqual(out.new, { plus: 1, pro: 1, max: 0, total: 3 }); // u4 未知方案只計 total
  assert.deepEqual(out.cancelled, { plus: 0, pro: 1, max: 0, total: 1 });
  assert.deepEqual(out.active, { plus: 1, pro: 0, max: 0, total: 1 });
  assert.equal(out.paymentsRevenue, 39 + 399 + 399 + 699 + 10);
});

test('輸出:結構白名單,客資 key 與值都不外洩', () => {
  const secret = 'SECRET-PII';
  const report = buildReport({
    range,
    now: NOW,
    orderRows: [order({ id: 'o1', order_no: secret, name: secret, email: `${secret}@x.com`, phone: secret, address: secret, store: secret, user_id: secret, note: secret, trade_no: secret })],
    products: [{ id: 'p1', name: '商品', status: '上架中', inventory: 1, variants: [], cost: secret }],
    subscriptions: [{ user_id: secret, plan: 'plus', expires_at: '2027-01-01T00:00:00Z', email: secret }],
    payments: [{ user_id: secret, order_no: secret, tier: 'plus', amount: 39, paid_at: inR }],
    priorUserIds: new Set(),
  });
  const tiers = ['plus', 'pro', 'max', 'total'];
  assert.deepEqual(Object.keys(report), ['range', 'generatedAt', 'orders', 'lowStock', 'subscriptions', 'notes']);
  assert.deepEqual(Object.keys(report.range), ['from', 'to', 'tz']);
  assert.deepEqual(Object.keys(report.orders), ['count', 'paidCount', 'revenue', 'cancelledCount', 'pendingShipment', 'byStatus']);
  assert.deepEqual(Object.keys(report.lowStock[0]), ['productId', 'name', 'variant', 'stock']);
  assert.deepEqual(Object.keys(report.subscriptions), ['new', 'cancelled', 'active', 'paymentsRevenue']);
  for (const k of ['new', 'cancelled', 'active']) assert.deepEqual(Object.keys(report.subscriptions[k]), tiers);
  assert.ok(!JSON.stringify(report).includes(secret));
});
