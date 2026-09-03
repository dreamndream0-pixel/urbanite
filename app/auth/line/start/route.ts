import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { getConfiguredSiteUrl, getServerRedirectOrigin } from '@/lib/site-url';
import { getLineLoginConfig, getLineRedirectUri } from '@/lib/line-login';

export const dynamic = 'force-dynamic';

function normalizeNext(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/account';
  return value;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const redirectOrigin = getServerRedirectOrigin(url.origin);
  const next = normalizeNext(url.searchParams.get('next'));

  if (url.origin !== redirectOrigin && redirectOrigin === getConfiguredSiteUrl()) {
    return NextResponse.redirect(`${redirectOrigin}/auth/line/start?next=${encodeURIComponent(next)}`);
  }

  const { channelId, channelSecret } = getLineLoginConfig();
  if (!channelId || !channelSecret) {
    const loginUrl = new URL('/login', redirectOrigin);
    loginUrl.searchParams.set('next', next);
    loginUrl.searchParams.set('error', 'LINE 登入尚未完成環境變數設定');
    return NextResponse.redirect(loginUrl);
  }

  const state = crypto.randomBytes(24).toString('hex');
  const lineUrl = new URL('https://access.line.me/oauth2/v2.1/authorize');
  lineUrl.searchParams.set('response_type', 'code');
  lineUrl.searchParams.set('client_id', channelId);
  lineUrl.searchParams.set('redirect_uri', getLineRedirectUri(redirectOrigin));
  lineUrl.searchParams.set('state', state);
  lineUrl.searchParams.set('scope', 'profile');

  const response = NextResponse.redirect(lineUrl);
  response.cookies.set('line_oauth_state', state, {
    httpOnly: true,
    secure: redirectOrigin.startsWith('https://'),
    sameSite: 'lax',
    path: '/',
    maxAge: 10 * 60,
  });
  response.cookies.set('line_oauth_next', next, {
    httpOnly: true,
    secure: redirectOrigin.startsWith('https://'),
    sameSite: 'lax',
    path: '/',
    maxAge: 10 * 60,
  });
  return response;
}
