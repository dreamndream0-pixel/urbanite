import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminUser, getSessionUser } from '@/lib/supabase/server';
import { canRequestReturn } from '@/lib/order-status';
import type { Order, OrderItem, ReturnItem, ReturnRequest } from '@/lib/types';

async function genNo(supabase: ReturnType<typeof createAdminClient>, table: string, prefix: string) {
  const tw = new Date(Date.now() + 8 * 3600 * 1000);
  const ymd = tw.toISOString().slice(0, 10).replace(/-/g, '');
  const p = `${prefix}${ymd}`;
  const col = table === 'returns' ? 'return_no' : 'refund_no';
  const { count } = await supabase.from(table).select(col, { count: 'exact', head: true }).like(col, `${p}%`);
  return `${p}${String((count ?? 0) + 1).padStart(4, '0')}`;
}

// GET /api/orders/[id]/returns — 該訂單的退貨(本人或管理員)
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createAdminClient();
  const { data: order } = await supabase.from('orders').select('user_id').eq('id', id).maybeSingle();
  if (!order) return NextResponse.json({ error: '找不到訂單' }, { status: 404 });

  const admin = await getAdminUser();
  if (!admin) {
    const user = await getSessionUser();
    if (!user || order.user_id !== user.id) return NextResponse.json({ error: '未授權' }, { status: 401 });
  }
  const { data } = await supabase.from('returns').select('*').eq('order_id', id).order('created_at', { ascending: true });
  return NextResponse.json((data ?? []) as ReturnRequest[]);
}

// POST /api/orders/[id]/returns — 客人申請退貨(本人訂單、已送達/已完成)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '請先登入' }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const reason = String(body?.reason ?? '').trim();
  const picked = Array.isArray(body?.items) ? body.items : [];

  const supabase = createAdminClient();
  const { data: order } = await supabase.from('orders').select('*').eq('id', id).maybeSingle();
  if (!order || order.user_id !== user.id) return NextResponse.json({ error: '找不到訂單' }, { status: 404 });
  if (!canRequestReturn(order as Order)) return NextResponse.json({ error: '此訂單目前無法申請退貨' }, { status: 409 });

  // 每張訂單只能提出一次退貨申請(除非先前被婉拒)
  const { data: existing } = await supabase.from('returns').select('status').eq('order_id', id);
  if ((existing ?? []).some((r) => r.status !== 'REJECTED')) {
    return NextResponse.json({ error: '此訂單已提出退貨申請,無法重複申請' }, { status: 409 });
  }

  const orderItems = (order.items ?? []) as OrderItem[];
  const items: ReturnItem[] = [];
  let refundAmount = 0;
  for (const p of picked) {
    const idx = Number(p.index);
    const src = orderItems[idx];
    if (!src) continue;
    const qty = Math.max(1, Math.min(Number(src.quantity) || 1, Math.floor(Number(p.quantity) || 1)));
    items.push({
      index: idx, name: src.name, variant: src.variant, sku: src.sku,
      price: src.price, quantity: qty, reason: String(p.reason ?? '').trim(),
    });
    refundAmount += src.price * qty;
  }
  if (items.length === 0) return NextResponse.json({ error: '請選擇要退貨的商品' }, { status: 400 });

  const returnNo = await genNo(supabase, 'returns', 'RT');
  const { data: ret, error } = await supabase
    .from('returns')
    .insert({ return_no: returnNo, order_id: id, user_id: user.id, reason, status: 'REQUESTED', items, refund_amount: refundAmount })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // 有退貨申請就把訂單歸到「退貨」欄位
  await supabase.from('orders').update({ status: '退貨', fulfillment_status: 'RETURNING' }).eq('id', id);

  await supabase.from('order_status_history').insert({
    order_id: id, type: 'order', from_status: '', to_status: 'RETURN_REQUESTED',
    note: `客人申請退貨 ${returnNo}${reason ? `:${reason}` : ''}`, created_by: '客人',
  });

  return NextResponse.json(ret as ReturnRequest, { status: 201 });
}

