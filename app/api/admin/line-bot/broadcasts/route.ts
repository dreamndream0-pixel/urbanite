import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminUser } from '@/lib/supabase/server';
import { cleanBroadcast } from './clean';

export const dynamic = 'force-dynamic';

// POST /api/admin/line-bot/broadcasts — 新增推播(草稿)
export async function POST(request: Request) {
  if (!(await getAdminUser())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const { data, error } = await createAdminClient().from('line_broadcasts').insert(cleanBroadcast(body)).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
