// KAZU 唯讀銷售統計的純函式(不依賴 Next / Supabase,可直接用 node --test 測試)。
// 訂單狀態的換算與 lib/order-status.ts 的 deriveStatuses 一致:中文 status 為主,英文狀態欄位為輔。
import { timingSafeEqual } from 'node:crypto';

export const TZ = 'Asia/Taipei';
export const MAX_DAYS = 92;
export const DEFAULT_DAYS = 7;
export const MIN_KEY_LENGTH = 32;
export const LOW_STOCK_DEFAULT = 10;
const TAIPEI_OFFSET_MS = 8 * 3600 * 1000; // 台北固定 UTC+8,沒有日光節約
const DAY_MS = 24 * 3600 * 1000;

// ---------- 鑰匙驗證 ----------
// 回傳 { ok: true } 或 { ok: false, status, error }
export function checkKey(configured, authorization) {
  if (typeof configured !== 'string' || configured.length < MIN_KEY_LENGTH) {
    return { ok: false, status: 503, error: 'NOT_CONFIGURED' };
  }
  const m = /^Bearer (.+)$/.exec(typeof authorization === 'string' ? authorization : '');
  if (!m || !safeEqual(m[1], configured)) return { ok: false, status: 401, error: 'UNAUTHORIZED' };
  return { ok: true };
}

export function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

// ---------- 日期區間(Asia/Taipei,含頭尾) ----------
const pad = (n) => String(n).padStart(2, '0');
const ymd = (ms) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

// 'YYYY-MM-DD' → 當日 00:00(台北)的 UTC 毫秒;格式或日期不存在回 null
function dayStartMs(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const utc = Date.UTC(y, m - 1, d);
  if (ymd(utc) !== s) return null;
  return utc - TAIPEI_OFFSET_MS;
}

// from / to 為 null 或 undefined 代表沒給;兩個都沒給才用預設最近 7 天(含今天)
export function parseRange(from, to, now = new Date()) {
  const invalid = { ok: false, status: 400, error: 'INVALID_RANGE' };
  let fromStr = from;
  let toStr = to;
  if (from == null && to == null) {
    const today = ymd(now.getTime() + TAIPEI_OFFSET_MS);
    toStr = today;
    fromStr = ymd(dayStartMs(today) + TAIPEI_OFFSET_MS - (DEFAULT_DAYS - 1) * DAY_MS);
  }
  const start = dayStartMs(fromStr);
  const lastDay = dayStartMs(toStr);
  if (start == null || lastDay == null || lastDay < start) return invalid;
  const days = Math.round((lastDay - start) / DAY_MS) + 1;
  if (days > MAX_DAYS) return invalid;
  const end = lastDay + DAY_MS; // 不含
  return {
    ok: true,
    from: fromStr,
    to: toStr,
    days,
    startMs: start,
    endMs: end,
    startIso: new Date(start).toISOString(),
    endIso: new Date(end).toISOString(),
  };
}

// ---------- 訂單 ----------
const SHIPPED_F = ['SHIPPED', 'IN_TRANSIT', 'AT_STORE', 'PICKED_UP', 'DELIVERED'];
const REFUNDED_P = ['REFUNDED', 'PARTIALLY_REFUNDED'];

export function classifyOrder(o) {
  const status = String(o.status ?? '');
  const f = String(o.fulfillment_status ?? '');
  const p = String(o.payment_status ?? '');
  const cancelled = status === '取消' || o.order_status === 'CANCELLED' || o.cancel_status === 'APPROVED';
  const returned = status === '退貨' || f === 'RETURNED';
  const refunded = REFUNDED_P.includes(p);
  const shipped = status === '已出貨' || status === '已完成' || SHIPPED_F.includes(f);
  const paid = o.paid === true && !['FAILED', 'CANCELLED'].includes(p);
  return {
    status: status || '未知',
    cancelled,
    returned,
    refunded,
    shipped,
    paid,
    revenueCounted: paid && !cancelled && !returned && !refunded,
    pending: paid && !cancelled && !returned && !refunded && !shipped,
  };
}

// rows 為期間內的訂單加上「待出貨候選」訂單,可重複;以 id 去重
export function computeOrders(rows, range) {
  const seen = new Map();
  for (const o of rows) if (!seen.has(o.id)) seen.set(o.id, o);
  const out = { count: 0, paidCount: 0, revenue: 0, cancelledCount: 0, pendingShipment: 0, byStatus: {} };
  for (const o of seen.values()) {
    const c = classifyOrder(o);
    if (c.pending) out.pendingShipment += 1;
    const t = Date.parse(o.created_at);
    if (!(t >= range.startMs && t < range.endMs)) continue;
    out.count += 1;
    out.byStatus[c.status] = (out.byStatus[c.status] ?? 0) + 1;
    if (c.cancelled) out.cancelledCount += 1;
    if (c.paid) out.paidCount += 1;
    if (c.revenueCounted) out.revenue += Number(o.total) || 0;
  }
  return out;
}

