import { NextResponse } from 'next/server';
import { withLineBotAdmin } from '@/lib/line-bot-admin';
import { cleanMenu } from './clean';

export const dynamic = 'force-dynamic';

// POST /api/admin/line-bot/menus — 新增圖文選單(草稿)
export function POST(request: Request) {
  return withLineBotAdmin(async ({ db }) => {
    const body = await request.json().catch(() => ({}));
    const { data, error } = await db.from('line_rich_menus').insert(cleanMenu(body)).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  });
}
