import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/supabase/server';
import { BookingError } from '@/lib/booking/server';
import { cancelWaitlist } from '@/lib/booking/engage';

export const dynamic = 'force-dynamic';

// DELETE /api/mycard/booking/waitlist/[id] — 店家移除候補
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: { code: 'AUTH_REQUIRED', message: '請先登入。' } }, { status: 401 });
  const { id } = await params;
  try { await cancelWaitlist({ type: 'owner', id: user.id }, id); return NextResponse.json({ ok: true }); }
  catch (e) {
    const err = e instanceof BookingError ? e : new BookingError('SERVER_ERROR', '移除失敗。', 500);
    return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
}
