import { NextResponse } from 'next/server';
import { availability, BookingError, getPublicBusiness, loadSchedule } from '@/lib/booking/server';
import { localParts } from '@/lib/booking/shared';

export const dynamic = 'force-dynamic';

// GET /api/booking/[slug]/availability?service=&addons=id,id&staff=&from=YYYY-MM-DD&days=7
// 可選的開始時間(不公開任何人的預約資料);staff 空白 = 不指定人員
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(request.url);
  const ctx = await getPublicBusiness(decodeURIComponent(slug));
  if (!ctx) return NextResponse.json({ error: { code: 'NOT_FOUND', message: '這張名片目前沒有開放預約。' } }, { status: 404 });
  const sched = await loadSchedule(ctx.business.id);
  const today = localParts(new Date()).date;
  const from = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('from') ?? '') ? url.searchParams.get('from')! : today;
  const days = Math.min(14, Math.max(1, Number(url.searchParams.get('days')) || 7));
  try {
    const result = await availability(ctx.business, sched, {
      serviceId: url.searchParams.get('service') ?? '',
      addonIds: (url.searchParams.get('addons') ?? '').split(',').filter(Boolean).slice(0, 20),
      staffId: url.searchParams.get('staff') || null,
    }, from < today ? today : from, days);
    return NextResponse.json({ days: result.days, server_time: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    const err = e instanceof BookingError ? e : new BookingError('SERVER_ERROR', '讀取時段失敗。', 500);
    return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
}
