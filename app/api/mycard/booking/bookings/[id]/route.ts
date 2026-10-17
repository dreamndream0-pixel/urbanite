import { after, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/supabase/server';
import { BookingError, ownerCancelItem, ownerCommand, ownerPayment, ownerReschedule, processBookingJobs } from '@/lib/booking/server';
import { redeemPoints, settleBookingPoints } from '@/lib/booking/loyalty';

export const dynamic = 'force-dynamic';

// POST /api/mycard/booking/bookings/[id]
// { command: approve|reject|cancel|check_in|complete|no_show, expected_version, reason, balance?: { amount, method } }
// { command: 'payment', expected_version, kind: deposit|balance|refund, amount, method, note }
// { command: 'reschedule', expected_version, start_at, staff_id }
// { command: 'cancel_item', expected_version, seq, reason } — 多項服務只取消其中一項
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: { code: 'AUTH_REQUIRED', message: '請先登入。' } }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const version = Number(body?.expected_version);
  try {
    let booking;
    if (body?.command === 'payment') {
      booking = await ownerPayment(user.id, id, version, {
        kind: String(body?.kind ?? ''), amount: Math.round(Number(body?.amount) || 0), method: String(body?.method ?? 'transfer'), note: String(body?.note ?? ''),
      });
    } else if (body?.command === 'redeem_points') {
      booking = await redeemPoints(user.id, id, version, Number(body?.points) || 0);
    } else if (body?.command === 'cancel_item') {
      booking = await ownerCancelItem(user.id, id, version, Number(body?.seq), String(body?.reason ?? ''));
    } else if (body?.command === 'reschedule') {
      booking = await ownerReschedule(user.id, id, version, String(body?.start_at ?? ''), body?.staff_id ? String(body.staff_id) : null);
    } else {
      const balance = body?.balance && Number(body.balance.amount) > 0 ? { amount: Math.round(Number(body.balance.amount)), method: String(body.balance.method ?? 'cash') } : undefined;
      booking = await ownerCommand(user.id, id, body?.command, version, String(body?.reason ?? ''), balance);
    }
    if (['complete', 'payment'].includes(body?.command)) await settleBookingPoints(id).catch((e) => console.error('reward', e));
    after(() => processBookingJobs().catch((e) => console.error('booking jobs', e)));
    return NextResponse.json(booking);
  } catch (e) {
    const err = e instanceof BookingError ? e : new BookingError('SERVER_ERROR', '操作失敗,請稍後再試。', 500);
    return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
}
