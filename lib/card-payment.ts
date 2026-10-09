import { randomBytes } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { matchesPaymentAmount } from '@/lib/payment-amount';

export const isCardOrderNo = (orderNo: string) => /^CP\d/.test(orderNo);
export function newCardOrderNo() {
  const stamp = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(2, 19).replace(/[-T:]/g, '');
  return `CP${stamp}${randomBytes(6).toString('hex')}`;
}

export async function cardSettlementReady(): Promise<boolean> {
  try {
    const { data, error } = await createAdminClient().rpc('card_settlement_version');
    return !error && data === 1;
  } catch { return false; }
}

type Payload = { Status?: string; Message?: string; Result?: Record<string, unknown> };
export async function settleCardPayment(payload: Payload): Promise<{ ok: boolean; orderNo: string; reason?: string }> {
  const result = payload.Result ?? {};
  const orderNo = String(result.MerchantOrderNo ?? '').trim();
  if (payload.Status !== 'SUCCESS') return { ok: false, orderNo, reason: '付款未成功' };
  if (!matchesPaymentAmount(result.Amt, result.Amt)) return { ok: false, orderNo, reason: '金額不符:無效金額' };
  const tradeNo = typeof result.TradeNo === 'string' ? result.TradeNo.trim() : '';
  if (!orderNo || !tradeNo || tradeNo.length > 100) return { ok: false, orderNo, reason: '付款資料不完整' };
  try {
    // No non-atomic fallback: all entitlement and payment writes belong to the DB transaction.
    const { data, error } = await createAdminClient().rpc('settle_card_payment_v1', {
      p_order_no: orderNo, p_amount: Number(result.Amt), p_trade_no: tradeNo,
    });
    if (error || data !== true) return { ok: false, orderNo, reason: error?.message?.includes('AMOUNT_MISMATCH') ? '金額不符' : '付款入帳待重試' };
    return { ok: true, orderNo };
  } catch { return { ok: false, orderNo, reason: '付款入帳待重試' }; }
}
