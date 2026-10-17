import { after, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/supabase/server';
import { BookingError, processBookingJobs } from '@/lib/booking/server';
import { decideRecord } from '@/lib/booking/customers';

export const dynamic = 'force-dynamic';

const ACTIONS = ['grant', 'decline', 'revoke', 'request_delete'] as const;

// POST /api/booking/my/records/[id] { action: grant | decline | revoke | request_delete } — 顧客決定服務照片是否公開、要求刪除
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: { code: 'AUTH_REQUIRED', message: '請先登入。' } }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    const action = ACTIONS.find((a) => a === body?.action);
    if (!action) throw new BookingError('VALIDATION_ERROR', '不支援的操作。', 422);
    await decideRecord(user.id, id, action);
    if (action === 'request_delete') after(() => processBookingJobs().catch((e) => console.error('booking jobs', e)));
    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = e instanceof BookingError ? e : new BookingError('SERVER_ERROR', '操作失敗,請稍後再試。', 500);
    return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
}
