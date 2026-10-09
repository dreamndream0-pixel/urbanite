import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/supabase/server';
import type { Category } from '@/lib/types';
import { shopAdminClient } from '@/lib/shop';

// PATCH /api/categories/[id] — 編輯分類(限管理員)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: '未授權' }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  const update: Record<string, unknown> = {};
  if (typeof body.name === 'string') update.name = body.name;
  if (typeof body.en === 'string') update.en = body.en;
  if (typeof body.sort_order === 'number') update.sort_order = body.sort_order;
  if ('parent_id' in body) update.parent_id = body.parent_id || null;
  if (typeof body.image === 'string') update.image = body.image.trim();
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: '沒有可更新的欄位' }, { status: 400 });
  }

  const supabase = (await shopAdminClient());
  const { data, error } = await supabase
    .from('categories')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data as Category);
}

// DELETE /api/categories/[id] — 刪除分類(限管理員)
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: '未授權' }, { status: 401 });

  const { id } = await params;
  const supabase = (await shopAdminClient());
  const { error } = await supabase.from('categories').delete().eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
