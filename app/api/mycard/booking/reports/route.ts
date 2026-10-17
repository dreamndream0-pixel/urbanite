import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/supabase/server';
import { BookingError } from '@/lib/booking/server';
import { ownerReport, payrollRun, settlePayroll } from '@/lib/booking/reports';

export const dynamic = 'force-dynamic';

const fail = (e: unknown) => {
  const err = e instanceof BookingError ? e : new BookingError('SERVER_ERROR', '讀取報表失敗。', 500);
  return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
};

// GET /api/mycard/booking/reports?from=&to=(或 ?run=結算 id)— 營運報表與抽成
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return fail(new BookingError('AUTH_REQUIRED', '請先登入。', 401));
  const q = new URL(request.url).searchParams;
  try {
    if (q.get('run')) return NextResponse.json(await payrollRun(user.id, q.get('run')!), { headers: { 'Cache-Control': 'no-store' } });
    return NextResponse.json(await ownerReport(user.id, q.get('from') ?? '', q.get('to') ?? ''), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return fail(e); }
}

// POST /api/mycard/booking/reports { from, to, note } — 結算這段期間的抽成(鎖定)
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return fail(new BookingError('AUTH_REQUIRED', '請先登入。', 401));
  const body = await request.json().catch(() => ({}));
  try { return NextResponse.json(await settlePayroll(user.id, String(body?.from ?? ''), String(body?.to ?? ''), String(body?.note ?? '')), { status: 201 }); }
  catch (e) { return fail(e); }
}
