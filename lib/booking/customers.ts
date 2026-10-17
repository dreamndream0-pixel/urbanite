// 預約系統 C3:顧客檔案、服務紀錄、私人照片、作品公開同意
// 顧客檔案每間店各自一份;照片放私人空間,只有店家與顧客本人能看;公開作品需顧客在預約頁同意,可撤回
import { createAdminClient } from '@/lib/supabase/admin';
import { BookingError, ownerBusiness } from './server';
import type { BkAttachment, BkCustomer, BkServiceRecord } from './shared';

const db = () => createAdminClient();
export const PHOTO_BUCKET = 'booking-private';
const PHOTO_PATH = /^[0-9a-f-]{36}\/customers\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

async function owned(ownerUserId: string) {
  const business = await ownerBusiness(ownerUserId);
  if (!business) throw new BookingError('NOT_FOUND', '請先完成預約設定。', 404);
  return business;
}

async function ownedCustomer(ownerUserId: string, customerId: string) {
  const business = await owned(ownerUserId);
  const { data } = await db().from('bk_customers').select('*').eq('id', customerId).eq('business_id', business.id).maybeSingle();
  if (!data) throw new BookingError('NOT_FOUND', '找不到這位顧客。', 404);
  return { business, customer: data as BkCustomer };
}

export async function ownedRecord(ownerUserId: string, recordId: string) {
  const business = await owned(ownerUserId);
  const { data } = await db().from('bk_service_records').select('*').eq('id', recordId).eq('business_id', business.id).maybeSingle();
  if (!data) throw new BookingError('NOT_FOUND', '找不到這筆服務紀錄。', 404);
  return { business, record: data as BkServiceRecord };
}

const clean = (s: unknown, n: number) => String(s ?? '').trim().slice(0, n);

// 顧客列表:來店次數、最近一次、累計已收
export async function listCustomers(ownerUserId: string, q: string) {
  const business = await owned(ownerUserId);
  let query = db().from('bk_customers').select('*').eq('business_id', business.id).order('updated_at', { ascending: false }).limit(200);
  const term = q.trim().replace(/[%,()]/g, '').slice(0, 30);
  if (term) query = query.or(`name.ilike.%${term}%,phone.ilike.%${term}%`);
  const { data: customers } = await query;
  const ids = (customers ?? []).map((c) => c.id);
  const { data: bookings } = ids.length
    ? await db().from('bk_bookings').select('customer_id, status, start_at, paid_amount').in('customer_id', ids)
    : { data: [] };
  return (customers ?? []).map((c) => {
    const mine = (bookings ?? []).filter((b) => b.customer_id === c.id);
    const done = mine.filter((b) => b.status === 'completed');
    return {
      ...(c as BkCustomer),
      visits: done.length,
      last_visit: done.map((b) => b.start_at).sort().at(-1) ?? null,
      upcoming: mine.filter((b) => ['pending', 'confirmed', 'checked_in'].includes(b.status) && new Date(b.start_at).getTime() > Date.now()).length,
      paid_total: mine.reduce((n, b) => n + (b.paid_amount ?? 0), 0),
    };
  });
}

export async function createCustomer(ownerUserId: string, input: { name: string; phone: string; note: string }) {
  const business = await owned(ownerUserId);
  if (!clean(input.name, 40)) throw new BookingError('VALIDATION_ERROR', '請填寫顧客姓名。', 422);
  const { data, error } = await db().from('bk_customers').insert({ business_id: business.id, name: clean(input.name, 40), phone: clean(input.phone, 30), note: clean(input.note, 1000) }).select('*').single();
  if (error) throw new BookingError('SERVER_ERROR', '新增失敗。', 500);
  return data as BkCustomer;
}

export async function customerDetail(ownerUserId: string, customerId: string) {
  const { customer } = await ownedCustomer(ownerUserId, customerId);
  const [{ data: bookings }, { data: records }, { data: photos }] = await Promise.all([
    db().from('bk_bookings').select('id, booking_no, service_snapshot, start_at, end_at, status, staff_id, total_price, paid_amount').eq('customer_id', customer.id).order('start_at', { ascending: false }).limit(100),
    db().from('bk_service_records').select('*').eq('customer_id', customer.id).order('performed_on', { ascending: false }).order('created_at', { ascending: false }),
    db().from('bk_attachments').select('id, record_id, kind, created_at').eq('customer_id', customer.id).order('created_at'),
  ]);
  return { customer, bookings: bookings ?? [], records: (records ?? []) as BkServiceRecord[], photos: (photos ?? []) as BkAttachment[] };
}

