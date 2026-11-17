import { NextResponse } from 'next/server';
import { getCurrentShop, scopedClient } from '@/lib/shop';
import { featureDenied } from '@/lib/pos-auth';
import { createStaffToken, LOCK_MINUTES, MAX_FAILED, POS_STAFF_COOKIE, POS_STAFF_MAX_AGE, verifyPassword } from '@/lib/pos-staff-session';

export const dynamic = 'force-dynamic';

const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/' };

// POST /api/pos/login { code, password } — POS 員工登入(員工編號 + 密碼)
// 連續輸錯 MAX_FAILED 次鎖定 LOCK_MINUTES 分鐘;編號不存在與密碼錯誤回同一個訊息
export async function POST(request: Request) {
  const shop = await getCurrentShop();
  if (!shop || shop.status === 'suspended') return NextResponse.json({ error: '找不到這家店' }, { status: 404 });
  const denied = await featureDenied('staff');
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  const code = String(body?.code ?? '').trim();
  const password = String(body?.password ?? '');
  if (!code || !password) return NextResponse.json({ error: '請輸入員工編號與密碼' }, { status: 400 });

  const db = scopedClient(shop.id);
  const { data: staff } = await db.from('pos_staff').select('id,code,name,pin_hash,active,failed_attempts,locked_until').ilike('code', code.replace(/[%_\\]/g, '\\$&')).maybeSingle();
  const wrong = NextResponse.json({ error: '員工編號或密碼不正確' }, { status: 401 });
  if (!staff || !staff.active || !staff.pin_hash) return wrong;
  if (staff.locked_until && new Date(staff.locked_until).getTime() > Date.now()) {
    const minutes = Math.max(1, Math.ceil((new Date(staff.locked_until).getTime() - Date.now()) / 60000));
    return NextResponse.json({ error: `密碼輸錯太多次,請 ${minutes} 分鐘後再試,或請店長重設密碼` }, { status: 429 });
  }
  if (!verifyPassword(password, staff.pin_hash)) {
    const failed = (staff.failed_attempts ?? 0) + 1;
    const lock = failed >= MAX_FAILED;
    await db.from('pos_staff').update({ failed_attempts: lock ? 0 : failed, locked_until: lock ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : null }).eq('id', staff.id);
    return lock ? NextResponse.json({ error: `密碼輸錯 ${MAX_FAILED} 次,已鎖定 ${LOCK_MINUTES} 分鐘` }, { status: 429 }) : wrong;
  }

  await db.from('pos_staff').update({ failed_attempts: 0, locked_until: null, last_login_at: new Date().toISOString() }).eq('id', staff.id);
  const response = NextResponse.json({ ok: true, name: staff.name || staff.code }, { headers: { 'Cache-Control': 'private, no-store' } });
  response.cookies.set(POS_STAFF_COOKIE, createStaffToken(staff.id, shop.id), { ...cookieOptions, maxAge: POS_STAFF_MAX_AGE });
  return response;
}

// DELETE /api/pos/login — POS 員工登出
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(POS_STAFF_COOKIE, '', { ...cookieOptions, maxAge: 0 });
  return response;
}
