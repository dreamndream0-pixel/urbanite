import { NextResponse } from 'next/server';
import { getPublicBusiness, loadSchedule, publicCatalog } from '@/lib/booking/server';

export const dynamic = 'force-dynamic';

// GET /api/booking/[slug] — 公開的預約入口資料:商家、名片、可預約服務與人員(不含任何顧客資料)
export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getPublicBusiness(decodeURIComponent(slug));
  if (!ctx) return NextResponse.json({ error: { code: 'NOT_FOUND', message: '這張名片目前沒有開放預約。' } }, { status: 404 });
  const sched = await loadSchedule(ctx.business.id);
  const b = ctx.business;
  return NextResponse.json({
    card: { slug: ctx.card.slug, display_name: ctx.card.display_name, avatar_url: ctx.card.avatar_url },
    business: {
      name: b.name || ctx.card.display_name, address: b.address, notice: b.notice, approval_mode: b.approval_mode,
      advance_days: b.advance_days, cancel_hours: b.cancel_hours, allow_any_staff: b.allow_any_staff, open: sched.hours.length > 0 || sched.staffHours.length > 0,
    },
    ...publicCatalog(sched),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
