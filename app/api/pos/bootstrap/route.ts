import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/supabase/server';
import { getCurrentShop, shopAdminClient } from '@/lib/shop';
import { getLoyalty } from '@/lib/loyalty';
import { loadPosProducts, openSession, sessionWithSummary } from '@/lib/pos-server';
import { resolvePosSettings } from '@/lib/pos';

export const dynamic = 'force-dynamic';

// GET /api/pos/bootstrap — POS 開機資料:商品(含即時庫存)、分類、設定、目前班別
export async function GET() {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const shop = await getCurrentShop();
  const supabase = await shopAdminClient();
  try {
    const [products, { data: categories }, { data: settings }, session, loyalty] = await Promise.all([
      loadPosProducts(supabase),
      supabase.from('categories').select('slug,name,parent_id,sort_order,campaign_id').order('sort_order', { ascending: true }),
      supabase.from('site_settings').select('logo_url,pos_settings').maybeSingle(),
      openSession(supabase),
      shop ? getLoyalty(shop.id).catch(() => null) : null,
    ]);
    return NextResponse.json({
      shop: { name: shop?.name ?? 'URBANITE', logo: settings?.logo_url ?? '' },
      cashier: admin.email ?? '',
      products,
      categories: categories ?? [],
      settings: resolvePosSettings(settings?.pos_settings),
      session: session ? await sessionWithSummary(supabase, session) : null,
      loyalty: Boolean(loyalty?.enabled),
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '讀取失敗' }, { status: 500 });
  }
}
