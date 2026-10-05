import { aesDecrypt, getNewebpayConfig, verifyTradeSha } from '@/lib/newebpay';
import { settleCardPayment } from '@/lib/card-payment';

// POST /api/card-plan/return — 藍新付款後瀏覽器導回;背景通知延遲時這裡也會補做入帳
export async function POST(request: Request) {
  const cfg = await getNewebpayConfig();
  let result = 'fail';
  try {
    const form = await request.formData();
    const tradeInfo = String(form.get('TradeInfo') ?? '');
    const tradeSha = String(form.get('TradeSha') ?? '');
    if (tradeInfo && verifyTradeSha(tradeInfo, tradeSha, cfg.hashKey, cfg.hashIv)) {
      const payload = JSON.parse(aesDecrypt(tradeInfo, cfg.hashKey, cfg.hashIv));
      const settled = await settleCardPayment(payload);
      result = settled.ok ? 'success' : 'fail';
    }
  } catch {
    /* 解析失敗:顯示失敗,實際狀態以背景通知為準 */
  }
  return new Response(null, { status: 303, headers: { Location: `${cfg.siteUrl}/mycard/upgrade?result=${result}` } });
}
