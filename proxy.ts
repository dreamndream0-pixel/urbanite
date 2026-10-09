import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { shopSlugFromHost } from '@/lib/shop-host';
import { getConfiguredSiteUrl } from '@/lib/site-url';

// 每次請求刷新使用者的登入 session(Supabase 官方建議做法)。
// 尚未設定 Supabase 環境變數時直接放行,方便本機開發。
// 名片服務、LINE 綁定屬於平台(主網站);在店家子網域打開時轉回主網站
const PLATFORM_ONLY = /^\/(card|mycard|line|shop\/new|@|api\/profile-card|api\/card-import|api\/admin\/card|api\/admin\/line|api\/admin\/shops)/;

export async function proxy(request: NextRequest) {
  const slug = shopSlugFromHost(request.headers.get('x-forwarded-host') || request.headers.get('host'));
  if (slug && PLATFORM_ONLY.test(request.nextUrl.pathname)) {
    const target = new URL(request.nextUrl.pathname + request.nextUrl.search, getConfiguredSiteUrl());
    return NextResponse.redirect(target);
  }

  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return response;

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
