import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { scopedClient, URBANITE_SHOP_ID } from '@/lib/shop';

export const dynamic = 'force-dynamic';

// GET /api/booking/my — 目前登入者自己的預約(含店家名稱、名片代稱、人員、收款進度),以及是否已綁定 LINE 通知
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: { code: 'AUTH_REQUIRED', message: '請先登入。' } }, { status: 401 });
  const db = createAdminClient();
  const { data: bookings } = await db.from('bk_bookings')
    .select('id, business_id, booking_no, service_snapshot, start_at, end_at, status, approval_status, expires_at, cancel_reason, version, contact, created_at, staff_id, addons, total_price, deposit_amount, paid_amount, payment_status, payment_report, reschedule_count')
    .eq('customer_user_id', user.id).order('start_at', { ascending: false }).limit(50);
  const ids = [...new Set((bookings ?? []).map((b) => b.business_id))];
  const [{ data: businesses }, { data: staff }] = await Promise.all([
    ids.length ? db.from('bk_businesses').select('id, name, card_id, address, cancel_hours, payment_info, reschedule_limit').in('id', ids) : Promise.resolve({ data: [] }),
    ids.length ? db.from('bk_staff').select('id, name, business_id, active').in('business_id', ids) : Promise.resolve({ data: [] }),
  ]);
  const cardIds = (businesses ?? []).map((b) => b.card_id).filter(Boolean);
  const { data: cards } = cardIds.length ? await db.from('profile_cards').select('id, slug, display_name').in('id', cardIds) : { data: [] };
  const { data: customer } = await scopedClient(URBANITE_SHOP_ID).from('customers').select('line_user_id').eq('user_id', user.id).maybeSingle();
  return NextResponse.json({
    line_bound: Boolean(customer?.line_user_id),
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
