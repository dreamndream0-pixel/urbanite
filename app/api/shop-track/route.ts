import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentShop } from '@/lib/shop';
import { accountRateLimit } from '@/lib/account-rate-limit';

export const dynamic = 'force-dynamic';

const TYPES = new Set(['visit', 'product_view', 'product_click', 'add_cart']);
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|preview|headless|lighthouse/i;
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// POST /api/shop-track { type, product_id?, campaign_id?, page?, source?, visitor } — 賣場流量事件(進站、商品點擊、商品頁瀏覽、加入購物車)
// 不記個資:visitor 是瀏覽器端的匿名代碼;機器人與過量請求直接略過
export async function POST(request: Request) {
  const ok = new NextResponse(null, { status: 204 });
  if (BOT.test(request.headers.get('user-agent') ?? '')) return ok;
  const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'local';
  if (!accountRateLimit(ip, 'shop-track', 120)) return ok;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const type = clean(body?.type, 20);
  if (!TYPES.has(type)) return ok;
  const shop = await getCurrentShop();
  if (!shop || shop.status === 'suspended') return ok;
  const campaign = clean(body?.campaign_id, 40);
  const { error } = await createAdminClient().from('shop_events').insert({
    shop_id: shop.id, type,
    product_id: clean(body?.product_id, 80) || null,
    campaign_id: /^[0-9a-f-]{36}$/i.test(campaign) ? campaign : null,
    page: clean(body?.page, 120), source: clean(body?.source, 40) || 'direct', visitor: clean(body?.visitor, 40),
  });
  if (error) console.error('shop-track', error.message);
  return ok;
}