// ---------- 低庫存 ----------
// 沿用後台:無規格商品 inventory <= 10;有規格依各規格安全庫存(數值,含 0),缺值才用 10。只算上架中。
export function computeLowStock(products) {
  const list = [];
  for (const p of products) {
    if (p.status !== '上架中') continue;
    const variants = Array.isArray(p.variants) ? p.variants : [];
    if (variants.length > 0) {
      for (const v of variants) {
        const stock = Number(v.inventory) || 0;
        const threshold = typeof v.safety === 'number' ? v.safety : LOW_STOCK_DEFAULT;
        if (stock <= threshold) {
          list.push({ productId: String(p.id), name: String(p.name ?? ''), variant: Array.isArray(v.options) ? v.options.join(' / ') : '', stock });
        }
      }
    } else {
      const stock = Number(p.inventory) || 0;
      if (stock <= LOW_STOCK_DEFAULT) list.push({ productId: String(p.id), name: String(p.name ?? ''), variant: '', stock });
    }
  }
  return list;
}

// ---------- 訂閱 ----------
const emptyTiers = () => ({ plus: 0, pro: 0, max: 0, total: 0 });
function bump(bucket, plan) {
  bucket.total += 1;
  if (plan === 'plus' || plan === 'pro' || plan === 'max') bucket[plan] += 1;
}

// payments:期間內 paid_at 的付款;priorUserIds:這些人在期間開始前已有付款紀錄的 user_id 集合
export function computeSubscriptions({ subscriptions, payments, priorUserIds, range, now }) {
  const nowMs = now.getTime();
  const out = { new: emptyTiers(), cancelled: emptyTiers(), active: emptyTiers(), paymentsRevenue: 0 };
  const first = new Map(); // user_id → 期間內最早一筆付款
  for (const p of payments) {
    const t = Date.parse(p.paid_at);
    if (!(t >= range.startMs && t < range.endMs)) continue;
    out.paymentsRevenue += Number(p.amount) || 0;
    const prev = first.get(p.user_id);
    if (!prev || t < prev.t) first.set(p.user_id, { t, tier: p.tier });
  }
  for (const [userId, f] of first) if (!priorUserIds.has(userId)) bump(out.new, f.tier);
  for (const s of subscriptions) {
    const e = Date.parse(s.expires_at);
    if (!Number.isFinite(e)) continue;
    if (e > nowMs) bump(out.active, s.plan);
    else if (e >= range.startMs && e < range.endMs) bump(out.cancelled, s.plan);
  }
  return out;
}

export function buildNotes() {
  return [
    'orders.count:期間內 created_at 建立的訂單數(只含平台 Urbanite 商店)。',
    'orders.paidCount:上述訂單中已付款的數量;貨到付款但尚未收款者不算已付款。',
    'orders.revenue:上述訂單中已付款、且未取消、未退貨、未退款的 total(折扣與回饋金折抵後、含運費)加總;部分退款整單排除。',
    'orders.cancelledCount:上述訂單中狀態為取消的數量,不含退貨(退貨仍列在 byStatus)。',
    'orders.pendingShipment:目前(不受期間限制)已付款、未取消退貨退款、尚未出貨的訂單數。',
    `lowStock:只含上架中商品;沿用後台規則:無規格商品庫存 <= ${LOW_STOCK_DEFAULT},有規格依各規格安全庫存(庫存 <= 安全庫存,含 0),安全庫存缺值才用 ${LOW_STOCK_DEFAULT};狀態為上架中但活動已過期或為草稿的商品仍會計入。`,
    'subscriptions.new:期間內有付款(paid_at)、且該使用者在期間開始前沒有付款紀錄的人數。',
    'subscriptions.cancelled:系統沒有取消紀錄,此為推算值:到期日落在期間內且已 <= 現在(含管理員手動終止與自然到期,數字會偏高);客人續訂後重跑同一範圍數字可能不同。',
    'subscriptions.active:目前到期日大於現在的訂閱數,為產生報告當下的快照,與 range 無關。',
    'subscriptions.paymentsRevenue:期間內 paid_at 的付款金額加總。方案代號不在 plus/pro/max 者只計入 total。訂閱表沒有店家欄位,視為平台層級。',
  ];
}

export function buildReport({ range, now, orderRows, products, subscriptions, payments, priorUserIds }) {
  return {
    range: { from: range.from, to: range.to, tz: TZ },
    generatedAt: now.toISOString(),
    orders: computeOrders(orderRows, range),
    lowStock: computeLowStock(products),
    subscriptions: computeSubscriptions({ subscriptions, payments, priorUserIds, range, now }),
    notes: buildNotes(),
  };
}
