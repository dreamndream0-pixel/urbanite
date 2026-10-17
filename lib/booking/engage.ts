// 預約系統 D1:候補名單(有空位時依登記順序一次邀請一位)
// 邀請不保留名額:顧客收到通知後照一般流程預約,仍由資料庫保證不重複;邀請逾時就換下一位
import { createAdminClient } from '@/lib/supabase/admin';
import { availability, BookingError, getPublicBusiness, loadSchedule } from './server';
import { localParts, minutesToHHMM, type BkBusiness } from './shared';

const db = () => createAdminClient();

export type WaitlistEntry = {
  id: string; business_id: string; customer_user_id: string; service_id: string; staff_id: string | null; date: string;
  from_min: number; to_min: number; contact: { name?: string; phone?: string }; status: 'waiting' | 'invited' | 'booked' | 'expired' | 'cancelled';
  invited_slot: string | null; invite_expires_at: string | null; created_at: string;
};

export async function joinWaitlist(input: {
  slug: string; userId: string; serviceId: string; staffId: string | null; date: string; fromMin: number; toMin: number; contact: { name: string; phone: string };
}) {
  const ctx = await getPublicBusiness(input.slug);
  if (!ctx) throw new BookingError('NOT_FOUND', '這張名片目前沒有開放預約。', 404);
  const { business } = ctx;
  if (!business.waitlist_enabled) throw new BookingError('POLICY_BLOCKED', '這家店沒有開放候補。', 422);
  const sched = await loadSchedule(business.id);
  if (!sched.services.some((s) => s.id === input.serviceId && s.price_mode !== 'quote')) throw new BookingError('VALIDATION_ERROR', '這個服務無法候補。', 422);
  const today = localParts(new Date()).date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || input.date < today) throw new BookingError('VALIDATION_ERROR', '請選擇今天以後的日期。', 422);
  const fromMin = Math.max(0, Math.min(1439, Math.round(input.fromMin)));
  const toMin = Math.max(fromMin + 15, Math.min(1440, Math.round(input.toMin)));
  const { count } = await db().from('bk_waitlist').select('id', { count: 'exact', head: true })
    .eq('business_id', business.id).eq('customer_user_id', input.userId).in('status', ['waiting', 'invited']);
  if ((count ?? 0) >= 3) throw new BookingError('POLICY_BLOCKED', '同一家店最多同時候補 3 個時段。', 422);
  const { data, error } = await db().from('bk_waitlist').insert({
    business_id: business.id, customer_user_id: input.userId, service_id: input.serviceId,
    staff_id: input.staffId && sched.staff.some((s) => s.id === input.staffId) ? input.staffId : null,
    date: input.date, from_min: fromMin, to_min: toMin, contact: { name: input.contact.name.trim().slice(0, 40), phone: input.contact.phone.trim().slice(0, 30) },
  }).select('*').single();
  if (error) throw new BookingError('SERVER_ERROR', '候補登記失敗。', 500);
  return data as WaitlistEntry;
}

export async function cancelWaitlist(actor: { type: 'customer' | 'owner'; id: string }, entryId: string) {
  let q = db().from('bk_waitlist').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', entryId).in('status', ['waiting', 'invited']);
  if (actor.type === 'customer') q = q.eq('customer_user_id', actor.id);
  else {
    const { data: biz } = await db().from('bk_businesses').select('id').eq('owner_user_id', actor.id).maybeSingle();
    q = q.eq('business_id', biz?.id ?? '');
  }
  const { data } = await q.select('id');
  if (!data?.length) throw new BookingError('NOT_FOUND', '找不到這筆候補。', 404);
}

// 背景工作:過期處理 → 每組(店、日期、服務)最多一位邀請中 → 有空位就邀請最早登記的人
export async function processWaitlist(limit = 20) {
  const now = new Date();
  const nowIso = now.toISOString();
  const today = localParts(now).date;
  const result = { invited: 0, expired: 0 };
  // 日期已過、邀請逾時 → 結束(顧客可重新登記)
  const { data: past } = await db().from('bk_waitlist').update({ status: 'expired', updated_at: nowIso }).in('status', ['waiting', 'invited']).lt('date', today).select('id');
  const { data: missed } = await db().from('bk_waitlist').update({ status: 'expired', updated_at: nowIso }).eq('status', 'invited').lt('invite_expires_at', nowIso).select('id');
  result.expired = (past?.length ?? 0) + (missed?.length ?? 0);

  const { data: waiting } = await db().from('bk_waitlist').select('*').eq('status', 'waiting').gte('date', today).order('created_at').limit(200);
  if (!waiting?.length) return result;
  const { data: invited } = await db().from('bk_waitlist').select('business_id, date, service_id').eq('status', 'invited');
  const busy = new Set((invited ?? []).map((w) => `${w.business_id}|${w.date}|${w.service_id}`));
  const cache = new Map<string, { business: BkBusiness; sched: Awaited<ReturnType<typeof loadSchedule>> }>();
  let checked = 0;
  for (const w of waiting as WaitlistEntry[]) {
    const key = `${w.business_id}|${w.date}|${w.service_id}`;
    if (busy.has(key) || checked >= limit) continue;
    checked++;
    if (!cache.has(w.business_id)) {
      const { data: business } = await db().from('bk_businesses').select('*').eq('id', w.business_id).single();
      if (!business?.enabled || !business.waitlist_enabled) continue;
      cache.set(w.business_id, { business: business as BkBusiness, sched: await loadSchedule(w.business_id) });
    }
    const ctx = cache.get(w.business_id);
    if (!ctx) continue;
    let day;
    try { [day] = (await availability(ctx.business, ctx.sched, { serviceId: w.service_id, addonIds: [], staffId: w.staff_id }, w.date, 1)).days; }
    catch { continue; }
    const slot = day?.slots.find((t) => { const [h, m] = t.split(':').map(Number); const min = h * 60 + m; return min >= w.from_min && min < w.to_min; });
    if (!slot) continue;
    const start = new Date(`${w.date}T${slot}:00+08:00`).getTime();
    const expires = new Date(Math.min(now.getTime() + ctx.business.waitlist_invite_minutes * 60000, start - ctx.business.lead_minutes * 60000));
    if (expires.getTime() <= now.getTime() + 5 * 60000) continue;
    const { data: upd } = await db().from('bk_waitlist').update({
      status: 'invited', invited_slot: slot, invite_expires_at: expires.toISOString(), invite_count: 1, updated_at: nowIso,
    }).eq('id', w.id).eq('status', 'waiting').select('id');
    if (!upd?.length) continue;
    busy.add(key);
    await db().from('bk_notification_outbox').insert({ business_id: w.business_id, waitlist_id: w.id, booking_version: 1, event: 'waitlist_invite', audience: 'customer' });
    result.invited++;
  }
  return result;
}

// 顧客成功預約後:同店同服務同日期的候補改為已預約
export async function markWaitlistBooked(businessId: string, userId: string, serviceId: string, startIso: string) {
  await db().from('bk_waitlist').update({ status: 'booked', updated_at: new Date().toISOString() })
    .eq('business_id', businessId).eq('customer_user_id', userId).eq('service_id', serviceId).eq('date', localParts(startIso).date).in('status', ['waiting', 'invited']);
}

export const windowLabel = (w: Pick<WaitlistEntry, 'from_min' | 'to_min'>) =>
  w.from_min === 0 && w.to_min === 1440 ? '整天' : `${minutesToHHMM(w.from_min)}–${w.to_min === 1440 ? '24:00' : minutesToHHMM(w.to_min)}`;
