import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireCardOwner } from '@/lib/card-access';
import { businessSlugProblem, identityShop } from '@/lib/business-identity';
import { grantReferralRewards } from '@/lib/card-referral';

// 第一次使用名片:設定暱稱、網址、推薦人

// GET /api/profile-card/setup?slug=xxx — 即時檢查網址能不能用
export async function GET(request: Request) {
  const owner = await requireCardOwner();
  if (!owner) return NextResponse.json({ error: '請先登入' }, { status: 401 });
  const slug = (new URL(request.url).searchParams.get('slug') ?? '').trim().toLowerCase();
  const shop = await identityShop(owner.user.id);
  const problem = await businessSlugProblem(slug, owner.card.id, owner.card.shop_id || shop?.id);
  return NextResponse.json({ ok: !problem, error: problem });
}

// POST /api/profile-card/setup — 送出後完成設定
export async function POST(request: Request) {
  const owner = await requireCardOwner();
  if (!owner) return NextResponse.json({ error: '請先登入' }, { status: 401 });
  if (owner.card.onboarded !== false) return NextResponse.json({ error: '已完成設定，請到名片設定修改' }, { status: 409 });
  const body = await request.json().catch(() => ({}));
  const name = String(body.display_name ?? '').trim().slice(0, 40);
  const slug = String(body.slug ?? '').trim().toLowerCase();
  const ref = String(body.referrer ?? '').trim().toLowerCase().replace(/^@/, '');
  if (!name) return NextResponse.json({ error: '請輸入店家名稱', field: 'name' }, { status: 400 });
  const shop = await identityShop(owner.user.id);
  if (shop && slug !== shop.slug) return NextResponse.json({ error: '請沿用既有官網網址，避免變更已分享的連結', field: 'slug' }, { status: 400 });
  const problem = await businessSlugProblem(slug, owner.card.id, shop?.id);
  if (problem) return NextResponse.json({ error: problem, field: 'slug' }, { status: 400 });

  const supabase = createAdminClient();
  let referredBy = '';
  if (ref) {
    const { data } = await supabase.from('profile_cards').select('id, slug').eq('slug', ref).maybeSingle();
    if (!data || data.id === owner.card.id) return NextResponse.json({ error: '找不到這位推薦人,可以留空', field: 'ref' }, { status: 400 });
    referredBy = data.id;
  }

  const { data: saved, error } = await supabase
    .from('profile_cards')
    .update({ display_name: name, slug, referred_by: referredBy || null, onboarded: true, business_identity: true, shop_id: shop?.id ?? null, updated_at: new Date().toISOString() })
    .eq('id', owner.card.id).eq('owner_user_id', owner.user.id).eq('onboarded', false).select('id').maybeSingle();
  if (error) {
    const taken = /duplicate|unique/i.test(error.message);
    return NextResponse.json({ error: taken ? '這個網址已經有人使用了' : error.message, field: taken ? 'slug' : undefined }, { status: 400 });
  }
  if (!saved) return NextResponse.json({ error: '設定已變更，請重新整理後再試' }, { status: 409 });
  // 推薦人滿 5 位就送 1 個月 U Plus
  if (referredBy) await grantReferralRewards(referredBy).catch(() => {});
  return NextResponse.json({ ok: true, slug });
}
