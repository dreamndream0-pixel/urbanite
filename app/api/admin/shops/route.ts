import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPlatformAdmin } from '@/lib/supabase/server';
import { URBANITE_SHOP_ID } from '@/lib/shop';

export const dynamic = 'force-dynamic';

// GET /api/admin/shops — 所有店家(平台管理員)
export async function GET() {
  if (!(await getPlatformAdmin())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const supabase = createAdminClient();
  const { data: shops, error } = await supabase.from('shops').select('*').order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const list = shops ?? [];
  // 每家店的商品數、訂單數(資料量小,逐家計數)
  const counts = await Promise.all(
    list.map(async (s) => {
      const [{ count: products }, { count: orders }] = await Promise.all([
        supabase.from('products').select('id', { count: 'exact', head: true }).eq('shop_id', s.id),
        supabase.from('orders').select('id', { count: 'exact', head: true }).eq('shop_id', s.id),
      ]);
      return { products: products ?? 0, orders: orders ?? 0 };
    }),
  );
  // 店主 email
  const owners = new Map<string, string>();
  for (const id of [...new Set(list.map((s) => s.owner_user_id).filter(Boolean))] as string[]) {
    const { data } = await supabase.auth.admin.getUserById(id);
    if (data?.user?.email) owners.set(id, data.user.email);
  }
  return NextResponse.json({
    shops: list.map((s, i) => ({ ...s, owner_email: s.owner_user_id ? owners.get(s.owner_user_id) ?? '' : '', ...counts[i] })),
  });
}

// PATCH /api/admin/shops { id, status?, plan? } — 停用 / 恢復、調整方案
export async function PATCH(request: Request) {
  if (!(await getPlatformAdmin())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const id = String(body.id ?? '');
  if (!id || id === URBANITE_SHOP_ID) return NextResponse.json({ error: 'URBANITE 不能調整' }, { status: 400 });
  const update: Record<string, string> = {};
  if (body.status === 'active' || body.status === 'suspended') update.status = body.status;
  if (body.plan === 'pro' || body.plan === 'max') update.plan = body.plan;
  if (!Object.keys(update).length) return NextResponse.json({ error: '沒有要更新的欄位' }, { status: 400 });
  const { data, error } = await createAdminClient().from('shops').update(update).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
