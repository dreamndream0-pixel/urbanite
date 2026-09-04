import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminUser } from '@/lib/supabase/server';
import { buildNewebpayLogisticsForm } from '@/lib/newebpay-logistics';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: '未授權' }, { status: 401 });

  const { id } = await params;
  const shipmentId = new URL(request.url).searchParams.get('shipment_id') || '';
  const supabase = createAdminClient();
  const [{ data: order }, { data: shipment }] = await Promise.all([
    supabase.from('orders').select('id, order_no').eq('id', id).maybeSingle(),
    supabase.from('shipments').select('*').eq('id', shipmentId).eq('order_id', id).maybeSingle(),
  ]);
  if (!order || !shipment) return NextResponse.json({ error: '找不到物流單' }, { status: 404 });
  if (!shipment.lgs_type || !shipment.ship_type) return NextResponse.json({ error: '此物流單不是藍新物流單' }, { status: 400 });

  const { actionUrl, fields } = buildNewebpayLogisticsForm('printLabel', {
    LgsType: shipment.lgs_type,
    ShipType: shipment.ship_type,
    MerchantOrderNo: [order.order_no],
  });
  const inputs = Object.entries(fields)
    .map(([key, value]) => `<input type="hidden" name="${key}" value="${String(value).replace(/"/g, '&quot;')}">`)
    .join('');
  return new NextResponse(`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>列印物流單</title></head><body><form id="f" method="post" action="${actionUrl}">${inputs}</form><script>document.getElementById('f').submit()</script></body></html>`, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
