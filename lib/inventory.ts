import type { SupabaseClient } from '@supabase/supabase-js';
import type { Order } from '@/lib/types';

// §25 取消 / 退貨時回補庫存。
// 以 orders.stock_committed 作為冪等旗標:只有「已扣庫存」的訂單會回補一次,
// 回補後把旗標設為 false,避免重覆回補(例如取消後再按一次)。
export async function restoreOrderStock(
  supabase: SupabaseClient,
  orderId: string,
  handler = '系統(取消回補)',
): Promise<void> {
  const { data: order } = await supabase
    .from('orders')
    .select('id, order_no, items, stock_committed')
    .eq('id', orderId)
    .maybeSingle();
  if (!order || order.stock_committed === false) return;

  const items = (order.items ?? []) as Order['items'];
  const productIds = [...new Set(items.map((i) => String(i.productId ?? '')).filter(Boolean))];
  if (productIds.length === 0) {
    await supabase.from('orders').update({ stock_committed: false }).eq('id', orderId);
    return;
  }

  const { data: products } = await supabase.from('products').select('*').in('id', productIds);
  const byId = new Map((products ?? []).map((p) => [p.id, p]));

  // 用工作副本累積回補(同商品多規格不互相覆蓋)
  type WorkProduct = { inventory: number; variants: { options: string[]; inventory: number }[] };
  const working = new Map<string, WorkProduct>();
  const movements: Record<string, unknown>[] = [];

  for (const item of items) {
    const pid = String(item.productId ?? '');
    const base = byId.get(pid);
    if (!base) continue;
    const w =
      working.get(pid) ??
      ({
        inventory: base.inventory,
        variants: (Array.isArray(base.variants) ? base.variants : []).map(
          (v: { options: string[]; inventory: number }) => ({ ...v }),
        ),
      } as WorkProduct);
    const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
    const hasVariants = w.variants.length > 0;
    if (hasVariants) {
      const label = String(item.variant ?? '');
      const v = w.variants.find((vv) => vv.options.join(' / ') === label);
      if (v) v.inventory += quantity;
      w.inventory = w.variants.reduce((n, vv) => n + vv.inventory, 0);
    } else {
      w.inventory += quantity;
    }
    working.set(pid, w);
    movements.push({
      product_id: pid,
      variant_key: hasVariants ? String(item.variant ?? '') : '',
      type: 'in',
      quantity,
      unit_price: base.price ?? 0,
      location: '',
      handler,
      note: `取消回補 ${order.order_no ?? ''}`.trim(),
    });
  }

  for (const [pid, w] of working) {
    await supabase.from('products').update({ inventory: w.inventory, variants: w.variants }).eq('id', pid);
  }
  if (movements.length) {
    try { await supabase.from('stock_movements').insert(movements); } catch { /* 記錄失敗不影響回補 */ }
  }
  await supabase.from('orders').update({ stock_committed: false }).eq('id', orderId);
}
