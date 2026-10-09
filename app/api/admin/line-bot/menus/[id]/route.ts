import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPlatformAdmin } from '@/lib/supabase/server';
import { publishRichMenu, unpublishRichMenu } from '@/lib/line-bot';
import type { RichMenu } from '@/lib/line-bot-types';
import { cleanMenu } from '../clean';

export const dynamic = 'force-dynamic';

// PATCH /api/admin/line-bot/menus/[id] — 儲存草稿
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getPlatformAdmin())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { data, error } = await createAdminClient().from('line_rich_menus').update(cleanMenu(body)).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

// POST /api/admin/line-bot/menus/[id]?action=publish|unpublish — 上線 / 下架
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getPlatformAdmin())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const { id } = await params;
  const action = new URL(request.url).searchParams.get('action');
  const supabase = createAdminClient();
  const { data: menu } = await supabase.from('line_rich_menus').select('*').eq('id', id).maybeSingle();
  if (!menu) return NextResponse.json({ error: '找不到選單' }, { status: 404 });
  try {
    if (action === 'unpublish') await unpublishRichMenu(menu as RichMenu);
    else await publishRichMenu(menu as RichMenu);
    const { data } = await supabase.from('line_rich_menus').select('*').order('created_at');
    return NextResponse.json({ menus: data ?? [] });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '操作失敗' }, { status: 400 });
  }
}

// DELETE /api/admin/line-bot/menus/[id]
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getPlatformAdmin())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const { id } = await params;
  const supabase = createAdminClient();
  const { data: menu } = await supabase.from('line_rich_menus').select('*').eq('id', id).maybeSingle();
  if (menu?.line_rich_menu_id) await unpublishRichMenu(menu as RichMenu).catch(() => {});
  const { error } = await supabase.from('line_rich_menus').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
