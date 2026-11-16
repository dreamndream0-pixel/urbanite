import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/supabase/server';
import { shopAdminClient } from '@/lib/shop';
import { taipeiDayRange } from '@/lib/pos-server';

export const dynamic = 'force-dynamic';

// GET /api/pos/orders?date=YYYY-MM-DD | ?q=單號或電話 — POS 訂單(預設今天,台灣時間)
export async function GET(request: Request) {
  if (!(await getAdminUser())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') ?? '').trim().replace(/[%,()]/g, '');
  const supabase = await shopAdminClient();
  let query = supabase.from('orders').select('*').eq('channel', 'pos').order('created_at', { ascending: false }).limit(200);
  if (q) query = query.or(`order_no.ilike.%${q}%,phone.ilike.%${q}%,customer_name.ilike.%${q}%`);
  else {
    const { from, to } = taipeiDayRange(url.searchParams.get('date') ?? '');
    query = query.gte('created_at', from).lt('created_at', to);
  }
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? [], { headers: { 'Cache-Control': 'private, no-store' } });
}
