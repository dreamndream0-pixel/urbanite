// 預約系統:伺服器端(建立預約、分派人員 / 床位、狀態變更、收款、改期、通知待發清單、背景工作)
// 所有寫入走資料庫 RPC(bk_create_booking2 / bk_transition / bk_record_payment / bk_reschedule / bk_report_payment),
// 同一交易寫入預約、歷程與通知;人員與床位的重複預約由資料庫排他約束擋下
import { createAdminClient } from '@/lib/supabase/admin';
import { getMessagingConfig } from '@/lib/line-messaging';
import { getConfiguredSiteUrl } from '@/lib/site-url';
import { scopedClient, URBANITE_SHOP_ID } from '@/lib/shop';
import {
  ACTIVE_STATUSES, addDays, computeSlots, formatDateTime, formatRange, localParts, minutesToHHMM, money,
  type BkAddon, type BkBooking, type BkBusiness, type BkHour, type BkResource, type BkService, type BkStaff,
  type BkStaffHour, type BkStaffService, type BookingStatus,
} from './shared';

export class BookingError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); }
}

const db = () => createAdminClient();

// 名片代稱 → 開放中的預約商家與名片資訊
export async function getPublicBusiness(slug: string) {
  const { data: card } = await db().from('profile_cards').select('id, slug, display_name, avatar_url, owner_user_id, published').eq('slug', slug).maybeSingle();
  if (!card || card.published === false || !card.owner_user_id) return null;
  const { data: business } = await db().from('bk_businesses').select('*').eq('owner_user_id', card.owner_user_id).maybeSingle();
  if (!business || !business.enabled) return null;
  return { card: card as { id: string; slug: string; display_name: string; avatar_url: string; owner_user_id: string }, business: business as BkBusiness };
}

export type Schedule = {
  services: BkService[]; addons: BkAddon[]; hours: BkHour[]; staff: BkStaff[];
  staffHours: BkStaffHour[]; staffServices: BkStaffService[]; resources: BkResource[];
};

// 商家的服務、加購、營業時段、人員、班表、床位(all = 後台用,含未開放)
export async function loadSchedule(businessId: string, all = false): Promise<Schedule> {
  const [services, addons, hours, staff, staffHours, staffServices, resources] = await Promise.all([
    db().from('bk_services').select('*').eq('business_id', businessId).in('active', all ? [true, false] : [true]).order('sort_order').order('created_at'),
    db().from('bk_addons').select('*').eq('business_id', businessId).in('active', all ? [true, false] : [true]).order('sort_order'),
    db().from('bk_hours').select('weekday, start_min, end_min').eq('business_id', businessId).order('weekday').order('start_min'),
    db().from('bk_staff').select('*').eq('business_id', businessId).in('active', all ? [true, false] : [true]).order('sort_order').order('created_at'),
    db().from('bk_staff_hours').select('staff_id, weekday, start_min, end_min').eq('business_id', businessId).order('weekday').order('start_min'),
    db().from('bk_staff_services').select('staff_id, service_id, duration_minutes, price').eq('business_id', businessId),
    db().from('bk_resources').select('id, name, active, sort_order').eq('business_id', businessId).in('active', all ? [true, false] : [true]).order('sort_order').order('created_at'),
  ]);
  return {
    services: (services.data ?? []) as BkService[],
    addons: (addons.data ?? []) as BkAddon[],
    hours: (hours.data ?? []) as BkHour[],
    staff: (staff.data ?? []) as BkStaff[],
    staffHours: (staffHours.data ?? []) as BkStaffHour[],
    staffServices: (staffServices.data ?? []) as BkStaffService[],
    resources: (resources.data ?? []) as BkResource[],
  };
}

// 可做這個服務的人員:服務有設定對應人員就只限那些人,沒設定 = 所有人員
export function staffForService(sched: Schedule, serviceId: string) {
  const links = sched.staffServices.filter((x) => x.service_id === serviceId);
  const active = sched.staff.filter((s) => s.active);
  return links.length ? active.filter((s) => links.some((l) => l.staff_id === s.id)) : active;
}

// 某位人員做這個服務 + 加購的時長與價格(人員可個別設定時間、價格)
export function quote(sched: Schedule, service: BkService, staffId: string | null, addonIds: string[]) {
  const link = staffId ? sched.staffServices.find((x) => x.service_id === service.id && x.staff_id === staffId) : undefined;
  const addons = sched.addons.filter((a) => a.service_id === service.id && a.active && addonIds.includes(a.id));
  const base = { duration: link?.duration_minutes ?? service.duration_minutes, price: link?.price ?? service.price };
  return {
    duration: base.duration + addons.reduce((n, a) => n + a.extra_minutes, 0),
    total: base.price + addons.reduce((n, a) => n + a.price, 0),
    addons: addons.map((a) => ({ id: a.id, name: a.name, price: a.price, extra_minutes: a.extra_minutes })),
  };
}

function hoursOf(sched: Schedule, staff: BkStaff): BkHour[] {
  if (staff.use_business_hours) return sched.hours;
  return sched.staffHours.filter((h) => h.staff_id === staff.id);
}

type Occupancy = { id: string; staff_id: string | null; resource_id: string | null; start_at: string; occupy_end_at: string };

