import { after, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/supabase/server';
import { BookingError, customerReschedule, customerRescheduleSlots, processBookingJobs } from '@/lib/booking/server';
import { localParts } from '@/lib/booking/shared';

export const dynamic = 'force-dynamic';

const fail = (e: unknown, fallback: string) => {
  const err = e instanceof BookingError ? e : new BookingError('SERVER_ERROR', fallback, 500);
  return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
};

// GET /api/booking/my/[id]/reschedule?from=&days= — 這筆預約可改到的時段(自己目前的時段不算占用)
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return fail(new BookingError('AUTH_REQUIRED', '請先登入。', 401), '');
  const { id } = await params;
  const url = new URL(request.url);
  const today = localParts(new Date()).date;
  const from = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('from') ?? '') ? url.searchParams.get('from')! : today;
  try {
    const days = await customerRescheduleSlots(user.id, id, from < today ? today : from, Math.min(14, Math.max(1, Number(url.searchParams.get('days')) || 14)));
    return NextResponse.json({ days }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return fail(e, '讀取時段失敗,請稍後再試。'); }
}

// POST /api/booking/my/[id]/reschedule { expected_version, start_at } — 顧客改期(搶不到新時段時原預約不變)
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return fail(new BookingError('AUTH_REQUIRED', '請先登入。', 401), '');
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    const b = await customerReschedule(user.id, id, Number(body?.expected_version), String(body?.start_at ?? ''));
    after(() => processBookingJobs().catch((e) => console.error('booking jobs', e)));
    return NextResponse.json({ start_at: b.start_at, end_at: b.end_at, version: b.version });
  } catch (e) { return fail(e, '改期失敗,請稍後再試。'); }
}
