import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/supabase/server';
import { shopAdminClient } from '@/lib/shop';
import { cleanPermissions } from '@/lib/pos-auth';
import { ensureLocations } from '@/lib/stock-locations';

export const dynamic = 'force-dynamic';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const list = async (db: Awaited<ReturnType<typeof shopAdminClient>>) =>
  (await db.from('pos_staff').select('id,email,name,permissions,location_ids,active,created_at').order('created_at', { ascending: true })).data ?? [];

// 只留下這家店存在的據點
async function cleanLocations(db: Awaited<ReturnType<typeof shopAdminClient>>, raw: unknown) {
  if (!Array.isArray(raw) || !raw.length) return [];
  const ids = new Set((await ensureLocations(db)).map((l) => l.id));
  return [...new Set(raw.map(String))].filter((id) => ids.has(id));
}

// GET /api/admin/pos-staff — POS 員工列表(限管理員)
export async function GET() {
  if (!(await getAdminUser())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  return NextResponse.json(await list(await shopAdminClient()), { headers: { 'Cache-Control': 'private, no-store' } });
}

// POST /api/admin/pos-staff { email, name, permissions?, location_ids? } — 新增 POS 員工
export async function POST(request: Request) {
  if (!(await getAdminUser())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const email = String(body?.email ?? '').trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 200) return NextResponse.json({ error: '請輸入正確的 Email' }, { status: 400 });
  const db = await shopAdminClient();
  const { error } = await db.from('pos_staff').insert({
    email, name: String(body?.name ?? '').trim().slice(0, 30),
    permissions: cleanPermissions(body?.permissions), location_ids: await cleanLocations(db, body?.location_ids),
  });
  if (error) return NextResponse.json({ error: error.code === '23505' ? '這個 Email 已經是 POS 員工' : error.message }, { status: error.code === '23505' ? 409 : 500 });
  return NextResponse.json(await list(db), { status: 201 });
}

// PATCH /api/admin/pos-staff { id, name?, permissions?, location_ids?, active? } — 修改權限 / 據點 / 停用
export async function PATCH(request: Request) {
  if (!(await getAdminUser())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const id = String(body?.id ?? '');
  const db = await shopAdminClient();
  const patch: Record<string, unknown> = {};
  if ('name' in (body ?? {})) patch.name = String(body.name ?? '').trim().slice(0, 30);
  if ('permissions' in (body ?? {})) patch.permissions = cleanPermissions(body.permissions);
  if ('location_ids' in (body ?? {})) patch.location_ids = await cleanLocations(db, body.location_ids);
  if ('active' in (body ?? {})) patch.active = body.active !== false;
  if (!id || !Object.keys(patch).length) return NextResponse.json({ error: '沒有要修改的內容' }, { status: 400 });
  const { data, error } = await db.from('pos_staff').update(patch).eq('id', id).select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: '找不到這位員工' }, { status: 404 });
  return NextResponse.json(await list(db));
}

// DELETE /api/admin/pos-staff?id= — 移除 POS 員工(馬上不能再進 POS)
export async function DELETE(request: Request) {
  if (!(await getAdminUser())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const id = new URL(request.url).searchParams.get('id') ?? '';
  const db = await shopAdminClient();
  const { error } = await db.from('pos_staff').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(await list(db));
}
