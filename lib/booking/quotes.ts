// 預約系統 C2:需報價服務的詢價 → 報價 → 接受(新秘、外出造型、客製服務)
// 詢價不占檔期;報價可暫保留檔期(建立待接受的預約,到期自動釋放);接受後走訂金 / 成立流程
import { createAdminClient } from '@/lib/supabase/admin';
import {
  BookingError, bookingNo, getPublicBusiness, loadSchedule, ownerBusiness, payDeadline, reminderNotices, rpcError, type Notice,
} from './server';
import type { BkBooking, BkBusiness, BkQuote, BkQuoteVersion, QuoteRequest } from './shared';

const db = () => createAdminClient();

export const QUOTE_IMAGE_BUCKET = 'booking-private';
const IMAGE_PATH = /^[0-9a-f-]{36}\/quotes\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/;
export const isQuoteImagePath = (p: string) => IMAGE_PATH.test(p);

// 顧客送出詢價(需登入;參考圖由 API 先上傳到私人空間,這裡只存路徑)
export async function requestQuote(input: {
  slug: string; userId: string; serviceId: string; staffId: string | null; quoteId: string;
  request: Omit<QuoteRequest, 'images'>; images: string[]; contact: { name: string; phone: string };
}) {
  const ctx = await getPublicBusiness(input.slug);
  if (!ctx) throw new BookingError('NOT_FOUND', '這張名片目前沒有開放預約。', 404);
  const { business } = ctx;
  if (business.owner_user_id === input.userId) throw new BookingError('POLICY_BLOCKED', '不能詢價自己的服務,請用其他帳號測試。', 422);
  const sched = await loadSchedule(business.id);
  const service = sched.services.find((s) => s.id === input.serviceId && s.price_mode === 'quote');
  if (!service) throw new BookingError('VALIDATION_ERROR', '這個服務目前無法詢價。', 422);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.request.event_date)) throw new BookingError('VALIDATION_ERROR', '請選擇活動日期。', 422);
  if (service.service_mode === 'outcall' && !input.request.address.trim()) throw new BookingError('VALIDATION_ERROR', '外出服務請填寫地點。', 422);
  const { count } = await db().from('bk_quotes').select('id', { count: 'exact', head: true })
    .eq('business_id', business.id).eq('customer_user_id', input.userId).eq('status', 'requested');
  if ((count ?? 0) >= 3) throw new BookingError('POLICY_BLOCKED', '你已有 3 筆詢價等待回覆,請等店家回覆後再送出。', 422);
  const staffId = input.staffId && sched.staff.some((s) => s.id === input.staffId && s.active) ? input.staffId : null;
  const r = input.request;
  const { data, error } = await db().from('bk_quotes').insert({
    id: input.quoteId, business_id: business.id, quote_no: bookingNo('QT'), customer_user_id: input.userId,
    service_id: service.id, service_name: service.name, staff_id: staffId,
    request: {
      event_date: r.event_date, time: r.time.slice(0, 5), event_type: r.event_type.trim().slice(0, 40), address: r.address.trim().slice(0, 120),
      people: r.people.trim().slice(0, 40), note: r.note.trim().slice(0, 1000), images: input.images.filter(isQuoteImagePath).slice(0, 3),
    },
    contact: { name: input.contact.name.trim().slice(0, 40), phone: input.contact.phone.trim().slice(0, 30) },
  }).select('*').single();
  if (error) throw new BookingError('SERVER_ERROR', '詢價送出失敗,請稍後再試。', 500);
  await db().from('bk_notification_outbox').insert({ business_id: business.id, quote_id: data.id, booking_version: 0, event: 'quote_requested', audience: 'owner' });
  return data as BkQuote;
}

