import { NextResponse } from 'next/server';
import { withLineBotAdmin } from '@/lib/line-bot-admin';
import { cleanBroadcast } from './clean';

export const dynamic = 'force-dynamic';

// POST /api/admin/line-bot/broadcasts — 新增推播(草稿)
export function POST(request: Request) {
  return withLineBotAdmin(async ({ db }) => {
    const body = await request.json().catch(() => ({}));
    const { data, error } = await db.from('line_broadcasts').insert(cleanBroadcast(body)).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  });
}
