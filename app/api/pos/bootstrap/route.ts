import { NextResponse } from 'next/server';
import { allowedLocations, getPosUser } from '@/lib/pos-auth';
import { getCurrentShop, shopAdminClient } from '@/lib/shop';
import { getLoyalty } from '@/lib/loyalty';
import { loadPosProducts, openSession, sessionWithSummary } from '@/lib/pos-server';
import { resolvePosButtons, resolvePosSettings } from '@/lib/pos';
import { ensureLocations, loadLevels, pickLocation, withLocationStock } from '@/lib/stock-locations';

export const dynamic = 'force-dynamic';

// GET /api/pos/bootstrap?location= — POS 開機資料:據點、商品(這個據點的即時庫存)、分類、設定、按鈕、目前班別
export async function GET(request: Request) {
  const me = await getPosUser();
  if (!me) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const shop = await getCurrentShop();
  const supabase = await shopAdminClient();
  try {
    // 員工只看得到被指定的據點
    const locations = allowedLocations(me, (await ensureLocations(supabase)).filter((l) => l.active));
    const location = pickLocation(locations, new URL(request.url).searchParams.get('location'));
    const [products, levels, { data: categories }, { data: settings }, session, loyalty] = await Promise.all([
      loadPosProducts(supabase),
      loadLevels(supabase),
      supabase.from('categories').select('slug,name,parent_id,sort_order,campaign_id').order('sort_order', { ascending: true }),
      supabase.from('site_settings').select('logo_url,pos_settings,pos_buttons').maybeSingle(),
      openSession(supabase, location),
      shop ? getLoyalty(shop.id).catch(() => null) : null,
    ]);
    return NextResponse.json({
      shop: { name: shop?.name ?? 'URBANITE', logo: settings?.logo_url ?? '' },
      cashier: me.name,
      me: { email: me.email, name: me.name, isAdmin: me.isAdmin, permissions: me.permissions },
      locations,
      location,
      products: withLocationStock(products, levels, location),
      buttons: resolvePosButtons(settings?.pos_buttons),
      categories: categories ?? [],
      settings: resolvePosSettings(settings?.pos_settings),
      session: session ? await sessionWithSummary(supabase, session) : null,
      loyalty: Boolean(loyalty?.enabled),
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '讀取失敗' }, { status: 500 });
  }
}
