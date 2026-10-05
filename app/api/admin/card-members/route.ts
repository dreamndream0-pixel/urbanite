import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminUser } from '@/lib/supabase/server';
import { TIERS } from '@/lib/card-plan';

// 後台:名片服務的會員列表、手動開通方案

export async function GET() {
  if (!(await getAdminUser())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const supabase = createAdminClient();
  const [{ data: cards }, { data: subs }, { data: blocks }, { data: payments }] = await Promise.all([
    supabase
      .from('profile_cards')
      .select('id, owner_user_id, slug, display_name, avatar_url, published, onboarded, referred_by, referral_rewards, created_at, updated_at')
      .order('created_at', { ascending: false }),
    supabase.from('card_subscriptions').select('user_id, plan, expires_at'),
    supabase.from('profile_card_blocks').select('card_id'),
    supabase.from('card_payments').select('user_id, amount, paid_at').not('paid_at', 'is', null),
  ]);

  // 會員 Email 與登入方式
  const users = new Map<string, { email: string; provider: string; last: string | null }>();
  for (let page = 1; page <= 20; page++) {
    const { data } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    for (const u of data?.users ?? []) {
      users.set(u.id, { email: u.email ?? '', provider: String(u.app_metadata?.provider ?? ''), last: u.last_sign_in_at ?? null });
    }
    if (!data || data.users.length < 1000) break;
  }

  const blockCount = new Map<string, number>();
  for (const b of blocks ?? []) blockCount.set(b.card_id, (blockCount.get(b.card_id) ?? 0) + 1);
  const subOf = new Map((subs ?? []).map((s) => [s.user_id, s]));
  const paidOf = new Map<string, number>();
  for (const p of payments ?? []) paidOf.set(p.user_id, (paidOf.get(p.user_id) ?? 0) + p.amount);
  const slugOf = new Map((cards ?? []).map((c) => [c.id, c.slug]));
  const referred = new Map<string, number>();
  for (const c of cards ?? []) if (c.referred_by && c.onboarded) referred.set(c.referred_by, (referred.get(c.referred_by) ?? 0) + 1);

  const members = (cards ?? []).map((c) => {
    const sub = c.owner_user_id ? subOf.get(c.owner_user_id) : undefined;
    const active = Boolean(sub && new Date(sub.expires_at).getTime() > Date.now());
    const u = c.owner_user_id ? users.get(c.owner_user_id) : undefined;
    return {
      id: c.id,
      user_id: c.owner_user_id,
      slug: c.slug,
      name: c.display_name,
      avatar: c.avatar_url,
      email: u?.email ?? '',
      provider: u?.provider ?? '',
      last_sign_in: u?.last ?? null,
      published: c.published,
      onboarded: c.onboarded,
      tier: active ? sub!.plan : 'free',
      expires_at: sub?.expires_at ?? null,
      blocks: blockCount.get(c.id) ?? 0,
      paid: c.owner_user_id ? paidOf.get(c.owner_user_id) ?? 0 : 0,
      referrer: c.referred_by ? slugOf.get(c.referred_by) ?? '' : '',
      referrals: referred.get(c.id) ?? 0,
      referral_rewards: c.referral_rewards ?? 0,
      created_at: c.created_at,
    };
  });
  return NextResponse.json({ members });
}

// POST { user_id, tier, days } 延長/開通;tier = 'free' 立即取消方案
export async function POST(request: Request) {
  if (!(await getAdminUser())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const userId = String(body.user_id ?? '');
  const tier = String(body.tier ?? '');
  const days = Math.max(0, Math.min(3660, Math.floor(Number(body.days) || 0)));
  if (!userId || !TIERS.some((t) => t.key === tier)) return NextResponse.json({ error: '資料不完整' }, { status: 400 });
  const supabase = createAdminClient();

  if (tier === 'free') {
    const { error } = await supabase.from('card_subscriptions').update({ expires_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('user_id', userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }
  if (!days) return NextResponse.json({ error: '請輸入天數' }, { status: 400 });

  // 同等級且未到期:接在到期日後;換等級:從今天起算
  const { data: sub } = await supabase.from('card_subscriptions').select('plan, expires_at').eq('user_id', userId).maybeSingle();
  const active = sub?.expires_at && new Date(sub.expires_at).getTime() > Date.now();
  const from = active && sub!.plan === tier ? new Date(sub!.expires_at).getTime() : Date.now();
  const expiresAt = new Date(from + days * 86400000).toISOString();
  const { error } = await supabase.from('card_subscriptions').upsert({ user_id: userId, plan: tier, expires_at: expiresAt, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, expires_at: expiresAt });
}
