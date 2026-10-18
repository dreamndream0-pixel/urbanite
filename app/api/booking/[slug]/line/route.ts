import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/supabase/server';
import { BookingError, getPublicBusiness } from '@/lib/booking/server';
import { createBindCode, isLinked } from '@/lib/booking/line-own';
import { accountRateLimit } from '@/lib/account-rate-limit';

export const dynamic = 'force-dynamic';

const fail = (e: unknown) => {
  const err = e instanceof BookingError ? e : new BookingError('SERVER_ERROR', '操作失敗,請稍後再試。', 500);
  return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
};

// GET /api/booking/[slug]/line — 這家店是否有自己的官方 LINE、我是否已綁定
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getPublicBusiness(decodeURIComponent(slug).toLowerCase());
  if (!ctx) return fail(new BookingError('NOT_FOUND', '找不到這個預約頁。', 404));
  const b = ctx.business;
  if (!b.line_own) return NextResponse.json({ own: false });
  const user = await getSessionUser();
  return NextResponse.json({ own: true, name: b.line_name, basic_id: b.line_basic_id, bound: user ? await isLinked(b.id, user.id, 'customer') : false });
}

// POST /api/booking/[slug]/line — 取得綁定碼與開啟店家官方 LINE 的網址(會預先帶入「綁定 XXXXXX」)
export async function POST(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const user = await getSessionUser();
  if (!user) return fail(new BookingError('AUTH_REQUIRED', '請先登入。', 401));
  if (!accountRateLimit(user.id, 'booking-line-code', 10)) return fail(new BookingError('RATE_LIMITED', '操作太頻繁,請稍後再試。', 429));
  const { slug } = await params;
  const ctx = await getPublicBusiness(decodeURIComponent(slug).toLowerCase());
  if (!ctx || !ctx.business.line_own || !ctx.business.line_basic_id) return fail(new BookingError('NOT_FOUND', '這家店還沒連接 LINE 官方帳號。', 404));
  try { return NextResponse.json(await createBindCode(ctx.business.id, ctx.business.line_basic_id, user.id, 'customer')); }
  catch (e) { return fail(e); }
}
