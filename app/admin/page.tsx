import { redirect } from 'next/navigation';
import { getAdminUser, getSessionUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import AdminDashboard from './AdminDashboard';
import type {
  Banner,
  Category,
  Customer,
  CouponUsage,
  Discount,
  Order,
  Product,
  SiteSettings,
  StockMovement,
  UserCoupon,
} from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  const sessionUser = configured ? await getSessionUser() : null;
  const user = sessionUser ? await getAdminUser() : null;

  // 已登入但不是管理員時回到前台,避免 OAuth 登入後卡在後台登入頁。
  if (sessionUser && !user) {
    redirect('/');
  }

  // 未設定 Supabase,或尚未登入 → 使用共用登入頁
  if (!user) {
    redirect('/login?next=/admin');
  }

  // 已是管理員 → 讀取初始資料並顯示後台
  const supabase = createAdminClient();
  const [
    { data: products },
    { data: orders },
    { data: categories },
    { data: settings },
    { data: discounts },
    { data: customers },
    { data: banners },
    { data: movements },
    { data: userCoupons },
    { data: couponUsages },
  ] = await Promise.all([
    supabase.from('products').select('*').order('sort_order', { ascending: true }),
    supabase.from('orders').select('*').order('created_at', { ascending: false }),
    supabase.from('categories').select('*').order('sort_order', { ascending: true }),
    supabase.from('site_settings').select('*').eq('id', 1).maybeSingle(),
    supabase.from('discounts').select('*').order('created_at', { ascending: false }),
    supabase.from('customers').select('*').order('created_at', { ascending: false }),
    supabase.from('banners').select('*').order('sort_order', { ascending: true }),
    supabase.from('stock_movements').select('*').order('created_at', { ascending: false }).limit(200),
    supabase.from('user_coupons').select('*, coupon:discounts(*)').order('received_at', { ascending: false }),
    supabase.from('coupon_usages').select('*').order('used_at', { ascending: false }),
  ]);

  return (
    <AdminDashboard
      initialProducts={(products ?? []) as Product[]}
      initialOrders={(orders ?? []) as Order[]}
      initialCategories={(categories ?? []) as Category[]}
      initialDiscounts={(discounts ?? []) as Discount[]}
      initialCustomers={(customers ?? []) as Customer[]}
      initialBanners={(banners ?? []) as Banner[]}
      initialMovements={(movements ?? []) as StockMovement[]}
      initialUserCoupons={(userCoupons ?? []) as UserCoupon[]}
      initialCouponUsages={(couponUsages ?? []) as CouponUsage[]}
      initialLogoUrl={settings?.logo_url ?? ''}
      initialSettings={settings as SiteSettings | null}
      userEmail={user.email ?? ''}
    />
  );
}