export async function updateCustomer(ownerUserId: string, customerId: string, input: { name: string; phone: string; note: string; tags: string[] }) {
  const { customer } = await ownedCustomer(ownerUserId, customerId);
  if (!clean(input.name, 40)) throw new BookingError('VALIDATION_ERROR', '請填寫顧客姓名。', 422);
  const tags = [...new Set((input.tags ?? []).map((t) => clean(t, 12)).filter(Boolean))].slice(0, 8);
  const { data, error } = await db().from('bk_customers').update({
    name: clean(input.name, 40), phone: clean(input.phone, 30), note: clean(input.note, 1000), tags, updated_at: new Date().toISOString(),
  }).eq('id', customer.id).select('*').single();
  if (error) throw new BookingError('SERVER_ERROR', '儲存失敗。', 500);
  return data as BkCustomer;
}

// 服務紀錄
export async function createRecord(ownerUserId: string, customerId: string, input: { bookingId: string | null; serviceName: string; content: string; performedOn: string; staffId: string | null }) {
  const { business, customer } = await ownedCustomer(ownerUserId, customerId);
  let bookingId: string | null = null;
  if (input.bookingId) {
    const { data: b } = await db().from('bk_bookings').select('id').eq('id', input.bookingId).eq('customer_id', customer.id).maybeSingle();
    bookingId = b?.id ?? null;
  }
  const { data, error } = await db().from('bk_service_records').insert({
    business_id: business.id, customer_id: customer.id, booking_id: bookingId, staff_id: input.staffId || null,
    service_name: clean(input.serviceName, 60), content: clean(input.content, 2000),
    performed_on: /^\d{4}-\d{2}-\d{2}$/.test(input.performedOn) ? input.performedOn : undefined,
  }).select('*').single();
  if (error) throw new BookingError('SERVER_ERROR', '新增紀錄失敗。', 500);
  await db().from('bk_customers').update({ updated_at: new Date().toISOString() }).eq('id', customer.id);
  return data as BkServiceRecord;
}

export async function updateRecord(ownerUserId: string, recordId: string, input: { serviceName: string; content: string; performedOn: string }) {
  const { record } = await ownedRecord(ownerUserId, recordId);
  const { data, error } = await db().from('bk_service_records').update({
    service_name: clean(input.serviceName, 60), content: clean(input.content, 2000),
    performed_on: /^\d{4}-\d{2}-\d{2}$/.test(input.performedOn) ? input.performedOn : record.performed_on, updated_at: new Date().toISOString(),
  }).eq('id', record.id).select('*').single();
  if (error) throw new BookingError('SERVER_ERROR', '儲存失敗。', 500);
  return data as BkServiceRecord;
}

// 刪除紀錄:照片檔案一起從私人空間移除(無法復原)
export async function deleteRecord(ownerUserId: string, recordId: string) {
  const { record } = await ownedRecord(ownerUserId, recordId);
  const { data: photos } = await db().from('bk_attachments').select('path').eq('record_id', record.id);
  const paths = (photos ?? []).map((p) => p.path).filter((p) => PHOTO_PATH.test(p));
  if (paths.length) await db().storage.from(PHOTO_BUCKET).remove(paths);
  await db().from('bk_service_records').delete().eq('id', record.id);
}

export function photoPath(businessId: string, customerId: string, fileId: string, ext: string) {
  return `${businessId}/customers/${customerId}/${fileId}.${ext}`;
}

export async function addPhoto(ownerUserId: string, recordId: string, path: string, kind: string) {
  const { business, record } = await ownedRecord(ownerUserId, recordId);
  if (!PHOTO_PATH.test(path) || !path.startsWith(`${business.id}/customers/${record.customer_id}/`)) throw new BookingError('VALIDATION_ERROR', '檔案路徑錯誤。', 422);
  const { count } = await db().from('bk_attachments').select('id', { count: 'exact', head: true }).eq('record_id', record.id);
  if ((count ?? 0) >= 12) throw new BookingError('POLICY_BLOCKED', '每筆紀錄最多 12 張照片。', 422);
  const { data, error } = await db().from('bk_attachments').insert({
    business_id: business.id, customer_id: record.customer_id, record_id: record.id, path, kind: ['before', 'after', 'other'].includes(kind) ? kind : 'after',
  }).select('id, record_id, kind, created_at').single();
  if (error) throw new BookingError('SERVER_ERROR', '照片儲存失敗。', 500);
  // 新增照片後,之前的公開同意不自動延伸到新照片
  if (record.consent === 'granted') await db().from('bk_service_records').update({ consent: 'none', consent_at: null }).eq('id', record.id);
  return data as BkAttachment;
}

export async function deletePhoto(ownerUserId: string, photoId: string) {
  const business = await owned(ownerUserId);
  const { data: p } = await db().from('bk_attachments').select('id, path').eq('id', photoId).eq('business_id', business.id).maybeSingle();
  if (!p) throw new BookingError('NOT_FOUND', '找不到照片。', 404);
  if (PHOTO_PATH.test(p.path)) await db().storage.from(PHOTO_BUCKET).remove([p.path]);
  await db().from('bk_attachments').delete().eq('id', p.id);
}

