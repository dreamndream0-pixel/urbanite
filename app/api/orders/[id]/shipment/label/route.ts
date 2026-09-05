import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminUser } from '@/lib/supabase/server';
import { buildNewebpayLogisticsForm } from '@/lib/newebpay-logistics';

function errorPage(title: string, message: string, detail = '') {
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] || c));
  return new NextResponse(
    `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head><body style="margin:0;font-family:system-ui,-apple-system,'PingFang TC','Microsoft JhengHei',sans-serif;background:#faf7f2;color:#1f1b19">
<div style="max-width:520px;margin:14vh auto 0;padding:0 20px;text-align:center">
<div style="font-size:44px;line-height:1;margin-bottom:12px">🖨️</div>
<h1 style="font-size:19px;margin:0 0 10px">${esc(title)}</h1>
<p style="font-size:15px;line-height:1.7;color:#4b443c;margin:0 0 16px">${esc(message)}</p>
${detail ? `<p style="font-size:12px;color:#8a7f72;margin:0 0 20px">${esc(detail)}</p>` : ''}
<button onclick="window.close()" style="border:0;border-radius:999px;background:#1f1b19;color:#fff;font-size:15px;font-weight:600;padding:10px 26px;cursor:pointer">關閉視窗</button>
</div></body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 200 },
  );
}

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

  // 伺服器端先送出:藍新正常回傳可列印標籤(HTML/PDF),出錯時回 JSON。
  // 直接自動送表單會把錯誤 JSON 丟到瀏覽器,故改由後端判斷回應內容。
  let res: Response;
  try {
    res = await fetch(actionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString(),
    });
  } catch {
    return errorPage('列印寄件單失敗', '無法連線至藍新物流,請稍後再試。');
  }

  const contentType = res.headers.get('content-type') || '';
  const buf = Buffer.from(await res.arrayBuffer());

  // 判斷是否為錯誤 JSON(藍新出錯時回 {"Status":"...","Message":"..."})
  const head = buf.subarray(0, 64).toString('utf8').trimStart();
  if (contentType.includes('json') || head.startsWith('{')) {
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(buf.toString('utf8')); } catch { /* 非 JSON */ }
    const status = String(parsed.Status ?? '');
    if (status && status.toUpperCase() !== 'SUCCESS') {
      const msg = String(parsed.Message ?? '') || '藍新物流回報錯誤';
      // 1114 = 預付費用餘額不足;針對常見情況給明確指引。
      if (status === '1114' || /預付|餘額不足|儲值/.test(msg)) {
        return errorPage(
          '列印寄件單失敗:預付餘額不足',
          '藍新物流採預付制,目前物流帳戶餘額不足以產生寄件單。請至藍新物流後台儲值/加值後,再重新列印寄件單。',
          `藍新回報:${msg}（代碼 ${status}）`,
        );
      }
      return errorPage('列印寄件單失敗', `藍新回報:${msg}`, `代碼 ${status}`);
    }
  }

  // 正常標籤:原樣回傳(HTML 列印頁或 PDF)
  return new NextResponse(buf, {
    headers: {
      'Content-Type': contentType || 'text/html; charset=utf-8',
      'Content-Disposition': 'inline',
    },
  });
}
