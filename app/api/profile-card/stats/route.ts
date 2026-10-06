import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireCardOwner } from '@/lib/card-access';

export const dynamic = 'force-dynamic';

// 台灣時間的日期字串(YYYY-MM-DD)
function twDay(iso: string | number) {
  return new Date(new Date(iso).getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

// GET /api/profile-card/stats?card_id=&days=7|30 — 數據分析(限管理員)
export async function GET(request: NextRequest) {
  const owner = await requireCardOwner();
  if (!owner) return NextResponse.json({ error: '請先登入' }, { status: 401 });
  const cardId = owner.card.id;
  // 免費版只看近 7 天
  const days = request.nextUrl.searchParams.get('days') === '30' && owner.plan.limits.statsDays >= 30 ? 30 : 7;

  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  const { data, error } = await createAdminClient()
    .from('profile_card_events')
    .select('type, block_id, spot, source, created_at')
    .eq('card_id', cardId)
    .gte('created_at', since)
    .limit(50000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const dayKeys = Array.from({ length: days }, (_, i) => twDay(Date.now() - (days - 1 - i) * 24 * 3600 * 1000));
  const daily = new Map(dayKeys.map((d) => [d, { day: d, views: 0, clicks: 0 }]));
  const blocks: Record<string, number> = {};
  const spots: Record<string, Record<string, number>> = {}; // 熱區圖片:每個熱區的點擊
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
      if (ev.block_id && ev.spot) {
        const m = (spots[ev.block_id] ??= {});
        m[ev.spot] = (m[ev.spot] ?? 0) + 1;
      }
    }
  }
  return NextResponse.json(
    { days, views, clicks, daily: [...daily.values()], blocks, spots, sources: owner.plan.limits.sources ? sources : {}, sourcesLocked: !owner.plan.limits.sources },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
