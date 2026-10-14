import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/supabase/server';
import { getCurrentShop, scopedClient } from '@/lib/shop';
import { adjustCredit, creditSummary } from '@/lib/loyalty';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ userId: string }> };

// GET /api/admin/loyalty/members/[userId] — 回饋金明細
export async function GET(_request: Request, { params }: Ctx) {
  const [admin, shop] = await Promise.all([getAdminUser(), getCurrentShop()]);
  if (!admin || !shop) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const { userId } = await params;
  return NextResponse.json(await creditSummary(shop.id, userId), { headers: { 'Cache-Control': 'private, no-store' } });
}

// POST /api/admin/loyalty/members/[userId] { amount, note } — 人工加發(正數)/ 扣除(負數),必須填原因
export async function POST(request: Request, { params }: Ctx) {
  const [admin, shop] = await Promise.all([getAdminUser(), getCurrentShop()]);
  if (!admin || !shop) return NextResponse.json({ error: '未授權' }, { status: 401 });
  const { userId } = await params;
  const body = await request.json().catch(() => ({}));
  const amount = Math.trunc(Number(body?.amount) || 0);
  const note = String(body?.note ?? '').trim().slice(0, 200);
  if (!amount) return NextResponse.json({ error: '請輸入調整金額' }, { status: 400 });
  if (!note) return NextResponse.json({ error: '請填寫調整原因' }, { status: 400 });
  const { data: member } = await scopedClient(shop.id).from('customers').select('user_id').eq('user_id', userId).maybeSingle();
  if (!member) return NextResponse.json({ error: '找不到這位會員' }, { status: 404 });
  try {
    await adjustCredit(shop.id, userId, amount, note, admin.email ?? admin.id);
    return NextResponse.json(await creditSummary(shop.id, userId));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '調整失敗' }, { status: 400 });
  }
}
