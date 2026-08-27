import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

// 社群登入完成後,Supabase 會把使用者導回這裡,換取登入 session。
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/admin';

  if (code) {
    const supabase = await createServerSupabase();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
