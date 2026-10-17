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

// POST /api/mycard/booking/branches { name, address } — 新增分店
export async function POST(request: Request) {
  const c = await ctx();
  if (!c) return err(401, 'AUTH_REQUIRED', '請先登入。');
  const body = await request.json().catch(() => ({}));
  const name = String(body?.name ?? '').trim().slice(0, 30);
  if (!name) return err(422, 'VALIDATION_ERROR', '請填寫分店名稱。');
  const db = createAdminClient();
  const { count } = await db.from('bk_branches').select('id', { count: 'exact', head: true }).eq('business_id', c.business.id);
  if ((count ?? 0) >= 20) return err(422, 'POLICY_BLOCKED', '分店最多 20 間。');
  const { data, error } = await db.from('bk_branches').insert({ business_id: c.business.id, name, address: String(body?.address ?? '').trim().slice(0, 120), sort_order: count ?? 0 }).select('*').single();
  if (error) return err(400, 'SERVER_ERROR', error.message);
  return NextResponse.json(data, { status: 201 });
}

// PATCH /api/mycard/booking/branches { id, name, address, active }
export async function PATCH(request: Request) {
  const c = await ctx();
  if (!c) return err(401, 'AUTH_REQUIRED', '請先登入。');
  const body = await request.json().catch(() => ({}));
  const name = String(body?.name ?? '').trim().slice(0, 30);
  if (!name) return err(422, 'VALIDATION_ERROR', '請填寫分店名稱。');
  const { data, error } = await createAdminClient().from('bk_branches')
    .update({ name, address: String(body?.address ?? '').trim().slice(0, 120), active: body?.active === undefined ? true : Boolean(body.active) })
    .eq('id', String(body?.id ?? '')).eq('business_id', c.business.id).select('*').single();
  if (error) return err(400, 'SERVER_ERROR', error.message);
  return NextResponse.json(data);
}

// DELETE /api/mycard/booking/branches?id= — 刪除分店(之後還有預約時不能刪,請改為停用)
export async function DELETE(request: Request) {
  const c = await ctx();
  if (!c) return err(401, 'AUTH_REQUIRED', '請先登入。');
  const id = new URL(request.url).searchParams.get('id') ?? '';
  const db = createAdminClient();
  const { count } = await db.from('bk_bookings').select('id', { count: 'exact', head: true }).eq('branch_id', id).in('status', ['pending', 'confirmed', 'checked_in']).gt('start_at', new Date().toISOString());
  if (count) return err(422, 'POLICY_BLOCKED', `這間分店之後還有 ${count} 筆預約,請先處理或改為停用。`);
  const { error } = await db.from('bk_branches').delete().eq('id', id).eq('business_id', c.business.id);
  if (error) return err(400, 'SERVER_ERROR', error.message);
  return NextResponse.json({ ok: true });
}
