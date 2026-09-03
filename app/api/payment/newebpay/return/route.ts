import { getNewebpayConfig, aesDecrypt, verifyTradeSha } from '@/lib/newebpay';
import { settleNewebpayPayment } from '@/lib/newebpay-settle';

// POST /api/payment/newebpay/return — 藍新 ReturnURL 付款後瀏覽器帶結果導回
// 解出訂單編號後,導向前台完成頁;若背景通知延遲,這裡也會補做付款入帳。
export async function POST(request: Request) {
  const cfg = getNewebpayConfig();
  let orderNo = '';
  let status = '';
  try {
    const form = await request.formData();
    const tradeInfo = String(form.get('TradeInfo') ?? '');
    const tradeSha = String(form.get('TradeSha') ?? '');
    if (tradeInfo) {
      if (tradeSha && !verifyTradeSha(tradeInfo, tradeSha, cfg.hashKey, cfg.hashIv)) {
        throw new Error('SHA ERROR');
      }
      const payload = JSON.parse(aesDecrypt(tradeInfo, cfg.hashKey, cfg.hashIv));
      orderNo = String(payload?.Result?.MerchantOrderNo ?? '');
      const settled = await settleNewebpayPayment(payload);
      status = settled.ok ? 'paid' : payload?.Status === 'SUCCESS' ? 'pending' : 'fail';
    }
  } catch {
    /* 解析失敗仍導回完成頁 */
  }
  const dest = orderNo
    ? `/checkout/complete?order_no=${encodeURIComponent(orderNo)}${status ? `&status=${status}` : ''}`
    : '/checkout/complete';
  return new Response(null, { status: 303, headers: { Location: cfg.siteUrl + dest } });
}
