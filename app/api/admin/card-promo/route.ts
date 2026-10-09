import { NextResponse } from 'next/server';
import { getPlatformAdmin } from '@/lib/supabase/server';
import { cleanPromo, getCardPromo, promoStatus } from '@/lib/card-promo';
import { scopedClient, URBANITE_SHOP_ID } from '@/lib/shop';

export const dynamic = 'force-dynamic';

// GET /api/admin/card-promo — 目前的限時免費設定
export async function GET() {
  if (!(await getPlatformAdmin())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const promo = await getCardPromo();
  return NextResponse.json({ promo, status: promoStatus(promo) });
}

// PUT /api/admin/card-promo { enabled, start, end, note }
export async function PUT(request: Request) {
  if (!(await getPlatformAdmin())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const promo = cleanPromo(await request.json().catch(() => ({})));
  if (promo.enabled && !promo.end) return NextResponse.json({ error: '請設定結束時間' }, { status: 400 });
  if (promo.start && promo.end && new Date(promo.start) >= new Date(promo.end)) return NextResponse.json({ error: '結束時間要晚於開始時間' }, { status: 400 });
  const { error } = await scopedClient(URBANITE_SHOP_ID).from('site_settings').update({ card_promo: promo, updated_at: new Date().toISOString() }).eq('id', 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ promo, status: promoStatus(promo) });
}
