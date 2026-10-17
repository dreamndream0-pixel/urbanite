// 預約系統:伺服器端(建立預約、狀態變更、通知待發清單、背景工作)
// 所有寫入走資料庫 RPC(bk_create_booking / bk_transition),同一交易寫入預約、歷程與通知
import { createAdminClient } from '@/lib/supabase/admin';
import { getMessagingConfig } from '@/lib/line-messaging';
import { getConfiguredSiteUrl } from '@/lib/site-url';
import { scopedClient, URBANITE_SHOP_ID } from '@/lib/shop';
import {
  computeSlots, formatRange, localParts, minutesToHHMM, money,
  type BkBooking, type BkBusiness, type BkHour, type BkService, type BookingStatus,
} from './shared';

export class BookingError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}

const db = () => createAdminClient();
const ACTIVE: BookingStatus[] = ['pending', 'confirmed'];

// 名片代稱 → 開放中的預約商家與名片資訊
export async function getPublicBusiness(slug: string) {
  const { data: card } = await db().from('profile_cards').select('id, slug, display_name, avatar_url, owner_user_id, published').eq('slug', slug).maybeSingle();
  if (!card || card.published === false || !card.owner_user_id) return null;
  const { data: business } = await db().from('bk_businesses').select('*').eq('owner_user_id', card.owner_user_id).maybeSingle();
  if (!business || !business.enabled) return null;
  return { card: card as { id: string; slug: string; display_name: string; avatar_url: string; owner_user_id: string }, business: business as BkBusiness };
}

export async function loadSchedule(businessId: string) {
  const [{ data: services }, { data: hours }] = await Promise.all([
    db().from('bk_services').select('*').eq('business_id', businessId).eq('active', true).order('sort_order').order('created_at'),
    db().from('bk_hours').select('weekday, start_min, end_min').eq('business_id', businessId),
  ]);
  return { services: (services ?? []) as BkService[], hours: (hours ?? []) as BkHour[] };
}

// 指定日期範圍內的可約時段(含既有預約、休假)
export async function availability(business: BkBusiness, service: BkService, hours: BkHour[], fromDate: string, days: number) {
  const fromIso = new Date(new Date(`${fromDate}T00:00:00+08:00`).getTime() - 86400000).toISOString();
  const toIso = new Date(new Date(`${fromDate}T00:00:00+08:00`).getTime() + (days + 1) * 86400000).toISOString();
  const [{ data: busy }, { data: exceptions }] = await Promise.all([
    db().from('bk_bookings').select('start_at, occupy_end_at, status, expires_at').eq('business_id', business.id).in('status', ACTIVE).lt('start_at', toIso).gt('occupy_end_at', fromIso),
    db().from('bk_exceptions').select('start_at, end_at').eq('business_id', business.id).lt('start_at', toIso).gt('end_at', fromIso),
  ]);
  const now = Date.now();
  // 逾期未確認的待確認預約不算占用(建立時會在交易內回收)
  const live = (busy ?? []).filter((b) => !(b.status === 'pending' && b.expires_at && new Date(b.expires_at).getTime() < now));
  return computeSlots({ business, hours, exceptions: exceptions ?? [], busy: live, duration: service.duration_minutes, fromDate, days });
}

