// 會員回饋金與消費等級(伺服器端)。資料表與 SQL 函式見 supabase/migration-loyalty.sql。
// 回饋金:訂單完成後依「下單時等級的回饋率」計算,延後入帳、有效期限、先用快到期的;退款依比例追回 / 退回。
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { getShopSecret, setShopSecret } from '@/lib/integrations';
import { scopedClient } from '@/lib/shop';
import { AUTO_COMPLETE_DAYS, earnAmount, maxRedeem, nextTier, resolveLoyalty, tierForSpend, type LoyaltySettings, type LoyaltyTier } from '@/lib/loyalty-settings';

const KIND = 'LOYALTY';
const DAY = 24 * 3600 * 1000;

export const getLoyalty = async (shopId: string) => resolveLoyalty(await getShopSecret(KIND, shopId));
export async function saveLoyalty(shopId: string, raw: unknown) {
  const settings = resolveLoyalty(raw);
  await setShopSecret(KIND, shopId, settings);
  return settings;
}

type OrderAmounts = { subtotal: number; discount: number; shipping_discount?: number | null; credit_used?: number | null; total: number; refund_amount?: number | null; status?: string; order_status?: string | null };

// 商品實付金額(扣掉商品折扣與回饋金折抵,不含運費);退款依比例扣除;取消為 0
export function paidProductAmount(o: OrderAmounts) {
  if (o.status === '取消' || o.order_status === 'CANCELLED') return 0;
  const itemDiscount = Math.max(0, Number(o.discount || 0) - Number(o.shipping_discount || 0));
  const product = Math.max(0, Number(o.subtotal || 0) - itemDiscount - Number(o.credit_used || 0));
  const total = Number(o.total || 0);
  const refundRatio = total > 0 ? Math.min(1, Number(o.refund_amount || 0) / total) : 0;
  return Math.floor(product * (1 - refundRatio));
}

// 近 N 個月有效消費:已完成訂單的商品實付金額(扣退款)
export async function effectiveSpend(db: SupabaseClient, userId: string, months: number) {
  const since = new Date(Date.now() - months * 30 * DAY).toISOString();
  const { data } = await db.from('orders').select('subtotal, discount, shipping_discount, credit_used, total, refund_amount, status, order_status')
    .eq('user_id', userId).eq('order_status', 'COMPLETED').gte('completed_at', since);
  return ((data ?? []) as OrderAmounts[]).reduce((n, o) => n + paidProductAmount(o), 0);
}

// 目前等級:近期消費達到的等級,或保級期間內的等級(取較高者)
export async function memberTier(db: SupabaseClient, userId: string, settings: LoyaltySettings) {
  const spend = await effectiveSpend(db, userId, settings.keepMonths);
  const bySpend = tierForSpend(settings, spend);
  const { data: c } = await db.from('customers').select('tier, tier_until').eq('user_id', userId).maybeSingle();
  const kept = c?.tier && c.tier_until && new Date(c.tier_until).getTime() > Date.now() ? settings.tiers.find((t) => t.key === c.tier) : undefined;
  const tier = kept && kept.threshold > bySpend.threshold ? kept : bySpend;
  const next = nextTier(settings, tier);
  return { tier, next, spend, toNext: next ? Math.max(0, next.threshold - spend) : 0, keptUntil: kept === tier ? c?.tier_until ?? null : null };
}

// 升級(或保級到期後重算)時記下等級與保級期限
async function refreshStoredTier(db: SupabaseClient, userId: string, settings: LoyaltySettings) {
  const spend = await effectiveSpend(db, userId, settings.keepMonths);
  const bySpend = tierForSpend(settings, spend);
  const { data: c } = await db.from('customers').select('tier, tier_until').eq('user_id', userId).maybeSingle();
  if (!c) return;
  const stored = settings.tiers.find((t) => t.key === c.tier);
  const valid = stored && c.tier_until && new Date(c.tier_until).getTime() > Date.now();
  if (!valid || bySpend.threshold > (stored?.threshold ?? -1)) {
    await db.from('customers').update({ tier: bySpend.key, tier_until: new Date(Date.now() + settings.keepMonths * 30 * DAY).toISOString() }).eq('user_id', userId);
  }
}

