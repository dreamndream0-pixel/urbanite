import { getSessionUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { bookingIcs } from '@/lib/booking/server';
import { getConfiguredSiteUrl } from '@/lib/site-url';
import type { BkBooking } from '@/lib/booking/shared';

export const dynamic = 'force-dynamic';

// GET /api/booking/my/[id]/ics — 加入 Apple / Google 行事曆(單向匯出)
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return new Response('請先登入', { status: 401 });
  const { id } = await params;
  const db = createAdminClient();
  const { data: booking } = await db.from('bk_bookings').select('*').eq('id', id).eq('customer_user_id', user.id).maybeSingle();
  if (!booking) return new Response('找不到預約', { status: 404 });
  const { data: business } = await db.from('bk_businesses').select('name, address, card_id').eq('id', booking.business_id).single();
  const { data: card } = business?.card_id ? await db.from('profile_cards').select('slug, display_name').eq('id', business.card_id).maybeSingle() : { data: null };
  const link = `${getConfiguredSiteUrl()}/@${card?.slug ?? ''}/book?tab=my`;
  const body = bookingIcs(booking as BkBooking, business?.name || card?.display_name || '', business?.address ?? '', link);
  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="booking-${booking.booking_no}.ics"`,
      'Cache-Control': 'no-store',
    },
  });
}
