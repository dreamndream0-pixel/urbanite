import { createAdminClient } from '@/lib/supabase/admin';
import { queryNewebpayPayment } from '@/lib/newebpay-query';
import { settleVideoPayment } from '@/lib/video-points';

// Deduplicate concurrent summary reads; crediting still uses the database's atomic,
// idempotent settlement transaction shared with provider callbacks.
const checks = new Map<string, { at: number; result: Promise<{ checked: number; settled: number; unconfirmed: number }> }>();
async function checkPayment(payment: { order_no: string; amount: number }, onError?: (code: string) => void) {
  try {
    const proof = await queryNewebpayPayment(payment.order_no, payment.amount);
    if (!proof.paid) return 'not_paid';
    const settlement = await settleVideoPayment({ Status: 'SUCCESS', Result: { MerchantOrderNo: payment.order_no, Amt: payment.amount, TradeNo: proof.tradeNo } });
    return settlement.ok ? 'settled' : 'unconfirmed';
  } catch (error) { onError?.(error instanceof Error && /^[A-Z0-9_]{1,80}$/.test(error.message) ? error.message : 'QUERY_UNAVAILABLE'); return 'unconfirmed'; }
}
const summarize = (outcomes: string[]) => ({ checked: outcomes.length, settled: outcomes.filter(value => value === 'settled').length, unconfirmed: outcomes.filter(value => value === 'unconfirmed').length });

// A server-authenticated minute job rotates through ALL pending orders, including
// abandoned and older orders. Advancing across unpaid orders avoids starvation.
export async function reconcileVideoPaymentBatch(cursor = '', deferred: string[] = []) {
  let query = createAdminClient().from('video_point_payments').select('order_no,amount,created_at').eq('status', 'pending')
    .lte('created_at', new Date(Date.now() - 90000).toISOString());
  if (cursor) query = query.gt('order_no', cursor);
  if (deferred.length) query = query.not('order_no', 'in', '(' + deferred.join(',') + ')');
  const { data, error } = await query.order('order_no', { ascending: true }).limit(6);
  if (error) throw new Error('PAYMENT_BATCH_UNAVAILABLE');
  const rows = data || [];
  const outcomes: string[] = [];
  const errorCounts: Record<string, number> = {};
  const deferrals: { orderNo: string; until: number }[] = [];
  for (let i = 0; i < rows.length; i += 3) outcomes.push(...await Promise.all(rows.slice(i, i + 3).map(async payment => {
    const onError = (code: string) => { errorCounts[code] = (errorCounts[code] || 0) + 1; };
    const outcome = await checkPayment(payment, onError);
    if (outcome !== 'settled') {
      const age = Date.now() - Date.parse(payment.created_at);
      deferrals.push({ orderNo: payment.order_no, until: Date.now() + (age > 3600000 ? 6 * 3600000 : age > 900000 ? 600000 : 120000) });
    }
    return outcome;
  })));
  return { ...summarize(outcomes), errorCounts, deferrals, pauseUntil: errorCounts.PAYMENT_QUERY_UNCONFIRMED_TRA10071 ? Date.now() + 4 * 3600000 : 0, nextCursor: rows.length === 6 ? rows[rows.length - 1].order_no : '' };
}
export function reconcileVideoPayments(userId: string) {
  const cached = checks.get(userId);
  if (cached && Date.now() - cached.at < 30000) return cached.result;
  const result = (async () => {
    const { data, error } = await createAdminClient().from('video_point_payments')
      .select('order_no,amount').eq('user_id', userId).eq('status', 'pending')
      .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString()).order('created_at', { ascending: false }).limit(3);
    if (error) return { checked: 0, settled: 0, unconfirmed: 1 };
    return summarize(await Promise.all((data || []).map(payment => checkPayment(payment))));
  })().catch(() => ({ checked: 0, settled: 0, unconfirmed: 1 }));
  if (checks.size >= 1000) checks.delete(checks.keys().next().value!);
  checks.set(userId, { at: Date.now(), result });
  return result;
}