// 會員的回饋金摘要:可用、待入帳、30 天內到期、最近紀錄
export async function creditSummary(shopId: string, userId: string) {
  const db = scopedClient(shopId);
  const soon = new Date(Date.now() + 30 * DAY).toISOString();
  const [{ data: balance }, { data: lots }, { data: entries }] = await Promise.all([
    createAdminClient().rpc('credit_balance', { p_shop: shopId, p_user: userId }),
    db.from('credit_lots').select('remaining, status, expires_at, available_at').eq('user_id', userId).in('status', ['pending', 'active']),
    db.from('credit_entries').select('id, kind, amount, note, created_at, order_id').eq('user_id', userId).order('created_at', { ascending: false }).limit(50),
  ]);
  const list = (lots ?? []) as { remaining: number; status: string; expires_at: string | null; available_at: string }[];
  return {
    balance: Math.max(0, Number(balance ?? 0)),
    pending: list.filter((l) => l.status === 'pending').reduce((n, l) => n + l.remaining, 0),
    expiringSoon: list.filter((l) => l.status === 'active' && l.remaining > 0 && l.expires_at && l.expires_at < soon).reduce((n, l) => n + l.remaining, 0),
    nextAvailableAt: list.filter((l) => l.status === 'pending').map((l) => l.available_at).sort()[0] ?? null,
    entries: entries ?? [],
  };
}

// 結帳試算:可用餘額、本筆最多折抵、目前等級回饋率
export async function creditQuote(shopId: string, userId: string, productAmount: number) {
  const settings = await getLoyalty(shopId);
  if (!settings.enabled) return null;
  const db = scopedClient(shopId);
  const [{ data: balance }, member] = await Promise.all([
    createAdminClient().rpc('credit_balance', { p_shop: shopId, p_user: userId }),
    memberTier(db, userId, settings),
  ]);
  const bal = Math.max(0, Number(balance ?? 0));
  return { settings, balance: bal, max: maxRedeem(settings, productAmount, bal), tier: member.tier as LoyaltyTier };
}

// 結帳扣用(原子操作,不足時拋錯)
export async function consumeCredit(shopId: string, userId: string, orderId: string, amount: number) {
  const { error } = await createAdminClient().rpc('consume_credit', { p_shop: shopId, p_user: userId, p_amount: amount, p_kind: 'redeem', p_order: orderId, p_note: '結帳折抵', p_actor: 'SYSTEM' });
  if (error) throw new Error(error.message.includes('INSUFFICIENT_CREDIT') ? '回饋金餘額不足' : error.message);
}

// 後台人工調整(正數加發、負數扣除),必須填原因並記錄操作人員
export async function adjustCredit(shopId: string, userId: string, amount: number, note: string, actor: string) {
  const db = createAdminClient();
  const settings = await getLoyalty(shopId);
  if (amount > 0) {
    const { error } = await db.rpc('grant_credit', { p_shop: shopId, p_user: userId, p_amount: amount, p_source: 'adjust', p_kind: 'adjust', p_order: null, p_valid_days: settings.validDays, p_note: note, p_actor: actor });
    if (error) throw new Error(error.message);
  } else if (amount < 0) {
    const { error } = await db.rpc('consume_credit', { p_shop: shopId, p_user: userId, p_amount: -amount, p_kind: 'adjust', p_order: null, p_note: note, p_actor: actor });
    if (error) throw new Error(error.message.includes('INSUFFICIENT_CREDIT') ? '餘額不足,無法扣除' : error.message);
  }
}

type JobOrder = OrderAmounts & { id: string; shop_id: string; user_id: string | null; completed_at: string | null; credit_rate: number; credit_returned: number };
const ORDER_FIELDS = 'id, shop_id, user_id, subtotal, discount, shipping_discount, credit_used, credit_returned, credit_rate, total, refund_amount, status, order_status, completed_at';

