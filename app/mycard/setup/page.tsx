import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { REFERRAL_COOKIE } from '@/lib/card-referral';
import { getSessionUser } from '@/lib/supabase/server';
import { getOwnedCard } from '@/lib/card-access';
import CardServiceHeader from '@/app/card/CardServiceHeader';
import SetupClient from './SetupClient';
import { identityShop } from '@/lib/business-identity';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: { absolute: '確認店家名稱與網址 | URBANLINKS' }, robots: { index: false } };

// 第一次登入名片服務:暱稱+自訂網址
export default async function CardSetupPage() {
  const user = await getSessionUser();
  if (!user) redirect('/card/login');
  const card = await getOwnedCard(user);
  if (!card || card.onboarded !== false) redirect('/mycard');
  const shop = await identityShop(user.id);

  return (
    <main className="min-h-screen bg-[#f6f2ec] text-[#1f1b19]">
      <CardServiceHeader loggedIn />
      <SetupClient name={shop?.name ?? card.display_name} slug={shop?.slug ?? card.slug.replace(/[._]+/g, '-')} existingShop={Boolean(shop)} referrer={(await cookies()).get(REFERRAL_COOKIE)?.value ?? ''} />
    </main>
  );
}