// 報價的占用:外出服務前後加交通時間(只占人員,不占店內座位)
function quoteBooking(business: BkBusiness, q: BkQuote, v: { total: number; deposit: number; staff_id: string; start_at: string; minutes: number; travel_minutes: number; items: { name: string; amount: number }[] }, extra: Record<string, unknown>) {
  const start = new Date(v.start_at).getTime();
  const end = start + v.minutes * 60000;
  const travel = v.travel_minutes * 60000;
  return {
    business_id: business.id, booking_no: bookingNo(), customer_user_id: q.customer_user_id, service_id: q.service_id,
    service_snapshot: { name: q.service_name, duration_minutes: v.minutes, price: v.total, items: v.items },
    start_at: new Date(start).toISOString(), end_at: new Date(end).toISOString(), occupy_end_at: new Date(end + travel).toISOString(),
    contact: { ...q.contact, note: [q.request.event_type, q.request.address, q.request.note].filter(Boolean).join(' / ').slice(0, 500) },
    source_card_id: business.card_id, source_channel: 'quote', staff_id: v.staff_id, staff_requested: Boolean(q.staff_id), resource_id: null,
    addons: [], total_price: v.total, deposit_amount: v.deposit, created_by: 'owner', quote_id: q.id, actor_type: 'owner',
    allocations: [{ staff_id: v.staff_id, resource_id: null, role: 'main', start_at: new Date(start - travel).toISOString(), end_at: new Date(end + travel).toISOString() }],
    ...extra,
  };
}

async function ownerQuote(ownerUserId: string, quoteId: string) {
  const business = await ownerBusiness(ownerUserId);
  if (!business) throw new BookingError('NOT_FOUND', '找不到這筆詢價。', 404);
  const { data: q } = await db().from('bk_quotes').select('*').eq('id', quoteId).eq('business_id', business.id).maybeSingle();
  if (!q) throw new BookingError('NOT_FOUND', '找不到這筆詢價。', 404);
  return { business, q: q as BkQuote };
}

// 店家送出 / 修改報價(新版本);可暫保留檔期,衝突時整筆不成立
export async function sendQuote(ownerUserId: string, quoteId: string, expectedVersion: number, input: {
  items: { name: string; amount: number }[]; deposit: number; staffId: string; startAt: string; minutes: number;
  travelMinutes: number; validDays: number; holdHours: number; note: string;
}) {
  const { business, q } = await ownerQuote(ownerUserId, quoteId);
  const sched = await loadSchedule(business.id);
  const staff = sched.staff.find((s) => s.id === input.staffId && s.active);
  if (!staff) throw new BookingError('VALIDATION_ERROR', '請選擇負責人員。', 422);
  const items = input.items.map((it) => ({ name: String(it.name ?? '').trim().slice(0, 40), amount: Math.max(0, Math.round(Number(it.amount) || 0)) })).filter((it) => it.name).slice(0, 12);
  if (!items.length) throw new BookingError('VALIDATION_ERROR', '請至少填一個報價項目。', 422);
  const total = items.reduce((n, it) => n + it.amount, 0);
  const deposit = Math.min(total, Math.max(0, Math.round(input.deposit || 0)));
  const start = new Date(input.startAt);
  if (Number.isNaN(start.getTime()) || start.getTime() < Date.now()) throw new BookingError('VALIDATION_ERROR', '服務時間要在未來。', 422);
  const minutes = Math.min(1440, Math.max(15, Math.round(input.minutes)));
  const travel = Math.min(480, Math.max(0, Math.round(input.travelMinutes)));
  const validUntil = new Date(Math.min(Date.now() + Math.max(1, input.validDays) * 86400000, start.getTime()));
  const holdHours = Math.min(168, Math.max(0, Math.round(input.holdHours)));
  const holdUntil = holdHours ? new Date(Math.min(Date.now() + holdHours * 3600000, validUntil.getTime())) : null;
  const v = { items, total, deposit, staff_id: staff.id, start_at: start.toISOString(), minutes, travel_minutes: travel };
  const hold = holdUntil
    ? quoteBooking(business, q, v, { status: 'pending', approval_status: 'pending', expires_at: holdUntil.toISOString(), payment_status: 'none', actor_id: ownerUserId })
    : null;
  const { data, error } = await db().rpc('bk_quote_send', {
    p_quote_id: q.id, p_expected_version: expectedVersion,
    p_v: { ...v, valid_until: validUntil.toISOString(), hold_until: holdUntil?.toISOString() ?? null, note: input.note.trim().slice(0, 500) },
    p_hold: hold, p_actor: ownerUserId,
  });
  if (error) {
    if (error.message.includes('SLOT_UNAVAILABLE')) throw new BookingError('SLOT_UNAVAILABLE', '這段時間(含交通)人員已有其他預約,無法保留檔期;可改時間或不保留。', 409);
    throw rpcError(error.message);
  }
  return data as BkQuote;
}

