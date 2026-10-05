import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/server';
import { getOwnedCard } from '@/lib/card-access';
import CardServiceHeader from '@/app/card/CardServiceHeader';
import SetupClient from './SetupClient';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: { absolute: '設定你的個人網址 | URBANLINKS' }, robots: { index: false } };

// 第一次登入名片服務:暱稱+自訂網址
export default async function CardSetupPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login?next=/mycard');
  const card = await getOwnedCard(user);
  if (!card || card.onboarded !== false) redirect('/mycard');

  return (
    <main className="min-h-screen bg-[#f6f2ec] text-[#1f1b19]">
      <CardServiceHeader loggedIn />
      <SetupClient name={card.display_name} slug={card.slug} />
    </main>
  );
}
