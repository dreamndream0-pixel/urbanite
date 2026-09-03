import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminUser } from '@/lib/supabase/server';
import { deriveStatuses } from '@/lib/order-status';
import { restoreOrderStock } from '@/lib/inventory';
import type { Order, Payment, Shipment, ShipmentEvent, OrderStatusHistory } from '@/lib/types';

// GET /api/orders/[id] — 取得訂單完整資訊(主檔 + 付款 + 物流 + 歷程),限管理員
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: '未授權' }, { status: 401 });

  const { id } = await params;
  const supabase = createAdminClient();

  const [orderRes, payRes, shipRes, histRes] = await Promise.all([
    supabase.from('orders').select('*').eq('id', id).maybeSingle(),
    supabase.from('payments').select('*').eq('order_id', id).order('created_at', { ascending: true }),
    supabase.from('shipments').select('*').eq('order_id', id).order('created_at', { ascending: true }),
    supabase.from('order_status_history').select('*').eq('order_id', id).order('created_at', { ascending: true }),
  ]);

  if (!orderRes.data) return NextResponse.json({ error: '找不到訂單' }, { status: 404 });

  const shipments = (shipRes.data ?? []) as Shipment[];
  if (shipments.length) {
    const { data: events } = await supabase
      .from('shipment_events')
      .select('*')
      .in('shipment_id', shipments.map((s) => s.id))
      .order('event_at', { ascending: true });
    const byShipment = new Map<string, ShipmentEvent[]>();
    for (const ev of (events ?? []) as ShipmentEvent[]) {
      const list = byShipment.get(ev.shipment_id) ?? [];
      list.push(ev);
      byShipment.set(ev.shipment_id, list);
    }
    for (const s of shipments) s.events = byShipment.get(s.id) ?? [];
  }

  return NextResponse.json({
    order: orderRes.data as Order,
    payments: (payRes.data ?? []) as Payment[],
    shipments,
    history: (histRes.data ?? []) as OrderStatusHistory[],
  });
}

// PATCH /api/orders/[id] — 更新訂單狀態 / 付款狀態(限管理員)
// 同步三套英文狀態並寫入狀態歷程。
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: '未授權' }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  const supabase = createAdminClient();
  const { data: current } = await supabase
    .from('orders')
    .select('status, paid, total, order_status, payment_status, fulfillment_status')
    .eq('id', id)
    .maybeSingle();
  if (!current) return NextResponse.json({ error: '找不到訂單' }, { status: 404 });

  const nextStatus = typeof body.status === 'string' ? body.status : current.status;
  const nextPaid = typeof body.paid === 'boolean' ? body.paid : current.paid;

  const update: Record<string, unknown> = {};
  if (typeof body.status === 'string') update.status = body.status;
  if (typeof body.paid === 'boolean') update.paid = body.paid;
  if (typeof body.admin_note === 'string') update.admin_note = body.admin_note;
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: '沒有可更新的欄位' }, { status: 400 });
  }

  const derived = deriveStatuses(nextStatus, nextPaid);
  update.order_status = derived.order_status;
  update.payment_status = derived.payment_status;
  update.fulfillment_status = derived.fulfillment_status;

  const { data, error } = await supabase
    .from('orders')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // 寫入變更歷程(只記錄實際有變動的狀態)
  const rows: Record<string, unknown>[] = [];
  const actor = admin.email || '後台管理員';
  if (derived.order_status !== current.order_status) {
    rows.push({ order_id: id, type: 'order', from_status: current.order_status ?? '', to_status: derived.order_status, note: `狀態改為「${nextStatus}」`, created_by: actor });
  }
  if (derived.payment_status !== current.payment_status) {
    rows.push({ order_id: id, type: 'payment', from_status: current.payment_status ?? '', to_status: derived.payment_status, note: nextPaid ? '標記已付款' : '標記未付款', created_by: actor });
  }
  if (derived.fulfillment_status !== current.fulfillment_status) {
    rows.push({ order_id: id, type: 'fulfillment', from_status: current.fulfillment_status ?? '', to_status: derived.fulfillment_status, note: '', created_by: actor });
  }
  if (rows.length) {
    try { await supabase.from('order_status_history').insert(rows); } catch { /* 歷程失敗不影響更新 */ }
  }

  // §25 取消 / 退貨 → 回補庫存(冪等);已付款則記錄應退款金額(實際退刷仍需人工處理)
  const nowCancelled = nextStatus === '取消' || nextStatus === '退貨';
  const wasCancelled = current.status === '取消' || current.status === '退貨';
  if (nowCancelled && !wasCancelled) {
    try {
      await restoreOrderStock(supabase, id, actor);
      if (current.paid) {
        await supabase
          .from('orders')
          .update({ refund_amount: current.total, net_amount: 0, payment_status: 'REFUNDED' })
          .eq('id', id);
        await supabase.from('order_status_history').insert({
          order_id: id, type: 'payment', from_status: 'PAID', to_status: 'REFUNDED',
          note: '訂單取消,需退款(請至金流後台退刷)', created_by: actor,
        });
      }
    } catch { /* 回補失敗不影響狀態更新 */ }
  }

  return NextResponse.json(data as Order);
}
