import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { getServerRedirectOrigin } from '@/lib/site-url';
import {
  exchangeLineCode,
  fetchLineProfile,
  getLineLoginConfig,
  getLineRedirectUri,
  upsertLineAuthUser,
  upsertLineCustomer,
  verifyLineState,
} from '@/lib/line-login';

export const dynamic = 'force-dynamic';

function normalizeNext(value?: string) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/account';
  return value;
}

function loginError(origin: string, next: string, message: string) {
  const loginUrl = new URL('/login', origin);
  loginUrl.searchParams.set('next', next);
  loginUrl.searchParams.set('error', `LINE 登入失敗：${message}`);
  return NextResponse.redirect(loginUrl);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const redirectOrigin = getServerRedirectOrigin(url.origin);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const providerError = url.searchParams.get('error_description') || url.searchParams.get('error');
  const cookieHeader = request.headers.get('cookie') ?? '';
  const nextMatch = cookieHeader.match(/(?:^|;\s*)line_oauth_next=([^;]+)/);
  let next = normalizeNext(nextMatch ? decodeURIComponent(nextMatch[1]) : undefined);

  if (providerError) return loginError(redirectOrigin, next, providerError);
  if (!code || !state) return loginError(redirectOrigin, next, '登入驗證資料不完整，請重新登入');

  const { channelId, channelSecret } = getLineLoginConfig();
  if (!channelId || !channelSecret) {
    return loginError(redirectOrigin, next, 'LINE 登入尚未完成環境變數設定');
  }

  try {
    next = normalizeNext(verifyLineState(state, channelSecret).next);
    const accessToken = await exchangeLineCode({
      code,
      redirectUri: getLineRedirectUri(redirectOrigin),
      channelId,
      channelSecret,
    });
    const profile = await fetchLineProfile(accessToken);
    const { user, password, email } = await upsertLineAuthUser(profile, channelSecret);
    await upsertLineCustomer(user.id, email, profile);

    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return loginError(redirectOrigin, next, error.message);

    const response = NextResponse.redirect(`${redirectOrigin}${next}`);
    response.cookies.delete('line_oauth_next');
    return response;
  } catch (error) {
    return loginError(redirectOrigin, next, error instanceof Error ? error.message : '無法取得 LINE 使用者資料');
  }
}
