import { getNewebpayConfig, aesDecrypt } from '@/lib/newebpay';

// POST /api/payment/newebpay/return — 藍新 ReturnURL 付款後瀏覽器帶結果導回
// 解出訂單編號後,導向前台完成頁(付款狀態以 notify 背景通知為準)。
export async function POST(request: Request) {
  const cfg = getNewebpayConfig();
  let orderNo = '';
  try {
    const form = await request.formData();
    const tradeInfo = String(form.get('TradeInfo') ?? '');
    if (tradeInfo) {
      const payload = JSON.parse(aesDecrypt(tradeInfo, cfg.hashKey, cfg.hashIv));
      orderNo = String(payload?.Result?.MerchantOrderNo ?? '');
    }
  } catch {
    /* 解析失敗仍導回完成頁 */
  }
  const dest = orderNo
    ? `/checkout/complete?order_no=${encodeURIComponent(orderNo)}`
    : '/checkout/complete';
  return new Response(null, { status: 303, headers: { Location: cfg.siteUrl + dest } });
}