// 請顧客同意把這筆紀錄的照片公開為作品(顧客需有帳號,LINE 通知)
export async function requestConsent(ownerUserId: string, recordId: string) {
  const { business, record } = await ownedRecord(ownerUserId, recordId);
  const { data: c } = await db().from('bk_customers').select('user_id').eq('id', record.customer_id).single();
  if (!c?.user_id) throw new BookingError('POLICY_BLOCKED', '這位顧客沒有帳號(電話客),無法線上同意。請當面取得書面同意。', 422);
  const { count } = await db().from('bk_attachments').select('id', { count: 'exact', head: true }).eq('record_id', record.id);
  if (!count) throw new BookingError('POLICY_BLOCKED', '這筆紀錄沒有照片。', 422);
  if (record.consent === 'granted') throw new BookingError('INVALID_STATE', '顧客已經同意公開。', 409);
  const { data } = await db().from('bk_service_records').update({ consent: 'requested', consent_at: null, updated_at: new Date().toISOString() }).eq('id', record.id).select('*').single();
  const { count: sent } = await db().from('bk_notification_outbox').select('id', { count: 'exact', head: true }).eq('record_id', record.id).eq('event', 'consent_requested');
  await db().from('bk_notification_outbox').insert({ business_id: business.id, record_id: record.id, booking_version: (sent ?? 0) + 1, event: 'consent_requested', audience: 'customer' });
  return data as BkServiceRecord;
}

// ---------- 顧客端 ----------
// 店家請你確認的服務照片(只列出店家請求過同意或你要求刪除的紀錄)
export async function myRecords(userId: string) {
  const { data: customers } = await db().from('bk_customers').select('id, business_id').eq('user_id', userId);
  const ids = (customers ?? []).map((c) => c.id);
  if (!ids.length) return [];
  const { data: records } = await db().from('bk_service_records').select('id, business_id, customer_id, service_name, performed_on, consent, consent_at, delete_requested')
    .in('customer_id', ids).neq('consent', 'none').order('performed_on', { ascending: false }).limit(30);
  const rids = (records ?? []).map((r) => r.id);
  const { data: photos } = rids.length ? await db().from('bk_attachments').select('id, record_id, kind').in('record_id', rids).order('created_at') : { data: [] };
  return (records ?? []).map((r) => ({ ...r, photos: (photos ?? []).filter((p) => p.record_id === r.id) }));
}

export async function decideRecord(userId: string, recordId: string, action: 'grant' | 'decline' | 'revoke' | 'request_delete') {
  const { data: r } = await db().from('bk_service_records').select('id, business_id, customer_id, consent, bk_customers!inner(user_id)').eq('id', recordId).maybeSingle();
  const owner = r ? (Array.isArray(r.bk_customers) ? r.bk_customers[0] : r.bk_customers) as { user_id: string | null } : null;
  if (!r || owner?.user_id !== userId) throw new BookingError('NOT_FOUND', '找不到這筆紀錄。', 404);
  const now = new Date().toISOString();
  if (action === 'request_delete') {
    await db().from('bk_service_records').update({ delete_requested: true, consent: r.consent === 'granted' ? 'revoked' : r.consent, updated_at: now }).eq('id', r.id);
    const { count } = await db().from('bk_notification_outbox').select('id', { count: 'exact', head: true }).eq('record_id', r.id).eq('event', 'photo_delete_requested');
    await db().from('bk_notification_outbox').insert({ business_id: r.business_id, record_id: r.id, booking_version: (count ?? 0) + 1, event: 'photo_delete_requested', audience: 'owner' });
    return;
  }
  const next = action === 'grant' ? 'granted' : action === 'decline' ? 'declined' : 'revoked';
  if (action === 'revoke' && r.consent !== 'granted') throw new BookingError('INVALID_STATE', '目前沒有同意公開。', 409);
  if (action !== 'revoke' && !['requested', 'declined', 'revoked'].includes(r.consent)) throw new BookingError('INVALID_STATE', '店家沒有請求同意。', 409);
  await db().from('bk_service_records').update({ consent: next, consent_at: now, updated_at: now }).eq('id', r.id);
}

// 照片:店家或照片中的顧客本人才能看
export async function photoFor(userId: string, photoId: string) {
  const { data: p } = await db().from('bk_attachments').select('path, business_id, customer_id').eq('id', photoId).maybeSingle();
  if (!p || !PHOTO_PATH.test(p.path)) return null;
  const [{ data: biz }, { data: c }] = await Promise.all([
    db().from('bk_businesses').select('owner_user_id').eq('id', p.business_id).single(),
    db().from('bk_customers').select('user_id').eq('id', p.customer_id).single(),
  ]);
  if (biz?.owner_user_id !== userId && c?.user_id !== userId) return null;
  const { data } = await db().storage.from(PHOTO_BUCKET).download(p.path);
  return data ? { data, ext: p.path.split('.').pop() ?? 'jpg' } : null;
}
