// 預約系統 C4:套票與回饋點數
// 套票:次數帳本(購買 / 保留 / 退回 / 扣次 / 退款),預約保留與扣退由資料庫交易與 trigger 處理
// 回饋點數:服務完成且付清後,依實收(不含點數、套票折抵)入帳;同一來源只入帳一次,退款時沖銷差額
import { createAdminClient } from '@/lib/supabase/admin';
import { BookingError, ownerBusiness, ownerPayment, rpcError } from './server';
import type { BkBusiness } from './shared';

const db = () => createAdminClient();

export type PackageProduct = { id: string; name: string; service_ids: string[]; sessions: number; price: number; valid_days: number; active: boolean };
export type CustomerPackage = {
  id: string; customer_id: string; name: string; service_ids: string[]; sessions_total: number; price_paid: number; pay_method: string;
  expires_at: string; status: 'active' | 'refunded'; created_at: string; available: number; used: number; reserved: number;
};

async function owned(ownerUserId: string) {
  const business = await ownerBusiness(ownerUserId);
  if (!business) throw new BookingError('NOT_FOUND', '請先完成預約設定。', 404);
  return business;
}

// ---------- 套票商品 ----------
export async function saveProduct(ownerUserId: string, input: Partial<PackageProduct> & { name: string }) {
  const business = await owned(ownerUserId);
  const row = {
    name: String(input.name ?? '').trim().slice(0, 40),
    service_ids: (input.service_ids ?? []).filter((x) => /^[0-9a-f-]{36}$/.test(x)).slice(0, 20),
    sessions: Math.min(100, Math.max(1, Math.round(Number(input.sessions) || 1))),
    price: Math.max(0, Math.round(Number(input.price) || 0)),
    valid_days: Math.min(3650, Math.max(1, Math.round(Number(input.valid_days) || 365))),
    active: input.active === undefined ? true : Boolean(input.active),
  };
  if (!row.name) throw new BookingError('VALIDATION_ERROR', '請填寫套票名稱。', 422);
  const q = input.id
    ? db().from('bk_package_products').update(row).eq('id', input.id).eq('business_id', business.id)
    : db().from('bk_package_products').insert({ ...row, business_id: business.id });
  const { data, error } = await q.select('*').single();
  if (error) throw new BookingError('SERVER_ERROR', '儲存失敗。', 500);
  return data as PackageProduct;
}

// 套票餘額由帳本算出
export async function packagesOf(customerIds: string[]): Promise<CustomerPackage[]> {
  if (!customerIds.length) return [];
  const { data: pkgs } = await db().from('bk_customer_packages').select('*').in('customer_id', customerIds).order('created_at', { ascending: false });
  const ids = (pkgs ?? []).map((p) => p.id);
  const { data: ledger } = ids.length ? await db().from('bk_package_ledger').select('package_id, booking_id, kind, sessions').in('package_id', ids) : { data: [] };
  return (pkgs ?? []).map((p) => {
    const rows = (ledger ?? []).filter((l) => l.package_id === p.id);
    const used = rows.filter((l) => l.kind === 'redeem').length;
    const reserved = rows.filter((l) => l.kind === 'reserve').length - used - rows.filter((l) => l.kind === 'release').length;
    const expired = new Date(p.expires_at).getTime() < Date.now();
    const available = p.status === 'active' && !expired ? Math.max(0, rows.reduce((n, l) => n + l.sessions, 0)) : 0;
    return { ...(p as Omit<CustomerPackage, 'available' | 'used' | 'reserved'>), available, used, reserved: Math.max(0, reserved) };
  });
}

export async function sellPackage(ownerUserId: string, customerId: string, input: { productId: string; price: number; method: string }) {
  const business = await owned(ownerUserId);
  const price = Math.max(0, Math.round(input.price || 0));
  const method = ['cash', 'transfer', 'card', 'other'].includes(input.method) ? input.method : 'cash';
  const points = business.reward_enabled && business.reward_rate > 0 ? Math.floor(price / business.reward_rate) : 0;
  const { data, error } = await db().rpc('bk_package_sell', { p_business: business.id, p_customer: customerId, p_product: input.productId, p_price: price, p_method: method, p_points: points });
  if (error) throw rpcError(error.message);
  return data;
}

export async function refundPackage(ownerUserId: string, packageId: string, note: string) {
  const business = await owned(ownerUserId);
  const { data, error } = await db().rpc('bk_package_refund', { p_package: packageId, p_business: business.id, p_note: note.slice(0, 100) });
  if (error) throw rpcError(error.message);
  return data as number;
}

// ---------- 回饋點數 ----------
export async function pointsOf(customerIds: string[]) {
  if (!customerIds.length) return new Map<string, number>();
  const { data } = await db().from('bk_reward_ledger').select('customer_id, points').in('customer_id', customerIds);
  const map = new Map<string, number>();
  for (const r of data ?? []) map.set(r.customer_id, (map.get(r.customer_id) ?? 0) + r.points);
  return map;
}

