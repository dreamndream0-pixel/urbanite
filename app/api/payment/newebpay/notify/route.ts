import { createAdminClient } from '@/lib/supabase/admin';
import { getNewebpayConfig, aesDecrypt, verifyTradeSha } from '@/lib/newebpay';

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

  const result = payload.Result ?? {};
  const orderNo = String(result.MerchantOrderNo ?? '').trim();
  const success = payload.Status === 'SUCCESS';

  if (orderNo && success) {
    const supabase = createAdminClient();
    const { data: order } = await supabase
      .from('orders')
      .select('id, paid, total')
      .eq('order_no', orderNo)
      .maybeSingle();

    if (order) {
      const amt = Number(result.Amt);
      if (Number.isFinite(amt) && amt !== Number(order.total)) {
        console.error('[NewebPay notify] 金額不符', orderNo, amt, order.total);
        return new Response('AMOUNT MISMATCH', { status: 400 });
      }
      if (!order.paid) {
        await supabase
          .from('orders')
          .update({ paid: true, payment_status: 'PAID', paid_amount: Number(order.total) })
          .eq('order_no', orderNo);
        try {
          const nowIso = new Date().toISOString();
          await supabase
            .from('payments')
            .update({
              status: 'PAID',
              transaction_id: String(result.TradeNo ?? ''),
              paid_at: nowIso,
              raw_response: payload as Record<string, unknown>,
            })
            .eq('order_id', order.id)
            .eq('status', 'PENDING');
          await supabase.from('order_status_history').insert({
            order_id: order.id,
            type: 'payment',
            from_status: 'UNPAID',
            to_status: 'PAID',
            note: '藍新付款完成',
            created_by: 'NewebPay',
          });
        } catch {
          /* 紀錄失敗不影響回應 */
        }
      }
    } else {
      console.error('[NewebPay notify] 找不到訂單', orderNo);
    }
  } else if (orderNo) {
    console.warn('[NewebPay notify] 付款未成功', orderNo, payload.Status, payload.Message);
  }

  return new Response('OK');
}
