import { after, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/supabase/server';
import { BookingError, customerReportPayment, processBookingJobs } from '@/lib/booking/server';

export const dynamic = 'force-dynamic';

// POST /api/booking/my/[id]/payment { expected_version, kind, last5, paid_at, payer, note } — 顧客回報已轉帳(訂金或全額)(店家核對後才算收款)
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: { code: 'AUTH_REQUIRED', message: '請先登入。' } }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    const b = await customerReportPayment(user.id, id, Number(body?.expected_version), {
      kind: body?.kind === 'full' ? 'full' : 'deposit', last5: String(body?.last5 ?? '').trim(), paidAt: String(body?.paid_at ?? ''), payer: String(body?.payer ?? ''), note: String(body?.note ?? ''),
    });
    after(() => processBookingJobs().catch((e) => console.error('booking jobs', e)));
    return NextResponse.json({ payment_status: b.payment_status, version: b.version });
  } catch (e) {
    const err = e instanceof BookingError ? e : new BookingError('SERVER_ERROR', '回報失敗,請稍後再試。', 500);
    return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
}
