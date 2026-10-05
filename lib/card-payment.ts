import { createAdminClient } from '@/lib/supabase/admin';
import { PERIODS, tierRank, type CardPeriod, type CardTier } from '@/lib/card-plan';

// 名片 Pro 方案付款(藍新):單號 CP 開頭,和商店訂單共用藍新的 Notify,入帳時依單號分流

export const isCardOrderNo = (orderNo: string) => /^CP\d/.test(orderNo);

export function newCardOrderNo() {
  const d = new Date(Date.now() + 8 * 3600 * 1000).toISOString(); // 台灣時間
  const stamp = d.slice(2, 19).replace(/[-T:]/g, ''); // YYMMDDHHmmss
  return `CP${stamp}${Math.floor(Math.random() * 900 + 100)}`;
}

type Payload = { Status?: string; Message?: string; Result?: Record<string, unknown> };

// 付款成功:標記已付款,Pro 到期日往後延(從今天或原本到期日較晚者起算)。可重複呼叫。
export async function settleCardPayment(payload: Payload): Promise<{ ok: boolean; orderNo: string; reason?: string }> {
  const result = payload.Result ?? {};
  const orderNo = String(result.MerchantOrderNo ?? '').trim();
  if (payload.Status !== 'SUCCESS') return { ok: false, orderNo, reason: payload.Message || '付款未成功' };
  const supabase = createAdminClient();
  const { data: pay } = await supabase.from('card_payments').select('*').eq('order_no', orderNo).maybeSingle();
  if (!pay) return { ok: false, orderNo, reason: '找不到付款紀錄' };
  if (pay.status === 'paid') return { ok: true, orderNo };
  const amt = Number(result.Amt);
  if (Number.isFinite(amt) && amt !== Number(pay.amount)) return { ok: false, orderNo, reason: `金額不符:${amt}/${pay.amount}` };

  // 先把狀態改成 paid(只成功一次),再延長方案,避免通知重送時重複加天數
  const { data: claimed } = await supabase
    .from('card_payments')
    .update({ status: 'paid', paid_at: new Date().toISOString(), trade_no: String(result.TradeNo ?? '') })
    .eq('id', pay.id)
    .neq('status', 'paid')
    .select('id');
  if (!claimed?.length) return { ok: true, orderNo };

  const days = PERIODS[pay.period as CardPeriod]?.days ?? 31;
  const tier = (pay.tier || 'plus') as CardTier;
  const { data: sub } = await supabase.from('card_subscriptions').select('plan, expires_at').eq('user_id', pay.user_id).maybeSingle();
  const stillActive = sub?.expires_at && new Date(sub.expires_at).getTime() > Date.now();
  // 同等級續約:接在原到期日之後;換等級(升級):從今天起算,等級取較高者
  const sameTier = stillActive && sub?.plan === tier;
  const from = sameTier ? new Date(sub!.expires_at).getTime() : Date.now();
  const plan = stillActive && tierRank(sub!.plan as CardTier) > tierRank(tier) ? sub!.plan : tier;
  const expiresAt = new Date(from + days * 24 * 3600 * 1000).toISOString();
  await supabase.from('card_subscriptions').upsert({ user_id: pay.user_id, plan, expires_at: expiresAt, updated_at: new Date().toISOString() });
  return { ok: true, orderNo };
}