async function occupancy(businessId: string, fromIso: string, toIso: string, excludeId?: string) {
  const [{ data: busy }, { data: exceptions }] = await Promise.all([
    db().from('bk_bookings').select('id, staff_id, resource_id, start_at, occupy_end_at, status, expires_at')
      .eq('business_id', businessId).in('status', ACTIVE_STATUSES).lt('start_at', toIso).gt('occupy_end_at', fromIso),
    db().from('bk_exceptions').select('start_at, end_at, staff_id').eq('business_id', businessId).lt('start_at', toIso).gt('end_at', fromIso),
  ]);
  const now = Date.now();
  // 逾期的待成立預約不算占用(建立時會在交易內回收)
  const live = (busy ?? []).filter((b) => b.id !== excludeId && !(b.status === 'pending' && b.expires_at && new Date(b.expires_at).getTime() < now)) as Occupancy[];
  return { live, exceptions: (exceptions ?? []) as { start_at: string; end_at: string; staff_id: string | null }[] };
}

type SlotRequest = { serviceId: string; addonIds: string[]; staffId: string | null; excludeBookingId?: string; ignoreLimits?: boolean };

// 可約時段:每位候選人員各自算(班表、休假、自己的預約、床位),再合併;staffId = 指定人員
export async function availability(business: BkBusiness, sched: Schedule, req: SlotRequest, fromDate: string, days: number) {
  const service = sched.services.find((s) => s.id === req.serviceId);
  if (!service) throw new BookingError('VALIDATION_ERROR', '這個服務目前無法預約。', 422);
  let candidates = staffForService(sched, service.id);
  if (req.staffId) candidates = candidates.filter((s) => s.id === req.staffId);
  const fromIso = new Date(new Date(`${fromDate}T00:00:00+08:00`).getTime() - 86400000).toISOString();
  const toIso = new Date(new Date(`${fromDate}T00:00:00+08:00`).getTime() + (days + 1) * 86400000).toISOString();
  const { live, exceptions } = await occupancy(business.id, fromIso, toIso, req.excludeBookingId);
  const pools = service.needs_resource && sched.resources.length ? sched.resources.map((r) => live.filter((b) => b.resource_id === r.id)) : [];
  const rules = req.ignoreLimits ? { ...business, lead_minutes: 0, advance_days: 365 } : business;
  const byStaff = new Map<string, { date: string; slots: string[]; closed: boolean }[]>();
  for (const staff of candidates) {
    byStaff.set(staff.id, computeSlots({
      business: rules,
      hours: hoursOf(sched, staff),
      exceptions: exceptions.filter((x) => !x.staff_id || x.staff_id === staff.id),
      busy: live.filter((b) => b.staff_id === staff.id),
      pools,
      duration: quote(sched, service, staff.id, req.addonIds).duration,
      fromDate,
      days,
    }));
  }
  const merged: { date: string; slots: string[]; closed: boolean }[] = [];
  for (let i = 0; i < days; i++) {
    const per = [...byStaff.values()].map((d) => d[i]).filter(Boolean);
    const slots = [...new Set(per.flatMap((d) => d.slots))].sort();
    merged.push({ date: addDays(fromDate, i), slots, closed: !per.length || per.every((d) => d.closed) });
  }
  return { days: merged, byStaff, service, live };
}

