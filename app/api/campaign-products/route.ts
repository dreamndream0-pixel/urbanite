import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminUser } from '@/lib/supabase/server';
import type { CampaignProduct } from '@/lib/types';

export async function GET(request: NextRequest) {
  const campaignId = request.nextUrl.searchParams.get('campaign_id') ?? '';
  if (!campaignId) return NextResponse.json({ error: '缺少 campaign_id' }, { status: 400 });
  const admin = await getAdminUser();
  const supabase = createAdminClient();
  if (!admin) {
    const { data: campaign } = await supabase.from('campaigns').select('id,status,start_at,end_at').eq('id', campaignId).maybeSingle();
    const now = Date.now();
    if (!campaign || campaign.status !== 'published' || (campaign.start_at && new Date(campaign.start_at).getTime() > now) || (campaign.end_at && new Date(campaign.end_at).getTime() < now)) {
      return NextResponse.json({ error: '活動不存在或尚未開放' }, { status: 404 });
    }
  }
  let query = supabase.from('campaign_products').select('*').eq('campaign_id', campaignId).order('sort_order');
  if (!admin) query = query.eq('status', '上架中');
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data as CampaignProduct[]);
}

export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const body = await request.json();
  if (!body?.campaign_id || !String(body?.name ?? '').trim()) {
    return NextResponse.json({ error: '缺少活動或商品名稱' }, { status: 400 });
  }
  const sku = String(body.sku ?? '').trim() || `CP-${Date.now()}`;
  const { data, error } = await createAdminClient().from('campaign_products').insert({
    campaign_id: body.campaign_id,
    sku,
    name: String(body.name).trim(),
    tagline: String(body.tagline ?? ''),
    price: Math.max(0, Number(body.price) || 0),
    original_price: body.original_price ? Number(body.original_price) : null,
    inventory: Math.max(0, Number(body.inventory) || 0),
    status: body.status === '已下架' ? '已下架' : '上架中',
    category: String(body.category ?? ''),
    image: String(body.image ?? ''),
    images: Array.isArray(body.images) ? body.images : body.image ? [body.image] : [],
    available_payment_methods: Array.isArray(body.available_payment_methods) ? body.available_payment_methods : [],
    available_shipping_methods: Array.isArray(body.available_shipping_methods) ? body.available_shipping_methods : [],
    shipping_fee_overrides: body.shipping_fee_overrides ?? {},
    specs: Array.isArray(body.specs) ? body.specs : [],
    variants: Array.isArray(body.variants) ? body.variants : [],
    unit: String(body.unit ?? ''),
    sale_mode: String(body.sale_mode ?? '現貨'),
    sort_order: Number(body.sort_order) || 0,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data as CampaignProduct, { status: 201 });
}
