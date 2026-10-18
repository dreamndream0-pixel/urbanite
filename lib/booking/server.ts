// 預約系統:伺服器端(建立預約、分派人員 / 床位、狀態變更、收款、改期、通知待發清單、背景工作)
// 所有寫入走資料庫 RPC(bk_create_booking2 / bk_transition / bk_record_payment / bk_reschedule / bk_report_payment),
// 同一交易寫入預約、歷程與通知;人員與床位的重複預約由資料庫排他約束擋下
import { createAdminClient } from '@/lib/supabase/admin';
import { getMessagingConfig } from '@/lib/line-messaging';
import { getConfiguredSiteUrl } from '@/lib/site-url';
import { scopedClient, URBANITE_SHOP_ID } from '@/lib/shop';
import {
  addDays, computeSlotsWith, formatDateTime, formatRange, localParts, minutesToHHMM, money, paymentReportText,
  type BkAddon, type BkBooking, type BkBusiness, type BkHour, type BkResource, type BkService, type BkStaff,
  type BkBranch, type BkServiceStep, type BkStaffHour, type BkStaffService, type BookingStatus,
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
  staffHours: BkStaffHour[]; staffServices: BkStaffService[]; resources: BkResource[]; steps: BkServiceStep[]; branches: BkBranch[];
};

// 商家的服務、加購、步驟、營業時段、人員、班表、床位(all = 後台用,含未開放)
export async function loadSchedule(businessId: string, all = false): Promise<Schedule> {
  const [services, addons, hours, staff, staffHours, staffServices, resources, steps, branches] = await Promise.all([
    db().from('bk_services').select('*').eq('business_id', businessId).in('active', all ? [true, false] : [true]).order('sort_order').order('created_at'),
    db().from('bk_addons').select('*').eq('business_id', businessId).in('active', all ? [true, false] : [true]).order('sort_order'),
    db().from('bk_hours').select('weekday, start_min, end_min, branch_id').eq('business_id', businessId).order('weekday').order('start_min'),
    db().from('bk_staff').select('*').eq('business_id', businessId).in('active', all ? [true, false] : [true]).order('sort_order').order('created_at'),
    db().from('bk_staff_hours').select('staff_id, weekday, start_min, end_min, branch_id').eq('business_id', businessId).order('weekday').order('start_min'),
    db().from('bk_staff_services').select('staff_id, service_id, duration_minutes, price').eq('business_id', businessId),
    db().from('bk_resources').select('id, name, active, sort_order, branch_id').eq('business_id', businessId).in('active', all ? [true, false] : [true]).order('sort_order').order('created_at'),
    db().from('bk_service_steps').select('id, service_id, seq, name, minutes, who, seat').eq('business_id', businessId).order('seq'),
    db().from('bk_branches').select('id, name, address, active, sort_order').eq('business_id', businessId).in('active', all ? [true, false] : [true]).order('sort_order').order('created_at'),
  ]);
  return {
    services: (services.data ?? []) as BkService[],
    addons: (addons.data ?? []) as BkAddon[],
    hours: (hours.data ?? []) as BkHour[],
    staff: (staff.data ?? []) as BkStaff[],
    staffHours: (staffHours.data ?? []) as BkStaffHour[],
    staffServices: (staffServices.data ?? []) as BkStaffService[],
    resources: (resources.data ?? []) as BkResource[],
    steps: (steps.data ?? []) as BkServiceStep[],
    branches: (branches.data ?? []) as BkBranch[],
  };
}

// 可做這個服務的人員(助理不接主要服務):服務有設定對應人員就只限那些人,沒設定 = 所有設計師
// 人員是否在這間分店服務(沒設定所屬分店 = 每間分店都可排)
export const atBranch = (st: Pick<BkStaff, 'branch_ids'>, branchId: string | null | undefined) => !branchId || !st.branch_ids?.length || st.branch_ids.includes(branchId);

export function staffForService(sched: Schedule, serviceId: string) {
  const links = sched.staffServices.filter((x) => x.service_id === serviceId);
  const active = sched.staff.filter((s) => s.active && s.role !== 'assistant');
  return links.length ? active.filter((s) => links.some((l) => l.staff_id === s.id)) : active;
}

const stepsOf = (sched: Schedule, serviceId: string) => sched.steps.filter((s) => s.service_id === serviceId).sort((a, b) => a.seq - b.seq);

// 某位人員做這個服務 + 加購的時長與價格(人員可個別設定時間、價格;分段服務的時間以步驟為準)
export function quote(sched: Schedule, service: BkService, staffId: string | null, addonIds: string[]) {
  const link = staffId ? sched.staffServices.find((x) => x.service_id === service.id && x.staff_id === staffId) : undefined;
  const addons = sched.addons.filter((a) => a.service_id === service.id && a.active && addonIds.includes(a.id));
  const steps = stepsOf(sched, service.id);
  const baseDuration = steps.length ? steps.reduce((n, s) => n + s.minutes, 0) : link?.duration_minutes ?? service.duration_minutes;
  const basePrice = link?.price ?? service.price;
  return {
    duration: baseDuration + addons.reduce((n, a) => n + a.extra_minutes, 0),
    total: basePrice + addons.reduce((n, a) => n + a.price, 0),
    addons: addons.map((a) => ({ id: a.id, name: a.name, price: a.price, extra_minutes: a.extra_minutes })),
  };
}

// 服務的分段計畫(相對開始的分鐘):沒有步驟 = 一整段由主要人員完成;加購時間接在最後;整理時間由主要人員與座位占用
type Seg = { from: number; to: number; who: 'main' | 'assistant' | 'none'; seat: boolean; name: string };
export function planOf(sched: Schedule, service: BkService, staffId: string | null, addonIds: string[], buffer: number) {
  const q = quote(sched, service, staffId, addonIds);
  const steps = stepsOf(sched, service.id);
  const segs: Seg[] = [];
  let t = 0;
  if (!steps.length) {
    segs.push({ from: 0, to: q.duration, who: 'main', seat: true, name: service.name });
    t = q.duration;
  } else {
    for (const s of steps) { segs.push({ from: t, to: t + s.minutes, who: s.who, seat: s.seat === 'keep', name: s.name }); t += s.minutes; }
    const extra = q.addons.reduce((n, a) => n + a.extra_minutes, 0);
    if (extra) { segs.push({ from: t, to: t + extra, who: 'main', seat: true, name: '加購' }); t += extra; }
  }
  if (buffer > 0) segs.push({ from: t, to: t + buffer, who: 'main', seat: true, name: '整理' });
  return { q, segs, total: t, occupy: t + buffer };
}

