import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/supabase/server';
import { BookingError, ownerBusiness } from '@/lib/booking/server';
import { bizWebhookUrl, createBindCode, isLinked, removeBizLine, saveBizLine } from '@/lib/booking/line-own';

export const dynamic = 'force-dynamic';

const fail = (e: unknown) => {
  const err = e instanceof BookingError ? e : new BookingError('SERVER_ERROR', '操作失敗,請稍後再試。', 500);
  return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
};
async function ctx() {
  const user = await getSessionUser();
  if (!user) throw new BookingError('AUTH_REQUIRED', '請先登入。', 401);
  const business = await ownerBusiness(user.id, true);
  if (!business) throw new BookingError('NOT_FOUND', '請先完成預約設定。', 404);
  return { user, business };
}

// GET — 連線狀態(不回傳金鑰)
export async function GET() {
  try {
    const { user, business } = await ctx();
    return NextResponse.json({
      own: business.line_own, name: business.line_name, basic_id: business.line_basic_id, webhook_url: bizWebhookUrl(business.id),
      owner_bound: business.line_own ? await isLinked(business.id, user.id, 'owner') : false,
    });
  } catch (e) { return fail(e); }
}

// PUT { channel_secret, access_token } — 連接 / 更新自己的官方帳號(會先驗證金鑰)
export async function PUT(request: Request) {
  try {
    const { business } = await ctx();
    const body = await request.json().catch(() => ({}));
    const r = await saveBizLine(business.id, { channelSecret: String(body?.channel_secret ?? ''), accessToken: String(body?.access_token ?? '') });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) { return fail(e); }
}

// POST — 店家本人的綁定碼(綁定後新預約通知從自己的官方帳號發給自己)
export async function POST() {
  try {
    const { user, business } = await ctx();
    if (!business.line_own || !business.line_basic_id) throw new BookingError('VALIDATION_ERROR', '請先連接官方帳號。', 422);
    return NextResponse.json(await createBindCode(business.id, business.line_basic_id, user.id, 'owner'));
  } catch (e) { return fail(e); }
}

// DELETE — 移除連線,改回平台官方帳號發送
export async function DELETE() {
  try {
    const { business } = await ctx();
    await removeBizLine(business.id);
    return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}
