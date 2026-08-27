import { getAdminUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import LoginPanel from './LoginPanel';
import AdminDashboard from './AdminDashboard';
import type { Category, Discount, Order, Product } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  const user = configured ? await getAdminUser() : null;

  // 未設定 Supabase,或未登入 / 非管理員 → 顯示登入畫面
  if (!user) {
    return <LoginPanel configured={configured} />;
  }

  // 已是管理員 → 讀取初始資料並顯示後台
  const supabase = createAdminClient();
  const [
    { data: products },
    { data: orders },
    { data: categories },
    { data: settings },
    { data: discounts },
  ] = await Promise.all([
    supabase.from('products').select('*').order('sort_order', { ascending: true }),
    supabase.from('orders').select('*').order('created_at', { ascending: false }),
    supabase.from('categories').select('*').order('sort_order', { ascending: true }),
    supabase.from('site_settings').select('*').eq('id', 1).maybeSingle(),
    supabase.from('discounts').select('*').order('created_at', { ascending: false }),
  ]);

  return (
    <AdminDashboard
      initialProducts={(products ?? []) as Product[]}
      initialOrders={(orders ?? []) as Order[]}
      initialCategories={(categories ?? []) as Category[]}
      initialDiscounts={(discounts ?? []) as Discount[]}
      initialLogoUrl={settings?.logo_url ?? ''}
      userEmail={user.email ?? ''}
    />
  );
}
