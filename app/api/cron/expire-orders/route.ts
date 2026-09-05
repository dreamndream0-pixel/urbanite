import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { restoreOrderStock } from '@/lib/inventory';
import { paymentDeadlineDays } from '@/lib/payment';

export const dynamic = 'force-dynamic';

// GET /api/cron/expire-orders — 逾期未付款訂單自動取消(回補庫存)
// 由 Vercel Cron 定時呼叫;若設有 CRON_SECRET,需帶對應授權。
// 規則:狀態=尚未付款、未付款,且建立時間已超過付款期限 → 取消。
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization') || '';
    const key = new URL(request.url).searchParams.get('key') || '';
    if (auth !== `Bearer ${secret}` && key !== secret) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  const days = paymentDeadlineDays();
  const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  const supabase = createAdminClient();

  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, order_no, total, paid, payment_status')
    .eq('status', '尚未付款')
    .eq('paid', false)
    .lt('created_at', cutoff)
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const cancelled: string[] = [];
  for (const order of orders ?? []) {
    try {
      await restoreOrderStock(supabase, order.id, '系統(付款逾期取消)');
      await supabase
        .from('orders')
        .update({ status: '取消', order_status: 'CANCELLED', payment_status: 'CANCELLED' })
        .eq('id', order.id)
        .eq('status', '尚未付款'); // 冪等:僅在仍為尚未付款時取消
      await supabase.from('order_status_history').insert([
        { order_id: order.id, type: 'order', from_status: 'PENDING', to_status: 'CANCELLED', note: `付款逾期(逾 ${days} 天未付款),自動取消`, created_by: '系統' },
        { order_id: order.id, type: 'payment', from_status: order.payment_status ?? 'UNPAID', to_status: 'CANCELLED', note: '付款逾期', created_by: '系統' },
      ]);
      cancelled.push(order.order_no);
    } catch {
      /* 單筆失敗不影響其他 */
    }
  }

  return NextResponse.json({ ok: true, checked: orders?.length ?? 0, cancelled: cancelled.length, orders: cancelled });
}
