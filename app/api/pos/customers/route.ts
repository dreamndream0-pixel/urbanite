import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/supabase/server';
import { getCurrentShop, shopAdminClient } from '@/lib/shop';
import { creditQuote } from '@/lib/loyalty';

export const dynamic = 'force-dynamic';

// GET /api/pos/customers?q=姓名/電話/Email — 找會員(最多 12 筆)
// GET /api/pos/customers?quote=<user_id>&amount=<商品金額> — 這位會員的回饋金餘額、本筆最多可折抵、等級
export async function GET(request: Request) {
  if (!(await getAdminUser())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const url = new URL(request.url);
  const supabase = await shopAdminClient();

  const quoteUser = (url.searchParams.get('quote') ?? '').trim();
  if (quoteUser) {
    const shop = await getCurrentShop();
    const amount = Math.max(0, Math.floor(Number(url.searchParams.get('amount')) || 0));
    const quote = shop ? await creditQuote(shop.id, quoteUser, amount).catch(() => null) : null;
    return NextResponse.json(quote ? { enabled: true, balance: quote.balance, max: quote.max, tier: quote.tier.name, rate: quote.tier.rate } : { enabled: false, balance: 0, max: 0, tier: '', rate: 0 }, { headers: { 'Cache-Control': 'private, no-store' } });
  }

  const q = (url.searchParams.get('q') ?? '').trim().replace(/[%,()]/g, '');
  if (q.length < 2) return NextResponse.json([]);
  const { data, error } = await supabase.from('customers').select('user_id,name,nickname,phone,email')
    .not('user_id', 'is', null).or(`name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%,nickname.ilike.%${q}%`).limit(12);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? [], { headers: { 'Cache-Control': 'private, no-store' } });
}
