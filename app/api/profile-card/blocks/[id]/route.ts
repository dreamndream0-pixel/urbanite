import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireCardOwner } from '@/lib/card-access';
import { BLOCK_TYPES, blockOptions, IMAGE_LIMIT, LINK_TITLE_LIMIT, type ProfileCardBlock } from '@/lib/profile-card';

export const dynamic = 'force-dynamic';

// PATCH /api/profile-card/blocks/[id] — 編輯區塊內容 / 開關
// 只能動自己名片的區塊
async function ownBlock(id: string) {
  const owner = await requireCardOwner();
  if (!owner) return null;
  const { data } = await createAdminClient().from('profile_card_blocks').select('id').eq('id', id).eq('card_id', owner.card.id).maybeSingle();
  return data ? owner : null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owner = await ownBlock(id);
  if (!owner) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of ['title', 'url', 'image', 'product_id'] as const) {
    if (typeof body[key] === 'string') update[key] = body[key].trim();
  }
  if (typeof update.title === 'string') update.title = (update.title as string).slice(0, LINK_TITLE_LIMIT);
  if (typeof body.enabled === 'boolean') update.enabled = body.enabled;
  // 更換區塊類型:原本的標題、網址、圖片都保留,換回來還在
  if (typeof body.type === 'string') {
    const type = body.type;
    if (!BLOCK_TYPES.some((t) => t.type === type) || (type === 'product' && !owner.plan.isAdmin)) {
      return NextResponse.json({ error: '資料格式錯誤' }, { status: 400 });
    }
    if (type === 'hotspot' && !owner.plan.limits.customStyle) {
      return NextResponse.json({ error: '熱區圖片是 U Plus 功能。', upgrade: true }, { status: 403 });
    }
    update.type = type;
  }
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
    if (!(key in body) || !owner.plan.limits.timed) continue; // 限時顯示:Pro
    const date = body[key] ? new Date(String(body[key])) : null;
    update[key] = date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
  }
  const { data, error } = await createAdminClient().from('profile_card_blocks').update(update).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data as ProfileCardBlock);
}

// DELETE /api/profile-card/blocks/[id]
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await ownBlock(id))) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const { error } = await createAdminClient().from('profile_card_blocks').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
