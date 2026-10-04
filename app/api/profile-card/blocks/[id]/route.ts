import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminUser } from '@/lib/supabase/server';
import type { ProfileCardBlock } from '@/lib/profile-card';

export const dynamic = 'force-dynamic';

// PATCH /api/profile-card/blocks/[id] — 編輯區塊內容 / 開關
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminUser())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of ['title', 'url', 'image', 'product_id'] as const) {
    if (typeof body[key] === 'string') update[key] = body[key].trim();
  }
  if (typeof body.enabled === 'boolean') update.enabled = body.enabled;
  const { data, error } = await createAdminClient().from('profile_card_blocks').update(update).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data as ProfileCardBlock);
}

// DELETE /api/profile-card/blocks/[id]
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminUser())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const { id } = await params;
  const { error } = await createAdminClient().from('profile_card_blocks').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
