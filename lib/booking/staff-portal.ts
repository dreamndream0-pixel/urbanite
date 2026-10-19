// 預約 E4:服務人員專屬頁(不用登入,憑店家給的私密連結)
// 人員可以:看自己的預約行程、填每週班表、新增 / 刪除自己的休假;看不到其他人員與店家設定
import crypto from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { BookingError } from './server';
import { localParts, type BkException, type BkHour, type BkStaff } from './shared';

const db = () => createAdminClient();
const TOKEN_RE = /^[A-Za-z0-9_-]{24,64}$/;

export function newPortalToken() {
  return crypto.randomBytes(24).toString('base64url');
}

async function staffByToken(token: string) {
  if (!TOKEN_RE.test(token)) throw new BookingError('NOT_FOUND', '連結無效或已重設,請向店家索取新連結。', 404);
  const { data: staff } = await db().from('bk_staff').select('*').eq('portal_token', token).maybeSingle();
  if (!staff) throw new BookingError('NOT_FOUND', '連結無效或已重設,請向店家索取新連結。', 404);
  const { data: business } = await db().from('bk_businesses').select('id, name, card_id, timezone').eq('id', staff.business_id).single();
  const { data: card } = business?.card_id ? await db().from('profile_cards').select('slug, display_name').eq('id', business.card_id).maybeSingle() : { data: null };
  return { staff: staff as BkStaff, business: business!, card };
}

export type PortalBooking = { id: string; start_at: string; end_at: string; status: string; service: string; customer: string; phone: string; resource: string; role: 'main' | 'assistant' };
export type PortalData = {
  staff: { id: string; name: string; title: string; use_business_hours: boolean; active: boolean };
  businessName: string; bookUrl: string; today: string;
  hours: BkHour[]; myHours: BkHour[]; exceptions: BkException[]; bookings: PortalBooking[];
};

export async function portalData(token: string, siteUrl: string): Promise<PortalData> {
  const { staff, business, card } = await staffByToken(token);
  const today = localParts(new Date()).date;
  const from = new Date(Date.now() - 7 * 86400000).toISOString();
  const to = new Date(Date.now() + 120 * 86400000).toISOString();
  const [hours, myHours, exceptions, allocs, resources] = await Promise.all([
    db().from('bk_hours').select('weekday, start_min, end_min, branch_id').eq('business_id', business.id).order('weekday').order('start_min'),
    db().from('bk_staff_hours').select('weekday, start_min, end_min, branch_id').eq('staff_id', staff.id).order('weekday').order('start_min'),
    db().from('bk_exceptions').select('id, start_at, end_at, reason, staff_id, branch_id').eq('business_id', business.id).gt('end_at', new Date().toISOString()).or(`staff_id.eq.${staff.id},staff_id.is.null`).order('start_at'),
    db().from('bk_allocations').select('booking_id, role, start_at, end_at').eq('staff_id', staff.id).gte('start_at', from).lte('start_at', to),
    db().from('bk_resources').select('id, name').eq('business_id', business.id),
  ]);
  // 主要人員是預約的 staff_id;助理只出現在 allocations
  const ids = [...new Set((allocs.data ?? []).map((a) => a.booking_id))];
  const { data: direct } = await db().from('bk_bookings').select('id').eq('business_id', business.id).eq('staff_id', staff.id).gte('start_at', from).lte('start_at', to);
  for (const d of direct ?? []) if (!ids.includes(d.id)) ids.push(d.id);
  const { data: rows } = ids.length
    ? await db().from('bk_bookings').select('id, start_at, end_at, status, service_snapshot, contact, resource_id, staff_id').in('id', ids).in('status', ['pending', 'confirmed', 'checked_in', 'completed'])
    : { data: [] };
  const bookings: PortalBooking[] = (rows ?? []).map((b) => {
    const mine = (allocs.data ?? []).filter((a) => a.booking_id === b.id);
    const assistant = b.staff_id !== staff.id && mine.length > 0;
    return {
      id: b.id,
      start_at: assistant ? mine.map((a) => a.start_at).sort()[0] : b.start_at,
      end_at: assistant ? mine.map((a) => a.end_at).sort().slice(-1)[0] : b.end_at,
      status: b.status, service: (b.service_snapshot as { name?: string })?.name ?? '',
      customer: (b.contact as { name?: string })?.name ?? '', phone: (b.contact as { phone?: string })?.phone ?? '',
      resource: (resources.data ?? []).find((r) => r.id === b.resource_id)?.name ?? '', role: (assistant ? 'assistant' : 'main') as PortalBooking['role'],
    };
  }).sort((x, y) => x.start_at.localeCompare(y.start_at));
  return {
    staff: { id: staff.id, name: staff.name, title: staff.title, use_business_hours: staff.use_business_hours, active: staff.active },
    businessName: business.name || card?.display_name || '', bookUrl: card?.slug ? `${siteUrl}/@${card.slug}/book?staff=${staff.id}` : '', today,
    hours: (hours.data ?? []) as BkHour[], myHours: (myHours.data ?? []) as BkHour[], exceptions: (exceptions.data ?? []) as BkException[], bookings,
  };
}

