// 預約系統 D2:營運報表與人員抽成結算
// 服務營收 = 期間內完成的預約(依服務日期);實收 = 期間內的收款減退款(依收款日期,不含點數 / 套票折抵)
// 抽成:依實際服務人員(多項服務按每一項)計算服務營收,期間內的退款回沖;結算後鎖定,不再變動
import { createAdminClient } from '@/lib/supabase/admin';
import { BookingError, loadSchedule, ownerBusiness } from './server';
import { addDays, fromLocal, localParts, type BkBusiness } from './shared';

const db = () => createAdminClient();
const ACTIVE = ['pending', 'confirmed', 'checked_in'];

type StaffRow = { staff_id: string; name: string; rate: number; completed: number; minutes: number; revenue: number; refunds: number; net: number; commission: number; scheduled_minutes: number; utilization: number };

export async function buildReport(business: BkBusiness, from: string, to: string) {
  const fromIso = fromLocal(from, 0).toISOString();
  const toIso = fromLocal(addDays(to, 1), 0).toISOString();
  const [{ data: bookings }, { data: payments }, sched, { data: packages }, { data: rewards }] = await Promise.all([
    db().from('bk_bookings').select('id, status, start_at, end_at, staff_id, service_id, service_snapshot, total_price, paid_amount, source_channel, customer_id, created_by')
      .eq('business_id', business.id).gte('start_at', fromIso).lt('start_at', toIso).limit(5000),
    db().from('bk_payments').select('booking_id, kind, amount, method, created_at').eq('business_id', business.id).gte('created_at', fromIso).lt('created_at', toIso).limit(10000),
    loadSchedule(business.id, true),
    db().from('bk_customer_packages').select('price_paid, created_at').eq('business_id', business.id).gte('created_at', fromIso).lt('created_at', toIso),
    db().from('bk_reward_ledger').select('kind, points').eq('business_id', business.id).gte('created_at', fromIso).lt('created_at', toIso),
  ]);
  const list = bookings ?? [];
  const ids = list.map((b) => b.id);
  const { data: items } = ids.length ? await db().from('bk_booking_items').select('booking_id, service_id, service_snapshot, staff_id, start_at, end_at, amount, status').in('booking_id', ids) : { data: [] };
  const done = list.filter((b) => b.status === 'completed');

  // 服務明細:有多項服務就用每一項(各自的人員與金額),否則用整筆
  type Line = { booking_id: string; staff_id: string | null; service: string; amount: number; minutes: number };
  const lines: Line[] = [];
  for (const b of done) {
    const its = (items ?? []).filter((i) => i.booking_id === b.id && i.status === 'active');
    if (its.length > 1) for (const i of its) lines.push({ booking_id: b.id, staff_id: i.staff_id, service: (i.service_snapshot as { name: string }).name, amount: i.amount, minutes: (new Date(i.end_at).getTime() - new Date(i.start_at).getTime()) / 60000 });
    else lines.push({ booking_id: b.id, staff_id: b.staff_id, service: (b.service_snapshot as { name: string }).name, amount: b.total_price, minutes: (new Date(b.end_at).getTime() - new Date(b.start_at).getTime()) / 60000 });
  }

  // 期間內的退款(依退款日期)回沖到原預約的服務人員
  const refundRows = (payments ?? []).filter((p) => p.kind === 'refund');
  const refundBookingIds = [...new Set(refundRows.map((p) => p.booking_id))];
  const { data: refundBookings } = refundBookingIds.length ? await db().from('bk_bookings').select('id, staff_id, status').in('id', refundBookingIds) : { data: [] };

  // 排班分鐘數(營業時段或人員班表,扣掉休假前的粗估)用來算稼動率
  const days: string[] = [];
  for (let d = from; d <= to && days.length < 370; d = addDays(d, 1)) days.push(d);
  const scheduled = (staffId: string) => {
    const st = sched.staff.find((s) => s.id === staffId);
    if (!st) return 0;
    const hours = st.use_business_hours ? sched.hours : sched.staffHours.filter((h) => h.staff_id === staffId);
    return days.reduce((n, d) => n + hours.filter((h) => h.weekday === localParts(fromLocal(d, 720)).weekday).reduce((m, h) => m + h.end_min - h.start_min, 0), 0);
  };

  const staffRows: StaffRow[] = sched.staff.filter((s) => s.role !== 'assistant' || lines.some((l) => l.staff_id === s.id)).map((s) => {
    const mine = lines.filter((l) => l.staff_id === s.id);
    const revenue = mine.reduce((n, l) => n + l.amount, 0);
    const refunds = refundRows.filter((p) => (refundBookings ?? []).find((rb) => rb.id === p.booking_id)?.staff_id === s.id && (refundBookings ?? []).find((rb) => rb.id === p.booking_id)?.status === 'completed').reduce((n, p) => n + p.amount, 0);
    const net = Math.max(0, revenue - refunds);
    const rate = Number(s.commission_rate ?? 0);
    const minutes = mine.reduce((n, l) => n + l.minutes, 0);
    const sm = scheduled(s.id);
    return {
      staff_id: s.id, name: s.name, rate, completed: new Set(mine.map((l) => l.booking_id)).size, minutes, revenue, refunds, net,
      commission: Math.round((net * rate) / 100), scheduled_minutes: sm, utilization: sm ? Math.round((minutes / sm) * 100) : 0,
    };
  });

  const byService = new Map<string, { count: number; revenue: number }>();
  for (const l of lines) { const r = byService.get(l.service) ?? { count: 0, revenue: 0 }; r.count++; r.revenue += l.amount; byService.set(l.service, r); }
  const byChannel = new Map<string, number>();
  for (const b of list) byChannel.set(b.source_channel || 'card', (byChannel.get(b.source_channel || 'card') ?? 0) + 1);
  const byMethod = new Map<string, number>();
  for (const p of payments ?? []) byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + (p.kind === 'refund' ? -p.amount : p.amount));

  // 新客 / 回頭客:期間內有完成預約的顧客,期間前是否有完成過
  const custIds = [...new Set(done.map((b) => b.customer_id).filter(Boolean))] as string[];
  const { data: before } = custIds.length ? await db().from('bk_bookings').select('customer_id').in('customer_id', custIds).eq('status', 'completed').lt('start_at', fromIso) : { data: [] };
  const returning = new Set((before ?? []).map((b) => b.customer_id));
  const forfeited = list.filter((b) => ['cancelled', 'no_show', 'expired'].includes(b.status) && b.paid_amount > 0).reduce((n, b) => n + b.paid_amount, 0);
  const count = (st: string) => list.filter((b) => b.status === st).length;
  const finished = list.filter((b) => !ACTIVE.includes(b.status)).length || 1;

  return {
    from, to,
    totals: {
      bookings: list.length, completed: done.length, upcoming: list.filter((b) => ACTIVE.includes(b.status)).length,
      cancelled: count('cancelled'), no_show: count('no_show'), expired: count('expired'),
      cancel_rate: Math.round((count('cancelled') / finished) * 100), no_show_rate: Math.round((count('no_show') / finished) * 100),
      service_revenue: lines.reduce((n, l) => n + l.amount, 0),
      collected: (payments ?? []).filter((p) => !['points', 'package'].includes(p.method)).reduce((n, p) => n + (p.kind === 'refund' ? -p.amount : p.amount), 0),
      forfeited, packages_sold: (packages ?? []).length, packages_amount: (packages ?? []).reduce((n, p) => n + p.price_paid, 0),
      points_earned: (rewards ?? []).filter((r) => r.points > 0 && r.kind !== 'adjust').reduce((n, r) => n + r.points, 0),
      points_redeemed: -(rewards ?? []).filter((r) => r.kind === 'redeem').reduce((n, r) => n + r.points, 0),
      customers: custIds.length, new_customers: custIds.filter((c) => !returning.has(c)).length, returning_customers: custIds.filter((c) => returning.has(c)).length,
      avg_ticket: done.length ? Math.round(lines.reduce((n, l) => n + l.amount, 0) / done.length) : 0,
    },
    staff: staffRows,
    services: [...byService.entries()].map(([name, r]) => ({ name, ...r })).sort((a, b) => b.revenue - a.revenue),
    channels: [...byChannel.entries()].map(([channel, n]) => ({ channel, count: n })).sort((a, b) => b.count - a.count),
    methods: [...byMethod.entries()].map(([method, amount]) => ({ method, amount })),
  };
}

