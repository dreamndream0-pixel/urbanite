import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { scopedClient, URBANITE_SHOP_ID } from '@/lib/shop';
import { myRecords } from '@/lib/booking/customers';
import { packagesOf, pointsOf } from '@/lib/booking/loyalty';

export const dynamic = 'force-dynamic';

// GET /api/booking/my — 目前登入者自己的預約(含店家名稱、名片代稱、人員、收款進度),以及是否已綁定 LINE 通知
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: { code: 'AUTH_REQUIRED', message: '請先登入。' } }, { status: 401 });
  const db = createAdminClient();
  const { data: bookings } = await db.from('bk_bookings')
    .select('id, business_id, booking_no, service_snapshot, start_at, end_at, status, approval_status, expires_at, cancel_reason, version, contact, created_at, staff_id, addons, total_price, deposit_amount, paid_amount, payment_status, payment_report, reschedule_count, quote_id')
    .eq('customer_user_id', user.id).order('start_at', { ascending: false }).limit(50);
  const { data: quotes } = await db.from('bk_quotes').select('id, business_id, quote_no, service_name, status, request, current_version, booking_id, created_at')
    .eq('customer_user_id', user.id).order('created_at', { ascending: false }).limit(30);
  const quoteIds = (quotes ?? []).filter((q) => q.current_version > 0).map((q) => q.id);
  const { data: versions } = quoteIds.length ? await db.from('bk_quote_versions').select('quote_id, version, items, total, deposit, start_at, minutes, travel_minutes, valid_until, hold_until, note').in('quote_id', quoteIds) : { data: [] };
  const records = await myRecords(user.id);
  // 我在各店的顧客檔:套票與點數
  const { data: myCustomers } = await db.from('bk_customers').select('id, business_id').eq('user_id', user.id);
  const cids = (myCustomers ?? []).map((c) => c.id);
  const [pkgs, pts] = await Promise.all([packagesOf(cids), pointsOf(cids)]);
  const { data: waitlist } = await db.from('bk_waitlist').select('id, business_id, service_id, date, from_min, to_min, status, invited_slot, invite_expires_at, staff_id')
    .eq('customer_user_id', user.id).in('status', ['waiting', 'invited']).order('date');
  const { data: optRows } = await db.from('bk_customers').select('business_id, marketing_opt_out').eq('user_id', user.id);
  const wsids = [...new Set((waitlist ?? []).map((w) => w.service_id))];
  const { data: wsvc } = wsids.length ? await db.from('bk_services').select('id, name').in('id', wsids) : { data: [] };
  const ids = [...new Set([...(bookings ?? []).map((b) => b.business_id), ...(quotes ?? []).map((q) => q.business_id), ...records.map((r) => r.business_id), ...(myCustomers ?? []).map((c) => c.business_id), ...(waitlist ?? []).map((w) => w.business_id)])];
  const [{ data: businesses }, { data: staff }] = await Promise.all([
    ids.length ? db.from('bk_businesses').select('id, name, card_id, address, cancel_hours, payment_info, reschedule_limit').in('id', ids) : Promise.resolve({ data: [] }),
    ids.length ? db.from('bk_staff').select('id, name, business_id, active').in('business_id', ids) : Promise.resolve({ data: [] }),
  ]);
  const cardIds = (businesses ?? []).map((b) => b.card_id).filter(Boolean);
  const { data: cards } = cardIds.length ? await db.from('profile_cards').select('id, slug, display_name').in('id', cardIds) : { data: [] };
  const { data: customer } = await scopedClient(URBANITE_SHOP_ID).from('customers').select('line_user_id').eq('user_id', user.id).maybeSingle();
  const bizInfo = (businessId: string) => {
    const biz = (businesses ?? []).find((x) => x.id === businessId);
    const card = (cards ?? []).find((c) => c.id === biz?.card_id);
    return { name: biz?.name || card?.display_name || '', slug: card?.slug ?? '' };
  };
  return NextResponse.json({
    line_bound: Boolean(customer?.line_user_id),
    records: records.map((r) => ({ ...r, business: bizInfo(r.business_id) })),
    waitlist: (waitlist ?? []).map((w) => ({ ...w, service_name: (wsvc ?? []).find((s) => s.id === w.service_id)?.name ?? '', business: bizInfo(w.business_id) })),
    prefs: (optRows ?? []).map((o) => ({ business: bizInfo(o.business_id), marketing_opt_out: o.marketing_opt_out })),
    packages: pkgs.filter((p) => p.status === 'active').map((p) => ({ id: p.id, name: p.name, service_ids: p.service_ids, available: p.available, used: p.used, reserved: p.reserved, sessions_total: p.sessions_total, expires_at: p.expires_at, business: bizInfo((myCustomers ?? []).find((c) => c.id === p.customer_id)?.business_id ?? '') })),
    points: (myCustomers ?? []).map((c) => ({ business: bizInfo(c.business_id), points: pts.get(c.id) ?? 0 })).filter((x) => x.points > 0),
    quotes: (quotes ?? []).map((q) => ({
      ...q, business: bizInfo(q.business_id),
      offer: (versions ?? []).find((v) => v.quote_id === q.id && v.version === q.current_version) ?? null,
    })),
    bookings: (bookings ?? []).map((b) => {
      const biz = (businesses ?? []).find((x) => x.id === b.business_id);
      const card = (cards ?? []).find((c) => c.id === biz?.card_id);
      // 一人工作室不顯示人員名稱
      const team = (staff ?? []).filter((s) => s.business_id === b.business_id && s.active).length > 1;
      return {
        ...b,
        staff_name: team ? (staff ?? []).find((s) => s.id === b.staff_id)?.name ?? '' : '',
        business: {
          name: biz?.name || card?.display_name || '', address: biz?.address ?? '', cancel_hours: biz?.cancel_hours ?? 24, slug: card?.slug ?? '',
          payment_info: biz?.payment_info ?? '', reschedule_limit: biz?.reschedule_limit ?? 0,
        },
      };
    }),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
