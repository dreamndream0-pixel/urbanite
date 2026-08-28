import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/supabase/server';

// GET /api/favorites — 取得目前登入者的收藏商品代碼清單
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ productIds: [] });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('favorites')
    .select('product_id')
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ productIds: (data ?? []).map((r) => r.product_id) });
}

// POST /api/favorites { productId } — 加入收藏(需登入)
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '請先登入' }, { status: 401 });

  const body = await request.json();
  const productId = String(body?.productId ?? '').trim();
  if (!productId) return NextResponse.json({ error: '缺少商品代碼' }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('favorites')
    .upsert({ user_id: user.id, product_id: productId }, { onConflict: 'user_id,product_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true }, { status: 201 });
}

// DELETE /api/favorites?productId=xxx — 移除收藏(需登入)
export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '請先登入' }, { status: 401 });

  const productId = new URL(request.url).searchParams.get('productId')?.trim();
  if (!productId) return NextResponse.json({ error: '缺少商品代碼' }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('favorites')
    .delete()
    .eq('user_id', user.id)
    .eq('product_id', productId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
