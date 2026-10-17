import { NextResponse } from 'next/server';
import { availability, getPublicBusiness, loadSchedule } from '@/lib/booking/server';
import { localParts } from '@/lib/booking/shared';

export const dynamic = 'force-dynamic';

// GET /api/booking/[slug]/availability?service=&from=YYYY-MM-DD&days=7 — 可選的開始時間(不公開任何人的預約資料)
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(request.url);
  const ctx = await getPublicBusiness(decodeURIComponent(slug));
  if (!ctx) return NextResponse.json({ error: { code: 'NOT_FOUND', message: '這張名片目前沒有開放預約。' } }, { status: 404 });
  const { services, hours } = await loadSchedule(ctx.business.id);
  const service = services.find((s) => s.id === url.searchParams.get('service'));
  if (!service) return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: '請先選擇服務。' } }, { status: 422 });
  const today = localParts(new Date()).date;
  const from = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('from') ?? '') ? url.searchParams.get('from')! : today;
  const days = Math.min(14, Math.max(1, Number(url.searchParams.get('days')) || 7));
  const result = await availability(ctx.business, service, hours, from < today ? today : from, days);
  return NextResponse.json({ days: result, server_time: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
}
