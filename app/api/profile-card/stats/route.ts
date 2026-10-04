import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// 台灣時間的日期字串(YYYY-MM-DD)
function twDay(iso: string | number) {
  return new Date(new Date(iso).getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

// GET /api/profile-card/stats?card_id=&days=7|30 — 數據分析(限管理員)
export async function GET(request: NextRequest) {
  if (!(await getAdminUser())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const cardId = request.nextUrl.searchParams.get('card_id') ?? '';
  const days = request.nextUrl.searchParams.get('days') === '30' ? 30 : 7;
  if (!cardId) return NextResponse.json({ error: '缺少 card_id' }, { status: 400 });

  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  const { data, error } = await createAdminClient()
    .from('profile_card_events')
    .select('type, block_id, source, created_at')
    .eq('card_id', cardId)
    .gte('created_at', since)
    .limit(50000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const dayKeys = Array.from({ length: days }, (_, i) => twDay(Date.now() - (days - 1 - i) * 24 * 3600 * 1000));
  const daily = new Map(dayKeys.map((d) => [d, { day: d, views: 0, clicks: 0 }]));
  const blocks: Record<string, number> = {};
  const sources: Record<string, number> = {};
  let views = 0;
  let clicks = 0;
  for (const ev of data ?? []) {
    const bucket = daily.get(twDay(ev.created_at));
    if (ev.type === 'view') {
      views += 1;
      if (bucket) bucket.views += 1;
      sources[ev.source] = (sources[ev.source] ?? 0) + 1;
    } else {
      clicks += 1;
      if (bucket) bucket.clicks += 1;
      if (ev.block_id) blocks[ev.block_id] = (blocks[ev.block_id] ?? 0) + 1;
    }
  }
  return NextResponse.json(
    { days, views, clicks, daily: [...daily.values()], blocks, sources },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
