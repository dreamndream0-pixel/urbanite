import { after, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/supabase/server';
import { BookingError, ownerCommand, processBookingJobs } from '@/lib/booking/server';

export const dynamic = 'force-dynamic';

// POST /api/mycard/booking/bookings/[id] { command: approve|reject|cancel|complete|no_show, expected_version, reason }
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: { code: 'AUTH_REQUIRED', message: '請先登入。' } }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    const booking = await ownerCommand(user.id, id, body?.command, Number(body?.expected_version), String(body?.reason ?? ''));
    after(() => processBookingJobs().catch((e) => console.error('booking jobs', e)));
    return NextResponse.json(booking);
  } catch (e) {
    const err = e instanceof BookingError ? e : new BookingError('SERVER_ERROR', '操作失敗,請稍後再試。', 500);
    return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
}