// 顧客接受報價:有效暫保留 → 轉成待付訂金 / 成立;否則重新取得檔期
export async function acceptQuote(userId: string, quoteId: string, quoteVersion: number) {
  const { data: q } = await db().from('bk_quotes').select('*').eq('id', quoteId).eq('customer_user_id', userId).maybeSingle();
  if (!q) throw new BookingError('NOT_FOUND', '找不到這筆詢價。', 404);
  const quote = q as BkQuote;
  const { data: v } = await db().from('bk_quote_versions').select('*').eq('quote_id', quote.id).eq('version', quote.current_version).maybeSingle();
  if (!v) throw new BookingError('INVALID_STATE', '店家還沒有報價。', 409);
  const ver = v as BkQuoteVersion;
  const { data: business } = await db().from('bk_businesses').select('*').eq('id', quote.business_id).single();
  const biz = business as BkBusiness;
  const start = new Date(ver.start_at).getTime();
  const needDeposit = ver.deposit > 0;
  if (needDeposit && start - Date.now() < 90 * 60000) throw new BookingError('POLICY_BLOCKED', '服務時間太近,來不及轉帳訂金,請直接聯絡店家。', 422);
  const status = needDeposit ? 'pending' : 'confirmed';
  const payment = needDeposit ? 'awaiting' : 'none';
  const expires = needDeposit ? new Date(payDeadline(biz, start)).toISOString() : null;
  const notices: Notice[] = [
    { event: 'quote_accepted', audience: 'owner' },
    { event: needDeposit ? 'awaiting_deposit' : 'confirmed', audience: 'customer' },
    ...(needDeposit ? [] : reminderNotices(biz, ver.start_at)),
  ];
  const fresh = quoteBooking(biz, quote, { ...ver, staff_id: ver.staff_id ?? '' }, {
    status, approval_status: 'approved', expires_at: expires, payment_status: payment, actor_type: 'customer', actor_id: userId,
  });
  if (!ver.staff_id) throw new BookingError('INVALID_STATE', '報價缺少負責人員,請聯絡店家。', 409);
  const { data, error } = await db().rpc('bk_quote_accept', {
    p_quote_id: quote.id, p_quote_version: quoteVersion, p_customer: userId, p_booking: fresh,
    p_status: status, p_payment: payment, p_expires: expires, p_notices: notices,
  });
  if (error) {
    if (error.message.includes('SLOT_UNAVAILABLE')) throw new BookingError('SLOT_UNAVAILABLE', '這個時段已被其他預約占用,請聯絡店家重新報價。', 409);
    throw rpcError(error.message);
  }
  return data as BkBooking;
}

// 顧客婉拒 / 店家取消詢價(暫保留一起釋放)
export async function closeQuote(actor: { type: 'customer' | 'owner'; id: string }, quoteId: string) {
  if (actor.type === 'owner') await ownerQuote(actor.id, quoteId);
  else {
    const { data } = await db().from('bk_quotes').select('id').eq('id', quoteId).eq('customer_user_id', actor.id).maybeSingle();
    if (!data) throw new BookingError('NOT_FOUND', '找不到這筆詢價。', 404);
  }
  const { data, error } = await db().rpc('bk_quote_close', {
    p_quote_id: quoteId, p_status: actor.type === 'customer' ? 'declined' : 'cancelled', p_actor_type: actor.type, p_actor: actor.id,
  });
  if (error) throw rpcError(error.message);
  return data as BkQuote;
}

// 參考圖:只有詢價的顧客本人或店家能讀
export async function quoteImageFor(userId: string, quoteId: string, index: number) {
  const { data: q } = await db().from('bk_quotes').select('customer_user_id, business_id, request').eq('id', quoteId).maybeSingle();
  if (!q) return null;
  if (q.customer_user_id !== userId) {
    const { data: biz } = await db().from('bk_businesses').select('owner_user_id').eq('id', q.business_id).single();
    if (biz?.owner_user_id !== userId) return null;
  }
  const path = ((q.request as QuoteRequest).images ?? [])[index];
  if (!path || !isQuoteImagePath(path)) return null;
  const { data } = await db().storage.from(QUOTE_IMAGE_BUCKET).download(path);
  return data ? { data, ext: path.split('.').pop() ?? 'jpg' } : null;
}
