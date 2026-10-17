import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ownerBusiness } from '@/lib/booking/server';

export const dynamic = 'force-dynamic';

const err = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

async function ctx() {
  const user = await getSessionUser();
  if (!user) return null;
  const business = await ownerBusiness(user.id, true);
  return business ? { user, business } : null;
}

// POST /api/mycard/booking/resources { name } — 新增床位 / 座位 / 設備
export async function POST(request: Request) {
  const c = await ctx();
  if (!c) return err(401, 'AUTH_REQUIRED', '請先登入。');
  const body = await request.json().catch(() => ({}));
  const name = String(body?.name ?? '').trim().slice(0, 30);
  if (!name) return err(422, 'VALIDATION_ERROR', '請填寫名稱。');
  const db = createAdminClient();
  const { count } = await db.from('bk_resources').select('id', { count: 'exact', head: true }).eq('business_id', c.business.id);
  if ((count ?? 0) >= 30) return err(422, 'POLICY_BLOCKED', '最多 30 個。');
  const branchId = typeof body?.branch_id === 'string' && /^[0-9a-f-]{36}$/.test(body.branch_id) ? body.branch_id : null;
  const { data, error } = await db.from('bk_resources').insert({ business_id: c.business.id, name, sort_order: count ?? 0, branch_id: branchId }).select('*').single();
  if (error) return err(400, 'SERVER_ERROR', error.message);
  return NextResponse.json(data, { status: 201 });
}

// PATCH /api/mycard/booking/resources { id, name, active }
export async function PATCH(request: Request) {
  const c = await ctx();
  if (!c) return err(401, 'AUTH_REQUIRED', '請先登入。');
  const body = await request.json().catch(() => ({}));
  const name = String(body?.name ?? '').trim().slice(0, 30);
  if (!name) return err(422, 'VALIDATION_ERROR', '請填寫名稱。');
  const { data, error } = await createAdminClient().from('bk_resources')
    .update({ name, active: body?.active === undefined ? true : Boolean(body.active) })
    .eq('id', String(body?.id ?? '')).eq('business_id', c.business.id).select('*').single();
  if (error) return err(400, 'SERVER_ERROR', error.message);
  return NextResponse.json(data);
}

// DELETE /api/mycard/booking/resources?id= — 刪除(既有預約的床位欄位清空,時段仍由人員保留)
export async function DELETE(request: Request) {
  const c = await ctx();
  if (!c) return err(401, 'AUTH_REQUIRED', '請先登入。');
  const id = new URL(request.url).searchParams.get('id') ?? '';
  const db = createAdminClient();
  const { count } = await db.from('bk_bookings').select('id', { count: 'exact', head: true }).eq('resource_id', id).in('status', ['pending', 'confirmed', 'checked_in']).gt('start_at', new Date().toISOString());
  if (count) return err(422, 'POLICY_BLOCKED', `這個床位之後還有 ${count} 筆預約,請先改期或改為停用。`);
  const { error } = await db.from('bk_resources').delete().eq('id', id).eq('business_id', c.business.id);
  if (error) return err(400, 'SERVER_ERROR', error.message);
  return NextResponse.json({ ok: true });
}
