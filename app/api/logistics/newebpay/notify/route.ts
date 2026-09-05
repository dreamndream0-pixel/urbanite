import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { decodeNewebpayLogisticsResponse, retToFulfillmentStatus } from '@/lib/newebpay-logistics';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const payload = decodeNewebpayLogisticsResponse(Object.fromEntries(formData.entries()));
    const orderNo = String(payload.MerchantOrderNo ?? '');
    if (!orderNo) return new NextResponse('0|Missing MerchantOrderNo', { status: 400 });

    const supabase = createAdminClient();
    const { data: order } = await supabase.from('orders').select('id, fulfillment_status').eq('order_no', orderNo).maybeSingle();
    if (!order) return new NextResponse('0|Order not found', { status: 404 });

    const { data: shipment } = await supabase
      .from('shipments')
      .select('id, status, store_id, ship_type')
      .eq('order_id', order.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!shipment) return new NextResponse('0|Shipment not found', { status: 404 });

    const retId = String(payload.Retld ?? payload.RetID ?? '');
    const retString = String(payload.RetString ?? payload.Message ?? '');
    const isPickup = Boolean(shipment.store_id) || Boolean(shipment.ship_type);
    const nextStatus = retToFulfillmentStatus(retId, { description: retString, isPickup });
    // 不倒退:買家已取貨(收款完成)後,後續貨態不再覆蓋
    if (shipment.status === 'PICKED_UP') return new NextResponse('1|OK');
    const eventAt = String(payload.EventTime ?? '') || new Date().toISOString();
    const description = String(payload.RetString ?? payload.Message ?? '藍新物流狀態更新');

    await supabase.from('shipment_events').insert({
      shipment_id: shipment.id,
      status: nextStatus,
      description,
      ret_id: retId,
      event_at: eventAt,
      raw_response: payload,
    });
    await supabase.from('shipments').update({
      status: nextStatus,
      tracking_number: String(payload.LgsNo ?? '') || undefined,
      updated_at: new Date().toISOString(),
      delivered_at: nextStatus === 'DELIVERED' ? new Date().toISOString() : undefined,
      raw_response: payload,
    }).eq('id', shipment.id);
    await supabase.from('orders').update({ fulfillment_status: nextStatus }).eq('id', order.id);
    await supabase.from('order_status_history').insert({
      order_id: order.id,
      type: 'fulfillment',
      from_status: order.fulfillment_status ?? '',
      to_status: nextStatus,
      note: description,
      created_by: 'NewebPay Logistics',
    });

    return new NextResponse('1|OK');
  } catch (error) {
    return new NextResponse(`0|${error instanceof Error ? error.message : 'Logistics notify failed'}`, { status: 400 });
  }
}
