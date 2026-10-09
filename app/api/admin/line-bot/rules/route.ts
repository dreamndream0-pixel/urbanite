import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPlatformAdmin } from '@/lib/supabase/server';
import { cleanRule } from './clean';

export const dynamic = 'force-dynamic';

// POST /api/admin/line-bot/rules — 新增關鍵字規則(排在最前面)
export async function POST(request: Request) {
  if (!(await getPlatformAdmin())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const supabase = createAdminClient();
  const { data: first } = await supabase.from('line_bot_rules').select('sort_order').order('sort_order').limit(1).maybeSingle();
  const { data, error } = await supabase
    .from('line_bot_rules')
    .insert({ ...cleanRule(body), sort_order: (first?.sort_order ?? 0) - 1 })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

// PUT /api/admin/line-bot/rules { ids } — 排序
export async function PUT(request: Request) {
  if (!(await getPlatformAdmin())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const { ids } = (await request.json().catch(() => ({}))) as { ids?: string[] };
  if (!Array.isArray(ids)) return NextResponse.json({ error: '資料錯誤' }, { status: 400 });
  const supabase = createAdminClient();
  await Promise.all(ids.map((id, i) => supabase.from('line_bot_rules').update({ sort_order: i }).eq('id', id)));
  return NextResponse.json({ ok: true });
}
