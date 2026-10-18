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
      addonIds: Array.isArray(body?.addon_ids) ? (body.addon_ids as unknown[]).map(String).slice(0, 20) : [],
      staffId: body?.staff_id ? String(body.staff_id) : null,
      extras: Array.isArray(body?.extra_ids) ? (body.extra_ids as unknown[]).map(String).slice(0, 3) : [],
      packageId: body?.package_id ? String(body.package_id) : null,
      addonPackages: Array.isArray(body?.addon_packages) ? (body.addon_packages as { addon_id?: unknown; package_id?: unknown }[]).slice(0, 20).map((x) => ({ addon_id: String(x?.addon_id ?? ''), package_id: String(x?.package_id ?? '') })) : [],
      branchId: body?.branch_id ? String(body.branch_id) : null,
      startAt: String(body?.start_at ?? ''),
      contact: { name, phone, note: String(body?.contact?.note ?? '') },
      idempotencyKey: request.headers.get('Idempotency-Key') ?? String(body?.idempotency_key ?? ''),
      channel: String(body?.channel ?? 'card'),
    });
    after(() => processBookingJobs().catch((e) => console.error('booking jobs', e)));
    return NextResponse.json({
      booking_id: booking.id, booking_no: booking.booking_no, status: booking.status, approval_status: booking.approval_status,
      start_at: booking.start_at, end_at: booking.end_at, expires_at: booking.expires_at, version: booking.version,
      deposit_amount: booking.deposit_amount, payment_status: booking.payment_status, total_price: booking.total_price,
      next_action: booking.status !== 'pending' ? 'none' : booking.approval_status === 'pending' ? 'wait_approval' : 'pay_deposit', server_time: new Date().toISOString(),
    }, { status: 201 });
  } catch (e) {
    if (e instanceof BookingError) return fail(e);
    console.error('create booking', e);
    return fail(new BookingError('SERVER_ERROR', '預約處理失敗,請稍後再試。', 500));
  }
}
