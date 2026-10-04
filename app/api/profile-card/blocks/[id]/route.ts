import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminUser } from '@/lib/supabase/server';
import { blockOptions, IMAGE_LIMIT, LINK_TITLE_LIMIT, type ProfileCardBlock } from '@/lib/profile-card';

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
  if (typeof update.title === 'string') update.title = (update.title as string).slice(0, LINK_TITLE_LIMIT);
  if (typeof body.enabled === 'boolean') update.enabled = body.enabled;
  // 圖文連結:多張圖片與版型
  if (Array.isArray(body.items)) {
    update.items = body.items
      .filter((i: unknown) => i && typeof i === 'object' && typeof (i as { image?: unknown }).image === 'string' && (i as { image: string }).image)
      .slice(0, IMAGE_LIMIT)
      .map((i: { image: string; title?: unknown; url?: unknown }) => ({
        image: i.image.trim(),
        title: typeof i.title === 'string' ? i.title.trim().slice(0, LINK_TITLE_LIMIT) : '',
        url: typeof i.url === 'string' ? i.url.trim() : '',
      }));
    update.image = (update.items as { image: string }[])[0]?.image ?? '';
  }
  if (body.options && typeof body.options === 'object') update.options = blockOptions({ options: body.options });
  // 限時顯示:空值代表不限
  for (const key of ['start_at', 'end_at'] as const) {
    if (!(key in body)) continue;
    const date = body[key] ? new Date(String(body[key])) : null;
    update[key] = date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
  }
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
