import type { createAdminClient } from '@/lib/supabase/admin';
import { isCollectOnDelivery } from '@/lib/payment';

type Supabase = ReturnType<typeof createAdminClient>;

export type PickupOrderRow = {
  id: string;
  total: number;
  paid: boolean;
  payment_status?: string;
  fulfillment_status?: string;
  shipping_method?: string;
  payment_method?: string;
};

// 買家已取貨 → 完成訂單;若為門市取貨付款(藍新代收),同時完成收款。
// 供後台手動按鈕、藍新 notify、更新貨態(代碼 6)共用,行為一致。
export async function finalizePickedUp(
  supabase: Supabase,
  order: PickupOrderRow,
  actor: string,
): Promise<{ cod: boolean }> {
  const cod = isCollectOnDelivery(order.shipping_method || '', order.payment_method || '') && !order.paid;
  const patch: Record<string, unknown> = {
    fulfillment_status: 'PICKED_UP',
    status: '已完成',
    order_status: 'COMPLETED',
  };
  if (cod) {
    patch.paid = true;
    patch.payment_status = 'PAID';
    patch.paid_amount = Number(order.total) || 0;
  }
  await supabase.from('orders').update(patch).eq('id', order.id);

  const rows: Record<string, unknown>[] = [
    { order_id: order.id, type: 'fulfillment', from_status: order.fulfillment_status ?? '', to_status: 'PICKED_UP', note: '買家已取貨', created_by: actor },
    { order_id: order.id, type: 'order', from_status: 'PROCESSING', to_status: 'COMPLETED', note: '訂單完成(已取貨)', created_by: actor },
  ];
  if (cod) {
    rows.push({ order_id: order.id, type: 'payment', from_status: order.payment_status ?? 'UNPAID', to_status: 'PAID', note: '門市取貨付款,已收款', created_by: actor });
  }
  try { await supabase.from('order_status_history').insert(rows); } catch { /* 歷程失敗不影響 */ }
  return { cod };
}
