import { createAdminClient } from '@/lib/supabase/admin';
import { getEcpayConfig, verifyCheckMacValue, type EcpayParams } from '@/lib/ecpay';

// POST /api/payment/ecpay/result — 付款完成後,消費者瀏覽器被綠界以 Form POST 導回(OrderResultURL)
// 這裡不需回 1|OK,驗簽 + 標記已付款(冪等,補 ReturnURL 可能的延遲)後,把瀏覽器導向完成頁。
export async function POST(request: Request) {
  const form = await request.formData();
  const params: EcpayParams = {};
  for (const [k, v] of form.entries()) params[k] = String(v);

  const cfg = getEcpayConfig();
  const orderNo = String(params.MerchantTradeNo || '').trim();
  const ok = verifyCheckMacValue(params, cfg.hashKey, cfg.hashIv) && String(params.RtnCode) === '1';

  if (ok && orderNo) {
    const supabase = createAdminClient();
    const { data: order } = await supabase
      .from('orders')
      .select('paid, total')
      .eq('order_no', orderNo)
      .maybeSingle();
    if (order && !order.paid) {
      const tradeAmt = Number(params.TradeAmt);
      if (!Number.isFinite(tradeAmt) || tradeAmt === Number(order.total)) {
        await supabase.from('orders').update({ paid: true }).eq('order_no', orderNo);
      }
    }
  }

  const site = cfg.siteUrl;
  const status = ok ? 'paid' : 'fail';
  const location = `${site}/checkout/complete?order_no=${encodeURIComponent(orderNo)}&status=${status}`;
  return new Response(null, { status: 303, headers: { Location: location } });
}
