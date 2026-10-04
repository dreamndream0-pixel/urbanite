import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminUser } from '@/lib/supabase/server';
import { sendBroadcast } from '@/lib/line-bot';
import { cleanBroadcast } from '../clean';

export const dynamic = 'force-dynamic';

// PATCH /api/admin/line-bot/broadcasts/[id] — 編輯草稿 / 排程
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminUser())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const { id } = await params;
  const supabase = createAdminClient();
  const { data: current } = await supabase.from('line_broadcasts').select('status').eq('id', id).maybeSingle();
  if (current && ['sent', 'sending'].includes(current.status)) return NextResponse.json({ error: '已送出的推播不能修改' }, { status: 400 });
  const body = await request.json().catch(() => ({}));
  const update = cleanBroadcast(body);
  if (update.status === 'scheduled' && !update.scheduled_at) return NextResponse.json({ error: '請設定排程時間' }, { status: 400 });
  const { data, error } = await supabase.from('line_broadcasts').update(update).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

// POST /api/admin/line-bot/broadcasts/[id] — 立即傳送
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminUser())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const { id } = await params;
  try {
    const recipients = await sendBroadcast(id);
    const { data } = await createAdminClient().from('line_broadcasts').select('*').eq('id', id).single();
    return NextResponse.json({ broadcast: data, recipients });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '傳送失敗' }, { status: 400 });
  }
}

// DELETE /api/admin/line-bot/broadcasts/[id]
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminUser())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const { id } = await params;
  const { error } = await createAdminClient().from('line_broadcasts').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
