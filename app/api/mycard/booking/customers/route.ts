import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/supabase/server';
import { BookingError } from '@/lib/booking/server';
import { createCustomer, listCustomers } from '@/lib/booking/customers';

export const dynamic = 'force-dynamic';

const fail = (e: unknown) => {
  const err = e instanceof BookingError ? e : new BookingError('SERVER_ERROR', '操作失敗,請稍後再試。', 500);
  return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
};

// GET /api/mycard/booking/customers?q= — 顧客列表(姓名 / 電話搜尋)
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return fail(new BookingError('AUTH_REQUIRED', '請先登入。', 401));
  try {
    const customers = await listCustomers(user.id, new URL(request.url).searchParams.get('q') ?? '');
    return NextResponse.json({ customers }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) { return fail(e); }
}

// POST /api/mycard/booking/customers { name, phone, note } — 新增顧客(電話客、現場客)
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return fail(new BookingError('AUTH_REQUIRED', '請先登入。', 401));
  const body = await request.json().catch(() => ({}));
  try {
    return NextResponse.json(await createCustomer(user.id, { name: String(body?.name ?? ''), phone: String(body?.phone ?? ''), note: String(body?.note ?? '') }), { status: 201 });
  } catch (e) { return fail(e); }
}
