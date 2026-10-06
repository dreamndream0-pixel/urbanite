import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireCardOwner } from '@/lib/card-access';
import { BLOCK_TYPES, type ProfileCardBlock } from '@/lib/profile-card';

export const dynamic = 'force-dynamic';

// POST /api/profile-card/blocks { card_id, type } — 新增區塊(排在最上方)
export async function POST(request: Request) {
  const owner = await requireCardOwner();
  if (!owner) return NextResponse.json({ error: '請先登入' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const cardId = owner.card.id;
  const type = String(body.type ?? '');
  if (!BLOCK_TYPES.some((t) => t.type === type) || (type === 'product' && !owner.plan.isAdmin)) {
    return NextResponse.json({ error: '資料格式錯誤' }, { status: 400 });
  }
  if (type === 'hotspot' && !owner.plan.limits.customStyle) {
    return NextResponse.json({ error: '熱區圖片是 U Plus 功能。', upgrade: true }, { status: 403 });
  }
  const supabase = createAdminClient();
  const { count } = await supabase.from('profile_card_blocks').select('id', { count: 'exact', head: true }).eq('card_id', cardId);
  if ((count ?? 0) >= owner.plan.limits.maxBlocks) {
    return NextResponse.json({ error: `免費版最多 ${owner.plan.limits.maxBlocks} 個區塊,升級 U Plus 即可不限數量`, upgrade: true }, { status: 403 });
  }
  const { data: first } = await supabase
    .from('profile_card_blocks')
    .select('sort_order')
    .eq('card_id', cardId)
    .order('sort_order')
    .limit(1)
    .maybeSingle();
  const { data, error } = await supabase
    .from('profile_card_blocks')
    .insert({ card_id: cardId, type, sort_order: (first?.sort_order ?? 1) - 1 })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data as ProfileCardBlock, { status: 201 });
}

// PUT /api/profile-card/blocks { ids: string[] } — 依陣列順序重新排序
export async function PUT(request: Request) {
  const owner = await requireCardOwner();
  if (!owner) return NextResponse.json({ error: '請先登入' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const ids = Array.isArray(body.ids) ? (body.ids as unknown[]).map(String) : [];
  const supabase = createAdminClient();
  await Promise.all(ids.map((id, index) => supabase.from('profile_card_blocks').update({ sort_order: index }).eq('id', id).eq('card_id', owner.card.id)));
  return NextResponse.json({ ok: true });
}
