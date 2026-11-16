import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/supabase/server';
import { shopAdminClient } from '@/lib/shop';
import { cleanPermissions, type PosStaff } from '@/lib/pos-auth';
import { hashPassword, passwordError, STAFF_CODE_PATTERN } from '@/lib/pos-staff-session';
import { ensureLocations } from '@/lib/stock-locations';

export const dynamic = 'force-dynamic';

type Db = Awaited<ReturnType<typeof shopAdminClient>>;

// 員工列表(不含密碼)+ 本月銷售:依訂單上記的員工統計
async function list(db: Db): Promise<PosStaff[]> {
  const tw = new Date(Date.now() + 8 * 3600 * 1000);
  const monthStart = new Date(`${tw.toISOString().slice(0, 7)}-01T00:00:00+08:00`).toISOString();
  const [{ data: staff }, { data: orders }] = await Promise.all([
    db.from('pos_staff').select('id,code,name,permissions,location_ids,active,last_login_at,created_at').order('created_at', { ascending: true }),
    db.from('orders').select('total,refund_amount,pos').eq('channel', 'pos').gte('created_at', monthStart).limit(5000),
  ]);
  const stats = new Map<string, { orders: number; net: number }>();
  for (const o of orders ?? []) {
    const id = (o.pos as { staff_id?: string } | null)?.staff_id;
    if (!id) continue;
    const s = stats.get(id) ?? { orders: 0, net: 0 };
    s.orders += 1; s.net += (Number(o.total) || 0) - (Number(o.refund_amount) || 0);
    stats.set(id, s);
  }
  return ((staff ?? []) as PosStaff[]).map((s) => ({ ...s, stats: stats.get(s.id) ?? { orders: 0, net: 0 } }));
}

// 只留下這家店存在的據點
async function cleanLocations(db: Db, raw: unknown) {
  if (!Array.isArray(raw) || !raw.length) return [];
  const ids = new Set((await ensureLocations(db)).map((l) => l.id));
  return [...new Set(raw.map(String))].filter((id) => ids.has(id));
}

const codeError = (code: string) => (STAFF_CODE_PATTERN.test(code) ? '' : '員工編號是 2~20 個英文字母或數字(例:A01、1001)');
const duplicate = (error: { code?: string; message: string }) => NextResponse.json({ error: error.code === '23505' ? '這個員工編號已經有人用了' : error.message }, { status: error.code === '23505' ? 409 : 500 });

// GET /api/admin/pos-staff — POS 員工列表(限管理員)
export async function GET() {
  if (!(await getAdminUser())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  return NextResponse.json(await list(await shopAdminClient()), { headers: { 'Cache-Control': 'private, no-store' } });
}

// POST /api/admin/pos-staff { code, name, password, permissions?, location_ids? } — 新增 POS 員工
export async function POST(request: Request) {
  if (!(await getAdminUser())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const code = String(body?.code ?? '').trim();
  const password = String(body?.password ?? '');
  const invalid = codeError(code) || passwordError(password);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  const db = await shopAdminClient();
  const { error } = await db.from('pos_staff').insert({
    code, name: String(body?.name ?? '').trim().slice(0, 30), pin_hash: hashPassword(password),
    permissions: cleanPermissions(body?.permissions), location_ids: await cleanLocations(db, body?.location_ids),
  });
  if (error) return duplicate(error);
  return NextResponse.json(await list(db), { status: 201 });
}

// PATCH /api/admin/pos-staff { id, code?, name?, password?, permissions?, location_ids?, active? } — 修改 / 重設密碼 / 停用
export async function PATCH(request: Request) {
  if (!(await getAdminUser())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const id = String(body?.id ?? '');
  const db = await shopAdminClient();
  const patch: Record<string, unknown> = {};
  if ('code' in (body ?? {})) {
    const code = String(body.code ?? '').trim();
    if (codeError(code)) return NextResponse.json({ error: codeError(code) }, { status: 400 });
    patch.code = code;
  }
  if ('password' in (body ?? {})) {
    const password = String(body.password ?? '');
    if (passwordError(password)) return NextResponse.json({ error: passwordError(password) }, { status: 400 });
    // 重設密碼同時解除鎖定
    Object.assign(patch, { pin_hash: hashPassword(password), failed_attempts: 0, locked_until: null });
  }
  if ('name' in (body ?? {})) patch.name = String(body.name ?? '').trim().slice(0, 30);
  if ('permissions' in (body ?? {})) patch.permissions = cleanPermissions(body.permissions);
  if ('location_ids' in (body ?? {})) patch.location_ids = await cleanLocations(db, body.location_ids);
  if ('active' in (body ?? {})) patch.active = body.active !== false;
  if (!id || !Object.keys(patch).length) return NextResponse.json({ error: '沒有要修改的內容' }, { status: 400 });
  const { data, error } = await db.from('pos_staff').update(patch).eq('id', id).select('id');
  if (error) return duplicate(error);
  if (!data?.length) return NextResponse.json({ error: '找不到這位員工' }, { status: 404 });
  return NextResponse.json(await list(db));
}

// DELETE /api/admin/pos-staff?id= — 移除 POS 員工(馬上不能再進 POS;已經賣出的訂單仍保留銷售人員)
export async function DELETE(request: Request) {
  if (!(await getAdminUser())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const id = new URL(request.url).searchParams.get('id') ?? '';
  const db = await shopAdminClient();
  const { error } = await db.from('pos_staff').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(await list(db));
}
