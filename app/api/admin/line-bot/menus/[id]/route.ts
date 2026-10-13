import { NextResponse } from 'next/server';
import { publishRichMenu, unpublishRichMenu } from '@/lib/line-bot';
import { withLineBotAdmin } from '@/lib/line-bot-admin';
import type { RichMenu } from '@/lib/line-bot-types';
import { cleanMenu } from '../clean';

export const dynamic = 'force-dynamic';

// PATCH /api/admin/line-bot/menus/[id] — 儲存草稿
export function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withLineBotAdmin(async ({ db }) => {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { data, error } = await db.from('line_rich_menus').update(cleanMenu(body)).eq('id', id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  });
}

// POST /api/admin/line-bot/menus/[id]?action=publish|unpublish — 上線 / 下架
export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withLineBotAdmin(async ({ db }) => {
    const { id } = await params;
    const action = new URL(request.url).searchParams.get('action');
    const { data: menu } = await db.from('line_rich_menus').select('*').eq('id', id).maybeSingle();
    if (!menu) return NextResponse.json({ error: '找不到選單' }, { status: 404 });
    if (action === 'unpublish') await unpublishRichMenu(menu as RichMenu);
    else await publishRichMenu(menu as RichMenu);
    const { data } = await db.from('line_rich_menus').select('*').order('created_at');
    return NextResponse.json({ menus: data ?? [] });
  });
}

// DELETE /api/admin/line-bot/menus/[id]
export function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withLineBotAdmin(async ({ db }) => {
    const { id } = await params;
    const { data: menu } = await db.from('line_rich_menus').select('*').eq('id', id).maybeSingle();
    if (menu?.line_rich_menu_id) await unpublishRichMenu(menu as RichMenu).catch(() => {});
    const { error } = await db.from('line_rich_menus').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  });
}