// 預約付清後入帳(實收 = 現金 / 轉帳 / 刷卡,扣掉退款;點數與套票折抵不算);已入帳過就只補差額
export async function settleBookingPoints(bookingId: string) {
  const { data: b } = await db().from('bk_bookings').select('id, business_id, customer_id, status, total_price, paid_amount').eq('id', bookingId).maybeSingle();
  if (!b?.customer_id || b.status !== 'completed') return 0;
  const { data: biz } = await db().from('bk_businesses').select('reward_enabled, reward_rate').eq('id', b.business_id).single();
  if (!biz?.reward_enabled || !(biz.reward_rate > 0)) return 0;
  const { data: pays } = await db().from('bk_payments').select('kind, amount, method').eq('booking_id', b.id);
  const net = (pays ?? []).reduce((n, p) => n + (['points', 'package'].includes(p.method) ? 0 : p.kind === 'refund' ? -p.amount : p.amount), 0);
  const should = Math.max(0, Math.floor(net / biz.reward_rate));
  const { data: rows } = await db().from('bk_reward_ledger').select('points, source').eq('business_id', b.business_id).like('source', `booking:${b.id}:earn%`);
  const have = (rows ?? []).reduce((n, r) => n + r.points, 0);
  // 還沒付清且沒入帳過:不入帳(只付訂金不回饋);已入帳過的預約之後退款要沖銷
  if (b.paid_amount < b.total_price && have === 0) return 0;
  const delta = should - have;
  if (!delta) return 0;
  const source = have === 0 && delta > 0 ? `booking:${b.id}:earn` : `booking:${b.id}:earn-adj-${(rows ?? []).length}`;
  await db().from('bk_reward_ledger').insert({
    business_id: b.business_id, customer_id: b.customer_id, booking_id: b.id, kind: delta > 0 ? 'earn' : 'reverse', points: delta, source,
    note: delta > 0 ? '服務完成回饋' : '退款沖銷',
  });
  return delta;
}

// 店家在預約上用點數折抵(記成一筆「點數折抵」的收款)
export async function redeemPoints(ownerUserId: string, bookingId: string, expectedVersion: number, points: number) {
  const business: BkBusiness = await owned(ownerUserId);
  if (!business.reward_enabled) throw new BookingError('POLICY_BLOCKED', '尚未開啟回饋點數。', 422);
  const { data: b } = await db().from('bk_bookings').select('id, customer_id, total_price, paid_amount').eq('id', bookingId).eq('business_id', business.id).maybeSingle();
  if (!b?.customer_id) throw new BookingError('NOT_FOUND', '找不到這筆預約或顧客。', 404);
  const pts = Math.round(points);
  const balance = (await pointsOf([b.customer_id])).get(b.customer_id) ?? 0;
  if (!(pts > 0) || pts > balance) throw new BookingError('VALIDATION_ERROR', `點數不足(目前 ${balance} 點)。`, 422);
  const amount = Math.min(pts * business.point_value, Math.max(0, b.total_price - b.paid_amount));
  if (!(amount > 0)) throw new BookingError('VALIDATION_ERROR', '這筆預約已經付清。', 422);
  const used = Math.ceil(amount / business.point_value);
  const { count } = await db().from('bk_reward_ledger').select('id', { count: 'exact', head: true }).eq('booking_id', b.id).eq('kind', 'redeem');
  const source = `booking:${b.id}:redeem-${count ?? 0}`;
  const { error } = await db().from('bk_reward_ledger').insert({ business_id: business.id, customer_id: b.customer_id, booking_id: b.id, kind: 'redeem', points: -used, source, note: '點數折抵' });
  if (error) throw new BookingError('VERSION_CONFLICT', '請重新整理後再試。', 409);
  try {
    return await ownerPayment(ownerUserId, b.id, expectedVersion, { kind: 'balance', amount, method: 'points', note: `${used} 點折抵` });
  } catch (e) {
    await db().from('bk_reward_ledger').delete().eq('business_id', business.id).eq('source', source);
    throw e;
  }
}

export async function adjustPoints(ownerUserId: string, customerId: string, points: number, note: string) {
  const business = await owned(ownerUserId);
  const pts = Math.round(points);
  if (!pts || Math.abs(pts) > 100000) throw new BookingError('VALIDATION_ERROR', '請輸入正確的點數。', 422);
  const { data: c } = await db().from('bk_customers').select('id').eq('id', customerId).eq('business_id', business.id).maybeSingle();
  if (!c) throw new BookingError('NOT_FOUND', '找不到這位顧客。', 404);
  const balance = (await pointsOf([customerId])).get(customerId) ?? 0;
  if (balance + pts < 0) throw new BookingError('VALIDATION_ERROR', `扣除後會小於 0(目前 ${balance} 點)。`, 422);
  await db().from('bk_reward_ledger').insert({ business_id: business.id, customer_id: customerId, kind: 'adjust', points: pts, source: `adjust:${crypto.randomUUID()}`, note: note.slice(0, 60) || '手動調整' });
  return balance + pts;
}
