import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET /api/orders/status?order_no=<no> — 查單筆訂單付款狀態(只回最少欄位,供結帳完成頁使用)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orderNo = String(searchParams.get('order_no') ?? '').trim();
  if (!orderNo) return NextResponse.json({ error: '缺少訂單編號' }, { status: 400 });

  const supabase = createAdminClient();
  const { data } = await supabase
    .from('orders')
    .select('order_no, paid, status, total, payment_method')
    .eq('order_no', orderNo)
    .maybeSingle();

  if (!data) return NextResponse.json({ error: '找不到訂單' }, { status: 404 });
  return NextResponse.json(data);
}
