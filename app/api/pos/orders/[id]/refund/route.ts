import { NextResponse } from 'next/server';
import { allowedLocations, can, getPosUser } from '@/lib/pos-auth';
import { getCurrentShop, shopAdminClient } from '@/lib/shop';
import { adjustLevel, ensureLocations, pickLocation } from '@/lib/stock-locations';
import { applyStockLines, nextRefundNo, openSession } from '@/lib/pos-server';
import { CASH, type PosMeta, type PosRefundEntry, type PosSessionRefund } from '@/lib/pos';
import type { Order, Product } from '@/lib/types';

export const dynamic = 'force-dynamic';

// POST /api/pos/orders/[id]/refund — POS 退貨 / 作廢(限管理員 / 店員)
// { items:[{ index, quantity }], method?, restock?: boolean, reason?, location_id? }
// 退款金額依實付比例計算;restock = true 時回補庫存並寫入庫紀錄。全部退完 → 訂單改為「退貨」。
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getPosUser();
  if (!me) return NextResponse.json({ error: '未授權' }, { status: 401 });
  if (!can(me, 'refund')) return NextResponse.json({ error: '這個帳號沒有「退貨 / 作廢」的權限' }, { status: 403 });
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const supabase = await shopAdminClient();

  const { data: row } = await supabase.from('orders').select('*').eq('id', id).maybeSingle();
  const order = row as Order | null;
  if (!order || order.channel !== 'pos') return NextResponse.json({ error: '找不到這筆 POS 訂單' }, { status: 404 });
  if (order.status === '取消' || order.status === '退貨') return NextResponse.json({ error: '這筆訂單已經退貨 / 取消' }, { status: 409 });

  const items = (order.items ?? []).map((i) => ({ ...i }));
  const wanted = new Map<number, number>();
  for (const r of (Array.isArray(body?.items) ? body.items : []) as { index?: unknown; quantity?: unknown }[]) {
    const index = Number(r.index);
    const quantity = Math.floor(Number(r.quantity));
    if (!Number.isInteger(index) || !items[index] || !Number.isSafeInteger(quantity) || quantity <= 0) continue;
    wanted.set(index, (wanted.get(index) ?? 0) + quantity);
  }
  if (!wanted.size) return NextResponse.json({ error: '請選擇要退的商品與數量' }, { status: 400 });

  let goods = 0;
  const stockLines: { productId: string; variant: string; quantity: number }[] = [];
  const entryItems: { index: number; quantity: number }[] = [];
  for (const [index, quantity] of wanted) {
    const item = items[index];
    const left = item.quantity - (item.returned_qty ?? 0);
    if (quantity > left) return NextResponse.json({ error: `「${item.name}」最多可退 ${left} 件` }, { status: 400 });
    item.returned_qty = (item.returned_qty ?? 0) + quantity;
    if (item.returned_qty >= item.quantity) item.item_status = 'RETURNED';
    goods += item.price * quantity;
    entryItems.push({ index, quantity });
    if (item.productId) stockLines.push({ productId: item.productId, variant: item.variant === '標準款' ? '' : item.variant, quantity });
  }

  // 依實付比例退款(整筆折扣、回饋金折抵平均分攤);全部退完時退到剛好等於實付
  const refunded = Number(order.refund_amount) || 0;
  const allReturned = items.every((i) => (i.returned_qty ?? 0) >= i.quantity);
  const share = order.subtotal > 0 ? order.total / order.subtotal : 0;
  const amount = Math.max(0, Math.min(order.total - refunded, allReturned ? order.total - refunded : Math.round(goods * share)));

  const method = String(body?.method ?? '').trim().slice(0, 20) || order.pos?.payments?.[0]?.method || CASH;
  const restock = body?.restock !== false;
  const reason = String(body?.reason ?? '').trim().slice(0, 200);
  const actor = me.label || 'POS';
  const now = new Date().toISOString();
  // 退回來的商品加到目前這台 POS 所在的據點(沒帶就用原本結帳的據點)
  const locations = await ensureLocations(supabase);
  const location = pickLocation(allowedLocations(me, locations), String(body?.location_id ?? '') || order.pos_location_id);
  const shop = await getCurrentShop();
  const session = await openSession(supabase, location);

  if (restock && stockLines.length) {
    const { data: products } = await supabase.from('products').select('*').in('id', [...new Set(stockLines.map((l) => l.productId))]);
    const byId = new Map(((products ?? []) as Product[]).map((p) => [p.id, p]));
    // 規格已不存在的品項不回補(避免加到錯的規格)
    const valid = stockLines.filter((l) => {
      const p = byId.get(l.productId);
      return p && (p.variants?.length ? p.variants.some((v) => v.options.join(' / ') === l.variant) : l.variant === '');
    });
    await applyStockLines(supabase, byId, valid, 1);
    if (shop) for (const l of valid) await adjustLevel(shop.id, location, l.productId, l.variant, l.quantity);
    if (valid.length) await supabase.from('stock_movements').insert(valid.map((l) => ({
      product_id: l.productId, variant_key: l.variant, type: 'in', quantity: l.quantity,
      unit_price: items.find((i) => i.productId === l.productId && (i.variant === l.variant || (l.variant === '' && i.variant === '標準款')))?.price ?? 0,
      location: order.customer_name ?? '', handler: `POS(${actor})`, note: `POS 退貨 ${order.order_no}${locations.length > 1 ? ` @${location.name}` : ''}`,
    })));
  }

  const entry: PosRefundEntry = { at: now, amount, method, by: actor, reason, restock, items: entryItems, session_id: session?.id ?? null };
  const pos: PosMeta = { ...(order.pos ?? { cashier: '', payments: [], tendered: 0, change: 0, manual_discount: 0 }), refunds: [...(order.pos?.refunds ?? []), entry] };
  const refundTotal = refunded + amount;
  const { data: updated, error } = await supabase.from('orders').update({
    items, pos, refund_amount: refundTotal, net_amount: order.total - refundTotal,
    payment_status: refundTotal >= order.total ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
    ...(allReturned ? { status: '退貨', fulfillment_status: 'RETURNED', stock_committed: false } : {}),
  }).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    if (amount > 0) await supabase.from('refunds').insert({ refund_no: await nextRefundNo(), order_id: id, amount, reason: reason || 'POS 退貨', status: 'COMPLETED', created_by: actor });
    await supabase.from('order_status_history').insert({ order_id: id, type: 'order', from_status: 'COMPLETED', to_status: allReturned ? 'RETURN_COMPLETED' : 'PARTIAL_RETURN', note: `POS ${allReturned ? '全部退貨' : '部分退貨'},退款 NT$${amount}(${method})${reason ? `:${reason}` : ''}`, created_by: actor });
    // 記到目前這一班(退出去的現金要從應有現金扣掉)
    if (session && amount > 0) {
      const line: PosSessionRefund = { at: now, order_no: order.order_no, amount, method, by: actor };
      await supabase.from('pos_sessions').update({ refunds: [...(session.refunds ?? []), line] }).eq('id', session.id);
    }
  } catch (e) {
    console.error('pos refund records', e);
  }

  return NextResponse.json({ order: updated as Order, amount });
}
