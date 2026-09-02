import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminUser } from '@/lib/supabase/server';
import type { Shipment } from '@/lib/types';

// POST /api/orders/[id]/shipment — 建立出貨(限管理員)
// 建立 shipment、寫入第一筆物流事件,並把訂單標記為「已出貨」。
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: '未授權' }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const provider = String(body?.provider ?? '').trim();
  const shippingMethod = String(body?.shipping_method ?? '').trim();
  const trackingNumber = String(body?.tracking_number ?? '').trim();

  const supabase = createAdminClient();
  const { data: order } = await supabase
    .from('orders')
    .select('id, customer_name, phone, status, fulfillment_status, shipping_method')
    .eq('id', id)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: '找不到訂單' }, { status: 404 });

  const nowIso = new Date().toISOString();
  const { data: shipment, error } = await supabase
    .from('shipments')
    .insert({
      order_id: id,
      provider,
      shipping_method: shippingMethod || order.shipping_method || '',
      tracking_number: trackingNumber,
      recipient_name: order.customer_name ?? '',
      recipient_phone: order.phone ?? '',
      status: 'SHIPPED',
      shipped_at: nowIso,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await supabase.from('shipment_events').insert({
    shipment_id: shipment.id,
    status: 'SHIPPED',
    description: trackingNumber ? `已建立出貨,物流單號 ${trackingNumber}` : '已建立出貨',
    event_at: nowIso,
  });

  // 訂單標記為已出貨 + 歷程
  await supabase
    .from('orders')
    .update({ status: '已出貨', fulfillment_status: 'SHIPPED', order_status: 'PROCESSING' })
    .eq('id', id);
  await supabase.from('order_status_history').insert({
    order_id: id,
    type: 'fulfillment',
    from_status: order.fulfillment_status ?? 'UNFULFILLED',
    to_status: 'SHIPPED',
    note: provider ? `${provider} 出貨` : '已出貨',
    created_by: admin.email || '後台管理員',
  });

  return NextResponse.json(shipment as Shipment, { status: 201 });
}

// PATCH /api/orders/[id]/shipment — 新增一筆物流事件(限管理員)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: '未授權' }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const shipmentId = String(body?.shipment_id ?? '').trim();
  const status = String(body?.status ?? '').trim();
  const description = String(body?.description ?? '').trim();
  const location = String(body?.location ?? '').trim();
  if (!shipmentId || (!status && !description)) {
    return NextResponse.json({ error: '請填寫物流狀態或說明' }, { status: 400 });
  }

  const supabase = createAdminClient();
  // 確認該物流屬於此訂單
  const { data: shipment } = await supabase
    .from('shipments')
    .select('id')
    .eq('id', shipmentId)
    .eq('order_id', id)
    .maybeSingle();
  if (!shipment) return NextResponse.json({ error: '找不到物流資料' }, { status: 404 });

  const nowIso = new Date().toISOString();
  const { data: event, error } = await supabase
    .from('shipment_events')
    .insert({ shipment_id: shipmentId, status, description, location, event_at: nowIso })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const update: Record<string, unknown> = { updated_at: nowIso };
  if (status) update.status = status;
  if (status === 'DELIVERED') update.delivered_at = nowIso;
  await supabase.from('shipments').update(update).eq('id', shipmentId);

  // 送達時同步訂單物流狀態
  if (status === 'DELIVERED') {
    await supabase.from('orders').update({ fulfillment_status: 'DELIVERED' }).eq('id', id);
    await supabase.from('order_status_history').insert({
      order_id: id, type: 'fulfillment', from_status: 'SHIPPED', to_status: 'DELIVERED',
      note: '已送達', created_by: admin.email || '後台管理員',
    });
  } else if (status === 'IN_TRANSIT') {
    await supabase.from('orders').update({ fulfillment_status: 'IN_TRANSIT' }).eq('id', id);
  }

  return NextResponse.json(event, { status: 201 });
}
