import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/supabase/server';
import { getCheckoutLine, lineAddFriendUrl } from '@/lib/checkout-line';
import { bindLineToUser, fetchBotProfile, getMessagingConfig, verifyBindToken } from '@/lib/line-messaging';
import { createLinkToken, getLineLoginConfig } from '@/lib/line-login';
import { syncMemberMenu } from '@/lib/line-bot';

export const dynamic = 'force-dynamic';

// GET /api/me/line — 目前會員的 LINE 綁定狀態(與加入官方 LINE 的連結)
export async function GET(request: Request) {
  const user = await getSessionUser();
  const nextParam = new URL(request.url).searchParams.get('next') ?? '/account';
  const next = nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/account';
  if (!user) return NextResponse.json({ error: '請先登入' }, { status: 401 });
  const supabase = createAdminClient();
  const [{ data: customer }, { data: settings }] = await Promise.all([
    supabase.from('customers').select('line_user_id, line_display_name, line_picture_url, line_bound_at').eq('user_id', user.id).maybeSingle(),
    supabase.from('site_settings').select('footer_sections').eq('id', 1).maybeSingle(),
  ]);
  const line = getCheckoutLine(settings);
  // 「加入 LINE」專屬連結:LINE 授權途中切換到 LINE App / 內建瀏覽器也能完成綁定
  const { channelSecret: loginSecret } = await getLineLoginConfig();
  const linkUrl = loginSecret
    ? `/auth/line/start?mode=link&next=${encodeURIComponent(next)}&u=${encodeURIComponent(createLinkToken(user.id, loginSecret))}`
    : `/auth/line/start?mode=link&next=${encodeURIComponent(next)}`;
  return NextResponse.json({
    linkUrl,
    bound: Boolean(customer?.line_user_id),
    displayName: customer?.line_display_name ?? '',
    pictureUrl: customer?.line_picture_url ?? '',
    boundAt: customer?.line_bound_at ?? null,
    addFriendUrl: lineAddFriendUrl(line),
    lineId: line.id,
  });
}

// POST /api/me/line { token } — 用 LINE 傳來的綁定連結完成綁定
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '請先登入' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { token?: string };
  try {
    const { channelSecret, accessToken } = await getMessagingConfig();
    const { lineUserId } = verifyBindToken(String(body.token ?? ''), channelSecret);
    const profile = accessToken ? await fetchBotProfile(lineUserId, accessToken) : null;
    await bindLineToUser(user.id, user.email ?? '', lineUserId, profile);
    return NextResponse.json({ ok: true, displayName: profile?.displayName ?? '' });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '綁定失敗' }, { status: 400 });
  }
}

// DELETE /api/me/line — 解除綁定
export async function DELETE() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: '請先登入' }, { status: 401 });
  const supabase = createAdminClient();
  const { data: before } = await supabase.from('customers').select('line_user_id').eq('user_id', user.id).maybeSingle();
  const { error } = await supabase
    .from('customers')
    .update({ line_user_id: null, line_display_name: '', line_picture_url: '', line_bound_at: null })
    .eq('user_id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  // 換回非會員圖文選單
  if (before?.line_user_id) await syncMemberMenu(before.line_user_id, false);
  return NextResponse.json({ ok: true });
}
