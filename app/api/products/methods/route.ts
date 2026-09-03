import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminUser } from '@/lib/supabase/server';

// POST /api/products/methods — 批次把「可用付款 / 物流方式」套用到多個商品(限管理員)
// body: {
//   field: 'available_payment_methods' | 'available_shipping_methods',
//   methods: string[],          // 要套用的方式;空陣列 = 允許全部(清除限制)
//   scope: 'all' | 'category',
//   category?: string,          // scope='category' 時,比對 products.category
// }
export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: '未授權' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const field = body?.field;
  if (field !== 'available_payment_methods' && field !== 'available_shipping_methods') {
    return NextResponse.json({ error: '欄位錯誤' }, { status: 400 });
  }
  const methods = Array.isArray(body?.methods) ? body.methods.map((m: unknown) => String(m)) : [];
  const scope = body?.scope === 'category' ? 'category' : 'all';
  const category = String(body?.category ?? '').trim();
  if (scope === 'category' && !category) {
    return NextResponse.json({ error: '請選擇分類' }, { status: 400 });
  }

  const supabase = createAdminClient();
  let query = supabase.from('products').update({ [field]: methods });
  query = scope === 'category' ? query.eq('category', category) : query.neq('id', '');
  const { data, error } = await query.select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ updated: (data ?? []).length });
}
