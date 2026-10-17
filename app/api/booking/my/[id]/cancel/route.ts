import { after, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/supabase/server';
import { BookingError, customerCancel, processBookingJobs } from '@/lib/booking/server';

export const dynamic = 'force-dynamic';

// POST /api/booking/my/[id]/cancel { expected_version, reason } — 顧客取消自己的預約
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: { code: 'AUTH_REQUIRED', message: '請先登入。' } }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    const booking = await customerCancel(user.id, id, Number(body?.expected_version), String(body?.reason ?? ''));
    after(() => processBookingJobs().catch((e) => console.error('booking jobs', e)));
    return NextResponse.json({ status: booking.status, version: booking.version });
  } catch (e) {
    const err = e instanceof BookingError ? e : new BookingError('SERVER_ERROR', '取消失敗,請稍後再試。', 500);
    return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
}
