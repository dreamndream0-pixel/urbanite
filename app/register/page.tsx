import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/server';
import RegisterClient from './RegisterClient';
import { shopAdminClient } from '@/lib/shop';

export const dynamic = 'force-dynamic';

function normalizeNext(value: string | string[] | undefined) {
  const next = Array.isArray(value) ? value[0] : value;
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/';
  return next;
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;
  const nextPath = normalizeNext(params.next);
  if (nextPath.startsWith('/mycard')) redirect(`/card/register?next=${encodeURIComponent(nextPath)}`);
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  let logoUrl = '';
  if (configured) {
    const sessionUser = await getSessionUser();
    if (sessionUser) redirect(nextPath);
    try {
      const { data } = await (await shopAdminClient())
        .from('site_settings')
        .select('logo_url')
        .maybeSingle();
      logoUrl = data?.logo_url ?? '';
    } catch {
      logoUrl = '';
    }
  }

  return <RegisterClient configured={configured} nextPath={nextPath} logoUrl={logoUrl} />;
}