const int = (v: unknown, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number(v) || 0)));

// 班表:跟營業時段相同,或自訂每週時段(整份取代)
export async function portalSaveHours(token: string, input: { use_business_hours: boolean; hours: unknown }) {
  const { staff, business } = await staffByToken(token);
  await db().from('bk_staff').update({ use_business_hours: Boolean(input.use_business_hours) }).eq('id', staff.id);
  if (input.use_business_hours) return;
  const rows = (Array.isArray(input.hours) ? input.hours as Record<string, unknown>[] : [])
    .map((h) => ({ business_id: business.id, staff_id: staff.id, weekday: int(h.weekday, 0, 6), start_min: int(h.start_min, 0, 1439), end_min: int(h.end_min, 1, 1440), branch_id: typeof h.branch_id === 'string' && /^[0-9a-f-]{36}$/.test(h.branch_id) ? h.branch_id : null }))
    .filter((h) => h.end_min > h.start_min)
    .slice(0, 50);
  await db().from('bk_staff_hours').delete().eq('staff_id', staff.id).eq('business_id', business.id);
  if (rows.length) await db().from('bk_staff_hours').insert(rows);
}

// 新增自己的休假;回傳這段時間已有的預約(不會自動取消,提醒人員找店家處理)
export async function portalAddLeave(token: string, input: { start_at: string; end_at: string; reason: string }) {
  const { staff, business } = await staffByToken(token);
  const start = new Date(input.start_at);
  const end = new Date(input.end_at);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) throw new BookingError('VALIDATION_ERROR', '請選擇正確的開始與結束時間。', 422);
  if (end.getTime() - start.getTime() > 120 * 86400000) throw new BookingError('VALIDATION_ERROR', '一次最多設定 120 天。', 422);
  if (end.getTime() < Date.now()) throw new BookingError('VALIDATION_ERROR', '不能設定已經過去的時間。', 422);
  const { error } = await db().from('bk_exceptions').insert({ business_id: business.id, staff_id: staff.id, start_at: start.toISOString(), end_at: end.toISOString(), reason: input.reason.trim().slice(0, 60) });
  if (error) throw new BookingError('SERVER_ERROR', '儲存失敗。', 500);
  const { data: affected } = await db().from('bk_bookings').select('id, start_at, end_at, contact, service_snapshot')
    .eq('business_id', business.id).eq('staff_id', staff.id).in('status', ['pending', 'confirmed']).lt('start_at', end.toISOString()).gt('occupy_end_at', start.toISOString());
  return (affected ?? []).length;
}

// 只能刪自己的休假(全店休假由店家管理)
export async function portalDeleteLeave(token: string, id: string) {
  const { staff, business } = await staffByToken(token);
  await db().from('bk_exceptions').delete().eq('id', id).eq('business_id', business.id).eq('staff_id', staff.id);
}
