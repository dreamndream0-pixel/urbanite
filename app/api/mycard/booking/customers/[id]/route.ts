import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/supabase/server';
import { BookingError } from '@/lib/booking/server';
import { createRecord, customerDetail, updateCustomer } from '@/lib/booking/customers';

export const dynamic = 'force-dynamic';

const fail = (e: unknown) => {
  const err = e instanceof BookingError ? e : new BookingError('SERVER_ERROR', '操作失敗,請稍後再試。', 500);
  return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
};

// GET /api/mycard/booking/customers/[id] — 顧客檔案:資料、預約、服務紀錄、照片清單
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return fail(new BookingError('AUTH_REQUIRED', '請先登入。', 401));
  const { id } = await params;
  try { return NextResponse.json(await customerDetail(user.id, id), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (e) { return fail(e); }
}

// PATCH /api/mycard/booking/customers/[id] { name, phone, note, tags } — 修改顧客資料與注意事項
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return fail(new BookingError('AUTH_REQUIRED', '請先登入。', 401));
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    return NextResponse.json(await updateCustomer(user.id, id, {
      name: String(body?.name ?? ''), phone: String(body?.phone ?? ''), note: String(body?.note ?? ''), tags: Array.isArray(body?.tags) ? body.tags.map(String) : [],
    }));
  } catch (e) { return fail(e); }
}

// POST /api/mycard/booking/customers/[id] { booking_id, service_name, content, performed_on, staff_id } — 新增服務紀錄
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return fail(new BookingError('AUTH_REQUIRED', '請先登入。', 401));
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    return NextResponse.json(await createRecord(user.id, id, {
      bookingId: body?.booking_id ? String(body.booking_id) : null, serviceName: String(body?.service_name ?? ''), content: String(body?.content ?? ''),
      performedOn: String(body?.performed_on ?? ''), staffId: body?.staff_id ? String(body.staff_id) : null,
    }), { status: 201 });
  } catch (e) { return fail(e); }
}
