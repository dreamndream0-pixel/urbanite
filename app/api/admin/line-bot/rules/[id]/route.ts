import { NextResponse } from 'next/server';
import { withLineBotAdmin } from '@/lib/line-bot-admin';
import { cleanRule } from '../clean';

export const dynamic = 'force-dynamic';

// PATCH /api/admin/line-bot/rules/[id]
export function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withLineBotAdmin(async ({ db }) => {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { data, error } = await db.from('line_bot_rules').update(cleanRule(body)).eq('id', id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  });
}

// DELETE /api/admin/line-bot/rules/[id]
export function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withLineBotAdmin(async ({ db }) => {
    const { id } = await params;
    const { error } = await db.from('line_bot_rules').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  });
}
