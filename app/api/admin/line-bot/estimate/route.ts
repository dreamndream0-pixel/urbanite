import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/supabase/server';
import { audienceUserIds, getFollowerCount } from '@/lib/line-bot';
import { AUDIENCE_OPTIONS, type BroadcastAudience } from '@/lib/line-bot-types';

export const dynamic = 'force-dynamic';

// GET /api/admin/line-bot/estimate?audience= — 推播對象人數(= 會用掉的則數 × 訊息數)
export async function GET(request: Request) {
  if (!(await getAdminUser())) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const audience = new URL(request.url).searchParams.get('audience') as BroadcastAudience;
  if (!AUDIENCE_OPTIONS.some((a) => a.key === audience)) return NextResponse.json({ error: '對象錯誤' }, { status: 400 });
  if (audience === 'all') {
    const f = await getFollowerCount();
    return NextResponse.json({ count: f ? f.followers - f.blocks : null });
  }
  return NextResponse.json({ count: (await audienceUserIds(audience)).length });
}
