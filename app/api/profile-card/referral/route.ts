import { NextResponse } from 'next/server';
import { requireCardOwner } from '@/lib/card-access';
import { getReferralStats } from '@/lib/card-referral';

// GET /api/profile-card/referral — 自己的推薦人數與獎勵
export async function GET() {
  const owner = await requireCardOwner();
  if (!owner) return NextResponse.json({ error: '請先登入' }, { status: 401 });
  const stats = await getReferralStats(owner.card.id, owner.card.referral_rewards ?? 0);
  return NextResponse.json({ slug: owner.card.slug, ...stats });
}
