import { getNewebpayConfig, aesDecrypt, verifyTradeSha } from '@/lib/newebpay';
import { settleNewebpayPayment } from '@/lib/newebpay-settle';

// POST /api/payment/newebpay/notify — 藍新 NotifyURL 背景付款通知
// 驗證 TradeSha → AES 解密 TradeInfo → 確認成功與金額 → 更新訂單(冪等)。
export async function POST(request: Request) {
  const form = await request.formData();
  const tradeInfo = String(form.get('TradeInfo') ?? '');
  const receivedSha = String(form.get('TradeSha') ?? '');
  const cfg = getNewebpayConfig();

  if (!tradeInfo || !verifyTradeSha(tradeInfo, receivedSha, cfg.hashKey, cfg.hashIv)) {
    console.error('[NewebPay notify] TradeSha 驗證失敗');
    return new Response('SHA ERROR', { status: 400 });
  }

  let payload: { Status?: string; Message?: string; Result?: Record<string, unknown> };
  try {
    payload = JSON.parse(aesDecrypt(tradeInfo, cfg.hashKey, cfg.hashIv));
  } catch {
    console.error('[NewebPay notify] 解密失敗');
    return new Response('DECRYPT ERROR', { status: 400 });
  }

  const settled = await settleNewebpayPayment(payload);
  if (!settled.ok) {
    console.warn('[NewebPay notify] 未完成入帳', settled.orderNo, settled.reason);
    if (settled.reason?.startsWith('金額不符')) return new Response('AMOUNT MISMATCH', { status: 400 });
  }

  return new Response('OK');
}
