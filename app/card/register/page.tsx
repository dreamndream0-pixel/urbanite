import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/server';
import RegisterClient from '@/app/register/RegisterClient';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: { absolute: '建立帳號 | URBANLINKS' }, robots: { index: false } };

function normalizeNext(value: string | string[] | undefined) {
  const next = Array.isArray(value) ? value[0] : value;
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/mycard';
  return next;
}

// 名片服務的註冊頁:與官網同版型,Logo 換成 URBANLINKS 的 U(帳號共用)
export default async function CardRegisterPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const nextPath = normalizeNext((await searchParams).next);
  if (await getSessionUser()) redirect(nextPath);
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  return <RegisterClient brand="card" configured={configured} nextPath={nextPath} logoUrl="/brand/u-logo.png" />;
}
