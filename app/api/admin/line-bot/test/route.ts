import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminUser } from '@/lib/supabase/server';
import { loadBotConfig, pushMessages, toLineMessages } from '@/lib/line-bot';
import type { MessageSet } from '@/lib/line-bot-types';

export const dynamic = 'force-dynamic';

// POST /api/admin/line-bot/test { content } — 傳送給自己(管理員已綁定的 LINE)預覽
export async function POST(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const { content } = (await request.json().catch(() => ({}))) as { content?: MessageSet };
  if (!content?.messages?.length) return NextResponse.json({ error: '沒有內容' }, { status: 400 });
  const { data: me } = await createAdminClient().from('customers').select('name, line_user_id, line_display_name').eq('user_id', admin.id).maybeSingle();
  if (!me?.line_user_id) return NextResponse.json({ error: '你的管理員帳號還沒綁定 LINE,請先到會員中心按「加入 LINE」' }, { status: 400 });
  try {
    const { config } = await loadBotConfig();
    const name = me.name || me.line_display_name || '你';
    const messages = await toLineMessages(content, { vars: { LINE名稱: me.line_display_name || name, 會員姓名: name }, lineUserId: me.line_user_id, trackKey: 'test' }, config.brandColor);
    if (!messages.length) return NextResponse.json({ error: '內容是空的' }, { status: 400 });
    await pushMessages(me.line_user_id, messages);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '傳送失敗' }, { status: 400 });
  }
}
