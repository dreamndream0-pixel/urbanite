import { createAdminClient } from '@/lib/supabase/admin';
import { queryNewebpayPayment } from '@/lib/newebpay-query';
import { settleVideoPayment } from '@/lib/video-points';

// Deduplicate concurrent summary reads; crediting still uses the database's atomic,
// idempotent settlement transaction shared with provider callbacks.
const checks = new Map<string, { at: number; result: Promise<{ checked: number; settled: number; unconfirmed: number }> }>();
export function reconcileVideoPayments(userId: string) {
  const cached = checks.get(userId);
  if (cached && Date.now() - cached.at < 30000) return cached.result;
  const result = (async () => {
    const { data, error } = await createAdminClient().from('video_point_payments')
      .select('order_no,amount').eq('user_id', userId).eq('status', 'pending')
      .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString()).order('created_at', { ascending: false }).limit(3);
    if (error) return { checked: 0, settled: 0, unconfirmed: 1 };
    const outcomes = await Promise.all((data || []).map(async payment => {
      try {
        const proof = await queryNewebpayPayment(payment.order_no, payment.amount);
        if (!proof.paid) return 'not_paid';
        const settlement = await settleVideoPayment({ Status: 'SUCCESS', Result: { MerchantOrderNo: payment.order_no, Amt: payment.amount, TradeNo: proof.tradeNo } });
        return settlement.ok ? 'settled' : 'unconfirmed';
      } catch { return 'unconfirmed'; }
    }));
    return { checked: outcomes.length, settled: outcomes.filter(value => value === 'settled').length, unconfirmed: outcomes.filter(value => value === 'unconfirmed').length };
  })().catch(() => ({ checked: 0, settled: 0, unconfirmed: 1 }));
  if (checks.size >= 1000) checks.delete(checks.keys().next().value!);
  checks.set(userId, { at: Date.now(), result });
  return result;
}
