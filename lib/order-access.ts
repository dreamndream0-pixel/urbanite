import { cookies } from 'next/headers';
import { getSessionUser } from '@/lib/supabase/server';
import { orderAccessCookieName, verifyOrderAccessToken } from './order-access-token';

export async function canAccessOrder(order: { order_no: string; user_id?: string | null }) {
  // A guest credential never overrides ownership of a member's order.
  if (order.user_id) {
    const user = await getSessionUser();
    return Boolean(user && user.id === order.user_id);
  }
  const jar = await cookies();
  return verifyOrderAccessToken(jar.get(orderAccessCookieName(order.order_no))?.value, order.order_no);
}
