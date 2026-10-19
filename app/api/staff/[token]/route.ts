import { NextResponse } from 'next/server';
import { BookingError } from '@/lib/booking/server';
import { portalAddLeave, portalData, portalDeleteLeave, portalSaveHours } from '@/lib/booking/staff-portal';
import { getConfiguredSiteUrl } from '@/lib/site-url';

export const dynamic = 'force-dynamic';

const fail = (e: unknown) => {
  const err = e instanceof BookingError ? e : new BookingError('SERVER_ERROR', '操作失敗,請稍後再試。', 500);
  return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status, headers: { 'Cache-Control': 'no-store' } });
};
type Ctx = { params: Promise<{ token: string }> };

// GET /api/staff/[token] — 服務人員專屬頁資料(自己的行程、班表、休假)
export async function GET(_request: Request, { params }: Ctx) {
  try { return NextResponse.json(await portalData((await params).token, getConfiguredSiteUrl()), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (e) { return fail(e); }
}

// PUT { use_business_hours, hours } — 儲存自己的每週班表
export async function PUT(request: Request, { params }: Ctx) {
  try {
    const body = await request.json().catch(() => ({}));
    await portalSaveHours((await params).token, { use_business_hours: Boolean(body?.use_business_hours), hours: body?.hours });
    return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}

// POST { start_at, end_at, reason } — 新增自己的休假
export async function POST(request: Request, { params }: Ctx) {
  try {
    const body = await request.json().catch(() => ({}));
    const affected = await portalAddLeave((await params).token, { start_at: String(body?.start_at ?? ''), end_at: String(body?.end_at ?? ''), reason: String(body?.reason ?? '') });
    return NextResponse.json({ ok: true, affected }, { status: 201 });
  } catch (e) { return fail(e); }
}

// DELETE ?id= — 刪除自己的休假
export async function DELETE(request: Request, { params }: Ctx) {
  try {
    await portalDeleteLeave((await params).token, new URL(request.url).searchParams.get('id') ?? '');
    return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}
