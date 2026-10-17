import { after, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/supabase/server';
import { BookingError, processBookingJobs } from '@/lib/booking/server';
import { closeQuote, sendQuote } from '@/lib/booking/quotes';

export const dynamic = 'force-dynamic';

// POST /api/mycard/booking/quotes/[id]
// { action: 'send', expected_version, items, deposit, staff_id, start_at, minutes, travel_minutes, valid_days, hold_hours, note }
// { action: 'cancel' }
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: { code: 'AUTH_REQUIRED', message: '請先登入。' } }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    let quote;
    if (body?.action === 'send') {
      quote = await sendQuote(user.id, id, Number(body?.expected_version), {
        items: Array.isArray(body?.items) ? body.items : [], deposit: Number(body?.deposit) || 0, staffId: String(body?.staff_id ?? ''),
        startAt: String(body?.start_at ?? ''), minutes: Number(body?.minutes) || 0, travelMinutes: Number(body?.travel_minutes) || 0,
        validDays: Number(body?.valid_days) || 7, holdHours: Number(body?.hold_hours) || 0, note: String(body?.note ?? ''),
      });
    } else if (body?.action === 'cancel') {
      quote = await closeQuote({ type: 'owner', id: user.id }, id);
    } else {
      throw new BookingError('VALIDATION_ERROR', '不支援的操作。', 422);
    }
    after(() => processBookingJobs().catch((e) => console.error('booking jobs', e)));
    return NextResponse.json(quote);
  } catch (e) {
    const err = e instanceof BookingError ? e : new BookingError('SERVER_ERROR', '操作失敗,請稍後再試。', 500);
    return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
}
