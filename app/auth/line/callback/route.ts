import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { bindLineToUser } from '@/lib/line-messaging';
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

// 這個 LINE 是否已綁定「用其他方式註冊」的會員(Google / Email…)
async function boundMemberEmail(lineUserId: string) {
  const admin = createAdminClient();
  const { data } = await admin.from('customers').select('user_id').eq('line_user_id', lineUserId).maybeSingle();
  if (!data?.user_id) return '';
  const { data: auth } = await admin.auth.admin.getUserById(data.user_id as string);
  const email = auth.user?.email ?? '';
  return email.endsWith('@line.urbanite.com.tw') ? '' : email;
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

  const { channelId, channelSecret } = await getLineLoginConfig();
  if (!channelId || !channelSecret) {
    return loginError(redirectOrigin, next, 'LINE 登入尚未完成環境變數設定');
  }

  try {
    const lineState = verifyLineState(state, channelSecret);
    next = normalizeNext(lineState.next);
    const accessToken = await exchangeLineCode({
      code,
      redirectUri: getLineRedirectUri(redirectOrigin),
      channelId,
      channelSecret,
    });
    const profile = await fetchLineProfile(accessToken);

    // 會員中心「加入 LINE」:綁定到發起的會員(記在簽章過的 state 裡)。
    // iPhone 授權會跳到 LINE App,回來時常在 LINE 內建瀏覽器開啟、沒有官網登入狀態,所以不依賴 session。
    if (lineState.mode === 'link' && lineState.uid) {
      const linked = new URL('/line/linked', redirectOrigin);
      try {
        const { data: member } = await createAdminClient().auth.admin.getUserById(lineState.uid);
        if (!member.user) throw new Error('找不到會員帳號,請重新操作');
        // LINE 授權已證明是本人的 LINE:若綁在本人的其他帳號,轉到這個帳號
        await bindLineToUser(member.user.id, member.user.email ?? '', profile.userId, profile, { transfer: true });
        linked.searchParams.set('ok', '1');
      } catch (e) {
        linked.searchParams.set('error', e instanceof Error ? e.message : 'LINE 綁定失敗');
      }
      const response = NextResponse.redirect(linked);
      response.cookies.delete('line_oauth_next');
      return response;
    }

    const supabase = await createServerSupabase();

    // 這個 LINE 已綁定其他登入方式的會員 → 直接登入該會員,不另開 LINE 帳號
    const boundEmail = await boundMemberEmail(profile.userId);
    if (boundEmail) {
      const { data: link, error: linkError } = await createAdminClient().auth.admin.generateLink({ type: 'magiclink', email: boundEmail });
      const tokenHash = link?.properties?.hashed_token;
      if (linkError || !tokenHash) return loginError(redirectOrigin, next, linkError?.message ?? '無法登入綁定的會員帳號');
      const { error } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: tokenHash });
      if (error) return loginError(redirectOrigin, next, error.message);
    } else {
      const { user, password, email } = await upsertLineAuthUser(profile, channelSecret);
      await upsertLineCustomer(user.id, email, profile);
      // LINE 登入即完成官方帳號綁定(同一個 Provider 的 userId 相同)
      await bindLineToUser(user.id, email, profile.userId, profile).catch(() => {});

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return loginError(redirectOrigin, next, error.message);
    }

    const response = NextResponse.redirect(`${redirectOrigin}${next}`);
    response.cookies.delete('line_oauth_next');
    return response;
  } catch (error) {
    return loginError(redirectOrigin, next, error instanceof Error ? error.message : '無法取得 LINE 使用者資料');
  }
}
