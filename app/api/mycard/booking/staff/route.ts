import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ownerBusiness } from '@/lib/booking/server';

export const dynamic = 'force-dynamic';

const err = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });
const int = (v: unknown, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number(v) || 0)));

async function ctx() {
  const user = await getSessionUser();
  if (!user) return null;
  const business = await ownerBusiness(user.id, true);
  return business ? { user, business } : null;
}

function clean(b: Record<string, unknown>) {
  return {
    name: String(b.name ?? '').trim().slice(0, 30),
    title: String(b.title ?? '').trim().slice(0, 30),
    avatar: /^https:\/\//.test(String(b.avatar ?? '')) ? String(b.avatar) : '',
    active: b.active === undefined ? true : Boolean(b.active),
    use_business_hours: b.use_business_hours === undefined ? true : Boolean(b.use_business_hours),
  };
}

// 人員自己的班表:整份取代
async function saveHours(businessId: string, staffId: string, hours: unknown) {
  if (!Array.isArray(hours)) return;
  const db = createAdminClient();
  const rows = (hours as Record<string, unknown>[])
    .map((h) => ({ business_id: businessId, staff_id: staffId, weekday: int(h.weekday, 0, 6), start_min: int(h.start_min, 0, 1439), end_min: int(h.end_min, 1, 1440) }))
    .filter((h) => h.end_min > h.start_min)
    .slice(0, 50);
  await db.from('bk_staff_hours').delete().eq('staff_id', staffId).eq('business_id', businessId);
  if (rows.length) await db.from('bk_staff_hours').insert(rows);
}

// POST /api/mycard/booking/staff { name, title, use_business_hours, hours } — 新增人員
export async function POST(request: Request) {
  const c = await ctx();
  if (!c) return err(401, 'AUTH_REQUIRED', '請先登入。');
  const body = await request.json().catch(() => ({}));
  const row = clean(body);
  if (!row.name) return err(422, 'VALIDATION_ERROR', '請填寫人員名稱。');
  const db = createAdminClient();
  const { count } = await db.from('bk_staff').select('id', { count: 'exact', head: true }).eq('business_id', c.business.id);
  if ((count ?? 0) >= 30) return err(422, 'POLICY_BLOCKED', '人員最多 30 位。');
  const { data, error } = await db.from('bk_staff').insert({ ...row, business_id: c.business.id, sort_order: count ?? 0 }).select('*').single();
  if (error) return err(400, 'SERVER_ERROR', error.message);
  await saveHours(c.business.id, data.id, body.hours);
  return NextResponse.json(data, { status: 201 });
}

// PATCH /api/mycard/booking/staff { id, ... } — 修改人員;{ order: [id...] } 調整排序
export async function PATCH(request: Request) {
  const c = await ctx();
  if (!c) return err(401, 'AUTH_REQUIRED', '請先登入。');
  const body = await request.json().catch(() => ({}));
  const db = createAdminClient();
  if (Array.isArray(body?.order)) {
    await Promise.all((body.order as string[]).slice(0, 30).map((id, i) => db.from('bk_staff').update({ sort_order: i }).eq('id', id).eq('business_id', c.business.id)));
    return NextResponse.json({ ok: true });
  }
  const id = String(body?.id ?? '');
  const row = clean(body);
  if (!row.name) return err(422, 'VALIDATION_ERROR', '請填寫人員名稱。');
  if (!row.active) {
    const { count } = await db.from('bk_staff').select('id', { count: 'exact', head: true }).eq('business_id', c.business.id).eq('active', true).neq('id', id);
    if (!count) return err(422, 'POLICY_BLOCKED', '至少要有一位可接預約的人員。');
  }
  const { data, error } = await db.from('bk_staff').update(row).eq('id', id).eq('business_id', c.business.id).select('*').single();
  if (error) return err(400, 'SERVER_ERROR', error.message);
  await saveHours(c.business.id, id, body.hours);
  // 停用人員:列出之後還有的預約,提醒店家移交(不自動取消)
  const { data: future } = row.active ? { data: [] } : await db.from('bk_bookings').select('id, start_at, end_at, contact, service_snapshot')
    .eq('staff_id', id).in('status', ['pending', 'confirmed']).gt('start_at', new Date().toISOString()).order('start_at');
  return NextResponse.json({ staff: data, future: future ?? [] });
}

// DELETE /api/mycard/booking/staff?id= — 刪除人員(有預約紀錄的只能停用,保留歷史)
export async function DELETE(request: Request) {
  const c = await ctx();
  if (!c) return err(401, 'AUTH_REQUIRED', '請先登入。');
  const id = new URL(request.url).searchParams.get('id') ?? '';
  const db = createAdminClient();
  const { count: others } = await db.from('bk_staff').select('id', { count: 'exact', head: true }).eq('business_id', c.business.id).eq('active', true).neq('id', id);
  if (!others) return err(422, 'POLICY_BLOCKED', '至少要有一位可接預約的人員。');
  const { count } = await db.from('bk_bookings').select('id', { count: 'exact', head: true }).eq('staff_id', id);
  if (count) return err(422, 'POLICY_BLOCKED', '這位人員有預約紀錄,不能刪除;請改為「停用」,歷史紀錄會保留。');
  const { error } = await db.from('bk_staff').delete().eq('id', id).eq('business_id', c.business.id);
  if (error) return err(400, 'SERVER_ERROR', error.message);
  return NextResponse.json({ ok: true });
}
