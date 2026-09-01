import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import AccountClient from './AccountClient';
import type { Discount, Order, Product } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  const user = configured ? await getSessionUser() : null;

  if (!user) {
    redirect('/login?next=/account');
  }

  const supabase = createAdminClient();
  const [
    { data: orders },
    { data: customer },
    { data: products },
    { data: favRows },
    { data: coupons },
  ] = await Promise.all([
    supabase.from('orders').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    supabase.from('customers').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('products').select('*').order('sort_order', { ascending: true }),
    supabase.from('favorites').select('product_id').eq('user_id', user.id),
    supabase.from('discounts').select('*').eq('active', true).order('created_at', { ascending: false }),
  ]);

  const name =
    customer?.name ||
    (user.user_metadata?.name as string) ||
    (user.user_metadata?.full_name as string) ||
    user.email ||
    '';
  const email = customer?.email || user.email || '';
  const phone = customer?.phone || user.phone || '';
  const address = customer?.address || '';
  const provider = (user.app_metadata?.provider as string) || 'email';
  const favoriteIds = (favRows ?? []).map((r) => r.product_id as string);

  return (
    <AccountClient
      userName={name}
      userEmail={email}
      userPhone={phone}
      userAddress={address}
      provider={provider}
      orders={(orders ?? []) as Order[]}
      products={(products ?? []) as Product[]}
      favoriteIds={favoriteIds}
      coupons={(coupons ?? []) as Discount[]}
    />
  );
}
