import { createAdminClient } from '@/lib/supabase/admin';

type NewebpayPayload = {
  Status?: string;
  Message?: string;
  Result?: Record<string, unknown>;
};

export async function settleNewebpayPayment(payload: NewebpayPayload): Promise<{
  ok: boolean;
  orderNo: string;
  reason?: string;
}> {
  const result = payload.Result ?? {};
  const orderNo = String(result.MerchantOrderNo ?? '').trim();
  if (!orderNo) return { ok: false, orderNo: '', reason: '缺少訂單編號' };
  if (payload.Status !== 'SUCCESS') return { ok: false, orderNo, reason: payload.Message || '付款未成功' };

  const supabase = createAdminClient();
  const { data: order, error } = await supabase
    .from('orders')
    .select('id, paid, total, payment_status, status')
    .eq('order_no', orderNo)
    .maybeSingle();
  if (error) return { ok: false, orderNo, reason: error.message };
  if (!order) return { ok: false, orderNo, reason: '找不到訂單' };

  const amt = Number(result.Amt);
  if (Number.isFinite(amt) && amt !== Number(order.total)) {
    return { ok: false, orderNo, reason: `金額不符:${amt}/${order.total}` };
  }

  const nowIso = new Date().toISOString();
  if (!order.paid || order.payment_status !== 'PAID') {
    // 付款成功後,若訂單還停在「尚未付款」,推進到「待出貨」(CONFIRMED)。
    const advanceStatus = order.status === '尚未付款';
    const patch: Record<string, unknown> = { paid: true, payment_status: 'PAID', paid_amount: Number(order.total) };
    if (advanceStatus) { patch.status = '待出貨'; patch.order_status = 'CONFIRMED'; }
    const { error: updateError } = await supabase
      .from('orders')
      .update(patch)
      .eq('order_no', orderNo);
    if (updateError) return { ok: false, orderNo, reason: updateError.message };
    if (advanceStatus) {
      await supabase.from('order_status_history').insert({
        order_id: order.id,
        type: 'order',
        from_status: 'PENDING',
        to_status: 'CONFIRMED',
        note: '付款完成,待出貨',
        created_by: 'NewebPay',
      });
    }
  }

  await supabase
    .from('payments')
    .update({
      provider: 'NewebPay',
      status: 'PAID',
      transaction_id: String(result.TradeNo ?? ''),
      paid_at: nowIso,
      raw_response: payload as Record<string, unknown>,
    })
    .eq('order_id', order.id)
    .in('status', ['PENDING', 'UNPAID', '']);

  await supabase.from('order_status_history').insert({
    order_id: order.id,
    type: 'payment',
    from_status: order.payment_status ?? 'UNPAID',
    to_status: 'PAID',
    note: '藍新付款完成',
    created_by: 'NewebPay',
  });

  return { ok: true, orderNo };
}
