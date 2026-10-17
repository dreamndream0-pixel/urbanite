import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/supabase/server';
import { BookingError, ownerCreateBooking, ownerSlots } from '@/lib/booking/server';

export const dynamic = 'force-dynamic';

const fail = (e: unknown, fallback: string) => {
  const err = e instanceof BookingError ? e : new BookingError('SERVER_ERROR', fallback, 500);
  return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
};

// GET /api/mycard/booking/bookings?date=&service=&addons=&staff=&booking= — 店家加單 / 改期可選的時段
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return fail(new BookingError('AUTH_REQUIRED', '請先登入。', 401), '');
  const q = new URL(request.url).searchParams;
  const date = q.get('date') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(new BookingError('VALIDATION_ERROR', '請選擇日期。', 422), '');
  try {
    const day = await ownerSlots(user.id, {
      date, serviceId: q.get('service') ?? '', addonIds: (q.get('addons') ?? '').split(',').filter(Boolean),
      staffId: q.get('staff') || null, bookingId: q.get('booking') || undefined, extras: (q.get('extra') ?? '').split(',').filter(Boolean).slice(0, 2),
    });
    return NextResponse.json(day, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return fail(e, '讀取時段失敗。'); }
}

// POST /api/mycard/booking/bookings { service_id, addon_ids, staff_id, start_at, contact } — 店家人工加單(電話、現場客)
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return fail(new BookingError('AUTH_REQUIRED', '請先登入。', 401), '');
  const body = await request.json().catch(() => ({}));
  try {
    const booking = await ownerCreateBooking(user.id, {
      serviceId: String(body?.service_id ?? ''),
      addonIds: Array.isArray(body?.addon_ids) ? (body.addon_ids as unknown[]).map(String).slice(0, 20) : [],
      staffId: body?.staff_id ? String(body.staff_id) : null,
      extras: Array.isArray(body?.extra_ids) ? (body.extra_ids as unknown[]).map(String).slice(0, 3) : [],
      customerId: body?.customer_id ? String(body.customer_id) : null,
      startAt: String(body?.start_at ?? ''),
      contact: { name: String(body?.contact?.name ?? ''), phone: String(body?.contact?.phone ?? ''), note: String(body?.contact?.note ?? '') },
    });
    return NextResponse.json(booking, { status: 201 });
  } catch (e) { return fail(e, '新增預約失敗。'); }
}
