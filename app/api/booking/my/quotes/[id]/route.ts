import { after, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/supabase/server';
import { BookingError, processBookingJobs } from '@/lib/booking/server';
import { acceptQuote, closeQuote } from '@/lib/booking/quotes';

export const dynamic = 'force-dynamic';

// POST /api/booking/my/quotes/[id] { action: accept | decline, version } — 顧客接受或婉拒報價
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: { code: 'AUTH_REQUIRED', message: '請先登入。' } }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    if (body?.action === 'accept') {
      const b = await acceptQuote(user.id, id, Number(body?.version));
      after(() => processBookingJobs().catch((e) => console.error('booking jobs', e)));
      return NextResponse.json({ booking_id: b.id, status: b.status, payment_status: b.payment_status, expires_at: b.expires_at });
    }
    if (body?.action === 'decline') {
      const q = await closeQuote({ type: 'customer', id: user.id }, id);
      after(() => processBookingJobs().catch((e) => console.error('booking jobs', e)));
      return NextResponse.json({ status: q.status });
    }
    throw new BookingError('VALIDATION_ERROR', '不支援的操作。', 422);
  } catch (e) {
    const err = e instanceof BookingError ? e : new BookingError('SERVER_ERROR', '操作失敗,請稍後再試。', 500);
    return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
}
