import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPlatformAdmin } from '@/lib/supabase/server';
import { cleanMenu } from './clean';

export const dynamic = 'force-dynamic';

// POST /api/admin/line-bot/menus — 新增圖文選單(草稿)
export async function POST(request: Request) {
  if (!(await getPlatformAdmin())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const { data, error } = await createAdminClient().from('line_rich_menus').insert(cleanMenu(body)).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
