import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminUser } from '@/lib/supabase/server';
import { isCampaignLive } from '@/lib/campaign';
import type { Campaign, Product } from '@/lib/types';

// GET /api/products — 取得商品(前台與後台共用)
//   預設:主站商品(不含活動頁商品)
//   ?campaign=<id>:該活動頁的商品
//   ?cart=1:結帳用,主站商品 + 仍在活動期間內的活動頁商品
export async function GET(request: NextRequest) {
  const supabase = createAdminClient();
  const campaignId = request.nextUrl.searchParams.get('campaign') ?? '';
  const forCart = request.nextUrl.searchParams.get('cart') === '1';
  let query = supabase.from('products').select('*').order('sort_order', { ascending: true });
  if (campaignId) query = query.eq('campaign_id', campaignId);
  else if (!forCart) query = query.is('campaign_id', null);
  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  let result = (data ?? []) as Product[];
  const campaignIds = [...new Set(result.map((p) => p.campaign_id).filter(Boolean))] as string[];
  if (campaignIds.length) {
    const admin = campaignId ? await getAdminUser() : null;
    const { data: campaigns } = await supabase.from('campaigns').select('id,status,start_at,end_at').in('id', campaignIds);
    const live = new Set(((campaigns ?? []) as Campaign[]).filter((c) => isCampaignLive(c)).map((c) => c.id));
    // 管理員可預覽草稿活動頁
    if (!admin) result = result.filter((p) => !p.campaign_id || live.has(p.campaign_id));
  }
  return NextResponse.json(result, {
    // 活動頁可能是管理員預覽草稿,不可被 CDN 快取給其他人
    headers: { 'Cache-Control': campaignId ? 'no-store' : 's-maxage=120, stale-while-revalidate=600' },
  });
}

// POST /api/products — 新增商品(限管理員)
export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: '未授權' }, { status: 401 });

  const body = await request.json();
  if (!body?.id || !body?.name || typeof body?.price !== 'number') {
    return NextResponse.json({ error: '缺少必填欄位(id / name / price)' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('products')
    .insert({
      id: String(body.id).trim(),
      name: body.name,
      tagline: body.tagline ?? '',
      price: body.price,
      original_price: body.original_price ?? null,
      inventory: body.inventory ?? 0,
      status: body.status ?? '上架中',
      category: body.category ?? '',
      image: body.image ?? (Array.isArray(body.images) ? body.images[0] ?? '' : ''),
      images: Array.isArray(body.images) ? body.images : body.image ? [body.image] : [],
      available_payment_methods: Array.isArray(body.available_payment_methods)
        ? body.available_payment_methods
        : [],
      available_shipping_methods: Array.isArray(body.available_shipping_methods)
        ? body.available_shipping_methods
        : [],
      shipping_fee_overrides: body.shipping_fee_overrides && typeof body.shipping_fee_overrides === 'object'
        ? body.shipping_fee_overrides
        : {},
      colors: body.colors ?? [],
      sizes: body.sizes ?? [],
      specs: Array.isArray(body.specs) ? body.specs : [],
      variants: Array.isArray(body.variants) ? body.variants : [],
      unit: body.unit ?? '',
      sale_mode: body.sale_mode ?? '現貨',
      color_images: body.color_images ?? {},
      is_featured: body.is_featured ?? false,
      sort_order: body.sort_order ?? 0,
      campaign_id: body.campaign_id || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data as Product, { status: 201 });
}