export async function ownerReport(ownerUserId: string, from: string, to: string) {
  const business = await ownerBusiness(ownerUserId);
  if (!business) throw new BookingError('NOT_FOUND', '請先完成預約設定。', 404);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) throw new BookingError('VALIDATION_ERROR', '請選擇正確的期間。', 422);
  if (addDays(from, 370) < to) throw new BookingError('VALIDATION_ERROR', '期間最多一年。', 422);
  const report = await buildReport(business, from, to);
  const { data: runs } = await db().from('bk_payroll_runs').select('id, period_start, period_end, total, note, created_at').eq('business_id', business.id).order('period_start', { ascending: false }).limit(24);
  return { ...report, runs: runs ?? [] };
}

// 結算抽成:鎖定這段期間的計算結果(期間重疊會被資料庫擋下;還沒結束的期間不能結算)
export async function settlePayroll(ownerUserId: string, from: string, to: string, note: string) {
  const business = await ownerBusiness(ownerUserId);
  if (!business) throw new BookingError('NOT_FOUND', '請先完成預約設定。', 404);
  if (to >= localParts(new Date()).date) throw new BookingError('POLICY_BLOCKED', '期間結束後才能結算(結束日要早於今天)。', 422);
  const report = await buildReport(business, from, to);
  const snapshot = report.staff.filter((s) => s.revenue || s.refunds).map((s) => ({ staff_id: s.staff_id, name: s.name, revenue: s.revenue, refunds: s.refunds, net: s.net, rate: s.rate, commission: s.commission, services: s.completed }));
  const { data, error } = await db().from('bk_payroll_runs').insert({
    business_id: business.id, period_start: from, period_end: to, snapshot, total: snapshot.reduce((n, s) => n + s.commission, 0), note: note.slice(0, 100), created_by: ownerUserId,
  }).select('*').single();
  if (error) {
    if (error.code === '23P01') throw new BookingError('POLICY_BLOCKED', '這段期間和已結算的期間重疊。', 409);
    throw new BookingError('SERVER_ERROR', '結算失敗。', 500);
  }
  return data;
}

export async function payrollRun(ownerUserId: string, runId: string) {
  const business = await ownerBusiness(ownerUserId);
  const { data } = await db().from('bk_payroll_runs').select('*').eq('id', runId).eq('business_id', business?.id ?? '').maybeSingle();
  if (!data) throw new BookingError('NOT_FOUND', '找不到這次結算。', 404);
  return data;
}
