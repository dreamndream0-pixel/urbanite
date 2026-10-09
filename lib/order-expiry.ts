import type { SupabaseClient } from '@supabase/supabase-js';
import { restoreOrderStock } from '@/lib/inventory';
import { isPaymentOverdue, paymentDeadlineDays } from '@/lib/payment';
import type { Order } from '@/lib/types';
import { scopedClient } from '@/lib/shop';

// 逾期未付款訂單自動取消(回補庫存、寫入狀態歷程)。
// 由每日排程呼叫,也會在會員中心 / 後台載入訂單時順便執行,讓逾期訂單即時轉為取消。
export async function expireOverdueOrders(supabase: SupabaseClient, opts: { userId?: string } = {}) {
  const days = paymentDeadlineDays();
  const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  let query = supabase
    .from('orders')
    .select('id, order_no, status, paid, order_status, payment_status, fulfillment_status, cancel_status, payment_method, shipping_method, created_at, shop_id')
    .eq('paid', false)
    .neq('status', '取消')
    .lt('created_at', cutoff)
    .limit(200);
  if (opts.userId) query = query.eq('user_id', opts.userId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const cancelled: string[] = [];
  for (const order of (data ?? []) as (Order & { shop_id?: string })[]) {
    if (!isPaymentOverdue(order, Date.now(), days)) continue;
    // 每日排程跨所有店家執行:這筆訂單後續的寫入(庫存、歷程)要算在它自己的店
    const db = order.shop_id ? scopedClient(order.shop_id) : supabase;
    try {
      const { data: updated } = await db
        .from('orders')
        .update({ status: '取消', order_status: 'CANCELLED', payment_status: 'CANCELLED' })
        .eq('id', order.id)
        .eq('paid', false)
        .neq('status', '取消') // 冪等:已取消或已付款就不動
        .select('id');
      if (!updated?.length) continue;
      // 確定取消後才回補庫存(避免與剛好完成的付款互相衝突)
      await restoreOrderStock(db, order.id, '系統(付款逾期取消)');
      await db.from('order_status_history').insert([
        { order_id: order.id, type: 'order', from_status: order.order_status ?? 'PENDING', to_status: 'CANCELLED', note: `付款逾期(逾 ${days} 天未付款),自動取消`, created_by: '系統' },
        { order_id: order.id, type: 'payment', from_status: order.payment_status ?? 'UNPAID', to_status: 'CANCELLED', note: '付款逾期', created_by: '系統' },
      ]);
      cancelled.push(order.order_no);
    } catch {
      /* 單筆失敗不影響其他 */
    }
  }
  return { checked: data?.length ?? 0, cancelled };
}
