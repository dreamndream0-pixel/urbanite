import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/supabase/server';
import { getCurrentShop, scopedClient } from '@/lib/shop';
import { getLoyalty, paidProductAmount } from '@/lib/loyalty';
import { tierForSpend } from '@/lib/loyalty-settings';

export const dynamic = 'force-dynamic';

// GET /api/admin/loyalty/members — 會員列表:等級、近期有效消費、可用 / 待入帳回饋金、訂單數
export async function GET() {
  const [admin, shop] = await Promise.all([getAdminUser(), getCurrentShop()]);
  if (!admin || !shop) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const settings = await getLoyalty(shop.id);
  const db = scopedClient(shop.id);
  const since = new Date(Date.now() - settings.keepMonths * 30 * 24 * 3600 * 1000).toISOString();
  const [{ data: customers }, { data: lots }, { data: orders }] = await Promise.all([
    db.from('customers').select('user_id, name, email, phone, tier, tier_until, created_at').not('user_id', 'is', null).order('created_at', { ascending: false }).limit(1000),
    db.from('credit_lots').select('user_id, remaining, status').in('status', ['pending', 'active']),
    db.from('orders').select('user_id, subtotal, discount, shipping_discount, credit_used, total, refund_amount, shipping_refund, status, order_status, completed_at').not('user_id', 'is', null),
  ]);
  const stat = new Map<string, { balance: number; pending: number; spend: number; orders: number }>();
  const get = (id: string) => stat.get(id) ?? (stat.set(id, { balance: 0, pending: 0, spend: 0, orders: 0 }), stat.get(id)!);
  for (const l of lots ?? []) {
    const s = get(l.user_id);
    if (l.status === 'active') s.balance += l.remaining; else s.pending += l.remaining;
  }
  for (const o of orders ?? []) {
    const s = get(o.user_id);
    s.orders++;
    if (o.order_status === 'COMPLETED' && o.completed_at && o.completed_at >= since) s.spend += paidProductAmount(o);
  }
  const now = Date.now();
  const members = (customers ?? []).map((c) => {
    const s = get(c.user_id);
    const bySpend = tierForSpend(settings, s.spend);
    const kept = c.tier && c.tier_until && new Date(c.tier_until).getTime() > now ? settings.tiers.find((t) => t.key === c.tier) : undefined;
    const tier = kept && kept.threshold > bySpend.threshold ? kept : bySpend;
    return { user_id: c.user_id, name: c.name || '', email: c.email || '', phone: c.phone || '', tier: tier.name, tierKey: tier.key, spend: s.spend, balance: Math.max(0, s.balance), pending: s.pending, orders: s.orders };
  });
  return NextResponse.json({ enabled: settings.enabled, tiers: settings.tiers, members }, { headers: { 'Cache-Control': 'private, no-store' } });
}
