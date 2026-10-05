import { createAdminClient } from '@/lib/supabase/admin';

// 推薦好友:每推薦 5 位完成註冊,送推薦人 1 個月 U Plus
export const REFERRAL_GOAL = 5;
export const REFERRAL_DAYS = 31;
export const REFERRAL_COOKIE = 'card_ref';

export type ReferralStats = { count: number; rewards: number; progress: number; goal: number };

// 推薦人名下已完成設定的人數
async function countReferrals(cardId: string) {
  const { count } = await createAdminClient()
    .from('profile_cards')
    .select('id', { count: 'exact', head: true })
    .eq('referred_by', cardId)
    .eq('onboarded', true);
  return count ?? 0;
}

export async function getReferralStats(cardId: string, rewards: number): Promise<ReferralStats> {
  const count = await countReferrals(cardId);
  return { count, rewards, progress: count % REFERRAL_GOAL, goal: REFERRAL_GOAL };
}

// 有新的被推薦人完成設定時呼叫;滿額就延長推薦人的方案
export async function grantReferralRewards(referrerCardId: string) {
  const supabase = createAdminClient();
  const { data: card } = await supabase.from('profile_cards').select('id, owner_user_id, referral_rewards').eq('id', referrerCardId).maybeSingle();
  if (!card?.owner_user_id) return;
  const due = Math.floor((await countReferrals(card.id)) / REFERRAL_GOAL) - (card.referral_rewards ?? 0);
  if (due <= 0) return;

  // 先把獎勵次數記上(同時有兩人完成時只會成功一次)
  const { data: claimed } = await supabase
    .from('profile_cards')
    .update({ referral_rewards: card.referral_rewards + due })
    .eq('id', card.id)
    .eq('referral_rewards', card.referral_rewards)
    .select('id');
  if (!claimed?.length) return;

  // 方案還在期限內:原方案往後延;否則從今天開始 U Plus
  const { data: sub } = await supabase.from('card_subscriptions').select('plan, expires_at').eq('user_id', card.owner_user_id).maybeSingle();
  const active = sub?.expires_at && new Date(sub.expires_at).getTime() > Date.now();
  const from = active ? new Date(sub!.expires_at).getTime() : Date.now();
  await supabase.from('card_subscriptions').upsert({
    user_id: card.owner_user_id,
    plan: active ? sub!.plan : 'plus',
    expires_at: new Date(from + due * REFERRAL_DAYS * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
  });
}
