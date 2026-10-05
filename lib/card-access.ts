import type { User } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/supabase/server';
import { getAdminEmails } from '@/lib/integrations';
import { FREE_LIMITS, PRO_LIMITS, RESERVED_SLUGS, type CardPlanInfo, type CardTier } from '@/lib/card-plan';
import { SLUG_PATTERN, type ProfileCard } from '@/lib/profile-card';

// 名片服務:誰可以編輯哪張名片、目前方案

export async function getPlanInfo(user: User): Promise<CardPlanInfo> {
  const admins = await getAdminEmails();
  const isAdmin = admins.includes((user.email ?? '').toLowerCase());
  const { data } = await createAdminClient().from('card_subscriptions').select('plan, expires_at').eq('user_id', user.id).maybeSingle();
  const expiresAt = data?.expires_at ?? null;
  const active = Boolean(expiresAt && new Date(expiresAt).getTime() > Date.now());
  // 管理員(店家)= U Max;付費且未到期 = 購買的等級;其餘 U Free
  const tier: CardTier = isAdmin ? 'max' : active ? ((['plus', 'pro', 'max'].includes(data?.plan) ? data!.plan : 'plus') as CardTier) : 'free';
  const pro = tier !== 'free';
  return { tier, pro, isAdmin, expiresAt: isAdmin ? null : expiresAt, limits: pro ? PRO_LIMITS : FREE_LIMITS };
}

// 由 Email 產生預設代稱(英數字),重複時加數字
async function suggestSlug(user: User) {
  const supabase = createAdminClient();
  const base =
    (user.email ?? '')
      .split('@')[0]
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '')
      .replace(/^[._-]+|[._-]+$/g, '')
      .slice(0, 20) || 'card';
  const candidates = [base, ...Array.from({ length: 8 }, () => `${base}${Math.floor(100 + Math.random() * 900)}`)];
  for (const slug of candidates) {
    if (!SLUG_PATTERN.test(slug) || RESERVED_SLUGS.includes(slug) || slug.startsWith('line-')) continue;
    const { data } = await supabase.from('profile_cards').select('id').eq('slug', slug).maybeSingle();
    if (!data) return slug;
  }
  return `card${Date.now().toString(36)}`;
}

// 檢查網址代稱能不能用;可以回傳空字串
export async function slugProblem(slug: string, plan: CardPlanInfo, cardId?: string) {
  if (!slug) return '請輸入網址';
  if (!SLUG_PATTERN.test(slug)) return '只能用小寫英文、數字、點、底線、連字號,2–30 字,開頭結尾要是英數字';
  if (RESERVED_SLUGS.includes(slug) || slug.startsWith('line-') || (slug === 'urbanite' && !plan.isAdmin)) return '這個網址不能使用,請換一個';
  const { data } = await createAdminClient().from('profile_cards').select('id').eq('slug', slug).maybeSingle();
  if (data && data.id !== cardId) return '這個網址已經有人使用了';
  return '';
}

// 目前登入者的名片(沒有就建立一張)
export async function getOwnedCard(user: User, create = true): Promise<ProfileCard | null> {
  const supabase = createAdminClient();
  const { data: own } = await supabase.from('profile_cards').select('*').eq('owner_user_id', user.id).maybeSingle();
  if (own) return own as ProfileCard;
  if (!create) return null;
  const { data: customer } = await supabase.from('customers').select('name').eq('user_id', user.id).maybeSingle();
  const name = customer?.name || (user.user_metadata?.full_name as string) || (user.user_metadata?.name as string) || '';
  const { data, error } = await supabase
    .from('profile_cards')
    .insert({
      owner_user_id: user.id,
      slug: await suggestSlug(user),
      display_name: name,
      avatar_url: (user.user_metadata?.avatar_url as string) || '',
      bio: '',
      theme: { template: 'ivory' },
      published: true,
      onboarded: false, // 先到 /mycard/setup 設定暱稱與網址
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as ProfileCard;
}

// API 共用:登入者+名片+方案
export async function requireCardOwner() {
  const user = await getSessionUser();
  if (!user) return null;
  const card = await getOwnedCard(user);
  if (!card) return null;
  return { user, card, plan: await getPlanInfo(user) };
}
