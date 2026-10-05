import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/server';
import CardServiceHeader from '../CardServiceHeader';
import CardLoginClient from './CardLoginClient';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: { absolute: '登入 | URBANLINKS' }, robots: { index: false } };

// 只允許站內路徑,預設回我的名片
function normalizeNext(value: string | string[] | undefined) {
  const next = Array.isArray(value) ? value[0] : value;
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/mycard';
  return next;
}

// 名片服務自己的登入頁(與官網 /login 分開,帳號共用)
export default async function CardLoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[]; error?: string | string[] }> }) {
  const params = await searchParams;
  const nextPath = normalizeNext(params.next);
  if (await getSessionUser()) redirect(nextPath);
  const error = Array.isArray(params.error) ? params.error[0] : params.error;

  return (
    <main className="min-h-screen bg-[#f6f2ec] text-[#1f1b19]">
      <CardServiceHeader loggedIn={false} current="login" />
      <CardLoginClient nextPath={nextPath} initialError={error ?? ''} />
    </main>
  );
}
