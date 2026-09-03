import { NextResponse } from 'next/server';
import { buildNewebpayLogisticsForm, shipTypeName } from '@/lib/newebpay-logistics';
import { getConfiguredSiteUrl } from '@/lib/site-url';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const shipType = url.searchParams.get('ship_type') || '1';
    const lgsType = url.searchParams.get('lgs_type') || 'C2C';
    const returnUrl = `${getConfiguredSiteUrl()}/api/logistics/newebpay/store-map/return`;
    const merchantOrderNo = `MAP${Date.now()}`;
    const { actionUrl, fields } = buildNewebpayLogisticsForm('storeMap', {
      MerchantOrderNo: merchantOrderNo,
      LgsType: lgsType,
      ShipType: shipType,
      ReturnURL: returnUrl,
      ExtraData: JSON.stringify({ from: 'checkout', shipType, lgsType }),
    });
    const inputs = Object.entries(fields)
      .map(([key, value]) => `<input type="hidden" name="${key}" value="${String(value).replace(/"/g, '&quot;')}">`)
      .join('');
    return new NextResponse(`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>前往${shipTypeName(shipType)}選擇門市</title></head><body><form id="f" method="post" action="${actionUrl}">${inputs}</form><script>document.getElementById('f').submit()</script></body></html>`, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '無法開啟門市地圖' }, { status: 500 });
  }
}
