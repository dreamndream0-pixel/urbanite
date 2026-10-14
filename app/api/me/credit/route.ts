import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/supabase/server';
import { getCurrentShop, scopedClient } from '@/lib/shop';
import { creditSummary, getLoyalty, memberTier } from '@/lib/loyalty';

export const dynamic = 'force-dynamic';

// GET /api/me/credit — 會員的回饋金與等級(目前網域的商店);未開啟回饋時 enabled=false
export async function GET() {
  const [user, shop] = await Promise.all([getSessionUser(), getCurrentShop()]);
  if (!user) return NextResponse.json({ error: '請先登入' }, { status: 401 });
  if (!shop) return NextResponse.json({ enabled: false });
  const settings = await getLoyalty(shop.id);
  if (!settings.enabled) return NextResponse.json({ enabled: false });
  const [summary, member] = await Promise.all([creditSummary(shop.id, user.id), memberTier(scopedClient(shop.id), user.id, settings)]);
  return NextResponse.json({
    enabled: true,
    ...summary,
    tier: member.tier,
    next: member.next,
    spend: member.spend,
    toNext: member.toNext,
    keptUntil: member.keptUntil,
    rules: { tiers: settings.tiers, delayDays: settings.delayDays, validDays: settings.validDays, maxRedeemPct: settings.maxRedeemPct, keepMonths: settings.keepMonths },
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
