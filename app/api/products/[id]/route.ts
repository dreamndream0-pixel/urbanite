import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminUser } from '@/lib/supabase/server';
import type { Product } from '@/lib/types';

// 可被後台編輯的欄位
const EDITABLE: (keyof Product)[] = [
  'name',
  'tagline',
  'price',
  'original_price',
  'inventory',
  'status',
  'category',
  'image',
  'images',
  'available_payment_methods',
  'available_shipping_methods',
  'shipping_fee_overrides',
  'colors',
  'sizes',
  'specs',
  'variants',
  'unit',
  'sale_mode',
  'color_images',
  'is_featured',
  'sort_order',
];

// PATCH /api/products/[id] — 編輯商品(限管理員)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: '未授權' }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  const update: Record<string, unknown> = {};
  for (const key of EDITABLE) {
    if (key in body) update[key] = body[key];
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: '沒有可更新的欄位' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('products')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data as Product);
}

// DELETE /api/products/[id] — 刪除商品(限管理員)
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: '未授權' }, { status: 401 });

  const { id } = await params;
  const supabase = createAdminClient();
  const { error } = await supabase.from('products').delete().eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