// PATCH /api/orders/[id]/returns — 賣家審核 / 推進退貨(限管理員)
// body: { return_id, action: 'approve'|'reject'|'received'|'refund', response?, restock?:boolean }
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: '未授權' }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const returnId = String(body?.return_id ?? '').trim();
  const action = String(body?.action ?? '').trim();
  const response = String(body?.response ?? '').trim();
  const actor = admin.email || '後台管理員';

  const supabase = createAdminClient();
  const { data: ret } = await supabase.from('returns').select('*').eq('id', returnId).eq('order_id', id).maybeSingle();
  if (!ret) return NextResponse.json({ error: '找不到退貨單' }, { status: 404 });

  const nowIso = new Date().toISOString();

  if (action === 'approve') {
    const { data } = await supabase.from('returns').update({ status: 'APPROVED', response, reviewed_at: nowIso }).eq('id', returnId).select().single();
    await supabase.from('order_status_history').insert({ order_id: id, type: 'order', from_status: 'RETURN_REQUESTED', to_status: 'RETURN_APPROVED', note: response ? `核准退貨:${response}` : '核准退貨', created_by: actor });
    return NextResponse.json(data as ReturnRequest);
  }

  if (action === 'reject') {
    const { data } = await supabase.from('returns').update({ status: 'REJECTED', response, reviewed_at: nowIso }).eq('id', returnId).select().single();
    await supabase.from('order_status_history').insert({ order_id: id, type: 'order', from_status: 'RETURN_REQUESTED', to_status: 'RETURN_REJECTED', note: response ? `婉拒退貨:${response}` : '婉拒退貨', created_by: actor });
    return NextResponse.json(data as ReturnRequest);
  }

  if (action === 'received') {
    const restock = body?.restock !== false; // 預設回補庫存
    const update: Record<string, unknown> = { status: 'RECEIVED', received_at: nowIso };
    if (restock && !ret.restocked) {
      await restockReturnItems(supabase, id, (ret.items ?? []) as ReturnItem[], actor);
      update.restocked = true;
    }
    const { data } = await supabase.from('returns').update(update).eq('id', returnId).select().single();
    await supabase.from('order_status_history').insert({ order_id: id, type: 'fulfillment', from_status: 'SHIPPED', to_status: 'RETURNED', note: restock ? '已收到退貨並回補庫存' : '已收到退貨', created_by: actor });
    return NextResponse.json(data as ReturnRequest);
  }

  if (action === 'refund') {
    const { data: order } = await supabase.from('orders').select('total, refund_amount, paid').eq('id', id).maybeSingle();
    if (!order) return NextResponse.json({ error: '找不到訂單' }, { status: 404 });
    const amount = Number(ret.refund_amount) || 0;
    const refundNo = await genNo(supabase, 'refunds', 'RF');
    await supabase.from('refunds').insert({ refund_no: refundNo, order_id: id, return_id: returnId, amount, reason: '退貨退款', status: 'COMPLETED', created_by: actor });

    const newRefundTotal = (Number(order.refund_amount) || 0) + amount;
    const payStatus = newRefundTotal >= Number(order.total) ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
    await supabase.from('orders').update({ refund_amount: newRefundTotal, net_amount: Number(order.total) - newRefundTotal, payment_status: payStatus }).eq('id', id);

    const { data } = await supabase.from('returns').update({ status: 'COMPLETED', completed_at: nowIso }).eq('id', returnId).select().single();
    await supabase.from('order_status_history').insert({ order_id: id, type: 'payment', from_status: order.paid ? 'PAID' : 'UNPAID', to_status: payStatus, note: `退貨退款 ${refundNo}(${amount})`, created_by: actor });
    return NextResponse.json(data as ReturnRequest);
  }

  return NextResponse.json({ error: '未知動作' }, { status: 400 });
}

// 依退貨品項回補庫存(以 orders.items 的 productId 對應)
async function restockReturnItems(
  supabase: ReturnType<typeof createAdminClient>,
  orderId: string,
  items: ReturnItem[],
  actor: string,
) {
  const { data: order } = await supabase.from('orders').select('order_no, items').eq('id', orderId).maybeSingle();
  const orderItems = (order?.items ?? []) as OrderItem[];
  const movements: Record<string, unknown>[] = [];
  const byProduct = new Map<string, { inventory: number; variants: { options: string[]; inventory: number }[] } | null>();

  for (const it of items) {
    const src = orderItems[it.index];
    const pid = src?.productId;
    if (!pid) continue;
    let work = byProduct.get(pid);
    if (work === undefined) {
      const { data: base } = await supabase.from('products').select('*').eq('id', pid).maybeSingle();
      work = base ? { inventory: base.inventory, variants: (Array.isArray(base.variants) ? base.variants : []).map((v: { options: string[]; inventory: number }) => ({ ...v })) } : null;
      byProduct.set(pid, work);
    }
    if (!work) continue;
    const qty = it.quantity;
    if (work.variants.length > 0) {
      const v = work.variants.find((vv) => vv.options.join(' / ') === String(it.variant));
      if (v) v.inventory += qty;
      work.inventory = work.variants.reduce((n, vv) => n + vv.inventory, 0);
    } else {
      work.inventory += qty;
    }
    movements.push({ product_id: pid, variant_key: work.variants.length ? String(it.variant) : '', type: 'in', quantity: qty, unit_price: it.price, location: '', handler: actor, note: `退貨回補 ${order?.order_no ?? ''}`.trim() });
  }
  for (const [pid, work] of byProduct) {
    if (work) await supabase.from('products').update({ inventory: work.inventory, variants: work.variants }).eq('id', pid);
  }
  if (movements.length) { try { await supabase.from('stock_movements').insert(movements); } catch { /* 記錄失敗不影響 */ } }
}
