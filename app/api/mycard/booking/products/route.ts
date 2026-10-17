import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/supabase/server';
import { BookingError } from '@/lib/booking/server';
import { saveProduct } from '@/lib/booking/loyalty';

export const dynamic = 'force-dynamic';

// POST /api/mycard/booking/products { id?, name, service_ids, sessions, price, valid_days, active } — 新增 / 修改套票商品
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: { code: 'AUTH_REQUIRED', message: '請先登入。' } }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  try {
    return NextResponse.json(await saveProduct(user.id, {
      id: body?.id ? String(body.id) : undefined, name: String(body?.name ?? ''),
      service_ids: Array.isArray(body?.service_ids) ? body.service_ids.map(String) : [],
      sessions: Number(body?.sessions), price: Number(body?.price), valid_days: Number(body?.valid_days), active: body?.active,
    }));
  } catch (e) {
    const err = e instanceof BookingError ? e : new BookingError('SERVER_ERROR', '儲存失敗。', 500);
    return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
}
