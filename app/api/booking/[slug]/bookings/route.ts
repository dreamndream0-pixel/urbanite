import { after, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/supabase/server';
import { BookingError, createBooking, processBookingJobs } from '@/lib/booking/server';
import { accountRateLimit } from '@/lib/account-rate-limit';

export const dynamic = 'force-dynamic';

const fail = (e: BookingError) => NextResponse.json({ error: { code: e.code, message: e.message, retryable: e.status >= 500 } }, { status: e.status });

// POST /api/booking/[slug]/bookings — 顧客送出預約(需登入)。Idempotency-Key 重送回傳同一筆
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const user = await getSessionUser();
  if (!user) return fail(new BookingError('AUTH_REQUIRED', '請先登入再送出預約。', 401));
  if (!accountRateLimit(user.id, 'booking-create', 10)) return fail(new BookingError('RATE_LIMITED', '操作太頻繁,請稍後再試。', 429));
  const { slug } = await params;
  const body = await request.json().catch(() => ({}));
  const name = String(body?.contact?.name ?? '').trim();
  const phone = String(body?.contact?.phone ?? '').trim();
  if (!name) return fail(new BookingError('VALIDATION_ERROR', '請填寫預約人姓名。', 422));
  if (!/^[0-9+\-\s()]{8,20}$/.test(phone)) return fail(new BookingError('VALIDATION_ERROR', '請填寫正確的聯絡電話。', 422));
  try {
    const booking = await createBooking({
      slug: decodeURIComponent(slug),
      userId: user.id,
      serviceId: String(body?.service_id ?? ''),
      startAt: String(body?.start_at ?? ''),
      contact: { name, phone, note: String(body?.contact?.note ?? '') },
      idempotencyKey: request.headers.get('Idempotency-Key') ?? String(body?.idempotency_key ?? ''),
      channel: String(body?.channel ?? 'card'),
    });
    after(() => processBookingJobs().catch((e) => console.error('booking jobs', e)));
    return NextResponse.json({
      booking_id: booking.id, booking_no: booking.booking_no, status: booking.status, approval_status: booking.approval_status,
      start_at: booking.start_at, end_at: booking.end_at, expires_at: booking.expires_at, version: booking.version,
      next_action: booking.status === 'pending' ? 'wait_approval' : 'none', server_time: new Date().toISOString(),
    }, { status: 201 });
  } catch (e) {
    if (e instanceof BookingError) return fail(e);
    console.error('create booking', e);
    return fail(new BookingError('SERVER_ERROR', '預約處理失敗,請稍後再試。', 500));
  }
}