// 排程(每 5 分鐘):自動完成、回饋入帳 / 到期、退款退回與追回
export async function processLoyalty() {
  const admin = createAdminClient();
  const result = { completed: 0, earned: 0, activated: 0, expired: 0, returned: 0, clawed: 0 };
  const { data: completed } = await admin.rpc('auto_complete_orders', { p_days: AUTO_COMPLETE_DAYS });
  result.completed = Number(completed ?? 0);

  // 開啟回饋的店家
  const { data: keys } = await admin.from('integration_settings').select('key').like('key', `SHOP_${KIND}:%`);
  const shopIds = (keys ?? []).map((k) => String(k.key).split(':')[1]).filter(Boolean);
  for (const shopId of shopIds) {
    const settings = await getLoyalty(shopId);
    const db = scopedClient(shopId);
    // 1) 已完成訂單 → 建立待入帳回饋(每筆一次)
    if (settings.enabled) {
      const since = new Date(Date.now() - 120 * DAY).toISOString();
      const { data: orders } = await db.from('orders').select(ORDER_FIELDS).eq('order_status', 'COMPLETED').not('user_id', 'is', null).gte('completed_at', since).limit(500);
      const list = (orders ?? []) as JobOrder[];
      if (list.length) {
        const { data: lots } = await db.from('credit_lots').select('order_id').eq('source', 'order').in('order_id', list.map((o) => o.id));
        const done = new Set((lots ?? []).map((l) => l.order_id));
        for (const o of list.filter((x) => !done.has(x.id))) {
          const amount = earnAmount(paidProductAmount(o), Number(o.credit_rate || 0));
          const availableAt = new Date(new Date(o.completed_at ?? Date.now()).getTime() + settings.delayDays * DAY);
          const { error } = await db.from('credit_lots').insert({
            user_id: o.user_id, source: 'order', order_id: o.id, amount, remaining: amount,
            status: amount > 0 ? 'pending' : 'void', available_at: availableAt.toISOString(),
            expires_at: new Date(availableAt.getTime() + settings.validDays * DAY).toISOString(),
          });
          if (!error && amount > 0) result.earned++;
          if (!error) await refreshStoredTier(db, o.user_id!, settings).catch(() => {});
        }
      }
    }

    // 2) 取消 / 退款:退回用掉的回饋金(依退款比例),並追回這筆訂單的回饋
    const { data: changed } = await db.from('orders').select(ORDER_FIELDS).not('user_id', 'is', null)
      .or('status.eq.取消,order_status.eq.CANCELLED,refund_amount.gt.0').gte('created_at', new Date(Date.now() - 400 * DAY).toISOString()).limit(500);
    for (const o of (changed ?? []) as JobOrder[]) {
      const cancelled = o.status === '取消' || o.order_status === 'CANCELLED';
      const ratio = cancelled ? 1 : Number(o.total) > 0 ? Math.min(1, Number(o.refund_amount || 0) / Number(o.total)) : 0;
      const target = Math.floor(Number(o.credit_used || 0) * ratio);
      const delta = target - Number(o.credit_returned || 0);
      if (delta > 0) {
        const { error } = await admin.rpc('grant_credit', { p_shop: shopId, p_user: o.user_id, p_amount: delta, p_source: 'refund', p_kind: 'return', p_order: o.id, p_valid_days: settings.validDays, p_note: cancelled ? '訂單取消,退回回饋金' : '訂單退款,退回回饋金', p_actor: 'SYSTEM' });
        if (!error) result.returned++;
      }
      const earnTarget = earnAmount(paidProductAmount(o), Number(o.credit_rate || 0));
      const { data: reduced } = await admin.rpc('reduce_order_credit', { p_order: o.id, p_target: earnTarget });
      if (Number(reduced ?? 0) > 0) result.clawed++;
    }
  }

  // 3) 到期入帳、過期歸零(所有店家)
  const [{ data: activated }, { data: expired }] = await Promise.all([admin.rpc('activate_credit_lots'), admin.rpc('expire_credit_lots')]);
  result.activated = Number(activated ?? 0);
  result.expired = Number(expired ?? 0);
  return result;
}

export type { LoyaltySettings, LoyaltyTier };
