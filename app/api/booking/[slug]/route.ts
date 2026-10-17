import { NextResponse } from 'next/server';
import { getPublicBusiness, loadSchedule } from '@/lib/booking/server';

export const dynamic = 'force-dynamic';

// GET /api/booking/[slug] — 公開的預約入口資料:商家、名片、可預約服務(不含任何顧客資料)
export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getPublicBusiness(decodeURIComponent(slug));
  if (!ctx) return NextResponse.json({ error: { code: 'NOT_FOUND', message: '這張名片目前沒有開放預約。' } }, { status: 404 });
  const { services, hours } = await loadSchedule(ctx.business.id);
  const b = ctx.business;
  return NextResponse.json({
    card: { slug: ctx.card.slug, display_name: ctx.card.display_name, avatar_url: ctx.card.avatar_url },
    business: {
      name: b.name || ctx.card.display_name, address: b.address, notice: b.notice, approval_mode: b.approval_mode,
      advance_days: b.advance_days, cancel_hours: b.cancel_hours, open: hours.length > 0,
    },
    services: services.map((s) => ({ id: s.id, name: s.name, description: s.description, duration_minutes: s.duration_minutes, price: s.price, price_note: s.price_note, image: s.image })),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
