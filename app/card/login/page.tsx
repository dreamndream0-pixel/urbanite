import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/server';
import LoginClient from '@/app/login/LoginClient';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: { absolute: '登入 | URBANLINKS' }, robots: { index: false } };

// 只允許站內路徑,預設回我的名片
function normalizeNext(value: string | string[] | undefined) {
  const next = Array.isArray(value) ? value[0] : value;
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/mycard';
  return next;
}

// 名片服務的登入頁:與官網同版型,Logo 換成 URBANLINKS 的 U(帳號共用)
export default async function CardLoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[]; error?: string | string[] }> }) {
  const params = await searchParams;
  const nextPath = normalizeNext(params.next);
  if (await getSessionUser()) redirect(nextPath);
  const error = Array.isArray(params.error) ? params.error[0] : params.error;
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  return <LoginClient brand="card" configured={configured} nextPath={nextPath} logoUrl="/brand/u-logo.png" initialError={error ?? ''} />;
}
