import { NextResponse } from 'next/server';
import { getAdminUser, getPlatformAdmin, getSessionUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentShop, isPlatformShop, shopAdminClient, shopUrl } from '@/lib/shop';

// GET /api/me — 目前登入者資訊
// isAdmin:能不能管理「目前這家店」(主網站 = 平台管理員;店家網址 = 店主 / 員工)
// shops:自己管理的店家(會員選單顯示「我的官網後台」)
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ user: null });

  const [admin, platform, current] = await Promise.all([getAdminUser(), getPlatformAdmin(), getCurrentShop()]);
  const isAdmin = Boolean(admin);
  const { data: members } = await createAdminClient().from('shop_members').select('role, shop:shops(id, slug, name, status)').eq('user_id', user.id);
  const shops = (members ?? [])
    .map((m) => ({ role: m.role as string, ...(m.shop as unknown as { id: string; slug: string; name: string; status: string }) }))
    .filter((s) => s.slug && s.status !== 'suspended')
    .map((s) => ({ slug: s.slug, name: s.name, role: s.role, current: s.id === current?.id, adminUrl: shopUrl(s.slug, '/admin'), url: shopUrl(s.slug) }));
  const name =
    (user.user_metadata?.name as string) ||
    (user.user_metadata?.full_name as string) ||
    user.email ||
    '';

  const supabase = (await shopAdminClient());
  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  return NextResponse.json({
    email: customer?.email || user.email,
    name: customer?.name || name,
    phone: customer?.phone || user.phone || '',
    address: customer?.address || '',
    recipients: Array.isArray(customer?.recipients) ? customer.recipients : [],
    isAdmin,
    adminRole: !isAdmin ? '' : isPlatformShop(current) || platform ? 'platform' : shops.find((s) => s.current)?.role === 'staff' ? 'staff' : 'owner',
    shops,
  });
}
