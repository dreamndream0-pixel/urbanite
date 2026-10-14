import { NextResponse } from 'next/server';
import { sendBroadcast } from '@/lib/line-bot';
import { withLineBotAdmin } from '@/lib/line-bot-admin';
import { cleanBroadcast } from '../clean';

export const dynamic = 'force-dynamic';

// PATCH /api/admin/line-bot/broadcasts/[id] — 編輯草稿 / 排程
export function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withLineBotAdmin(async ({ db }) => {
    const { id } = await params;
    const { data: current } = await db.from('line_broadcasts').select('status').eq('id', id).maybeSingle();
    if (!current) return NextResponse.json({ error: '找不到推播' }, { status: 404 });
    if (['sent', 'sending'].includes(current.status)) return NextResponse.json({ error: '已送出的推播不能修改' }, { status: 400 });
    const body = await request.json().catch(() => ({}));
    const update = cleanBroadcast(body);
    if (update.status === 'scheduled' && !update.scheduled_at) return NextResponse.json({ error: '請設定排程時間' }, { status: 400 });
    const { data, error } = await db.from('line_broadcasts').update(update).eq('id', id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  });
}

// POST /api/admin/line-bot/broadcasts/[id] — 立即傳送
export function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withLineBotAdmin(async ({ db }) => {
    const { id } = await params;
    const recipients = await sendBroadcast(id);
    const { data } = await db.from('line_broadcasts').select('*').eq('id', id).single();
    return NextResponse.json({ broadcast: data, recipients });
  });
}

// DELETE /api/admin/line-bot/broadcasts/[id]
export function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withLineBotAdmin(async ({ db }) => {
    const { id } = await params;
    const { error } = await db.from('line_broadcasts').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  });
}
