import { NextResponse } from 'next/server';
import { getConfiguredSiteUrl, getServerRedirectOrigin } from '@/lib/site-url';
import { createLineState, getLineLoginConfig, getLineRedirectUri, verifyLinkToken } from '@/lib/line-login';
import { getSessionUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function normalizeNext(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/account';
  return value;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const redirectOrigin = getServerRedirectOrigin(url.origin);
  const next = normalizeNext(url.searchParams.get('next'));
  const linkMode = url.searchParams.get('mode') === 'link';

  if (url.origin !== redirectOrigin && redirectOrigin === getConfiguredSiteUrl()) {
    const forward = new URL('/auth/line/start', redirectOrigin);
    url.searchParams.forEach((v, k) => forward.searchParams.set(k, v));
    return NextResponse.redirect(forward);
  }

  // 會員中心「加入 LINE」:專屬連結(u=簽章)或目前登入的會員,連結自己的 LINE(同時加入官方帳號好友)
  const { channelId: cfgId, channelSecret: cfgSecret } = await getLineLoginConfig();
  const tokenUid = linkMode && cfgSecret ? verifyLinkToken(url.searchParams.get('u') ?? '', cfgSecret) : null;
  const linkUser = linkMode ? (tokenUid ? { id: tokenUid } : await getSessionUser()) : null;
  if (linkMode && !linkUser) {
    // 登入後自動接回 LINE 授權
    return NextResponse.redirect(`${redirectOrigin}/login?next=${encodeURIComponent(`/auth/line/start?mode=link&next=${next}`)}`);
  }

  const channelId = cfgId;
  const channelSecret = cfgSecret;
  if (!channelId || !channelSecret) {
    const loginUrl = new URL('/login', redirectOrigin);
    loginUrl.searchParams.set('next', next);
    loginUrl.searchParams.set('error', 'LINE 登入尚未完成環境變數設定');
    return NextResponse.redirect(loginUrl);
  }

  const state = createLineState(next, channelSecret, linkUser ? { uid: linkUser.id } : undefined);
  const lineUrl = new URL('https://access.line.me/oauth2/v2.1/authorize');
  lineUrl.searchParams.set('response_type', 'code');
  lineUrl.searchParams.set('client_id', channelId);
  lineUrl.searchParams.set('redirect_uri', getLineRedirectUri(redirectOrigin));
  lineUrl.searchParams.set('state', state);
  lineUrl.searchParams.set('scope', 'profile');
  // 授權畫面同時邀請加入官方帳號好友(需在 LINE Login channel 連結官方帳號)
  lineUrl.searchParams.set('bot_prompt', linkMode ? 'aggressive' : 'normal');

  const response = NextResponse.redirect(lineUrl);
  response.cookies.set('line_oauth_next', next, {
    httpOnly: true,
    secure: redirectOrigin.startsWith('https://'),
    sameSite: 'lax',
    path: '/',
    maxAge: 10 * 60,
  });
  return response;
}
