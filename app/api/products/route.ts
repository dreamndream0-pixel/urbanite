import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminUser } from '@/lib/supabase/server';
import type { Product } from '@/lib/types';

// GET /api/products — 取得所有商品(前台與後台共用)
export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data as Product[]);
}

// POST /api/products — 新增商品(限管理員)
export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: '未授權' }, { status: 401 });

  const body = await request.json();
  if (!body?.id || !body?.name || typeof body?.price !== 'number') {
    return NextResponse.json({ error: '缺少必填欄位(id / name / price)' }, { status: 400 });
  }

  // 多圖:最多保留 10 張;主圖(image)一律同步為第一張
  const images: string[] = Array.isArray(body.images)
    ? body.images.filter((u: unknown) => typeof u === 'string' && u.trim() !== '').slice(0, 10)
    : [];
  const image = images[0] ?? body.image ?? '';

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
      image,
      images: image && images.length === 0 ? [image] : images,
      colors: body.colors ?? [],
      sizes: body.sizes ?? [],
      is_featured: body.is_featured ?? false,
      sort_order: body.sort_order ?? 0,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data as Product, { status: 201 });
}
