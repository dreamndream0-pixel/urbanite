import { NextResponse } from 'next/server';
import { buildItemDesc } from '@/lib/newebpay';
import {
  getShipmentNoWithRetry,
  normalizeLogisticsPhone,
  parseShipmentNo,
  requestNewebpayLogistics,
  retToFulfillmentStatus,
  shipTypeFromMethod,
  shipTypeName,
  tradeTypeFromMethod,
} from '@/lib/newebpay-logistics';
import { getConfiguredSiteUrl } from '@/lib/site-url';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminUser } from '@/lib/supabase/server';
import type { Shipment } from '@/lib/types';

function firstSuccessRow(payload: Record<string, unknown> | null): Record<string, unknown> {
  const success = payload?.SUCCESS;
  if (Array.isArray(success)) return (success[0] ?? {}) as Record<string, unknown>;
  if (success && typeof success === 'object') return success as Record<string, unknown>;
  return {};
}

function historyRows(payload: Record<string, unknown> | null): Record<string, unknown>[] {
  const history = payload?.History;
  return Array.isArray(history) ? history.filter((item) => item && typeof item === 'object') as Record<string, unknown>[] : [];
}

// POST /api/orders/[id]/shipment — 建立出貨(限管理員)
// 建立 shipment、寫入第一筆物流事件。可建立手動物流，也可呼叫藍新物流。
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
  const useNewebpay = Boolean(body?.use_newebpay);

  const supabase = createAdminClient();
  const { data: order } = await supabase
    .from('orders')
    .select('id, order_no, customer_name, phone, email, total, items, status, fulfillment_status, shipping_method, payment_method, store_id, store_name, store_phone, store_address, store_ship_type, store_lgs_type')
    .eq('id', id)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: '找不到訂單' }, { status: 404 });

  const nowIso = new Date().toISOString();
  if (useNewebpay) {
    if (!order.store_id) {
      return NextResponse.json({ error: '此訂單沒有取貨門市，無法建立藍新物流單' }, { status: 400 });
    }
    const shipType = order.store_ship_type || shipTypeFromMethod(order.shipping_method || '');
    const lgsType = order.store_lgs_type || 'C2C';
    const tradeType = tradeTypeFromMethod(order.shipping_method || '', order.payment_method || '');
    const notifyUrl = `${getConfiguredSiteUrl()}/api/logistics/newebpay/notify`;
    const itemDesc = buildItemDesc(Array.isArray(order.items) ? order.items as Parameters<typeof buildItemDesc>[0] : []);
    const createResult = await requestNewebpayLogistics('createShipment', {
      MerchantOrderNo: order.order_no,
      TradeType: tradeType,
      UserName: order.customer_name || '',
      UserTel: normalizeLogisticsPhone(order.phone || ''),
      UserEmail: order.email || '',
      StoreID: order.store_id || '',
      Amt: Math.max(1, Math.round(Number(order.total) || 1)),
      NotifyURL: notifyUrl,
      ItemDesc: itemDesc,
      LgsType: lgsType,
      ShipType: shipType,
    });
    if (!createResult.ok) {
      return NextResponse.json({ error: createResult.message || '藍新物流建單失敗', detail: createResult.raw }, { status: 400 });
    }
    let shipmentNoResult: Awaited<ReturnType<typeof requestNewebpayLogistics>> | null = null;
    try {
      shipmentNoResult = await getShipmentNoWithRetry(order.order_no);
    } catch {
      shipmentNoResult = null;
    }
    const parsed = parseShipmentNo(shipmentNoResult?.data ?? null);
    const created = createResult.data ?? {};
    const lgsNo = parsed.lgsNo;
    const storePrintNo = parsed.storePrintNo;
    const tradeNo = String(created.TradeNo ?? '');
    const { data: shipment, error } = await supabase
      .from('shipments')
      .insert({
        order_id: id,
        provider: `藍新物流-${shipTypeName(shipType)}`,
        shipping_method: order.shipping_method || '',
        tracking_number: lgsNo || storePrintNo,
        recipient_name: order.customer_name ?? '',
        recipient_phone: order.phone ?? '',
        status: 'READY_TO_SHIP',
        lgs_type: lgsType,
        ship_type: shipType,
        trade_type: tradeType,
        store_id: order.store_id || '',
        store_name: order.store_name || '',
        store_phone: order.store_phone || '',
        store_address: order.store_address || '',
        store_print_no: storePrintNo,
        trade_no: tradeNo,
        raw_response: { create: createResult.raw, shipment_no: shipmentNoResult?.raw ?? null },
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    await supabase.from('shipment_events').insert({
      shipment_id: shipment.id,
      status: 'READY_TO_SHIP',
      description: lgsNo || storePrintNo ? `已建立藍新物流單，寄件代碼 ${lgsNo || storePrintNo}` : '已建立藍新物流單',
      event_at: nowIso,
      raw_response: createResult.data,
    });
    await supabase
      .from('orders')
      .update({ status: '待出貨', fulfillment_status: 'READY_TO_SHIP', order_status: 'PROCESSING' })
      .eq('id', id);
    await supabase.from('order_status_history').insert({
      order_id: id,
      type: 'fulfillment',
      from_status: order.fulfillment_status ?? 'UNFULFILLED',
      to_status: 'READY_TO_SHIP',
      note: '已建立藍新物流單',
      created_by: admin.email || '後台管理員',
    });

    return NextResponse.json(shipment as Shipment, { status: 201 });
  }

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
  const action = String(body?.action ?? '').trim();
  const apiActions = ['trace', 'query', 'modify', 'getno'];
  if (!shipmentId || (!status && !description && !apiActions.includes(action))) {
    return NextResponse.json({ error: '請填寫物流狀態或說明' }, { status: 400 });
  }

  const supabase = createAdminClient();
  // 確認該物流屬於此訂單
  const { data: shipment } = await supabase
    .from('shipments')
    .select('*')
    .eq('id', shipmentId)
    .eq('order_id', id)
    .maybeSingle();
  if (!shipment) return NextResponse.json({ error: '找不到物流資料' }, { status: 404 });

  if (action === 'trace') {
    const { data: order } = await supabase.from('orders').select('id, order_no, fulfillment_status').eq('id', id).maybeSingle();
    if (!order?.order_no) return NextResponse.json({ error: '找不到訂單單號' }, { status: 404 });
    if (!shipment.lgs_type || !shipment.ship_type) return NextResponse.json({ error: '此物流單不是藍新物流單' }, { status: 400 });
    const trace = await requestNewebpayLogistics('trace', { MerchantOrderNo: order.order_no });
    if (!trace.ok) return NextResponse.json({ error: trace.message || '查詢藍新貨態失敗', detail: trace.raw }, { status: 400 });
    const rows = historyRows(trace.data);
    const newest = rows[rows.length - 1] ?? trace.data ?? {};
    const nextStatus = retToFulfillmentStatus(newest.Retld ?? newest.RetID);
    const eventAt = String(newest.EventTime ?? '') || new Date().toISOString();
    const eventDescription = String(newest.RetString ?? trace.message ?? '藍新物流貨態更新');
    const { data: event, error } = await supabase
      .from('shipment_events')
      .insert({
        shipment_id: shipmentId,
        status: nextStatus,
        description: eventDescription,
        ret_id: String(newest.Retld ?? newest.RetID ?? ''),
        event_at: eventAt,
        raw_response: trace.data,
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    await supabase.from('shipments').update({
      status: nextStatus,
      tracking_number: String(trace.data?.LgsNo ?? shipment.tracking_number ?? ''),
      updated_at: new Date().toISOString(),
      delivered_at: nextStatus === 'DELIVERED' ? new Date().toISOString() : shipment.delivered_at,
      raw_response: trace.data,
    }).eq('id', shipmentId);
    await supabase.from('orders').update({ fulfillment_status: nextStatus }).eq('id', id);
    await supabase.from('order_status_history').insert({
      order_id: id,
      type: 'fulfillment',
      from_status: order.fulfillment_status ?? '',
      to_status: nextStatus,
      note: eventDescription,
      created_by: admin.email || '後台管理員',
    });
    return NextResponse.json(event, { status: 201 });
  }

  // 重新取號(NPA-B53):對已建單但未取得寄件代碼的物流單重試 getShipmentNo
  if (action === 'getno') {
    const { data: order } = await supabase.from('orders').select('order_no').eq('id', id).maybeSingle();
    if (!order?.order_no) return NextResponse.json({ error: '找不到訂單單號' }, { status: 404 });
    if (!shipment.lgs_type || !shipment.ship_type) return NextResponse.json({ error: '此物流單不是藍新物流單' }, { status: 400 });
    const r = await getShipmentNoWithRetry(order.order_no);
    if (!r || !r.ok) return NextResponse.json({ error: r?.status === '1109' ? '藍新查無此物流單,請改用「建立藍新物流單」重新建立' : (r?.message || '取號失敗'), detail: r?.raw }, { status: 400 });
    const parsed = parseShipmentNo(r.data);
    if (parsed.error && !parsed.lgsNo && !parsed.storePrintNo) {
      return NextResponse.json({ error: `取號失敗:${parsed.error}` }, { status: 400 });
    }
    const lgsNo = parsed.lgsNo;
    const storePrintNo = parsed.storePrintNo;
    const nowIso = new Date().toISOString();
    await supabase.from('shipments').update({
      tracking_number: lgsNo || storePrintNo || shipment.tracking_number || '',
      store_print_no: storePrintNo || shipment.store_print_no || '',
      updated_at: nowIso,
      raw_response: r.data,
    }).eq('id', shipmentId);
    await supabase.from('shipment_events').insert({
      shipment_id: shipmentId,
      status: shipment.status,
      description: lgsNo || storePrintNo ? `重新取號成功,寄件代碼 ${lgsNo || storePrintNo}` : '重新取號',
      event_at: nowIso,
      raw_response: r.data,
    });
    return NextResponse.json({ ok: true, lgs_no: lgsNo || storePrintNo, data: r.data }, { status: 200 });
  }

  // 查詢配送單(NPA-B55):取回目前配送單明細/狀態
  if (action === 'query') {
    const { data: order } = await supabase.from('orders').select('order_no').eq('id', id).maybeSingle();
    if (!order?.order_no) return NextResponse.json({ error: '找不到訂單單號' }, { status: 404 });
    const q = await requestNewebpayLogistics('queryShipment', { MerchantOrderNo: order.order_no });
    if (!q.ok) return NextResponse.json({ error: q.message || '查詢配送單失敗', detail: q.raw }, { status: 400 });
    const row = firstSuccessRow(q.data);
    const lgsNo = String(row.LgsNo ?? '');
    const nowIso = new Date().toISOString();
    await supabase.from('shipments').update({
      tracking_number: lgsNo || shipment.tracking_number || '',
      updated_at: nowIso,
      raw_response: q.data,
    }).eq('id', shipmentId);
    await supabase.from('shipment_events').insert({
      shipment_id: shipmentId,
      status: shipment.status,
      description: `查詢配送單:${q.message || '成功'}${lgsNo ? `,寄件代碼 ${lgsNo}` : ''}`,
      event_at: nowIso,
      raw_response: q.data,
    });
    return NextResponse.json({ ok: true, data: q.data }, { status: 200 });
  }

  // 修改配送單(NPA-B56):改收件人資訊 / 重選門市(限未取號、逾期、重選門市)
  if (action === 'modify') {
    const { data: order } = await supabase.from('orders').select('order_no').eq('id', id).maybeSingle();
    if (!order?.order_no) return NextResponse.json({ error: '找不到訂單單號' }, { status: 404 });
    if (!shipment.lgs_type || !shipment.ship_type) return NextResponse.json({ error: '此物流單不是藍新物流單' }, { status: 400 });
    const userName = String(body?.recipient_name ?? '').trim();
    const userTel = String(body?.recipient_phone ?? '').trim();
    const userEmail = String(body?.recipient_email ?? '').trim();
    const storeId = String(body?.store_id ?? '').trim();
    const m = await requestNewebpayLogistics('modifyShipment', {
      MerchantOrderNo: order.order_no,
      LgsType: shipment.lgs_type,
      ShipType: shipment.ship_type,
      UserName: userName || undefined,
      UserTel: userTel ? normalizeLogisticsPhone(userTel) : undefined,
      UserEmail: userEmail || undefined,
      StoreID: storeId || undefined,
    });
    if (!m.ok) return NextResponse.json({ error: m.message || '修改配送單失敗', detail: m.raw }, { status: 400 });
    const nowIso = new Date().toISOString();
    const upd: Record<string, unknown> = { updated_at: nowIso, raw_response: m.data };
    if (userName) upd.recipient_name = userName;
    if (userTel) upd.recipient_phone = userTel;
    if (storeId) upd.store_id = storeId;
    await supabase.from('shipments').update(upd).eq('id', shipmentId);
    await supabase.from('shipment_events').insert({
      shipment_id: shipmentId,
      status: shipment.status,
      description: `修改配送單:${m.message || '成功'}`,
      event_at: nowIso,
      raw_response: m.data,
    });
    return NextResponse.json({ ok: true, data: m.data }, { status: 200 });
  }

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
