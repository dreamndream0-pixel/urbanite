import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isVideoStudioRequest } from '@/lib/video-points';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/video-points/service — 僅供影片網站(伺服器對伺服器)查詢餘額、扣點、退點。
// { action: 'balance' | 'debit' | 'refund', userId, points?, ref? } → { balance }
export async function POST(request: Request) {
  if (!isVideoStudioRequest(request)) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { action?: string; userId?: string; points?: number; ref?: string };
  if (!body.userId || !UUID.test(body.userId)) return NextResponse.json({ error: 'INVALID_USER' }, { status: 400 });
  const ref = typeof body.ref === 'string' && /^[A-Za-z0-9:_-]{1,100}$/.test(body.ref) ? body.ref : '';
  const db = createAdminClient();

  if (body.action === 'balance') {
    const { data, error } = await db.from('video_point_accounts').select('balance').eq('user_id', body.userId).maybeSingle();
    if (error) return NextResponse.json({ error: 'UNAVAILABLE' }, { status: 503 });
    return NextResponse.json({ balance: data?.balance ?? 0 });
  }
  if (body.action === 'debit') {
    if (!ref || !Number.isInteger(body.points) || (body.points ?? 0) <= 0 || (body.points ?? 0) > 100000) return NextResponse.json({ error: 'INVALID_DEBIT' }, { status: 400 });
    const { data, error } = await db.rpc('video_points_debit_v1', { p_user: body.userId, p_points: body.points, p_ref: ref });
    if (error?.message?.includes('INSUFFICIENT_POINTS')) return NextResponse.json({ error: 'INSUFFICIENT_POINTS' }, { status: 402 });
    if (error) return NextResponse.json({ error: 'UNAVAILABLE' }, { status: 503 });
    return NextResponse.json({ balance: data });
  }
  if (body.action === 'refund') {
    if (!ref) return NextResponse.json({ error: 'INVALID_REFUND' }, { status: 400 });
    const { data, error } = await db.rpc('video_points_refund_v1', { p_user: body.userId, p_ref: ref });
    if (error) return NextResponse.json({ error: 'UNAVAILABLE' }, { status: 503 });
    return NextResponse.json({ balance: data });
  }
  return NextResponse.json({ error: 'UNKNOWN_ACTION' }, { status: 400 });
}
