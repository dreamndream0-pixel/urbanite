import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminUser } from '@/lib/supabase/server';
import type { CampaignProduct } from '@/lib/types';

const editable: (keyof CampaignProduct)[] = [
  'sku', 'name', 'tagline', 'price', 'original_price', 'inventory', 'status',
  'category', 'image', 'images', 'available_payment_methods', 'available_shipping_methods',
  'shipping_fee_overrides', 'specs', 'variants', 'unit', 'sale_mode', 'sort_order',
];

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const { id } = await params;
  const body = await request.json();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of editable) if (key in body) update[key] = body[key];
  const { data, error } = await createAdminClient().from('campaign_products').update(update).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data as CampaignProduct);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const { id } = await params;
  const { error } = await createAdminClient().from('campaign_products').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
