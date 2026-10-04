import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminUser } from '@/lib/supabase/server';
import { BLOCK_TYPES, type ProfileCardBlock } from '@/lib/profile-card';

export const dynamic = 'force-dynamic';

// POST /api/profile-card/blocks { card_id, type } — 新增區塊(排在最上方)
export async function POST(request: Request) {
  if (!(await getAdminUser())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const cardId = String(body.card_id ?? '');
  const type = String(body.type ?? '');
  if (!cardId || !BLOCK_TYPES.some((t) => t.type === type)) {
    return NextResponse.json({ error: '資料格式錯誤' }, { status: 400 });
  }
  const supabase = createAdminClient();
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
  if (!(await getAdminUser())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const ids = Array.isArray(body.ids) ? (body.ids as unknown[]).map(String) : [];
  const supabase = createAdminClient();
  await Promise.all(ids.map((id, index) => supabase.from('profile_card_blocks').update({ sort_order: index }).eq('id', id)));
  return NextResponse.json({ ok: true });
}
