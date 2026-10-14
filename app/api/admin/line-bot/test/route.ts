import { NextResponse } from 'next/server';
import { loadBotConfig, pushMessages, toLineMessages } from '@/lib/line-bot';
import { withLineBotAdmin } from '@/lib/line-bot-admin';
import type { MessageSet } from '@/lib/line-bot-types';
import { scopedClient } from '@/lib/shop';

export const dynamic = 'force-dynamic';

// POST /api/admin/line-bot/test { content } — 傳送給自己(後台帳號已綁定這家店的 LINE)預覽
export function POST(request: Request) {
  return withLineBotAdmin(async ({ admin, shop }) => {
    const { content } = (await request.json().catch(() => ({}))) as { content?: MessageSet };
    if (!content?.messages?.length) return NextResponse.json({ error: '沒有內容' }, { status: 400 });
    const { data: me } = await scopedClient(shop.id).from('customers').select('name, line_user_id, line_display_name').eq('user_id', admin.id).maybeSingle();
    if (!me?.line_user_id) return NextResponse.json({ error: '你的帳號還沒綁定這家店的 LINE,請先到會員中心按「訂閱 LINE 通知」' }, { status: 400 });
    const { config } = await loadBotConfig();
    const name = me.name || me.line_display_name || '你';
    const vars = { LINE名稱: me.line_display_name || name, 會員姓名: name, 商店名稱: shop.name };
    const messages = await toLineMessages(content, { vars, lineUserId: me.line_user_id, trackKey: 'test' }, config.brandColor);
    if (!messages.length) return NextResponse.json({ error: '內容是空的' }, { status: 400 });
    await pushMessages(me.line_user_id, messages);
    return NextResponse.json({ ok: true });
  });
}
