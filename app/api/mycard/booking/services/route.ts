import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ownerBusiness } from '@/lib/booking/server';

export const dynamic = 'force-dynamic';

const err = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });
const int = (v: unknown, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number(v) || 0)));

function clean(b: Record<string, unknown>) {
  const duration = Math.round(Number(b.duration_minutes));
  return {
    name: String(b.name ?? '').trim().slice(0, 60),
    description: String(b.description ?? '').trim().slice(0, 500),
    duration_minutes: Number.isFinite(duration) ? Math.min(720, Math.max(5, duration)) : 60,
    price: Math.max(0, Math.round(Number(b.price) || 0)),
    price_note: String(b.price_note ?? '').trim().slice(0, 20),
    image: /^https:\/\//.test(String(b.image ?? '')) ? String(b.image) : '',
    active: b.active === undefined ? true : Boolean(b.active),
    needs_resource: Boolean(b.needs_resource),
    deposit: int(b.deposit, 0, 100000),
  };
}

async function ctx() {
  const user = await getSessionUser();
  if (!user) return null;
  const business = await ownerBusiness(user.id, true);
  return business ? { user, business } : null;
}

// 加購與可做的人員:整份取代(既有預約保存當時的加購快照,不受影響)
async function syncChildren(businessId: string, serviceId: string, body: Record<string, unknown>) {
  const db = createAdminClient();
  if (Array.isArray(body.addons)) {
    const list = (body.addons as Record<string, unknown>[]).slice(0, 20)
      .map((a, i) => ({ id: typeof a.id === 'string' ? a.id : '', name: String(a.name ?? '').trim().slice(0, 40), price: int(a.price, 0, 100000), extra_minutes: int(a.extra_minutes, 0, 240), active: a.active === undefined ? true : Boolean(a.active), sort_order: i }))
      .filter((a) => a.name);
    const keep = list.filter((a) => a.id).map((a) => a.id);
    const del = db.from('bk_addons').delete().eq('service_id', serviceId).eq('business_id', businessId);
    await (keep.length ? del.not('id', 'in', `(${keep.join(',')})`) : del);
    for (const a of list) {
      const row = { name: a.name, price: a.price, extra_minutes: a.extra_minutes, active: a.active, sort_order: a.sort_order };
      if (a.id) await db.from('bk_addons').update(row).eq('id', a.id).eq('business_id', businessId);
      else await db.from('bk_addons').insert({ ...row, business_id: businessId, service_id: serviceId });
    }
  }
  if (Array.isArray(body.staff)) {
    const { data: staff } = await db.from('bk_staff').select('id').eq('business_id', businessId);
    const valid = new Set((staff ?? []).map((s) => s.id));
    const rows = (body.staff as Record<string, unknown>[])
      .filter((x) => valid.has(String(x.staff_id)))
      .map((x) => ({
        staff_id: String(x.staff_id), service_id: serviceId, business_id: businessId,
        duration_minutes: x.duration_minutes ? int(x.duration_minutes, 5, 720) : null,
        price: x.price === null || x.price === undefined || x.price === '' ? null : int(x.price, 0, 1000000),
      }));
    await db.from('bk_staff_services').delete().eq('service_id', serviceId).eq('business_id', businessId);
    if (rows.length) await db.from('bk_staff_services').insert(rows);
  }
}

// POST /api/mycard/booking/services — 新增服務
export async function POST(request: Request) {
  const c = await ctx();
  if (!c) return err(401, 'AUTH_REQUIRED', '請先登入。');
  const body = await request.json().catch(() => ({}));
  const row = clean(body);
  if (!row.name) return err(422, 'VALIDATION_ERROR', '請填寫服務名稱。');
  const db = createAdminClient();
  const { count } = await db.from('bk_services').select('id', { count: 'exact', head: true }).eq('business_id', c.business.id);
  if ((count ?? 0) >= 50) return err(422, 'POLICY_BLOCKED', '服務最多 50 項。');
  const { data, error } = await db.from('bk_services').insert({ ...row, business_id: c.business.id, sort_order: count ?? 0 }).select('*').single();
  if (error) return err(400, 'SERVER_ERROR', error.message);
  await syncChildren(c.business.id, data.id, body);
  return NextResponse.json(data, { status: 201 });
}

// PATCH /api/mycard/booking/services { id, ... } — 修改服務(既有預約保存當時快照,不受影響);{ order: [id...] } 調整排序
export async function PATCH(request: Request) {
  const c = await ctx();
  if (!c) return err(401, 'AUTH_REQUIRED', '請先登入。');
  const body = await request.json().catch(() => ({}));
  const db = createAdminClient();
  if (Array.isArray(body?.order)) {
    await Promise.all((body.order as string[]).slice(0, 50).map((id, i) => db.from('bk_services').update({ sort_order: i }).eq('id', id).eq('business_id', c.business.id)));
    return NextResponse.json({ ok: true });
  }
  const id = String(body?.id ?? '');
  const row = clean(body);
  if (!row.name) return err(422, 'VALIDATION_ERROR', '請填寫服務名稱。');
  const { data: cur } = await db.from('bk_services').select('version').eq('id', id).eq('business_id', c.business.id).maybeSingle();
  if (!cur) return err(404, 'NOT_FOUND', '找不到這個服務。');
  const { data, error } = await db.from('bk_services').update({ ...row, version: cur.version + 1, updated_at: new Date().toISOString() }).eq('id', id).eq('business_id', c.business.id).select('*').single();
  if (error) return err(400, 'SERVER_ERROR', error.message);
  await syncChildren(c.business.id, id, body);
  return NextResponse.json(data);
}

// DELETE /api/mycard/booking/services?id= — 刪除服務(既有預約保留快照)
export async function DELETE(request: Request) {
  const c = await ctx();
  if (!c) return err(401, 'AUTH_REQUIRED', '請先登入。');
  const id = new URL(request.url).searchParams.get('id') ?? '';
  const { error } = await createAdminClient().from('bk_services').delete().eq('id', id).eq('business_id', c.business.id);
  if (error) return err(400, 'SERVER_ERROR', error.message);
  return NextResponse.json({ ok: true });
}
