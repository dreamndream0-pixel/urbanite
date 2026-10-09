import { buildMPGParams } from '@/lib/newebpay';
import type { Order } from '@/lib/types';
import { canAccessOrder } from '@/lib/order-access';
import { getCurrentShop, isPlatformShop, shopAdminClient } from '@/lib/shop';

// GET /api/payment/newebpay/checkout?order=<order_no>
// 依訂單組出藍新 MPG 參數,回傳自動送出的表單(瀏覽器跳轉到藍新付款頁)。
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orderNo = String(searchParams.get('order') ?? '').trim();
  if (!orderNo) return htmlError('缺少訂單編號');
  // 藍新金流是 URBANITE 的帳號:其他店家不能使用
  if (!isPlatformShop(await getCurrentShop())) return htmlError('這家店目前只提供轉帳匯款', 400);

  const supabase = (await shopAdminClient());
  const { data: order } = await supabase
    .from('orders')
    .select('*')
    .eq('order_no', orderNo)
    .maybeSingle();

  if (!order || !(await canAccessOrder(order))) return htmlError('無法存取訂單,請登入原帳號或使用下單的瀏覽器', 404);
  const o = order as Order;
  if (o.paid) return redirect(`/checkout/complete?order_no=${encodeURIComponent(orderNo)}`);

  const { params, action } = await buildMPGParams({
    order_no: o.order_no,
    total: o.total,
    email: o.email,
    items: (o.items ?? []).map((it) => ({ name: it.name, variant: it.variant, quantity: it.quantity })),
  });

  const inputs = Object.entries(params)
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`)
    .join('\n    ');

  const html = `<!doctype html>
<html lang="zh-Hant">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>導向藍新付款…</title>
<style>body{font-family:system-ui,-apple-system,"PingFang TC","Microsoft JhengHei",sans-serif;background:#f6f2ec;color:#1f1b19;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
.box{text-align:center}.spin{width:36px;height:36px;border:3px solid #e5ded4;border-top-color:#c84767;border-radius:50%;animation:s 1s linear infinite;margin:0 auto 16px}
@keyframes s{to{transform:rotate(360deg)}}button{margin-top:12px;padding:10px 20px;border-radius:999px;border:0;background:#1f1b19;color:#fff;font-weight:600}</style>
</head>
<body>
  <div class="box">
    <div class="spin"></div>
    <p>正在導向藍新安全付款頁面…</p>
    <form id="mpg" method="post" action="${esc(action)}">
    ${inputs}
      <button type="submit">若未自動跳轉,請按此前往付款</button>
    </form>
  </div>
  <script>document.getElementById('mpg').submit();</script>
</body>
</html>`;

  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } });
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function redirect(path: string): Response {
  const site = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '');
  return new Response(null, { status: 303, headers: { Location: site + path, 'Cache-Control': 'private, no-store' } });
}

function htmlError(msg: string, status = 400): Response {
  return new Response(
    `<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:40px;text-align:center"><p>${esc(msg)}</p><a href="/checkout">返回結帳</a></body>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' } },
  );
}
