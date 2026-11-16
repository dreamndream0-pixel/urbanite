import type { Metadata, Viewport } from 'next';
import { redirect } from 'next/navigation';
import { getAdminUser, getSessionUser } from '@/lib/supabase/server';
import PosApp from './PosApp';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: { absolute: 'POS 門市結帳' }, robots: { index: false, follow: false } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1 };

// POS 門市結帳:只有這家店的管理員 / 店員可以用;銷售寫進同一份訂單與庫存
export default async function PosPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect('/login?next=/pos');
  if (!(await getAdminUser())) redirect('/');
  return <PosApp />;
}