type Range = { start: number; end: number };
const overlaps = (list: Range[], s: number, e: number) => list.some((b) => b.start < e && s < b.end);
function merge(list: Range[]) {
  const sorted = [...list].sort((a, b) => a.start - b.start);
  const out: Range[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

// 分店:營業時段以該分店自己的為準,沒設定就用共用時段;人員班表沒指定分店的那段 = 任一分店
function hoursOf(sched: Schedule, staff: BkStaff, branchId: string | null = null): BkHour[] {
  if (staff.use_business_hours) {
    if (!branchId) return sched.hours;
    const own = sched.hours.filter((h) => h.branch_id === branchId);
    return own.length ? own : sched.hours.filter((h) => !h.branch_id);
  }
  const base = sched.staffHours.filter((h) => h.staff_id === staff.id);
  return branchId ? base.filter((h) => !h.branch_id || h.branch_id === branchId) : base;
}

// 這段時間是否在這位人員的上班時段內(助理分派用)
function inHours(sched: Schedule, staff: BkStaff, s: number, e: number, branchId: string | null = null) {
  const a = localParts(new Date(s));
  const len = (e - s) / 60000;
  return hoursOf(sched, staff, branchId).some((h) => h.weekday === a.weekday && h.start_min <= a.minutes && a.minutes + len <= h.end_min);
}

type Occupancy = { booking_id: string; staff_id: string | null; resource_id: string | null; role: string; start: number; end: number; branch_id: string | null };

// 範圍內的有效占用區段與休假(逾期的待成立預約不算;改期時排除自己)
async function occupancy(businessId: string, fromIso: string, toIso: string, excludeId?: string) {
  const [{ data: allocs }, { data: exceptions }, { data: external }] = await Promise.all([
    db().from('bk_allocations').select('booking_id, staff_id, resource_id, role, start_at, end_at, bk_bookings!inner(status, expires_at, branch_id)')
      .eq('business_id', businessId).eq('active', true).lt('start_at', toIso).gt('end_at', fromIso),
    db().from('bk_exceptions').select('start_at, end_at, staff_id, branch_id').eq('business_id', businessId).lt('start_at', toIso).gt('end_at', fromIso),
    // 外部行事曆匯入的忙碌時段(視同休假)
    db().from('bk_external_busy').select('start_at, end_at, staff_id').eq('business_id', businessId).lt('start_at', toIso).gt('end_at', fromIso).limit(5000),
  ]);
  const now = Date.now();
  const live: Occupancy[] = (allocs ?? [])
    .filter((a) => {
      const bk = (Array.isArray(a.bk_bookings) ? a.bk_bookings[0] : a.bk_bookings) as { status: string; expires_at: string | null; branch_id: string | null } | null;
      return a.booking_id !== excludeId && !(bk?.status === 'pending' && bk.expires_at && new Date(bk.expires_at).getTime() < now);
    })
    .map((a) => {
      const bk = (Array.isArray(a.bk_bookings) ? a.bk_bookings[0] : a.bk_bookings) as { branch_id: string | null } | null;
      return { booking_id: a.booking_id, staff_id: a.staff_id, resource_id: a.resource_id, role: a.role, start: new Date(a.start_at).getTime(), end: new Date(a.end_at).getTime(), branch_id: bk?.branch_id ?? null };
    });
  const ex = [...(exceptions ?? []), ...(external ?? []).map((x) => ({ ...x, branch_id: null }))].map((x) => ({ staff_id: x.staff_id as string | null, branch_id: x.branch_id as string | null, start: new Date(x.start_at).getTime(), end: new Date(x.end_at).getTime() }));
  return { live, exceptions: ex };
}

// extras:同一次再加的服務(依序進行);seqs:各項在預約裡的編號(改期時沿用原編號)
type SlotRequest = { serviceId: string; addonIds: string[]; staffId: string | null; extras?: string[]; seqs?: number[]; excludeBookingId?: string; ignoreLimits?: boolean; branchId?: string | null };
export type AllocInput = { staff_id: string | null; resource_id: string | null; role: 'main' | 'assistant' | 'seat'; start_at: string; end_at: string; item_seq?: number };

// 一位主要人員做一項服務,在某個開始時間的完整分派:主要人員各段、助理各段、座位(同一張)
function makeAssigner(business: BkBusiness, sched: Schedule, service: BkService, staff: BkStaff, addonIds: string[], occ: Awaited<ReturnType<typeof occupancy>>, buffer: number, branchId: string | null = null) {
  const plan = planOf(sched, service, staff.id, addonIds, buffer);
  const assistants = sched.staff.filter((s) => s.active && s.role === 'assistant' && atBranch(s, branchId));
  const shopOff = occ.exceptions.filter((x) => !x.staff_id && (!x.branch_id || x.branch_id === branchId));
  const travel = business.branch_travel_minutes * 60000;
  const busyOf = (id: string) => [
    ...occ.live.filter((a) => a.staff_id === id).map((a) => (branchId && a.branch_id && a.branch_id !== branchId ? { ...a, start: a.start - travel, end: a.end + travel } : a)),
    ...occ.exceptions.filter((x) => x.staff_id === id || (!x.staff_id && (!x.branch_id || x.branch_id === branchId))),
  ];
  const staffBusy = busyOf(staff.id);
  const assistantBusy = new Map(assistants.map((a) => [a.id, busyOf(a.id)]));
  const seats = service.needs_resource ? sched.resources.filter((r) => r.active && (!branchId || !r.branch_id || r.branch_id === branchId)) : [];
  const seatBusy = new Map(seats.map((r) => [r.id, occ.live.filter((a) => a.resource_id === r.id)]));
  // 沒有助理時,助理步驟由主要人員自己做
  const mainSegs = plan.segs.filter((s) => s.who === 'main' || (s.who === 'assistant' && !assistants.length));
  const asstSegs = assistants.length ? plan.segs.filter((s) => s.who === 'assistant') : [];
  const seatSegs = merge(plan.segs.filter((s) => s.seat).map((s) => ({ start: s.from, end: s.to })));
  const mainRanges = merge(mainSegs.map((s) => ({ start: s.from, end: s.to })));

  function assign(t: number, seq = 0): { allocs: AllocInput[]; resourceId: string | null } | null {
    const at = (m: number) => t + m * 60000;
    if (overlaps(shopOff, t, at(plan.occupy))) return null;
    if (mainRanges.some((r) => overlaps(staffBusy, at(r.start), at(r.end)))) return null;
    const allocs: AllocInput[] = mainRanges.map((r) => ({ staff_id: staff.id, resource_id: null, role: 'main', start_at: new Date(at(r.start)).toISOString(), end_at: new Date(at(r.end)).toISOString(), item_seq: seq }));
    for (const seg of asstSegs) {
      const s = at(seg.from);
      const e = at(seg.to);
      const who = assistants.find((a) => !overlaps(assistantBusy.get(a.id)!, s, e) && inHours(sched, a, s, e, branchId));
      if (!who) return null;
      allocs.push({ staff_id: who.id, resource_id: null, role: 'assistant', start_at: new Date(s).toISOString(), end_at: new Date(e).toISOString(), item_seq: seq });
    }
    let resourceId: string | null = null;
    if (seats.length) {
      const seat = seats.find((r) => seatSegs.every((g) => !overlaps(seatBusy.get(r.id)!, at(g.start), at(g.end))));
      if (!seat) return null;
      resourceId = seat.id;
      for (const g of seatSegs) allocs.push({ staff_id: null, resource_id: seat.id, role: 'seat', start_at: new Date(at(g.start)).toISOString(), end_at: new Date(at(g.end)).toISOString(), item_seq: seq });
    }
    return { allocs, resourceId };
  }
  return { plan, assign };
}

type ItemPlan = { seq: number; service: BkService; staff: BkStaff; start: number; end: number; plan: ReturnType<typeof planOf> };

// 一位主要人員起頭的整組服務:第一項給這位人員,之後每一項優先同一位、不行再換其他可做的人員(要在班內)
function makeChain(business: BkBusiness, sched: Schedule, service: BkService, staff: BkStaff, req: SlotRequest, occ: Awaited<ReturnType<typeof occupancy>>) {
  const extras = (req.extras ?? []).map((id) => sched.services.find((s) => s.id === id)).filter((s): s is BkService => Boolean(s));
  const seqs = req.seqs ?? [0, 1, 2, 3];
  const lastBuffer = (i: number) => (i === extras.length ? business.buffer_minutes : 0);
  const branch = req.branchId ?? null;
  const head = makeAssigner(business, sched, service, staff, req.addonIds, occ, lastBuffer(0), branch);
  const tails = extras.map((svc, i) => {
    const cands = staffForService(sched, svc.id).filter((st) => atBranch(st, branch)).sort((a, b) => (a.id === staff.id ? -1 : b.id === staff.id ? 1 : a.sort_order - b.sort_order));
    return { svc, options: cands.map((st) => ({ st, a: makeAssigner(business, sched, svc, st, [], occ, lastBuffer(i + 1), branch) })) };
  });

  function assign(t: number) {
    const first = head.assign(t, seqs[0]);
    if (!first) return null;
    const allocs = [...first.allocs];
    const items: ItemPlan[] = [{ seq: seqs[0], service, staff, start: t, end: t + head.plan.total * 60000, plan: head.plan }];
    let cursor = t + head.plan.total * 60000;
    for (let i = 0; i < tails.length; i++) {
      let picked: ItemPlan | null = null;
      for (const { st, a } of tails[i].options) {
        if (!inHours(sched, st, cursor, cursor + a.plan.total * 60000, branch)) continue;
        const got = a.assign(cursor, seqs[i + 1]);
        if (!got) continue;
        allocs.push(...got.allocs);
        picked = { seq: seqs[i + 1], service: tails[i].svc, staff: st, start: cursor, end: cursor + a.plan.total * 60000, plan: a.plan };
        break;
      }
      if (!picked) return null;
      items.push(picked);
      cursor = picked.end;
    }
    const last = items[items.length - 1];
    return { allocs, resourceId: first.resourceId, items, end: cursor, occupyEnd: last.start + last.plan.occupy * 60000 };
  }
  return { head, assign };
}

// 可約時段:每位候選人員各自算(班表、休假、自己的占用、助理、座位、後續服務),再合併;staffId = 指定人員
export async function availability(business: BkBusiness, sched: Schedule, req: SlotRequest, fromDate: string, days: number) {
  const service = sched.services.find((s) => s.id === req.serviceId);
  if (!service) throw new BookingError('VALIDATION_ERROR', '這個服務目前無法預約。', 422);
  let candidates = staffForService(sched, service.id);
  if (req.staffId) candidates = candidates.filter((s) => s.id === req.staffId);
  candidates = candidates.filter((s) => atBranch(s, req.branchId));
  if (req.branchId && service.branch_ids?.length && !service.branch_ids.includes(req.branchId)) candidates = [];
  const fromIso = new Date(new Date(`${fromDate}T00:00:00+08:00`).getTime() - 86400000).toISOString();
  const toIso = new Date(new Date(`${fromDate}T00:00:00+08:00`).getTime() + (days + 1) * 86400000).toISOString();
  const occ = await occupancy(business.id, fromIso, toIso, req.excludeBookingId);
  const rules = req.ignoreLimits ? { ...business, lead_minutes: 0, advance_days: 365 } : business;
  const byStaff = new Map<string, { date: string; slots: string[]; closed: boolean }[]>();
  const chains = new Map<string, ReturnType<typeof makeChain>>();
  for (const staff of candidates) {
    const c = makeChain(business, sched, service, staff, req, occ);
    chains.set(staff.id, c);
    byStaff.set(staff.id, computeSlotsWith({ business: rules, hours: hoursOf(sched, staff, req.branchId ?? null), duration: c.head.plan.total, fromDate, days, ok: (t) => c.assign(t) !== null }));
  }
  const merged: { date: string; slots: string[]; closed: boolean }[] = [];
  for (let i = 0; i < days; i++) {
    const per = [...byStaff.values()].map((d) => d[i]).filter(Boolean);
    const slots = [...new Set(per.flatMap((d) => d.slots))].sort();
    merged.push({ date: addDays(fromDate, i), slots, closed: !per.length || per.every((d) => d.closed) });
  }
  return { days: merged, byStaff, service, occ, chains };
}

export function bookingNo(prefix = 'BK') {
  const { date } = localParts(new Date());
  return `${prefix}-${date.replace(/-/g, '')}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

export type Notice = { event: string; audience: 'customer' | 'owner'; due_at?: string };

export function reminderNotices(business: Pick<BkBusiness, 'reminder_24h' | 'reminder_2h'>, startIso: string): Notice[] {
  const start = new Date(startIso).getTime();
  const soon = Date.now() + 5 * 60000;
  const list: Notice[] = [];
  // 已經過了提醒時間就不補發(例:服務前 1 小時才成立,不發 24 小時 / 2 小時提醒)
  if (business.reminder_24h && start - 24 * 3600000 > soon) list.push({ event: 'reminder_24h', audience: 'customer', due_at: new Date(start - 24 * 3600000).toISOString() });
  if (business.reminder_2h && start - 2 * 3600000 > soon) list.push({ event: 'reminder_2h', audience: 'customer', due_at: new Date(start - 2 * 3600000).toISOString() });
  return list;
}

// 訂金轉帳期限:店家設定的小時數內,且不晚於服務前 1 小時;至少給 30 分鐘
export function payDeadline(business: BkBusiness, startMs: number) {
  const latest = startMs - 60 * 60000;
  return Math.max(Date.now() + 30 * 60000, Math.min(Date.now() + business.deposit_hours * 3600000, latest));
}

export function rpcError(message: string): BookingError {
  if (message.includes('SLOT_UNAVAILABLE')) return new BookingError('SLOT_UNAVAILABLE', '這個時段剛被預約,請重新選擇。', 409);
  if (message.includes('VERSION_CONFLICT')) return new BookingError('VERSION_CONFLICT', '預約內容已經更新,請重新整理後再操作。', 409);
  if (message.includes('INVALID_STATE')) return new BookingError('INVALID_STATE', '目前的預約狀態不能執行這個操作。', 409);
  if (message.includes('VALIDATION_ERROR')) return new BookingError('VALIDATION_ERROR', '金額不正確。', 422);
  if (message.includes('PACKAGE_EMPTY')) return new BookingError('PACKAGE_EMPTY', '套票次數已用完。', 409);
  if (message.includes('PACKAGE_INVALID')) return new BookingError('PACKAGE_INVALID', '這張套票不能用在這項服務,或已過期。', 422);
  if (message.includes('QUOTE_EXPIRED')) return new BookingError('QUOTE_EXPIRED', '這份報價已過期,請聯絡店家重新報價。', 409);
  if (message.includes('NOT_FOUND')) return new BookingError('NOT_FOUND', '找不到這筆資料。', 404);
  return new BookingError('SERVER_ERROR', '預約處理失敗,請稍後再試。', 500);
}

type ItemOut = { seq: number; service_id: string; service_snapshot: Record<string, unknown>; staff_id: string; start_at: string; end_at: string; amount: number };
type Placement = {
  staff: BkStaff; q: ReturnType<typeof quote>; steps: { name: string; minutes: number; who: string }[]; end: Date; occupyEnd: Date;
  resourceId: string | null; allocs: AllocInput[]; items: ItemOut[]; total: number; extraDeposit: number; names: string[]; minutes: number;
};

const stepsOut = (plan: ReturnType<typeof planOf>) => plan.segs.filter((s) => s.name !== '整理').map((s) => ({ name: s.name, minutes: s.to - s.from, who: s.who }));

// 這個開始時間可以給哪些人員(含助理、座位、後續服務分派);不限人員時當天預約較少的人優先
async function placements(business: BkBusiness, sched: Schedule, req: SlotRequest, start: Date): Promise<Placement[]> {
  const local = localParts(start);
  const label = minutesToHHMM(local.minutes);
  const { byStaff, occ, chains } = await availability(business, sched, req, local.date, 1);
  const free = [...byStaff.entries()].filter(([, d]) => d[0]?.slots.includes(label)).map(([id]) => sched.staff.find((s) => s.id === id)!);
  const load = (id: string) => new Set(occ.live.filter((a) => a.staff_id === id && a.role === 'main' && localParts(new Date(a.start)).date === local.date).map((a) => a.booking_id)).size;
  free.sort((a, b) => load(a.id) - load(b.id) || a.sort_order - b.sort_order);
  const out: Placement[] = [];
  for (const staff of free) {
    const got = chains.get(staff.id)!.assign(start.getTime());
    if (!got) continue;
    const head = got.items[0];
    const items: ItemOut[] = got.items.map((it) => {
      const amount = it.plan.q.total;
      return {
        seq: it.seq, service_id: it.service.id, staff_id: it.staff.id, amount,
        service_snapshot: { name: it.service.name, duration_minutes: it.plan.total, price: amount, price_note: it.service.price_note, ...(it.plan.segs.length > 1 ? { steps: stepsOut(it.plan) } : {}) },
        start_at: new Date(it.start).toISOString(), end_at: new Date(it.end).toISOString(),
      };
    });
    out.push({
      staff, q: head.plan.q, resourceId: got.resourceId, allocs: got.allocs, steps: stepsOut(head.plan),
      end: new Date(got.end), occupyEnd: new Date(got.occupyEnd), items,
      total: items.reduce((n, it) => n + it.amount, 0),
      extraDeposit: got.items.slice(1).reduce((n, it) => n + it.service.deposit, 0),
      names: got.items.map((it) => it.service.name),
      minutes: Math.round((got.end - start.getTime()) / 60000),
    });
  }
  return out;
}

// 依序嘗試候選人員;被同時送出的人搶走時重新計算一次再試(資料庫排他約束保證不重複)
async function tryPlacements<T>(compute: () => Promise<Placement[]>, run: (p: Placement) => Promise<T>) {
  for (let round = 0; round < 2; round++) {
    const list = await compute();
    if (!list.length) break;
    for (const p of list.slice(0, 5)) {
      try { return await run(p); }
      catch (e) { if (!(e instanceof BookingError && e.code === 'SLOT_UNAVAILABLE')) throw e; }
    }
  }
  throw new BookingError('SLOT_UNAVAILABLE', '這個時段已無法預約,請重新選擇。', 409);
}

// 預約快照:多項服務時名稱合併(通知、行事曆用),明細在 bk_booking_items
const snapshotOf = (service: BkService, p: Placement) => ({
  name: p.names.join(' + '),
  duration_minutes: p.minutes,
  price: p.total, price_note: p.items.length > 1 ? '' : service.price_note, ...(p.steps.length > 1 && p.items.length <= 1 ? { steps: p.steps } : {}),
});

const cleanContact = (c: { name: string; phone: string; note: string }) => ({
  name: c.name.trim().slice(0, 40), phone: c.phone.trim().slice(0, 30), note: c.note.trim().slice(0, 500),
});

// 顧客建立預約:伺服器重新核對服務、人員、時段、床位與金額(不採用前端的時長與金額)
export async function createBooking(input: {
  slug: string; userId: string; serviceId: string; addonIds: string[]; staffId: string | null; startAt: string; extras?: string[]; packageId?: string | null; branchId?: string | null;
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
  if (service.price_mode === 'quote') throw new BookingError('VALIDATION_ERROR', '這項服務需要先詢價。', 422);
  if (!input.staffId && !business.allow_any_staff && staffForService(sched, service.id).length > 1) throw new BookingError('VALIDATION_ERROR', '請選擇服務人員。', 422);
  const start = new Date(input.startAt);
  if (Number.isNaN(start.getTime())) throw new BookingError('VALIDATION_ERROR', '時間格式錯誤。', 422);

  const extras = cleanExtras(sched, service.id, input.extras);
  const branchId = pickBranch(sched, input.branchId);
  const req: SlotRequest = { serviceId: service.id, addonIds: input.addonIds, staffId: input.staffId, extras, branchId };

  const manual = business.approval_mode === 'manual';
  const contact = cleanContact(input.contact);
  return tryPlacements(() => placements(business, sched, req, start), async (p) => {
    // 用套票:主服務的基本價格由套票支付,只收加購與其他項目
    const covered = input.packageId ? p.q.total - p.q.addons.reduce((n, a) => n + a.price, 0) : 0;
    const total = Math.max(0, p.total - covered);
    const wanted = (input.packageId ? 0 : service.deposit) + p.extraDeposit;
    const deposit = wanted > 0 ? (total > 0 ? Math.min(wanted, total) : 0) : 0;
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
        service_snapshot: snapshotOf(service, p), start_at: start.toISOString(), end_at: p.end.toISOString(), occupy_end_at: p.occupyEnd.toISOString(),
        status: confirmed ? 'confirmed' : 'pending', approval_status: manual ? 'pending' : 'not_required', expires_at: expires,
        contact, source_card_id: card.id, source_channel: input.channel.slice(0, 20) || 'card', idempotency_key: idem || null,
        staff_id: p.staff.id, staff_requested: Boolean(input.staffId), resource_id: p.resourceId, addons: p.q.addons, allocations: p.allocs, items: p.items.length > 1 ? p.items : [], package_id: input.packageId || null, branch_id: branchId,
        total_price: total, deposit_amount: deposit, payment_status: deposit ? 'awaiting' : 'none',
        created_by: 'customer', actor_type: 'customer', actor_id: input.userId,
      },
      p_notices: notices,
    });
    if (error) throw rpcError(error.message);
    await (await import('./engage')).markWaitlistBooked(business.id, input.userId, service.id, start.toISOString()).catch(() => {});
    return data as BkBooking;
  });
}

// 店家人工加單(電話、現場客):一樣經過人員 / 床位衝突檢查,不受最短提前與可約天數限制
export async function ownerCreateBooking(ownerUserId: string, input: {
  serviceId: string; addonIds: string[]; staffId: string | null; startAt: string; contact: { name: string; phone: string; note: string }; extras?: string[]; customerId?: string | null; branchId?: string | null;
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
  let customerId: string | null = null;
  if (input.customerId) {
    const { data: c } = await db().from('bk_customers').select('id').eq('id', input.customerId).eq('business_id', business.id).maybeSingle();
    customerId = c?.id ?? null;
  }
  const branchId = pickBranch(sched, input.branchId);
  const req: SlotRequest = { serviceId: service.id, addonIds: input.addonIds, staffId: input.staffId, extras: cleanExtras(sched, service.id, input.extras), ignoreLimits: true, branchId };
  return tryPlacements(() => placements(business, sched, req, start), async (p) => {
    const { data, error } = await db().rpc('bk_create_booking2', {
      p: {
        business_id: business.id, booking_no: bookingNo(), customer_user_id: null, service_id: service.id,
        service_snapshot: snapshotOf(service, p), start_at: start.toISOString(), end_at: p.end.toISOString(), occupy_end_at: p.occupyEnd.toISOString(),
        status: 'confirmed', approval_status: 'not_required', expires_at: null, contact: cleanContact(input.contact),
        source_card_id: business.card_id, source_channel: 'owner', staff_id: p.staff.id, staff_requested: Boolean(input.staffId),
        resource_id: p.resourceId, addons: p.q.addons, allocations: p.allocs, items: p.items.length > 1 ? p.items : [], total_price: p.total, deposit_amount: 0, payment_status: 'none',
        created_by: 'owner', actor_type: 'owner', actor_id: ownerUserId, customer_id: customerId, branch_id: branchId,
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
      return call({ from: ['confirmed', 'checked_in'], status: 'completed', approval: null, notices: await followUpNotices(business, b) });
    }
    case 'no_show':
      if (new Date(b.start_at).getTime() > Date.now()) throw new BookingError('POLICY_BLOCKED', '服務時間開始後才能標記未到。', 422);
      return call({ from: ['confirmed', 'checked_in'], status: 'no_show', approval: null, notices: [] });
    default:
      throw new BookingError('VALIDATION_ERROR', '不支援的操作。', 422);
  }
}

// 服務完成後的感謝訊息(3 小時後)與回訪提醒(服務設定的天數後早上 10 點)
async function followUpNotices(business: BkBusiness, b: BkBooking): Promise<Notice[]> {
  if (!b.customer_user_id) return [];
  const list: Notice[] = [];
  if (business.thanks_enabled) list.push({ event: 'thanks', audience: 'customer', due_at: new Date(Date.now() + 3 * 3600000).toISOString() });
  if (b.service_id) {
    const { data: svc } = await db().from('bk_services').select('revisit_days').eq('id', b.service_id).maybeSingle();
    if (svc?.revisit_days) {
      const date = addDays(localParts(b.start_at).date, svc.revisit_days);
      list.push({ event: 'revisit', audience: 'customer', due_at: new Date(`${date}T10:00:00+08:00`).toISOString() });
    }
  }
  return list;
}

const METHODS = ['transfer', 'cash', 'card', 'other', 'points', 'package'];

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

// 分店:商家有分店時必須選一間開放中的分店;沒有分店時一律為空
function pickBranch(sched: Schedule, branchId?: string | null) {
  const open = sched.branches.filter((b) => b.active);
  if (!open.length) return null;
  if (!branchId || !open.some((b) => b.id === branchId)) throw new BookingError('VALIDATION_ERROR', '請選擇分店。', 422);
  return branchId;
}

// 同一次再加的服務:最多 2 項,不能和主服務重複,須是開放中的服務
function cleanExtras(sched: Schedule, mainId: string, extras?: string[]) {
  const ids = [...new Set((extras ?? []).filter((id) => id !== mainId && sched.services.some((s) => s.id === id)))];
  if ((extras ?? []).length > 2) throw new BookingError('VALIDATION_ERROR', '同一次最多再加 2 項服務。', 422);
  return ids.slice(0, 2);
}

// 改期用:這筆預約目前仍有效的服務組合(取消過的項目不再排入,沿用原本的項目編號)
async function chainOf(sched: Schedule, b: BkBooking): Promise<Pick<SlotRequest, 'serviceId' | 'addonIds' | 'extras' | 'seqs'>> {
  const { data: items } = await db().from('bk_booking_items').select('seq, service_id').eq('booking_id', b.id).eq('status', 'active').order('seq');
  const fromItems = Boolean(items?.length);
  const list = fromItems ? items! : [{ seq: 0, service_id: b.service_id }];
  if (list.some((it) => !it.service_id || !sched.services.some((s) => s.id === it.service_id))) {
    throw new BookingError('POLICY_BLOCKED', '預約裡有服務已下架,無法改期,請聯絡店家。', 422);
  }
  return {
    serviceId: list[0].service_id as string,
    addonIds: list[0].seq === 0 ? (b.addons ?? []).map((a) => a.id) : [],
    extras: list.slice(1).map((it) => it.service_id as string),
    // 只有原本就有項目明細的預約才帶 seqs(改期時會一併更新明細)
    seqs: fromItems ? list.map((it) => it.seq) : undefined,
  };
}

// 店家取消多項服務中的一項(只釋放那一項的時段並重算金額;已收款不自動退)
export async function ownerCancelItem(ownerUserId: string, bookingId: string, expectedVersion: number, seq: number, reason = '') {
  const { b } = await ownerBooking(ownerUserId, bookingId);
  const { data, error } = await db().rpc('bk_cancel_item', {
    p_booking_id: b.id, p_expected_version: expectedVersion, p_seq: seq, p_reason: reason.slice(0, 200),
    p_actor_type: 'owner', p_actor: ownerUserId, p_notices: [{ event: 'item_cancelled', audience: 'customer' }],
  });
  if (error) throw rpcError(error.message);
  return data as BkBooking;
}

// 改期:新時段搶不到時舊預約不變;成功後舊提醒失效、寫入新提醒
async function reschedule(business: BkBusiness, b: BkBooking, expectedVersion: number, startAt: string, staffId: string | null, actor: { type: 'owner' | 'customer'; id: string }, ignoreLimits: boolean) {
  const start = new Date(startAt);
  if (Number.isNaN(start.getTime())) throw new BookingError('VALIDATION_ERROR', '時間格式錯誤。', 422);
  const sched = await loadSchedule(business.id);
  const req: SlotRequest = { ...(await chainOf(sched, b)), staffId, excludeBookingId: b.id, ignoreLimits, branchId: b.branch_id ?? null };
  const notices: Notice[] = [
    { event: 'rescheduled', audience: actor.type === 'owner' ? 'customer' : 'owner' },
    ...(actor.type === 'customer' ? [{ event: 'rescheduled', audience: 'customer' as const }] : []),
    ...(b.status === 'confirmed' ? reminderNotices(business, start.toISOString()) : []),
  ];
  return tryPlacements(() => placements(business, sched, req, start), async (p) => {
    const { data, error } = await db().rpc('bk_reschedule', {
      p_booking_id: b.id, p_expected_version: expectedVersion, p_staff: p.staff.id, p_resource: p.resourceId, p_allocations: p.allocs, p_items: req.seqs ? p.items : null,
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
export async function ownerSlots(ownerUserId: string, input: { serviceId: string; addonIds: string[]; staffId: string | null; bookingId?: string; date: string; extras?: string[]; branchId?: string | null }) {
  const business = await ownerBusiness(ownerUserId);
  if (!business) throw new BookingError('NOT_FOUND', '請先完成預約設定。', 404);
  const sched = await loadSchedule(business.id);
  let req: SlotRequest = { serviceId: input.serviceId, addonIds: input.addonIds, staffId: input.staffId, extras: input.bookingId ? [] : cleanExtras(sched, input.serviceId, input.extras), ignoreLimits: true, branchId: input.branchId || null };
  if (input.bookingId) {
    const { b } = await ownerBooking(ownerUserId, input.bookingId);
    req = { ...req, ...(await chainOf(sched, b)), excludeBookingId: b.id, branchId: b.branch_id ?? null };
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
  const sched = await loadSchedule(business.id);
  const req: SlotRequest = { ...(await chainOf(sched, b)), staffId: b.staff_requested ? b.staff_id : null, excludeBookingId: b.id, branchId: b.branch_id ?? null };
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
// 顧客回報付款:kind = 訂金 / 全額(金額由資料庫依總額、訂金、已付計算),附末 5 碼、轉帳時間、戶名
export async function customerReportPayment(userId: string, bookingId: string, expectedVersion: number, report: { kind?: 'deposit' | 'full'; last5: string; paidAt?: string; payer?: string; note?: string }) {
  if (!/^\d{5}$/.test(report.last5)) throw new BookingError('VALIDATION_ERROR', '請填寫匯款帳號末 5 碼。', 422);
  const { data, error } = await db().rpc('bk_report_payment', {
    p_booking_id: bookingId, p_expected_version: expectedVersion, p_customer: userId,
    p_report: { kind: report.kind === 'full' ? 'full' : 'deposit', last5: report.last5, paid_at: (report.paidAt ?? '').trim().slice(0, 20), payer: (report.payer ?? '').trim().slice(0, 30), note: (report.note ?? '').trim().slice(0, 100) },
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
  payment_reported: { owner: '顧客已回報轉帳,請核對款項', color: '#1f6f8b' },
  confirmed: { customer: '預約已確認', color: '#2f6b3f' },
  rejected: { customer: '預約未成立', color: '#8a5a50' },
  rescheduled: { customer: '預約時間已更改', owner: '顧客更改了預約時間', color: '#1f6f8b' },
  quote_accepted: { owner: '顧客接受了報價', color: '#2f6b3f' },
  thanks: { customer: '謝謝你今天的光臨', color: '#2f6b3f' },
  revisit: { customer: '回訪提醒', color: '#1f6f8b' },
  item_cancelled: { customer: '店家調整了預約的服務項目', color: '#8a5a50' },
  cancelled_by_owner: { customer: '店家已取消你的預約', color: '#8a5a50' },
  cancelled_by_customer: { owner: '顧客取消了預約', color: '#8a5a50' },
  expired: { customer: '預約已逾期取消', owner: '一筆預約已逾期取消', color: '#8a7f72' },
  reminder_24h: { customer: '明天的預約提醒', color: '#1f6f8b' },
  reminder_2h: { customer: '預約即將開始', color: '#1f6f8b' },
};

// 詢價單的通知(還沒有預約時):新詢價、報價送達、婉拒 / 取消
const QUOTE_TITLES: Record<string, { customer?: string; owner?: string; color: string }> = {
  quote_requested: { owner: '你有一筆新的詢價', color: '#1f6f8b' },
  quote_sent: { customer: '店家已回覆報價', color: '#b07a1f' },
  quote_declined: { owner: '顧客婉拒了報價', color: '#8a5a50' },
  quote_cancelled: { customer: '店家已取消這筆詢價', color: '#8a5a50' },
};

async function pushLine(token: string, retryKey: string, to: string, message: unknown): Promise<{ state: 'api_accepted' | 'retry' | 'failed'; error?: string }> {
  try {
    const res = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Line-Retry-Key': retryKey },
      body: JSON.stringify({ to, messages: [message] }),
    });
    if (res.ok || res.status === 409) return { state: 'api_accepted' };
    return { state: res.status === 429 || res.status >= 500 ? 'retry' : 'failed', error: `line_${res.status}` };
  } catch {
    return { state: 'retry', error: 'network' };
  }
}

async function deliverQuote(row: OutboxRow, token: string): Promise<{ state: 'api_accepted' | 'skipped' | 'retry' | 'failed'; error?: string }> {
  const { data: q } = await db().from('bk_quotes').select('*').eq('id', row.quote_id!).maybeSingle();
  if (!q) return { state: 'skipped', error: 'quote_missing' };
  const meta = QUOTE_TITLES[row.event];
  const title = meta?.[row.audience];
  if (!meta || !title) return { state: 'skipped', error: 'no_template' };
  const { data: business } = await db().from('bk_businesses').select('owner_user_id, name, card_id').eq('id', q.business_id).single();
  const recipient = row.audience === 'owner' ? business?.owner_user_id : q.customer_user_id;
  const lineId = recipient ? await lineUserIdOf(recipient) : null;
  if (!lineId) return { state: 'skipped', error: 'no_line' };
  const { data: card } = business?.card_id ? await db().from('profile_cards').select('slug, display_name').eq('id', business.card_id).maybeSingle() : { data: null };
  const { data: v } = q.current_version ? await db().from('bk_quote_versions').select('*').eq('quote_id', q.id).eq('version', q.current_version).maybeSingle() : { data: null };
  const site = getConfiguredSiteUrl();
  const businessName = business?.name || card?.display_name || '';
  const req = (q.request ?? {}) as { event_date?: string; time?: string; event_type?: string };
  const row2 = (k: string, val: string) => ({ type: 'box', layout: 'baseline', spacing: 'sm', contents: [
    { type: 'text', text: k, size: 'sm', color: '#8a7f72', flex: 2 },
    { type: 'text', text: val || '—', size: 'sm', color: '#1f1b19', flex: 5, wrap: true },
  ] });
  const body = [
    row2('服務', q.service_name),
    row2('活動日', [req.event_date, req.time].filter(Boolean).join(' ')),
    ...(req.event_type ? [row2('類型', req.event_type)] : []),
    ...(v && row.event === 'quote_sent' ? [row2('報價', money(v.total)), ...(v.deposit ? [row2('訂金', money(v.deposit))] : []), row2('有效至', formatDateTime(v.valid_until))] : []),
    row2('編號', q.quote_no),
  ];
  const message = {
    type: 'flex', altText: `【${businessName}】${title}`.slice(0, 300),
    contents: {
      type: 'bubble',
      header: { type: 'box', layout: 'vertical', backgroundColor: meta.color, paddingAll: '16px', contents: [
        { type: 'text', text: businessName || 'URBANLINKS 預約', size: 'xs', color: '#ffffffcc' },
        { type: 'text', text: title, size: 'lg', weight: 'bold', color: '#ffffff', wrap: true, margin: 'sm' },
      ] },
      body: { type: 'box', layout: 'vertical', spacing: 'md', contents: body },
      footer: { type: 'box', layout: 'vertical', contents: [
        { type: 'button', style: 'primary', color: '#1f1b19', height: 'sm', action: { type: 'uri', label: row.audience === 'owner' ? '到後台處理' : '查看報價', uri: row.audience === 'owner' ? `${site}/mycard/booking` : `${site}/@${card?.slug ?? ''}/book?tab=my` } },
      ] },
    },
  };
  return pushLine(token, row.id, lineId, message);
}

// 服務紀錄的通知:請顧客同意公開照片(不在訊息裡放照片或紀錄內容)、顧客要求刪除照片
async function deliverRecord(row: OutboxRow, token: string): Promise<{ state: 'api_accepted' | 'skipped' | 'retry' | 'failed'; error?: string }> {
  const { data: r } = await db().from('bk_service_records').select('id, business_id, customer_id, service_name, performed_on, consent, delete_requested').eq('id', row.record_id!).maybeSingle();
  if (!r) return { state: 'skipped', error: 'record_missing' };
  if (row.event === 'consent_requested' && r.consent !== 'requested') return { state: 'skipped', error: 'stale' };
  const { data: business } = await db().from('bk_businesses').select('owner_user_id, name, card_id').eq('id', r.business_id).single();
  const { data: customer } = await db().from('bk_customers').select('user_id, name').eq('id', r.customer_id).single();
  const recipient = row.audience === 'owner' ? business?.owner_user_id : customer?.user_id;
  const lineId = recipient ? await lineUserIdOf(recipient) : null;
  if (!lineId) return { state: 'skipped', error: 'no_line' };
  const { data: card } = business?.card_id ? await db().from('profile_cards').select('slug, display_name').eq('id', business.card_id).maybeSingle() : { data: null };
  const site = getConfiguredSiteUrl();
  const businessName = business?.name || card?.display_name || '';
  const owner = row.audience === 'owner';
  const title = row.event === 'consent_requested' ? '店家想把服務照片作為作品分享' : '顧客要求刪除服務照片';
  const text = row.event === 'consent_requested'
    ? `${r.performed_on} ${r.service_name} 的照片。同意前不會公開,同意後也可以隨時撤回。`
    : `${customer?.name ?? ''} 要求刪除 ${r.performed_on} ${r.service_name} 的照片,請到顧客檔案處理。`;
  return pushLine(token, row.id, lineId, {
    type: 'flex', altText: `【${businessName}】${title}`.slice(0, 300),
    contents: {
      type: 'bubble',
      header: { type: 'box', layout: 'vertical', backgroundColor: '#1f6f8b', paddingAll: '16px', contents: [
        { type: 'text', text: businessName || 'URBANLINKS 預約', size: 'xs', color: '#ffffffcc' },
        { type: 'text', text: title, size: 'lg', weight: 'bold', color: '#ffffff', wrap: true, margin: 'sm' },
      ] },
      body: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text, size: 'sm', color: '#1f1b19', wrap: true }] },
      footer: { type: 'box', layout: 'vertical', contents: [
        { type: 'button', style: 'primary', color: '#1f1b19', height: 'sm', action: { type: 'uri', label: owner ? '到後台處理' : '查看並決定', uri: owner ? `${site}/mycard/booking` : `${site}/@${card?.slug ?? ''}/book?tab=my` } },
      ] },
    },
  });
}

// 候補邀請:有空位了,請在期限內預約(先完成預約的人取得名額)
async function deliverWaitlist(row: OutboxRow, token: string): Promise<{ state: 'api_accepted' | 'skipped' | 'retry' | 'failed'; error?: string }> {
  const { data: w } = await db().from('bk_waitlist').select('*').eq('id', row.waitlist_id!).maybeSingle();
  if (!w || w.status !== 'invited') return { state: 'skipped', error: 'stale' };
  const lineId = await lineUserIdOf(w.customer_user_id);
  if (!lineId) return { state: 'skipped', error: 'no_line' };
  const { data: business } = await db().from('bk_businesses').select('name, card_id').eq('id', w.business_id).single();
  const { data: card } = business?.card_id ? await db().from('profile_cards').select('slug, display_name').eq('id', business.card_id).maybeSingle() : { data: null };
  const { data: svc } = await db().from('bk_services').select('name').eq('id', w.service_id).maybeSingle();
  const businessName = business?.name || card?.display_name || '';
  const link = `${getConfiguredSiteUrl()}/@${card?.slug ?? ''}/book?s=${w.service_id}&d=${w.date}&t=${encodeURIComponent(w.invited_slot ?? '')}${w.staff_id ? `&p=${w.staff_id}` : ''}`;
  const [, mo, da] = String(w.date).split('-');
  return pushLine(token, row.id, lineId, {
    type: 'flex', altText: `【${businessName}】候補的時段有空位了`.slice(0, 300),
    contents: {
      type: 'bubble',
      header: { type: 'box', layout: 'vertical', backgroundColor: '#2f6b3f', paddingAll: '16px', contents: [
        { type: 'text', text: businessName || 'URBANLINKS 預約', size: 'xs', color: '#ffffffcc' },
        { type: 'text', text: '候補的時段有空位了', size: 'lg', weight: 'bold', color: '#ffffff', wrap: true, margin: 'sm' },
      ] },
      body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: [
        { type: 'text', text: `${svc?.name ?? ''} · ${Number(mo)}/${Number(da)} ${w.invited_slot}`, size: 'md', weight: 'bold', color: '#1f1b19', wrap: true },
        { type: 'text', text: `請在 ${formatDateTime(w.invite_expires_at)} 前完成預約;名額沒有保留,先完成預約的人取得。`, size: 'xs', color: '#8a7f72', wrap: true },
      ] },
      footer: { type: 'box', layout: 'vertical', contents: [
        { type: 'button', style: 'primary', color: '#1f1b19', height: 'sm', action: { type: 'uri', label: '立即預約', uri: link } },
      ] },
    },
  });
}

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

type OutboxRow = { id: string; booking_id: string | null; quote_id: string | null; record_id: string | null; waitlist_id: string | null; booking_version: number; event: string; audience: 'customer' | 'owner'; attempts: number; due_at: string };

async function deliver(row: OutboxRow, token: string): Promise<{ state: 'api_accepted' | 'skipped' | 'retry' | 'failed'; error?: string }> {
  if (!row.booking_id) {
    if (row.quote_id) return deliverQuote(row, token);
    if (row.record_id) return deliverRecord(row, token);
    if (row.waitlist_id) return deliverWaitlist(row, token);
    return { state: 'skipped', error: 'no_target' };
  }
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
  // 回訪 / 感謝:顧客關閉提醒就不發;回訪時已經再預約過就不發
  if (['thanks', 'revisit'].includes(row.event)) {
    const { data: cust } = b.customer_id ? await db().from('bk_customers').select('marketing_opt_out').eq('id', b.customer_id).maybeSingle() : { data: null };
    if (cust?.marketing_opt_out) return { state: 'skipped', error: 'opt_out' };
    if (row.event === 'revisit') {
      const { count } = await db().from('bk_bookings').select('id', { count: 'exact', head: true }).eq('business_id', b.business_id)
        .eq('customer_user_id', b.customer_user_id ?? '').gt('start_at', b.start_at).in('status', ['pending', 'confirmed', 'checked_in', 'completed']);
      if (count) return { state: 'skipped', error: 'returned' };
    }
  }
  const meta = TITLES[row.event];
  const title = row.event === 'revisit' ? `該預約下一次「${b.service_snapshot.name}」了` : meta?.[row.audience];
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
    extra = paymentReportText(b.payment_report);
  } else if (row.event === 'thanks') {
    const { data: biz2 } = await db().from('bk_businesses').select('thanks_message').eq('id', b.business_id).single();
    extra = biz2?.thanks_message || '期待下次再為你服務。';
  } else if (row.event === 'revisit') {
    extra = `距離上次服務(${formatDateTime(b.start_at).split(' ')[0]})已經一段時間,需要的話可以直接預約下一次。`;
  } else if (row.audience === 'customer' && business?.address && ['confirmed', 'rescheduled', 'reminder_24h', 'reminder_2h'].includes(row.event)) {
    extra = `地點:${business.address}`;
  }
  const message = flexMessage({
    title, color: meta.color, businessName, booking: b, staffName: (staffCount ?? 0) > 1 ? staff?.name ?? '' : '',
    link: row.event === 'revisit' ? `${site}/@${card?.slug ?? ''}/book?s=${b.service_id ?? ''}` : link,
    button: row.audience === 'owner' ? '到後台處理' : row.event === 'revisit' ? '立即預約' : '查看預約', extra,
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
  const result = { expired: 0, sent: 0, skipped: 0, failed: 0, invited: 0 };
  // 候補邀請(放在通知前,讓剛產生的邀請這次就送出)
  try { await (await import('./calendar')).syncDueCalendars(); } catch (e) { console.error('calendar sync', e); }
  try { result.invited = (await (await import('./engage')).processWaitlist()).invited; } catch (e) { console.error('waitlist', e); }
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
    .insert({ owner_user_id: userId, card_id: card?.id ?? null, name: '' })
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
      image: s.image, deposit: s.deposit, price_mode: s.price_mode, service_mode: s.service_mode, branch_ids: s.branch_ids ?? [],
      steps: stepsOf(sched, s.id).map((st) => ({ name: st.name, minutes: st.minutes, who: st.who })),
      addons: sched.addons.filter((a) => a.service_id === s.id).map((a) => ({ id: a.id, name: a.name, price: a.price, extra_minutes: a.extra_minutes })),
      staff: staffForService(sched, s.id).map((st) => {
        const link = sched.staffServices.find((x) => x.service_id === s.id && x.staff_id === st.id);
        const stepSum = stepsOf(sched, s.id).reduce((n, x) => n + x.minutes, 0);
        return { id: st.id, duration_minutes: stepSum || (link?.duration_minutes ?? s.duration_minutes), price: link?.price ?? s.price };
      }),
    })),
    staff: sched.staff.map((st) => ({ id: st.id, name: st.name, title: st.title, avatar: st.avatar, branch_ids: st.branch_ids ?? [] })),
    branches: sched.branches.filter((b) => b.active).map((b) => ({ id: b.id, name: b.name, address: b.address })),
  };
}