function bookingNo() {
  const { date } = localParts(new Date());
  return `BK-${date.replace(/-/g, '')}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

type Notice = { event: string; audience: 'customer' | 'owner'; due_at?: string };

function reminderNotices(business: BkBusiness, startIso: string): Notice[] {
  const start = new Date(startIso).getTime();
  const soon = Date.now() + 5 * 60000;
  const list: Notice[] = [];
  // 已經過了提醒時間就不補發(例:服務前 1 小時才成立,不發 24 小時 / 2 小時提醒)
  if (business.reminder_24h && start - 24 * 3600000 > soon) list.push({ event: 'reminder_24h', audience: 'customer', due_at: new Date(start - 24 * 3600000).toISOString() });
  if (business.reminder_2h && start - 2 * 3600000 > soon) list.push({ event: 'reminder_2h', audience: 'customer', due_at: new Date(start - 2 * 3600000).toISOString() });
  return list;
}

function rpcError(message: string): BookingError {
  if (message.includes('SLOT_UNAVAILABLE')) return new BookingError('SLOT_UNAVAILABLE', '這個時段剛被預約,請重新選擇。', 409);
  if (message.includes('VERSION_CONFLICT')) return new BookingError('VERSION_CONFLICT', '預約內容已經更新,請重新整理後再操作。', 409);
  if (message.includes('INVALID_STATE')) return new BookingError('INVALID_STATE', '目前的預約狀態不能執行這個操作。', 409);
  if (message.includes('NOT_FOUND')) return new BookingError('NOT_FOUND', '找不到這筆預約。', 404);
  return new BookingError('SERVER_ERROR', '預約處理失敗,請稍後再試。', 500);
}

// 顧客建立預約:伺服器重新核對服務、時段(營業時間、休假、提前時間),資料庫排他約束保證不重複
export async function createBooking(input: {
  slug: string; userId: string; serviceId: string; startAt: string;
  contact: { name: string; phone: string; note: string }; idempotencyKey: string; channel: string;
}) {
  // 重送(網路重試、連點):同一顧客同一個 key 直接回傳原本那筆,不重新檢查時段(時段已被自己占用)
  const idem = input.idempotencyKey.slice(0, 80);
  if (idem) {
    const { data: existing } = await db().from('bk_bookings').select('*').eq('customer_user_id', input.userId).eq('idempotency_key', idem).maybeSingle();
    if (existing) return existing as BkBooking;
  }
  const ctx = await getPublicBusiness(input.slug);
  if (!ctx) throw new BookingError('NOT_FOUND', '這張名片目前沒有開放預約。', 404);
  const { business, card } = ctx;
  if (business.owner_user_id === input.userId) throw new BookingError('POLICY_BLOCKED', '不能預約自己的服務,請用其他帳號測試。', 422);
  const { services, hours } = await loadSchedule(business.id);
  const service = services.find((s) => s.id === input.serviceId);
  if (!service) throw new BookingError('VALIDATION_ERROR', '這個服務目前無法預約。', 422);

  const start = new Date(input.startAt);
  if (Number.isNaN(start.getTime())) throw new BookingError('VALIDATION_ERROR', '時間格式錯誤。', 422);
  const local = localParts(start);
  const [day] = await availability(business, service, hours, local.date, 1);
  if (!day.slots.includes(minutesToHHMM(local.minutes))) throw new BookingError('SLOT_UNAVAILABLE', '這個時段已無法預約,請重新選擇。', 409);

  const end = new Date(start.getTime() + service.duration_minutes * 60000);
  const occupyEnd = new Date(end.getTime() + business.buffer_minutes * 60000);
  const manual = business.approval_mode === 'manual';
  let expires: string | null = null;
  if (manual) {
    // 確認期限:不晚於服務開始前 30 分鐘
    const deadline = Math.min(Date.now() + business.approve_hours * 3600000, start.getTime() - 30 * 60000);
    if (deadline <= Date.now() + 5 * 60000) throw new BookingError('POLICY_BLOCKED', '這個時段太近,來不及確認,請直接聯絡店家。', 422);
    expires = new Date(deadline).toISOString();
  }
  const notices: Notice[] = [
    { event: 'new_booking', audience: 'owner' },
    { event: manual ? 'received' : 'confirmed', audience: 'customer' },
    ...(manual ? [] : reminderNotices(business, start.toISOString())),
  ];
  const { data, error } = await db().rpc('bk_create_booking', {
    p_business_id: business.id,
    p_customer: input.userId,
    p_service_id: service.id,
    p_service_snapshot: { name: service.name, duration_minutes: service.duration_minutes, price: service.price, price_note: service.price_note },
    p_start: start.toISOString(),
    p_end: end.toISOString(),
    p_occupy_end: occupyEnd.toISOString(),
    p_status: manual ? 'pending' : 'confirmed',
    p_approval: manual ? 'pending' : 'not_required',
    p_expires: expires,
    p_contact: {
      name: input.contact.name.trim().slice(0, 40),
      phone: input.contact.phone.trim().slice(0, 30),
      note: input.contact.note.trim().slice(0, 500),
    },
    p_source_card: card.id,
    p_source_channel: input.channel.slice(0, 20) || 'card',
    p_idem: idem || null,
    p_booking_no: bookingNo(),
    p_notices: notices,
  });
  if (error) throw rpcError(error.message);
  return data as BkBooking;
}

type Command = 'approve' | 'reject' | 'cancel' | 'complete' | 'no_show';

// 名片主人(店家)操作預約
export async function ownerCommand(ownerUserId: string, bookingId: string, command: Command, expectedVersion: number, reason = '') {
  const { data: business } = await db().from('bk_businesses').select('*').eq('owner_user_id', ownerUserId).maybeSingle();
  if (!business) throw new BookingError('NOT_FOUND', '找不到這筆預約。', 404);
  const { data: booking } = await db().from('bk_bookings').select('*').eq('id', bookingId).eq('business_id', business.id).maybeSingle();
  if (!booking) throw new BookingError('NOT_FOUND', '找不到這筆預約。', 404);
  const b = booking as BkBooking;
  const plan: Record<Command, { from: BookingStatus[]; status: BookingStatus; approval: string | null; notices: Notice[] }> = {
    approve: { from: ['pending'], status: 'confirmed', approval: 'approved', notices: [{ event: 'confirmed', audience: 'customer' }, ...reminderNotices(business as BkBusiness, b.start_at)] },
    reject: { from: ['pending'], status: 'cancelled', approval: 'rejected', notices: [{ event: 'rejected', audience: 'customer' }] },
    cancel: { from: ['pending', 'confirmed'], status: 'cancelled', approval: null, notices: [{ event: 'cancelled_by_owner', audience: 'customer' }] },
    complete: { from: ['confirmed'], status: 'completed', approval: null, notices: [] },
    no_show: { from: ['confirmed'], status: 'no_show', approval: null, notices: [] },
  };
  const p = plan[command];
  if (!p) throw new BookingError('VALIDATION_ERROR', '不支援的操作。', 422);
  if (command === 'no_show' && new Date(b.start_at).getTime() > Date.now()) throw new BookingError('POLICY_BLOCKED', '服務時間開始後才能標記未到。', 422);
  if (command === 'approve' && b.expires_at && new Date(b.expires_at).getTime() < Date.now()) throw new BookingError('POLICY_BLOCKED', '已超過確認期限,這筆預約已逾期。', 422);
  const { data, error } = await db().rpc('bk_transition', {
    p_booking_id: b.id, p_expected_version: expectedVersion, p_from: p.from, p_status: p.status, p_approval: p.approval,
    p_reason: reason.slice(0, 200), p_actor_type: 'owner', p_actor: ownerUserId, p_event: command, p_notices: p.notices,
  });
  if (error) throw rpcError(error.message);
  return data as BkBooking;
}

// 顧客取消自己的預約(待確認隨時可取消;已確認依店家設定的期限)
export async function customerCancel(userId: string, bookingId: string, expectedVersion: number, reason = '') {
  const { data: booking } = await db().from('bk_bookings').select('*').eq('id', bookingId).eq('customer_user_id', userId).maybeSingle();
  if (!booking) throw new BookingError('NOT_FOUND', '找不到這筆預約。', 404);
  const b = booking as BkBooking;
  const { data: business } = await db().from('bk_businesses').select('cancel_hours').eq('id', b.business_id).single();
  if (b.status === 'confirmed' && new Date(b.start_at).getTime() - Date.now() < (business?.cancel_hours ?? 24) * 3600000) {
    throw new BookingError('POLICY_BLOCKED', `服務前 ${business?.cancel_hours ?? 24} 小時內無法線上取消,請直接聯絡店家。`, 422);
  }
  const { data, error } = await db().rpc('bk_transition', {
    p_booking_id: b.id, p_expected_version: expectedVersion, p_from: ['pending', 'confirmed'], p_status: 'cancelled', p_approval: null,
    p_reason: reason.slice(0, 200), p_actor_type: 'customer', p_actor: userId, p_event: 'cancelled_by_customer',
    p_notices: [{ event: 'cancelled_by_customer', audience: 'owner' }],
  });
  if (error) throw rpcError(error.message);
  return data as BkBooking;
}

// ---------- 通知 ----------
const TITLES: Record<string, { customer?: string; owner?: string; color: string }> = {
  new_booking: { owner: '你有一筆新預約', color: '#1f6f8b' },
  received: { customer: '預約申請已送出,等待店家確認', color: '#b07a1f' },
  confirmed: { customer: '預約已確認', color: '#2f6b3f' },
  rejected: { customer: '預約未成立', color: '#8a5a50' },
  cancelled_by_owner: { customer: '店家已取消你的預約', color: '#8a5a50' },
  cancelled_by_customer: { owner: '顧客取消了預約', color: '#8a5a50' },
  expired: { customer: '預約申請已逾期', owner: '一筆預約已逾期未確認', color: '#8a7f72' },
  reminder_24h: { customer: '明天的預約提醒', color: '#1f6f8b' },
  reminder_2h: { customer: '預約即將開始', color: '#1f6f8b' },
};

async function lineUserIdOf(userId: string) {
  const { data } = await scopedClient(URBANITE_SHOP_ID).from('customers').select('line_user_id').eq('user_id', userId).maybeSingle();
  return (data?.line_user_id as string | null) || null;
}

function flexMessage(opts: { title: string; color: string; businessName: string; booking: BkBooking; link: string; button: string; extra?: string }) {
  const b = opts.booking;
  const row = (k: string, v: string) => ({ type: 'box', layout: 'baseline', spacing: 'sm', contents: [
    { type: 'text', text: k, size: 'sm', color: '#8a7f72', flex: 2 },
    { type: 'text', text: v || '—', size: 'sm', color: '#1f1b19', flex: 5, wrap: true },
  ] });
  const price = b.service_snapshot.price ? `${money(b.service_snapshot.price)}${b.service_snapshot.price_note ? ` ${b.service_snapshot.price_note}` : ''}` : (b.service_snapshot.price_note || '—');
  return {
    type: 'flex',
    altText: `【${opts.businessName}】${opts.title}`.slice(0, 300),
    contents: {
      type: 'bubble',
      header: { type: 'box', layout: 'vertical', backgroundColor: opts.color, paddingAll: '16px', contents: [
        { type: 'text', text: opts.businessName || 'URBANLINKS 預約', size: 'xs', color: '#ffffffcc' },
        { type: 'text', text: opts.title, size: 'lg', weight: 'bold', color: '#ffffff', wrap: true, margin: 'sm' },
      ] },
      body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [
        row('服務', b.service_snapshot.name),
        row('時間', formatRange(b.start_at, b.end_at)),
        row('價格', price),
        row('預約人', b.contact?.name ?? ''),
        row('編號', b.booking_no),
        ...(opts.extra ? [{ type: 'text', text: opts.extra, size: 'xs', color: '#8a7f72', wrap: true, margin: 'md' }] : []),
      ] },
      footer: { type: 'box', layout: 'vertical', contents: [
        { type: 'button', style: 'primary', color: '#1f1b19', height: 'sm', action: { type: 'uri', label: opts.button, uri: opts.link } },
      ] },
    },
  };
}

type OutboxRow = { id: string; booking_id: string; booking_version: number; event: string; audience: 'customer' | 'owner'; attempts: number };

async function deliver(row: OutboxRow, token: string): Promise<{ state: 'api_accepted' | 'skipped' | 'retry' | 'failed'; error?: string }> {
  const { data: booking } = await db().from('bk_bookings').select('*').eq('id', row.booking_id).maybeSingle();
  if (!booking) return { state: 'skipped', error: 'booking_missing' };
  const b = booking as BkBooking;
  // 提醒:預約已改動(版本不同)或不是已確認 → 不發舊提醒
  if (row.event.startsWith('reminder_') && (b.version !== row.booking_version || b.status !== 'confirmed')) return { state: 'skipped', error: 'stale' };
  if (row.event.startsWith('reminder_') && new Date(b.start_at).getTime() < Date.now()) return { state: 'skipped', error: 'past' };
  const { data: business } = await db().from('bk_businesses').select('owner_user_id, name, card_id, address').eq('id', b.business_id).single();
  const { data: card } = business?.card_id ? await db().from('profile_cards').select('slug, display_name').eq('id', business.card_id).maybeSingle() : { data: null };
  const meta = TITLES[row.event];
  const title = meta?.[row.audience];
  if (!meta || !title) return { state: 'skipped', error: 'no_template' };
  const recipient = row.audience === 'owner' ? business?.owner_user_id : b.customer_user_id;
  const lineId = recipient ? await lineUserIdOf(recipient) : null;
  if (!lineId) return { state: 'skipped', error: 'no_line' };
  const site = getConfiguredSiteUrl();
  const businessName = business?.name || card?.display_name || '';
  const link = row.audience === 'owner' ? `${site}/mycard/booking` : `${site}/@${card?.slug ?? ''}/book?tab=my`;
  const extra = row.audience === 'customer' && business?.address && ['confirmed', 'reminder_24h', 'reminder_2h'].includes(row.event) ? `地點:${business.address}` : undefined;
  const message = flexMessage({ title, color: meta.color, businessName, booking: b, link, button: row.audience === 'owner' ? '到後台處理' : '查看預約', extra });
  try {
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Line-Retry-Key': row.id },
      body: JSON.stringify({ to: lineId, messages: [message] }),
    });
    if (res.ok || res.status === 409) return { state: 'api_accepted' }; // 409 = 相同 retry key 已接受過
    const retryable = res.status === 429 || res.status >= 500;
    return { state: retryable ? 'retry' : 'failed', error: `line_${res.status}` };
  } catch {
    return { state: 'retry', error: 'network' };
  }
}

// 背景工作:回收逾期待確認、送出到期的通知(cron 每 5 分鐘,建立 / 操作預約後也會立刻跑一次)
export async function processBookingJobs(limit = 30) {
  const result = { expired: 0, sent: 0, skipped: 0, failed: 0 };
  const now = new Date().toISOString();
  const { data: overdue } = await db().from('bk_bookings').select('id, version').eq('status', 'pending').lt('expires_at', now).limit(50);
  for (const o of overdue ?? []) {
    const { error } = await db().rpc('bk_transition', {
      p_booking_id: o.id, p_expected_version: o.version, p_from: ['pending'], p_status: 'expired', p_approval: 'rejected',
      p_reason: '超過確認期限', p_actor_type: 'system', p_actor: null, p_event: 'expired',
      p_notices: [{ event: 'expired', audience: 'customer' }, { event: 'expired', audience: 'owner' }],
    });
    if (!error) result.expired++;
  }

  const { data: claimed, error } = await db().rpc('bk_claim_outbox', { p_limit: limit });
  if (error || !claimed?.length) return result;
  const { accessToken } = await getMessagingConfig();
  for (const row of claimed as OutboxRow[]) {
    const r = accessToken ? await deliver(row, accessToken) : { state: 'skipped' as const, error: 'line_not_configured' };
    const patch: Record<string, unknown> = { lease_until: null, last_error: r.error ?? '', updated_at: new Date().toISOString() };
    if (r.state === 'retry' && row.attempts < 6) {
      patch.state = 'queued';
      patch.due_at = new Date(Date.now() + Math.min(60, 2 ** row.attempts) * 60000 + Math.random() * 30000).toISOString();
    } else {
      patch.state = r.state === 'retry' ? 'failed' : r.state;
    }
    await db().from('bk_notification_outbox').update(patch).eq('id', row.id);
    if (patch.state === 'api_accepted') result.sent++;
    else if (patch.state === 'skipped') result.skipped++;
    else if (patch.state === 'failed') result.failed++;
  }
  return result;
}

// 名片主人:取得(或建立)自己的預約商家
export async function ownerBusiness(userId: string, create = false) {
  const { data } = await db().from('bk_businesses').select('*').eq('owner_user_id', userId).maybeSingle();
  if (data || !create) return (data as BkBusiness | null) ?? null;
  const { data: card } = await db().from('profile_cards').select('id, display_name').eq('owner_user_id', userId).maybeSingle();
  const { data: created, error } = await db().from('bk_businesses')
    .insert({ owner_user_id: userId, card_id: card?.id ?? null, name: card?.display_name ?? '' })
    .select('*').single();
  if (error) {
    const { data: again } = await db().from('bk_businesses').select('*').eq('owner_user_id', userId).maybeSingle();
    return (again as BkBusiness | null) ?? null;
  }
  return created as BkBusiness;
}
