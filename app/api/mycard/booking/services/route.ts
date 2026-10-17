import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ownerBusiness } from '@/lib/booking/server';

export const dynamic = 'force-dynamic';

const err = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

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
  };
}

async function ctx() {
  const user = await getSessionUser();
  if (!user) return null;
  const business = await ownerBusiness(user.id, true);
  return business ? { user, business } : null;
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