function bookingNo() {
  const { date } = localParts(new Date());
  return `BK-${date.replace(/-/g, '')}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

type Notice = { event: string; audience: 'customer' | 'owner'; due_at?: string };

function reminderNotices(business: Pick<BkBusiness, 'reminder_24h' | 'reminder_2h'>, startIso: string): Notice[] {
  const start = new Date(startIso).getTime();
  const soon = Date.now() + 5 * 60000;
  const list: Notice[] = [];
  // 已經過了提醒時間就不補發(例:服務前 1 小時才成立,不發 24 小時 / 2 小時提醒)
  if (business.reminder_24h && start - 24 * 3600000 > soon) list.push({ event: 'reminder_24h', audience: 'customer', due_at: new Date(start - 24 * 3600000).toISOString() });
  if (business.reminder_2h && start - 2 * 3600000 > soon) list.push({ event: 'reminder_2h', audience: 'customer', due_at: new Date(start - 2 * 3600000).toISOString() });
  return list;
}

// 訂金轉帳期限:店家設定的小時數內,且不晚於服務前 1 小時;至少給 30 分鐘
function payDeadline(business: BkBusiness, startMs: number) {
  const latest = startMs - 60 * 60000;
  return Math.max(Date.now() + 30 * 60000, Math.min(Date.now() + business.deposit_hours * 3600000, latest));
}

function rpcError(message: string): BookingError {
  if (message.includes('SLOT_UNAVAILABLE')) return new BookingError('SLOT_UNAVAILABLE', '這個時段剛被預約,請重新選擇。', 409);
  if (message.includes('VERSION_CONFLICT')) return new BookingError('VERSION_CONFLICT', '預約內容已經更新,請重新整理後再操作。', 409);
  if (message.includes('INVALID_STATE')) return new BookingError('INVALID_STATE', '目前的預約狀態不能執行這個操作。', 409);
  if (message.includes('VALIDATION_ERROR')) return new BookingError('VALIDATION_ERROR', '金額不正確。', 422);
  if (message.includes('NOT_FOUND')) return new BookingError('NOT_FOUND', '找不到這筆預約。', 404);
  return new BookingError('SERVER_ERROR', '預約處理失敗,請稍後再試。', 500);
}

type Placement = { staff: BkStaff; q: ReturnType<typeof quote>; end: Date; occupyEnd: Date; resources: (string | null)[] };

// 這個開始時間可以給哪些人員 / 床位(依序嘗試);不限人員時當天預約較少的人優先
async function placements(business: BkBusiness, sched: Schedule, req: SlotRequest, start: Date): Promise<Placement[]> {
  const local = localParts(start);
  const label = minutesToHHMM(local.minutes);
  const { byStaff, service, live } = await availability(business, sched, req, local.date, 1);
  const free = [...byStaff.entries()].filter(([, d]) => d[0]?.slots.includes(label)).map(([id]) => sched.staff.find((s) => s.id === id)!);
  const load = (id: string) => live.filter((b) => b.staff_id === id && localParts(b.start_at).date === local.date).length;
  free.sort((a, b) => load(a.id) - load(b.id) || a.sort_order - b.sort_order);
  return free.map((staff) => {
    const q = quote(sched, service, staff.id, req.addonIds);
    const end = new Date(start.getTime() + q.duration * 60000);
    const occupyEnd = new Date(end.getTime() + business.buffer_minutes * 60000);
    const resources = service.needs_resource && sched.resources.length
      ? sched.resources.filter((r) => !live.some((b) => b.resource_id === r.id && new Date(b.start_at) < occupyEnd && start < new Date(b.occupy_end_at))).map((r) => r.id)
      : [null];
    return { staff, q, end, occupyEnd, resources };
  }).filter((p) => p.resources.length);
}

// 依序嘗試候選人員 / 床位;被同時送出的人搶走就換下一個(資料庫排他約束保證不重複)
async function tryPlacements<T>(list: Placement[], run: (p: Placement, resourceId: string | null) => Promise<T>) {
  let attempts = 0;
  for (const p of list) {
    for (const r of p.resources) {
      if (++attempts > 8) break;
      try { return await run(p, r); }
      catch (e) { if (!(e instanceof BookingError && e.code === 'SLOT_UNAVAILABLE')) throw e; }
    }
  }
  throw new BookingError('SLOT_UNAVAILABLE', '這個時段已無法預約,請重新選擇。', 409);
}

const snapshotOf = (service: BkService, q: ReturnType<typeof quote>) => ({ name: service.name, duration_minutes: q.duration, price: q.total, price_note: service.price_note });

const cleanContact = (c: { name: string; phone: string; note: string }) => ({
  name: c.name.trim().slice(0, 40), phone: c.phone.trim().slice(0, 30), note: c.note.trim().slice(0, 500),
});

// 顧客建立預約:伺服器重新核對服務、人員、時段、床位與金額(不採用前端的時長與金額)
export async function createBooking(input: {
  slug: string; userId: string; serviceId: string; addonIds: string[]; staffId: string | null; startAt: string;
  contact: { name: string; phone: string; note: string }; idempotencyKey: string; channel: string;
}) {
  // 重送(網路重試、連點):同一顧客同一個 key 直接回傳原本那筆
  const idem = input.idempotencyKey.slice(0, 80);
  if (idem) {
    const { data: existing } = await db().from('bk_bookings').select('*').eq('customer_user_id', input.userId).eq('idempotency_key', idem).maybeSingle();
    if (existing) return existing as BkBooking;
  }
  const ctx = await getPublicBusiness(input.slug);
  if (!ctx) throw new BookingError('NOT_FOUND', '這張名片目前沒有開放預約。', 404);
  const { business, card } = ctx;
  if (business.owner_user_id === input.userId) throw new BookingError('POLICY_BLOCKED', '不能預約自己的服務,請用其他帳號測試。', 422);
  const sched = await loadSchedule(business.id);
  const service = sched.services.find((s) => s.id === input.serviceId);
  if (!service) throw new BookingError('VALIDATION_ERROR', '這個服務目前無法預約。', 422);
  if (!input.staffId && !business.allow_any_staff && staffForService(sched, service.id).length > 1) throw new BookingError('VALIDATION_ERROR', '請選擇服務人員。', 422);
  const start = new Date(input.startAt);
  if (Number.isNaN(start.getTime())) throw new BookingError('VALIDATION_ERROR', '時間格式錯誤。', 422);

  const list = await placements(business, sched, { serviceId: service.id, addonIds: input.addonIds, staffId: input.staffId }, start);
  if (!list.length) throw new BookingError('SLOT_UNAVAILABLE', '這個時段已無法預約,請重新選擇。', 409);

  const manual = business.approval_mode === 'manual';
  const contact = cleanContact(input.contact);
  return tryPlacements(list, async (p, resourceId) => {
    const deposit = service.deposit > 0 ? (p.q.total > 0 ? Math.min(service.deposit, p.q.total) : service.deposit) : 0;
    let expires: string | null = null;
    if (manual) {
      // 確認期限:不晚於服務開始前 30 分鐘
      const deadline = Math.min(Date.now() + business.approve_hours * 3600000, start.getTime() - 30 * 60000);
      if (deadline <= Date.now() + 5 * 60000) throw new BookingError('POLICY_BLOCKED', '這個時段太近,來不及確認,請直接聯絡店家。', 422);
      expires = new Date(deadline).toISOString();
    } else if (deposit) {
      if (start.getTime() - Date.now() < 90 * 60000) throw new BookingError('POLICY_BLOCKED', '這個時段太近,來不及轉帳訂金,請直接聯絡店家。', 422);
      expires = new Date(payDeadline(business, start.getTime())).toISOString();
    }
    const confirmed = !manual && !deposit;
    const notices: Notice[] = [
      { event: 'new_booking', audience: 'owner' },
      { event: manual ? 'received' : deposit ? 'awaiting_deposit' : 'confirmed', audience: 'customer' },
      ...(confirmed ? reminderNotices(business, start.toISOString()) : []),
    ];
    const { data, error } = await db().rpc('bk_create_booking2', {
      p: {
        business_id: business.id, booking_no: bookingNo(), customer_user_id: input.userId, service_id: service.id,
        service_snapshot: snapshotOf(service, p.q), start_at: start.toISOString(), end_at: p.end.toISOString(), occupy_end_at: p.occupyEnd.toISOString(),
        status: confirmed ? 'confirmed' : 'pending', approval_status: manual ? 'pending' : 'not_required', expires_at: expires,
        contact, source_card_id: card.id, source_channel: input.channel.slice(0, 20) || 'card', idempotency_key: idem || null,
        staff_id: p.staff.id, staff_requested: Boolean(input.staffId), resource_id: resourceId, addons: p.q.addons,
        total_price: p.q.total, deposit_amount: deposit, payment_status: deposit ? 'awaiting' : 'none',
        created_by: 'customer', actor_type: 'customer', actor_id: input.userId,
      },
      p_notices: notices,
    });
    if (error) throw rpcError(error.message);
    return data as BkBooking;
  });
}

// 店家人工加單(電話、現場客):一樣經過人員 / 床位衝突檢查,不受最短提前與可約天數限制
export async function ownerCreateBooking(ownerUserId: string, input: {
  serviceId: string; addonIds: string[]; staffId: string | null; startAt: string; contact: { name: string; phone: string; note: string };
}) {
  const business = await ownerBusiness(ownerUserId);
  if (!business) throw new BookingError('NOT_FOUND', '請先完成預約設定。', 404);
  const sched = await loadSchedule(business.id);
  const service = sched.services.find((s) => s.id === input.serviceId);
  if (!service) throw new BookingError('VALIDATION_ERROR', '請選擇服務。', 422);
  const start = new Date(input.startAt);
  if (Number.isNaN(start.getTime())) throw new BookingError('VALIDATION_ERROR', '時間格式錯誤。', 422);
  if (start.getTime() < Date.now() - 12 * 3600000) throw new BookingError('VALIDATION_ERROR', '不能新增已經過去的預約。', 422);
  if (!input.contact.name.trim()) throw new BookingError('VALIDATION_ERROR', '請填寫顧客姓名。', 422);
  const list = await placements(business, sched, { serviceId: service.id, addonIds: input.addonIds, staffId: input.staffId, ignoreLimits: true }, start);
  if (!list.length) throw new BookingError('SLOT_UNAVAILABLE', '這個時段人員或床位已滿,或不在營業時段內。', 409);
  return tryPlacements(list, async (p, resourceId) => {
    const { data, error } = await db().rpc('bk_create_booking2', {
      p: {
        business_id: business.id, booking_no: bookingNo(), customer_user_id: null, service_id: service.id,
        service_snapshot: snapshotOf(service, p.q), start_at: start.toISOString(), end_at: p.end.toISOString(), occupy_end_at: p.occupyEnd.toISOString(),
        status: 'confirmed', approval_status: 'not_required', expires_at: null, contact: cleanContact(input.contact),
        source_card_id: business.card_id, source_channel: 'owner', staff_id: p.staff.id, staff_requested: Boolean(input.staffId),
        resource_id: resourceId, addons: p.q.addons, total_price: p.q.total, deposit_amount: 0, payment_status: 'none',
        created_by: 'owner', actor_type: 'owner', actor_id: ownerUserId,
      },
      p_notices: [],
    });
    if (error) throw rpcError(error.message);
    return data as BkBooking;
  });
}

type Command = 'approve' | 'reject' | 'cancel' | 'check_in' | 'complete' | 'no_show';

async function ownerBooking(ownerUserId: string, bookingId: string) {
  const business = await ownerBusiness(ownerUserId);
  if (!business) throw new BookingError('NOT_FOUND', '找不到這筆預約。', 404);
  const { data: booking } = await db().from('bk_bookings').select('*').eq('id', bookingId).eq('business_id', business.id).maybeSingle();
  if (!booking) throw new BookingError('NOT_FOUND', '找不到這筆預約。', 404);
  return { business, b: booking as BkBooking };
}

// 名片主人(店家)操作預約
export async function ownerCommand(ownerUserId: string, bookingId: string, command: Command, expectedVersion: number, reason = '', balance?: { amount: number; method: string }) {
  const { business, b } = await ownerBooking(ownerUserId, bookingId);
  let version = expectedVersion;
  const call = async (args: { from: BookingStatus[]; status: BookingStatus; approval: string | null; notices: Notice[]; expires?: string | null; payment?: string | null }) => {
    const { data, error } = await db().rpc('bk_transition', {
      p_booking_id: b.id, p_expected_version: version, p_from: args.from, p_status: args.status, p_approval: args.approval,
      p_reason: reason.slice(0, 200), p_actor_type: 'owner', p_actor: ownerUserId, p_event: command, p_notices: args.notices,
      p_expires: args.expires ?? null, p_payment_status: args.payment ?? null,
    });
    if (error) throw rpcError(error.message);
    return data as BkBooking;
  };
  switch (command) {
    case 'approve': {
      if (b.expires_at && new Date(b.expires_at).getTime() < Date.now()) throw new BookingError('POLICY_BLOCKED', '已超過確認期限,這筆預約已逾期。', 422);
      // 需要訂金且還沒付足:核准後才開始算訂金期限,收到訂金才成立
      if (b.deposit_amount > b.paid_amount) {
        return call({
          from: ['pending'], status: 'pending', approval: 'approved',
          expires: new Date(payDeadline(business, new Date(b.start_at).getTime())).toISOString(),
          payment: b.payment_status === 'reported' ? 'reported' : 'awaiting',
          notices: [{ event: 'approved_pay', audience: 'customer' }],
        });
      }
      return call({ from: ['pending'], status: 'confirmed', approval: 'approved', notices: [{ event: 'confirmed', audience: 'customer' }, ...reminderNotices(business, b.start_at)] });
    }
    case 'reject':
      return call({ from: ['pending'], status: 'cancelled', approval: 'rejected', notices: [{ event: 'rejected', audience: 'customer' }] });
    case 'cancel':
      return call({ from: ['pending', 'confirmed'], status: 'cancelled', approval: null, notices: [{ event: 'cancelled_by_owner', audience: 'customer' }] });
    case 'check_in':
      if (new Date(b.start_at).getTime() - Date.now() > 3 * 3600000) throw new BookingError('POLICY_BLOCKED', '服務前 3 小時內才能報到。', 422);
      return call({ from: ['confirmed'], status: 'checked_in', approval: null, notices: [] });
    case 'complete': {
      // 完成時一起收尾款(收款與完成分開記錄,訂金 + 尾款 = 總額,不重複計算營收)
      if (balance && balance.amount > 0) {
        const paid = await recordPayment(business, b, version, 'balance', balance.amount, balance.method, '完成服務時收取', 'owner', ownerUserId);
        version = paid.version;
      }
      return call({ from: ['confirmed', 'checked_in'], status: 'completed', approval: null, notices: [] });
    }
    case 'no_show':
      if (new Date(b.start_at).getTime() > Date.now()) throw new BookingError('POLICY_BLOCKED', '服務時間開始後才能標記未到。', 422);
      return call({ from: ['confirmed', 'checked_in'], status: 'no_show', approval: null, notices: [] });
    default:
      throw new BookingError('VALIDATION_ERROR', '不支援的操作。', 422);
  }
}

const METHODS = ['transfer', 'cash', 'card', 'other'];

async function recordPayment(business: BkBusiness, b: BkBooking, version: number, kind: string, amount: number, method: string, note: string, actorType: string, actor: string) {
  const { data, error } = await db().rpc('bk_record_payment', {
    p_booking_id: b.id, p_expected_version: version, p_kind: kind, p_amount: Math.round(amount),
    p_method: METHODS.includes(method) ? method : 'other', p_note: note.slice(0, 200), p_actor_type: actorType, p_actor: actor,
    p_confirm_notices: [{ event: 'confirmed', audience: 'customer' }, ...reminderNotices(business, b.start_at)],
  });
  if (error) throw rpcError(error.message);
  return data as BkBooking;
}

// 店家記錄收款 / 退款(訂金付足且已核准 → 自動成立並通知顧客)
export async function ownerPayment(ownerUserId: string, bookingId: string, expectedVersion: number, input: { kind: string; amount: number; method: string; note: string }) {
  const { business, b } = await ownerBooking(ownerUserId, bookingId);
  if (!['deposit', 'balance', 'refund'].includes(input.kind)) throw new BookingError('VALIDATION_ERROR', '收款類型錯誤。', 422);
  if (!(input.amount > 0) || input.amount > 1000000) throw new BookingError('VALIDATION_ERROR', '請輸入正確金額。', 422);
  if (input.kind === 'refund' && input.amount > b.paid_amount) throw new BookingError('VALIDATION_ERROR', '退款金額不能超過已收金額。', 422);
  return recordPayment(business, b, expectedVersion, input.kind, input.amount, input.method, input.note, 'owner', ownerUserId);
}

// 改期:新時段搶不到時舊預約不變;成功後舊提醒失效、寫入新提醒
async function reschedule(business: BkBusiness, b: BkBooking, expectedVersion: number, startAt: string, staffId: string | null, actor: { type: 'owner' | 'customer'; id: string }, ignoreLimits: boolean) {
  const start = new Date(startAt);
  if (Number.isNaN(start.getTime())) throw new BookingError('VALIDATION_ERROR', '時間格式錯誤。', 422);
  const sched = await loadSchedule(business.id);
  if (!b.service_id || !sched.services.some((s) => s.id === b.service_id)) throw new BookingError('POLICY_BLOCKED', '這個服務已下架,無法改期,請聯絡店家。', 422);
  const req: SlotRequest = { serviceId: b.service_id, addonIds: (b.addons ?? []).map((a) => a.id), staffId, excludeBookingId: b.id, ignoreLimits };
  const list = await placements(business, sched, req, start);
  if (!list.length) throw new BookingError('SLOT_UNAVAILABLE', '這個時段已無法預約,請重新選擇。', 409);
  const notices: Notice[] = [
    { event: 'rescheduled', audience: actor.type === 'owner' ? 'customer' : 'owner' },
    ...(actor.type === 'customer' ? [{ event: 'rescheduled', audience: 'customer' as const }] : []),
    ...(b.status === 'confirmed' ? reminderNotices(business, start.toISOString()) : []),
  ];
  return tryPlacements(list, async (p, resourceId) => {
    const { data, error } = await db().rpc('bk_reschedule', {
      p_booking_id: b.id, p_expected_version: expectedVersion, p_staff: p.staff.id, p_resource: resourceId,
      p_start: start.toISOString(), p_end: p.end.toISOString(), p_occupy_end: p.occupyEnd.toISOString(),
      p_actor_type: actor.type, p_actor: actor.id, p_count: actor.type === 'customer', p_notices: notices,
    });
    if (error) throw rpcError(error.message);
    return data as BkBooking;
  });
}

export async function ownerReschedule(ownerUserId: string, bookingId: string, expectedVersion: number, startAt: string, staffId: string | null) {
  const { business, b } = await ownerBooking(ownerUserId, bookingId);
  return reschedule(business, b, expectedVersion, startAt, staffId, { type: 'owner', id: ownerUserId }, true);
}

// 店家改期 / 人工加單用的可約時段(不受最短提前限制)
export async function ownerSlots(ownerUserId: string, input: { serviceId: string; addonIds: string[]; staffId: string | null; bookingId?: string; date: string }) {
  const business = await ownerBusiness(ownerUserId);
  if (!business) throw new BookingError('NOT_FOUND', '請先完成預約設定。', 404);
  const sched = await loadSchedule(business.id);
  let req: SlotRequest = { serviceId: input.serviceId, addonIds: input.addonIds, staffId: input.staffId, ignoreLimits: true };
  if (input.bookingId) {
    const { b } = await ownerBooking(ownerUserId, input.bookingId);
    if (!b.service_id) throw new BookingError('POLICY_BLOCKED', '這個服務已下架,無法改期。', 422);
    req = { ...req, serviceId: b.service_id, addonIds: (b.addons ?? []).map((a) => a.id), excludeBookingId: b.id };
  }
  const { days } = await availability(business, sched, req, input.date, 1);
  return days[0];
}

async function customerBooking(userId: string, bookingId: string) {
  const { data: booking } = await db().from('bk_bookings').select('*').eq('id', bookingId).eq('customer_user_id', userId).maybeSingle();
  if (!booking) throw new BookingError('NOT_FOUND', '找不到這筆預約。', 404);
  const b = booking as BkBooking;
  const { data: business } = await db().from('bk_businesses').select('*').eq('id', b.business_id).single();
  return { b, business: business as BkBusiness };
}

function customerChangeAllowed(business: BkBusiness, b: BkBooking, what: '取消' | '改期') {
  if (!['pending', 'confirmed'].includes(b.status)) throw new BookingError('INVALID_STATE', `目前的預約狀態不能${what}。`, 409);
  if (b.status === 'confirmed' && new Date(b.start_at).getTime() - Date.now() < business.cancel_hours * 3600000) {
    throw new BookingError('POLICY_BLOCKED', `服務前 ${business.cancel_hours} 小時內無法線上${what},請直接聯絡店家。`, 422);
  }
}

// 顧客改期(次數與期限依店家設定;指定人員的預約維持同一位人員)
export async function customerReschedule(userId: string, bookingId: string, expectedVersion: number, startAt: string) {
  const { b, business } = await customerBooking(userId, bookingId);
  customerChangeAllowed(business, b, '改期');
  if (b.reschedule_count >= business.reschedule_limit) throw new BookingError('POLICY_BLOCKED', business.reschedule_limit ? `線上改期最多 ${business.reschedule_limit} 次,請直接聯絡店家。` : '這家店不開放線上改期,請直接聯絡店家。', 422);
  return reschedule(business, b, expectedVersion, startAt, b.staff_requested ? b.staff_id : null, { type: 'customer', id: userId }, false);
}

export async function customerRescheduleSlots(userId: string, bookingId: string, fromDate: string, days: number) {
  const { b, business } = await customerBooking(userId, bookingId);
  customerChangeAllowed(business, b, '改期');
  if (b.reschedule_count >= business.reschedule_limit) throw new BookingError('POLICY_BLOCKED', '已達線上改期次數上限,請直接聯絡店家。', 422);
  if (!b.service_id) throw new BookingError('POLICY_BLOCKED', '這個服務已下架,無法改期,請聯絡店家。', 422);
  const sched = await loadSchedule(business.id);
  const req: SlotRequest = { serviceId: b.service_id, addonIds: (b.addons ?? []).map((a) => a.id), staffId: b.staff_requested ? b.staff_id : null, excludeBookingId: b.id };
  return (await availability(business, sched, req, fromDate, days)).days;
}

// 顧客取消自己的預約(待成立隨時可取消;已確認依店家設定的期限)
export async function customerCancel(userId: string, bookingId: string, expectedVersion: number, reason = '') {
  const { b, business } = await customerBooking(userId, bookingId);
  customerChangeAllowed(business, b, '取消');
  const { data, error } = await db().rpc('bk_transition', {
    p_booking_id: b.id, p_expected_version: expectedVersion, p_from: ['pending', 'confirmed'], p_status: 'cancelled', p_approval: null,
    p_reason: reason.slice(0, 200), p_actor_type: 'customer', p_actor: userId, p_event: 'cancelled_by_customer',
    p_notices: [{ event: 'cancelled_by_customer', audience: 'owner' }],
  });
  if (error) throw rpcError(error.message);
  return data as BkBooking;
}

// 顧客回報已轉帳訂金(店家核對後記錄收款才算付款)
export async function customerReportPayment(userId: string, bookingId: string, expectedVersion: number, report: { last5: string; amount: number; note: string }) {
  if (!/^\d{5}$/.test(report.last5)) throw new BookingError('VALIDATION_ERROR', '請填寫匯款帳號末 5 碼。', 422);
  const { data, error } = await db().rpc('bk_report_payment', {
    p_booking_id: bookingId, p_expected_version: expectedVersion, p_customer: userId,
    p_report: { last5: report.last5, amount: Math.max(0, Math.round(report.amount || 0)), note: report.note.trim().slice(0, 100) },
  });
  if (error) throw rpcError(error.message);
  return data as BkBooking;
}

// 加入行事曆(.ics 單向匯出,不是雙向同步)
export function bookingIcs(b: BkBooking, businessName: string, address: string, link: string) {
  const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//URBANLINKS//Booking//ZH-TW', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:${b.id}@urbanlinks`, `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(b.start_at)}`, `DTEND:${stamp(b.end_at)}`,
    `SUMMARY:${esc(`${businessName} ${b.service_snapshot.name}`)}`,
    ...(address ? [`LOCATION:${esc(address)}`] : []),
    `DESCRIPTION:${esc(`預約編號 ${b.booking_no}\n${link}`)}`,
    'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', `DESCRIPTION:${esc(b.service_snapshot.name)}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n');
}

// ---------- 通知 ----------
const TITLES: Record<string, { customer?: string; owner?: string; color: string }> = {
  new_booking: { owner: '你有一筆新預約', color: '#1f6f8b' },
  received: { customer: '預約申請已送出,等待店家確認', color: '#b07a1f' },
  awaiting_deposit: { customer: '時段已保留,請完成訂金轉帳', color: '#b07a1f' },
  approved_pay: { customer: '店家已確認,請完成訂金轉帳', color: '#b07a1f' },
  payment_reported: { owner: '顧客已回報轉帳,請核對訂金', color: '#1f6f8b' },
  confirmed: { customer: '預約已確認', color: '#2f6b3f' },
  rejected: { customer: '預約未成立', color: '#8a5a50' },
  rescheduled: { customer: '預約時間已更改', owner: '顧客更改了預約時間', color: '#1f6f8b' },
  cancelled_by_owner: { customer: '店家已取消你的預約', color: '#8a5a50' },
  cancelled_by_customer: { owner: '顧客取消了預約', color: '#8a5a50' },
  expired: { customer: '預約已逾期取消', owner: '一筆預約已逾期取消', color: '#8a7f72' },
  reminder_24h: { customer: '明天的預約提醒', color: '#1f6f8b' },
  reminder_2h: { customer: '預約即將開始', color: '#1f6f8b' },
};

async function lineUserIdOf(userId: string) {
  const { data } = await scopedClient(URBANITE_SHOP_ID).from('customers').select('line_user_id').eq('user_id', userId).maybeSingle();
  return (data?.line_user_id as string | null) || null;
}

function flexMessage(opts: { title: string; color: string; businessName: string; booking: BkBooking; staffName: string; link: string; button: string; extra?: string }) {
  const b = opts.booking;
  const row = (k: string, v: string) => ({ type: 'box', layout: 'baseline', spacing: 'sm', contents: [
    { type: 'text', text: k, size: 'sm', color: '#8a7f72', flex: 2 },
    { type: 'text', text: v || '—', size: 'sm', color: '#1f1b19', flex: 5, wrap: true },
  ] });
  const total = b.total_price || b.service_snapshot.price;
  const price = total ? `${money(total)}${b.service_snapshot.price_note ? ` ${b.service_snapshot.price_note}` : ''}` : (b.service_snapshot.price_note || '—');
  const addons = (b.addons ?? []).map((a) => a.name).join('、');
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
        row('服務', addons ? `${b.service_snapshot.name}(+${addons})` : b.service_snapshot.name),
        row('時間', formatRange(b.start_at, b.end_at)),
        ...(opts.staffName ? [row('人員', opts.staffName)] : []),
        row('價格', price),
        ...(b.deposit_amount ? [row('訂金', `${money(b.deposit_amount)}${b.paid_amount >= b.deposit_amount ? '(已收)' : ''}`)] : []),
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

type OutboxRow = { id: string; booking_id: string; booking_version: number; event: string; audience: 'customer' | 'owner'; attempts: number; due_at: string };

async function deliver(row: OutboxRow, token: string): Promise<{ state: 'api_accepted' | 'skipped' | 'retry' | 'failed'; error?: string }> {
  const { data: booking } = await db().from('bk_bookings').select('*').eq('id', row.booking_id).maybeSingle();
  if (!booking) return { state: 'skipped', error: 'booking_missing' };
  const b = booking as BkBooking;
  if (row.event.startsWith('reminder_')) {
    // 提醒只發給已確認的預約;改期後時間對不上的舊提醒不發(收款等其他異動不影響提醒)
    const lead = row.event === 'reminder_24h' ? 24 * 3600000 : 2 * 3600000;
    if (!['confirmed', 'checked_in'].includes(b.status)) return { state: 'skipped', error: 'stale' };
    if (Math.abs(new Date(b.start_at).getTime() - lead - new Date(row.due_at).getTime()) > 60000) return { state: 'skipped', error: 'stale' };
    if (new Date(b.start_at).getTime() < Date.now()) return { state: 'skipped', error: 'past' };
  }
  const { data: business } = await db().from('bk_businesses').select('owner_user_id, name, card_id, address, payment_info').eq('id', b.business_id).single();
  const [{ data: card }, { data: staff }, { count: staffCount }] = await Promise.all([
    business?.card_id ? db().from('profile_cards').select('slug, display_name').eq('id', business.card_id).maybeSingle() : Promise.resolve({ data: null }),
    b.staff_id ? db().from('bk_staff').select('name').eq('id', b.staff_id).maybeSingle() : Promise.resolve({ data: null }),
    db().from('bk_staff').select('id', { count: 'exact', head: true }).eq('business_id', b.business_id).eq('active', true),
  ]);
  const meta = TITLES[row.event];
  const title = meta?.[row.audience];
  if (!meta || !title) return { state: 'skipped', error: 'no_template' };
  const recipient = row.audience === 'owner' ? business?.owner_user_id : b.customer_user_id;
  const lineId = recipient ? await lineUserIdOf(recipient) : null;
  if (!lineId) return { state: 'skipped', error: 'no_line' };
  const site = getConfiguredSiteUrl();
  const businessName = business?.name || card?.display_name || '';
  const link = row.audience === 'owner' ? `${site}/mycard/booking` : `${site}/@${card?.slug ?? ''}/book?tab=my`;
  let extra: string | undefined;
  if (row.audience === 'customer' && ['awaiting_deposit', 'approved_pay'].includes(row.event)) {
    extra = `請在 ${b.expires_at ? formatDateTime(b.expires_at) : '期限'} 前轉帳訂金 ${money(b.deposit_amount - b.paid_amount)},完成後到「查看預約」回報末 5 碼,逾時會自動取消。${business?.payment_info ? `\n${business.payment_info}` : ''}`;
  } else if (row.audience === 'owner' && row.event === 'payment_reported') {
    extra = `回報末 5 碼:${b.payment_report?.last5 ?? '—'}${b.payment_report?.amount ? `,金額 ${money(b.payment_report.amount)}` : ''}`;
  } else if (row.audience === 'customer' && business?.address && ['confirmed', 'rescheduled', 'reminder_24h', 'reminder_2h'].includes(row.event)) {
    extra = `地點:${business.address}`;
  }
  const message = flexMessage({
    title, color: meta.color, businessName, booking: b, staffName: (staffCount ?? 0) > 1 ? staff?.name ?? '' : '',
    link, button: row.audience === 'owner' ? '到後台處理' : '查看預約', extra,
  });
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

// 背景工作:回收逾期待成立(未確認、未付訂金)、送出到期的通知(cron 每 5 分鐘,建立 / 操作預約後也會立刻跑一次)
export async function processBookingJobs(limit = 30) {
  const result = { expired: 0, sent: 0, skipped: 0, failed: 0 };
  const now = new Date().toISOString();
  const { data: overdue } = await db().from('bk_bookings').select('id, version').eq('status', 'pending').lt('expires_at', now).limit(50);
  for (const o of overdue ?? []) {
    const { error } = await db().rpc('bk_transition', {
      p_booking_id: o.id, p_expected_version: o.version, p_from: ['pending'], p_status: 'expired', p_approval: null,
      p_reason: '超過確認或付款期限', p_actor_type: 'system', p_actor: null, p_event: 'expired',
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

// 名片主人:取得(或建立)自己的預約商家;新商家自動建立一位人員(本人)
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
  await db().from('bk_staff').insert({ business_id: created.id, name: card?.display_name || '我' });
  return created as BkBusiness;
}

// 顧客頁用的公開資料:服務(含加購、可做的人員、訂金)、人員(不含任何預約或顧客資料)
export function publicCatalog(sched: Schedule) {
  return {
    services: sched.services.map((s) => ({
      id: s.id, name: s.name, description: s.description, duration_minutes: s.duration_minutes, price: s.price, price_note: s.price_note,
      image: s.image, deposit: s.deposit,
      addons: sched.addons.filter((a) => a.service_id === s.id).map((a) => ({ id: a.id, name: a.name, price: a.price, extra_minutes: a.extra_minutes })),
      staff: staffForService(sched, s.id).map((st) => {
        const link = sched.staffServices.find((x) => x.service_id === s.id && x.staff_id === st.id);
        return { id: st.id, duration_minutes: link?.duration_minutes ?? s.duration_minutes, price: link?.price ?? s.price };
      }),
    })),
    staff: sched.staff.map((st) => ({ id: st.id, name: st.name, title: st.title, avatar: st.avatar })),
  };
}
