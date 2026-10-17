import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ownerBusiness } from '@/lib/booking/server';
import { DEFAULT_BUSINESS, localParts } from '@/lib/booking/shared';
import { scopedClient, URBANITE_SHOP_ID } from '@/lib/shop';

export const dynamic = 'force-dynamic';

const unauthorized = () => NextResponse.json({ error: { code: 'AUTH_REQUIRED', message: '請先登入。' } }, { status: 401 });

// GET /api/mycard/booking — 名片主人的預約設定、服務、營業時段、休假、近期預約
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const db = createAdminClient();
  const business = await ownerBusiness(user.id, true);
  if (!business) return NextResponse.json({ error: { code: 'SERVER_ERROR', message: '無法建立預約設定。' } }, { status: 500 });
  const since = new Date(Date.now() - 14 * 86400000).toISOString();
  const [{ data: services }, { data: hours }, { data: exceptions }, { data: bookings }, { data: card }, { data: me }] = await Promise.all([
    db.from('bk_services').select('*').eq('business_id', business.id).order('sort_order').order('created_at'),
    db.from('bk_hours').select('weekday, start_min, end_min').eq('business_id', business.id).order('weekday').order('start_min'),
    db.from('bk_exceptions').select('id, start_at, end_at, reason').eq('business_id', business.id).gte('end_at', new Date().toISOString()).order('start_at'),
    db.from('bk_bookings').select('*').eq('business_id', business.id).gte('start_at', since).order('start_at').limit(300),
    db.from('profile_cards').select('slug, display_name').eq('owner_user_id', user.id).maybeSingle(),
    scopedClient(URBANITE_SHOP_ID).from('customers').select('line_user_id').eq('user_id', user.id).maybeSingle(),
  ]);
  return NextResponse.json({
    business, services: services ?? [], hours: hours ?? [], exceptions: exceptions ?? [], bookings: bookings ?? [],
    card: card ?? null, line_bound: Boolean(me?.line_user_id), today: localParts(new Date()).date,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

const int = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

// PUT /api/mycard/booking { business?, hours? } — 儲存預約設定與每週營業時段(整份取代)
export async function PUT(request: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const db = createAdminClient();
  const business = await ownerBusiness(user.id, true);
  if (!business) return NextResponse.json({ error: { code: 'SERVER_ERROR', message: '無法建立預約設定。' } }, { status: 500 });
  const body = await request.json().catch(() => ({}));

  if (body?.business && typeof body.business === 'object') {
    const b = body.business as Record<string, unknown>;
    const patch = {
      name: String(b.name ?? business.name).trim().slice(0, 60),
      enabled: b.enabled === undefined ? business.enabled : Boolean(b.enabled),
      approval_mode: b.approval_mode === 'auto' ? 'auto' : 'manual',
      slot_interval: [15, 30, 60].includes(Number(b.slot_interval)) ? Number(b.slot_interval) : DEFAULT_BUSINESS.slot_interval,
      lead_minutes: int(b.lead_minutes, 0, 10080, business.lead_minutes),
      advance_days: int(b.advance_days, 1, 180, business.advance_days),
      buffer_minutes: int(b.buffer_minutes, 0, 120, business.buffer_minutes),
      approve_hours: int(b.approve_hours, 1, 168, business.approve_hours),
      cancel_hours: int(b.cancel_hours, 0, 168, business.cancel_hours),
      address: String(b.address ?? '').trim().slice(0, 120),
      notice: String(b.notice ?? '').trim().slice(0, 1000),
      reminder_24h: b.reminder_24h === undefined ? business.reminder_24h : Boolean(b.reminder_24h),
      reminder_2h: b.reminder_2h === undefined ? business.reminder_2h : Boolean(b.reminder_2h),
      updated_at: new Date().toISOString(),
    };
    const { error } = await db.from('bk_businesses').update(patch).eq('id', business.id);
    if (error) return NextResponse.json({ error: { code: 'SERVER_ERROR', message: error.message } }, { status: 400 });
  }

  if (Array.isArray(body?.hours)) {
    const rows = (body.hours as Record<string, unknown>[])
      .map((h) => ({ business_id: business.id, weekday: int(h.weekday, 0, 6, 0), start_min: int(h.start_min, 0, 1439, 0), end_min: int(h.end_min, 1, 1440, 0) }))
      .filter((h) => h.end_min > h.start_min)
      .slice(0, 50);
    await db.from('bk_hours').delete().eq('business_id', business.id);
    if (rows.length) {
      const { error } = await db.from('bk_hours').insert(rows);
      if (error) return NextResponse.json({ error: { code: 'SERVER_ERROR', message: error.message } }, { status: 400 });
    }
  }
  const { data } = await db.from('bk_businesses').select('*').eq('id', business.id).single();
  return NextResponse.json({ business: data });
}
