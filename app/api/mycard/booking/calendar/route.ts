import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { BookingError, ownerBusiness } from '@/lib/booking/server';
import { addCalendar, removeCalendar, rotateToken, syncCalendar } from '@/lib/booking/calendar';

export const dynamic = 'force-dynamic';

const fail = (e: unknown) => {
  const err = e instanceof BookingError ? e : new BookingError('SERVER_ERROR', '操作失敗,請稍後再試。', 500);
  return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
};

// GET — 訂閱網址的 token 與已連結的外部行事曆(不回傳外部網址全文)
export async function GET() {
  const user = await getSessionUser();
  if (!user) return fail(new BookingError('AUTH_REQUIRED', '請先登入。', 401));
  const business = await ownerBusiness(user.id);
  if (!business) return fail(new BookingError('NOT_FOUND', '請先完成預約設定。', 404));
  const db = createAdminClient();
  const [{ data: biz }, { data: staff }, { data: cals }] = await Promise.all([
    db.from('bk_businesses').select('calendar_token').eq('id', business.id).single(),
    db.from('bk_staff').select('id, name, calendar_token, active').eq('business_id', business.id).order('sort_order'),
    db.from('bk_external_calendars').select('id, staff_id, label, url, last_synced_at, last_error, event_count, active').eq('business_id', business.id).order('created_at'),
  ]);
  return NextResponse.json({
    business_token: biz?.calendar_token ?? null,
    staff: staff ?? [],
    calendars: (cals ?? []).map((c) => ({ ...c, url: new URL(c.url).hostname })),
  }, { headers: { 'Cache-Control': 'no-store' } });
}

// POST { action: 'rotate', staff_id? } | { action: 'add', url, staff_id?, label } | { action: 'remove', id } | { action: 'sync', id }
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return fail(new BookingError('AUTH_REQUIRED', '請先登入。', 401));
  const body = await request.json().catch(() => ({}));
  try {
    if (body?.action === 'rotate') return NextResponse.json({ token: await rotateToken(user.id, body?.staff_id ? String(body.staff_id) : null) });
    if (body?.action === 'add') return NextResponse.json(await addCalendar(user.id, { url: String(body?.url ?? ''), staffId: body?.staff_id ? String(body.staff_id) : null, label: String(body?.label ?? '') }), { status: 201 });
    if (body?.action === 'remove') { await removeCalendar(user.id, String(body?.id ?? '')); return NextResponse.json({ ok: true }); }
    if (body?.action === 'sync') {
      const business = await ownerBusiness(user.id);
      const { data: cal } = await createAdminClient().from('bk_external_calendars').select('id, business_id, staff_id, url').eq('id', String(body?.id ?? '')).eq('business_id', business?.id ?? '').maybeSingle();
      if (!cal) throw new BookingError('NOT_FOUND', '找不到這個行事曆。', 404);
      return NextResponse.json({ events: await syncCalendar(cal) });
    }
    throw new BookingError('VALIDATION_ERROR', '不支援的操作。', 422);
  } catch (e) { return fail(e); }
}
