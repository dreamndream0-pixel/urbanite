import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireCardOwner, slugProblem } from '@/lib/card-access';

// 第一次使用名片:設定暱稱、網址、推薦人

// GET /api/profile-card/setup?slug=xxx — 即時檢查網址能不能用
export async function GET(request: Request) {
  const owner = await requireCardOwner();
  if (!owner) return NextResponse.json({ error: '請先登入' }, { status: 401 });
  const slug = (new URL(request.url).searchParams.get('slug') ?? '').trim().toLowerCase();
  const problem = await slugProblem(slug, owner.plan, owner.card.id);
  return NextResponse.json({ ok: !problem, error: problem });
}

// POST /api/profile-card/setup — 送出後完成設定
export async function POST(request: Request) {
  const owner = await requireCardOwner();
  if (!owner) return NextResponse.json({ error: '請先登入' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const name = String(body.display_name ?? '').trim().slice(0, 40);
  const slug = String(body.slug ?? '').trim().toLowerCase();
  const ref = String(body.referrer ?? '').trim().toLowerCase().replace(/^@/, '');
  if (!name) return NextResponse.json({ error: '請輸入暱稱', field: 'name' }, { status: 400 });
  const problem = await slugProblem(slug, owner.plan, owner.card.id);
  if (problem) return NextResponse.json({ error: problem, field: 'slug' }, { status: 400 });

  const supabase = createAdminClient();
  let referredBy = '';
  if (ref) {
    const { data } = await supabase.from('profile_cards').select('id, slug').eq('slug', ref).maybeSingle();
    if (!data || data.id === owner.card.id) return NextResponse.json({ error: '找不到這位推薦人,可以留空', field: 'ref' }, { status: 400 });
    referredBy = data.slug;
  }

  const { error } = await supabase
    .from('profile_cards')
    .update({ display_name: name, slug, referred_by: referredBy, onboarded: true, updated_at: new Date().toISOString() })
    .eq('id', owner.card.id);
  if (error) {
    const taken = /duplicate|unique/i.test(error.message);
    return NextResponse.json({ error: taken ? '這個網址已經有人使用了' : error.message, field: taken ? 'slug' : undefined }, { status: 400 });
  }
  return NextResponse.json({ ok: true, slug });
}
