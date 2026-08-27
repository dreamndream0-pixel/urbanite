import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import AccountClient from './AccountClient';
import type { Order } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  const user = configured ? await getSessionUser() : null;

  if (!user) {
    redirect('/login?next=/account');
  }

  let orders: Order[] = [];
  if (user) {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    orders = (data ?? []) as Order[];
  }

  const name =
    (user?.user_metadata?.name as string) ||
    (user?.user_metadata?.full_name as string) ||
    user?.email ||
    '';

  return (
    <AccountClient
      userName={name}
      orders={orders}
    />
  );
}
