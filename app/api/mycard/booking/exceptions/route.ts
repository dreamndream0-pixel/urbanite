import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ownerBusiness } from '@/lib/booking/server';

export const dynamic = 'force-dynamic';

const err = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

// POST /api/mycard/booking/exceptions { start_at, end_at, reason, staff_id } — 新增休假 / 不開放時段(staff_id 空白 = 全店)
// 回傳與這段時間重疊的有效預約,提醒店家處理(不會自動取消)
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return err(401, 'AUTH_REQUIRED', '請先登入。');
  const business = await ownerBusiness(user.id, true);
  if (!business) return err(500, 'SERVER_ERROR', '無法建立預約設定。');
  const body = await request.json().catch(() => ({}));
  const start = new Date(String(body?.start_at ?? ''));
  const end = new Date(String(body?.end_at ?? ''));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return err(422, 'VALIDATION_ERROR', '請選擇正確的開始與結束時間。');
  if (end.getTime() - start.getTime() > 120 * 86400000) return err(422, 'VALIDATION_ERROR', '一次最多設定 120 天。');
  const db = createAdminClient();
  let staffId: string | null = body?.staff_id ? String(body.staff_id) : null;
  if (staffId) {
    const { data: st } = await db.from('bk_staff').select('id').eq('id', staffId).eq('business_id', business.id).maybeSingle();
    if (!st) staffId = null;
  }
  const { data, error } = await db.from('bk_exceptions')
    .insert({ business_id: business.id, start_at: start.toISOString(), end_at: end.toISOString(), reason: String(body?.reason ?? '').trim().slice(0, 60), staff_id: staffId })
    .select('id, start_at, end_at, reason, staff_id').single();
  if (error) return err(400, 'SERVER_ERROR', error.message);
  let q = db.from('bk_bookings').select('id, booking_no, start_at, end_at, status, contact, service_snapshot')
    .eq('business_id', business.id).in('status', ['pending', 'confirmed']).lt('start_at', end.toISOString()).gt('occupy_end_at', start.toISOString());
  if (staffId) q = q.eq('staff_id', staffId);
  const { data: affected } = await q;
  return NextResponse.json({ exception: data, affected: affected ?? [] }, { status: 201 });
}

// DELETE /api/mycard/booking/exceptions?id=
export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) return err(401, 'AUTH_REQUIRED', '請先登入。');
  const business = await ownerBusiness(user.id);
  if (!business) return err(404, 'NOT_FOUND', '找不到資料。');
  const id = new URL(request.url).searchParams.get('id') ?? '';
  const { error } = await createAdminClient().from('bk_exceptions').delete().eq('id', id).eq('business_id', business.id);
  if (error) return err(400, 'SERVER_ERROR', error.message);
  return NextResponse.json({ ok: true });
}
