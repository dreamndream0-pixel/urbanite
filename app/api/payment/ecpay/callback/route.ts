import { createAdminClient } from '@/lib/supabase/admin';
import { getEcpayConfig, verifyCheckMacValue, type EcpayParams } from '@/lib/ecpay';

// POST /api/payment/ecpay/callback — 綠界 Server-to-Server 付款結果通知(ReturnURL)
// 收到後必須驗證 CheckMacValue,並回應純文字「1|OK」,否則綠界會重送。
export async function POST(request: Request) {
  const form = await request.formData();
  const params: EcpayParams = {};
  for (const [k, v] of form.entries()) params[k] = String(v);

  const cfg = getEcpayConfig();

  // 1) 驗簽:不通過就不動資料(仍回 1|OK 避免無限重送,但記錄)
  if (!verifyCheckMacValue(params, cfg.hashKey, cfg.hashIv)) {
    console.error('[ECPay callback] CheckMacValue 驗證失敗', params.MerchantTradeNo);
    return text('0|CheckMacValue Error');
  }

  const orderNo = String(params.MerchantTradeNo || '').trim();
  const success = String(params.RtnCode) === '1'; // 付款成功碼(字串 '1')

  if (orderNo && success) {
    const supabase = createAdminClient();
    // 只在尚未標記時更新(冪等:重送不會重覆處理)
    const { data: order } = await supabase
      .from('orders')
      .select('id, paid, total')
      .eq('order_no', orderNo)
      .maybeSingle();
    if (order) {
      // 金額比對(防竄改):綠界回傳 TradeAmt 應等於訂單金額
      const tradeAmt = Number(params.TradeAmt);
      if (Number.isFinite(tradeAmt) && tradeAmt !== Number(order.total)) {
        console.error('[ECPay callback] 金額不符', orderNo, tradeAmt, order.total);
        return text('0|Amount Mismatch');
      }
      if (!order.paid) {
        await supabase
          .from('orders')
          .update({ paid: true })
          .eq('order_no', orderNo);
      }
    } else {
      console.error('[ECPay callback] 找不到訂單', orderNo);
    }
  } else if (orderNo) {
    console.warn('[ECPay callback] 付款未成功', orderNo, 'RtnCode=', params.RtnCode, params.RtnMsg);
  }

  // 無論成功與否,只要驗簽通過都要回 1|OK(否則綠界持續重送)
  return text('1|OK');
}

function text(body: string): Response {
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
