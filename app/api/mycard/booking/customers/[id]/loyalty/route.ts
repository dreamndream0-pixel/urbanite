import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { BookingError, ownerBusiness } from '@/lib/booking/server';
import { adjustPoints, packagesOf, pointsOf, refundPackage, sellPackage } from '@/lib/booking/loyalty';

export const dynamic = 'force-dynamic';

const fail = (e: unknown) => {
  const err = e instanceof BookingError ? e : new BookingError('SERVER_ERROR', '操作失敗,請稍後再試。', 500);
  return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
};

async function ownedCustomer(userId: string, customerId: string) {
  const business = await ownerBusiness(userId);
  if (!business) throw new BookingError('NOT_FOUND', '請先完成預約設定。', 404);
  const { data } = await createAdminClient().from('bk_customers').select('id').eq('id', customerId).eq('business_id', business.id).maybeSingle();
  if (!data) throw new BookingError('NOT_FOUND', '找不到這位顧客。', 404);
  return business;
}

// GET — 這位顧客的套票(含剩餘次數)、點數餘額與最近點數紀錄
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return fail(new BookingError('AUTH_REQUIRED', '請先登入。', 401));
  const { id } = await params;
  try {
    await ownedCustomer(user.id, id);
    const [packages, points, { data: ledger }] = await Promise.all([
      packagesOf([id]), pointsOf([id]),
      createAdminClient().from('bk_reward_ledger').select('id, kind, points, note, created_at').eq('customer_id', id).order('id', { ascending: false }).limit(20),
    ]);
    return NextResponse.json({ packages, points: points.get(id) ?? 0, ledger: ledger ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return fail(e); }
}

// POST { action: 'sell', product_id, price, method } | { action: 'refund', package_id, note } | { action: 'adjust', points, note }
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return fail(new BookingError('AUTH_REQUIRED', '請先登入。', 401));
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    const business = await ownedCustomer(user.id, id);
    if (body?.action === 'sell') return NextResponse.json(await sellPackage(user.id, id, { productId: String(body?.product_id ?? ''), price: Number(body?.price) || 0, method: String(body?.method ?? 'cash') }));
    if (body?.action === 'refund') {
      const { data: pk } = await createAdminClient().from('bk_customer_packages').select('id').eq('id', String(body?.package_id ?? '')).eq('customer_id', id).eq('business_id', business.id).maybeSingle();
      if (!pk) throw new BookingError('NOT_FOUND', '找不到這張套票。', 404);
      return NextResponse.json({ refunded_sessions: await refundPackage(user.id, pk.id, String(body?.note ?? '')) });
    }
    if (body?.action === 'adjust') return NextResponse.json({ points: await adjustPoints(user.id, id, Number(body?.points) || 0, String(body?.note ?? '')) });
    throw new BookingError('VALIDATION_ERROR', '不支援的操作。', 422);
  } catch (e) { return fail(e); }
}
