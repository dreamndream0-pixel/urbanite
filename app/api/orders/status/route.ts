import { NextResponse } from 'next/server';
import { canAccessOrder } from '@/lib/order-access';
import { shopAdminClient } from '@/lib/shop';

// GET /api/orders/status?order_no=<no> — 查單筆訂單付款狀態(只回最少欄位,供結帳完成頁使用)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orderNo = String(searchParams.get('order_no') ?? '').trim();
  if (!orderNo) return NextResponse.json({ error: '缺少訂單編號' }, { status: 400 });

  const supabase = (await shopAdminClient());
  const { data } = await supabase
    .from('orders')
    .select('order_no, user_id, paid, status, total, payment_method')
    .eq('order_no', orderNo)
    .maybeSingle();

  const headers = { 'Cache-Control': 'private, no-store' };
  if (!data || !(await canAccessOrder(data))) return NextResponse.json({ error: '無法存取訂單，請登入原帳號或使用下單的瀏覽器。' }, { status: 404, headers });
  return NextResponse.json({ order_no: data.order_no, paid: data.paid, status: data.status, total: data.total, payment_method: data.payment_method }, { headers });
}
