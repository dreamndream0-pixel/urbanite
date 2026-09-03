import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getServerRedirectOrigin } from '@/lib/site-url';

// 社群登入完成後,Supabase 會把使用者導回這裡,換取登入 session。
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const providerError = searchParams.get('error_description') || searchParams.get('error');
  // 預設導回「前台首頁」;管理員登入會自行帶 next=/admin
  const next = searchParams.get('next') ?? '/';
  const redirectOrigin = getServerRedirectOrigin(origin);

  if (providerError) {
    const loginUrl = new URL('/login', redirectOrigin);
    loginUrl.searchParams.set('next', next);
    loginUrl.searchParams.set('error', `登入失敗：${providerError}`);
    return NextResponse.redirect(loginUrl);
  }

  if (code) {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const loginUrl = new URL('/login', redirectOrigin);
      loginUrl.searchParams.set('next', next);
      loginUrl.searchParams.set('error', `登入失敗：${error.message}`);
      return NextResponse.redirect(loginUrl);
    }

    // 登入即建檔:把登入帳號寫進顧客資料(管理員帳號除外)
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const adminEmails = (process.env.ADMIN_EMAILS ?? '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
      const isAdmin = adminEmails.includes((user.email ?? '').toLowerCase());
      if (!isAdmin) {
        const name =
          (user.user_metadata?.name as string) ||
          (user.user_metadata?.full_name as string) ||
          user.email ||
          '';
        const admin = createAdminClient();
        await admin
          .from('customers')
          .upsert({ user_id: user.id, email: user.email, name }, { onConflict: 'user_id' });
      }
    }
  }

  return NextResponse.redirect(`${redirectOrigin}${next}`);
}
