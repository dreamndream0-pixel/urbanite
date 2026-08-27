import { redirect } from 'next/navigation';
import { getAdminUser, getSessionUser } from '@/lib/supabase/server';
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
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;
  const nextPath = normalizeNext(params.next);
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  if (configured) {
    const sessionUser = await getSessionUser();
    if (sessionUser) {
      if (nextPath === '/admin') {
        const adminUser = await getAdminUser();
        redirect(adminUser ? '/admin' : '/');
      }
      redirect(nextPath);
    }
  }

  return <LoginClient configured={configured} nextPath={nextPath} />;
}
