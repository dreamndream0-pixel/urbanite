import { redirect } from 'next/navigation';
import { getAdminUser, getSessionUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import LoginClient from './LoginClient';

export const dynamic = 'force-dynamic';

function normalizeNext(value: string | string[] | undefined) {
  const next = Array.isArray(value) ? value[0] : value;
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/account';
  return next;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; error?: string | string[] }>;
}) {
  const params = await searchParams;
  const nextPath = normalizeNext(params.next);
  const authError = Array.isArray(params.error) ? params.error[0] : params.error;
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  let logoUrl = '';
  if (configured) {
    const sessionUser = await getSessionUser();
    if (sessionUser) {
      if (nextPath === '/admin') {
        const adminUser = await getAdminUser();
        redirect(adminUser ? '/admin' : '/');
      }
      redirect(nextPath);
    }
    // 伺服器端先讀好 Logo,避免前台先閃一下文字再換成圖片
    try {
      const { data } = await createAdminClient()
        .from('site_settings')
        .select('logo_url')
        .eq('id', 1)
        .maybeSingle();
      logoUrl = data?.logo_url ?? '';
    } catch {
      logoUrl = '';
    }
  }

  return <LoginClient configured={configured} nextPath={nextPath} logoUrl={logoUrl} initialError={authError ?? ''} />;
}
