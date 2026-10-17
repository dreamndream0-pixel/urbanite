import { after, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/supabase/server';
import { BookingError, processBookingJobs } from '@/lib/booking/server';
import { joinWaitlist } from '@/lib/booking/engage';
import { accountRateLimit } from '@/lib/account-rate-limit';

export const dynamic = 'force-dynamic';

// POST /api/booking/[slug]/waitlist { service_id, staff_id, date, from_min, to_min, contact } — 加入候補
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: { code: 'AUTH_REQUIRED', message: '請先登入。' } }, { status: 401 });
  if (!accountRateLimit(user.id, 'booking-waitlist', 10)) return NextResponse.json({ error: { code: 'RATE_LIMITED', message: '操作太頻繁,請稍後再試。' } }, { status: 429 });
  const { slug } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    const w = await joinWaitlist({
      slug: decodeURIComponent(slug), userId: user.id, serviceId: String(body?.service_id ?? ''), staffId: body?.staff_id ? String(body.staff_id) : null,
      date: String(body?.date ?? ''), fromMin: Number(body?.from_min) || 0, toMin: Number(body?.to_min) || 1440,
      contact: { name: String(body?.contact?.name ?? ''), phone: String(body?.contact?.phone ?? '') },
    });
    after(() => processBookingJobs().catch((e) => console.error('booking jobs', e)));
    return NextResponse.json({ id: w.id, status: w.status }, { status: 201 });
  } catch (e) {
    const err = e instanceof BookingError ? e : new BookingError('SERVER_ERROR', '候補登記失敗。', 500);
    return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
}
