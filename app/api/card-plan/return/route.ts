import { aesDecrypt, getNewebpayConfig, verifyTradeSha } from '@/lib/newebpay';
import { settleCardPayment } from '@/lib/card-payment';

// POST /api/card-plan/return — 藍新付款後瀏覽器導回;背景通知延遲時這裡也會補做入帳
export async function POST(request: Request) {
  const cfg = await getNewebpayConfig();
  let result = 'pending';
  try {
    const form = await request.formData();
    const tradeInfo = String(form.get('TradeInfo') ?? '');
    const tradeSha = String(form.get('TradeSha') ?? '');
    if (tradeInfo && verifyTradeSha(tradeInfo, tradeSha, cfg.hashKey, cfg.hashIv)) {
      const payload = JSON.parse(aesDecrypt(tradeInfo, cfg.hashKey, cfg.hashIv));
      const settled = await settleCardPayment(payload);
      result = settled.ok ? 'success' : payload?.Status === 'SUCCESS' ? 'pending' : 'fail';
    }
  } catch {
    /* 無法確認時不宣稱扣款失敗,避免重複付款。 */
  }
  return new Response(null, { status: 303, headers: { Location: `${cfg.siteUrl}/mycard/upgrade?result=${result}` } });
}
