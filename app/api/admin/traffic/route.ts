import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminUser } from '@/lib/supabase/server';
import { getCurrentShop } from '@/lib/shop';

export const dynamic = 'force-dynamic';

// GET /api/admin/traffic?days=7|30|90 — 這家店的流量統計(報表及分析)
export async function GET(request: Request) {
  if (!(await getAdminUser())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const shop = await getCurrentShop();
  if (!shop) return NextResponse.json({ error: '找不到商店' }, { status: 404 });
  const days = [1, 7, 30, 90].includes(Number(new URL(request.url).searchParams.get('days'))) ? Number(new URL(request.url).searchParams.get('days')) : 7;
  // 以台灣時間的今天 00:00 往回算
  const todayTw = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const from = new Date(new Date(`${todayTw}T00:00:00+08:00`).getTime() - (days - 1) * 86400000);
  const to = new Date(Date.now() + 60000);
  const { data, error } = await createAdminClient().rpc('shop_traffic_stats', { p_shop: shop.id, p_from: from.toISOString(), p_to: to.toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ...(data as object), days, from: from.toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
}
