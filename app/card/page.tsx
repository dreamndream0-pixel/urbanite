import type { Metadata } from 'next';
import { getSessionUser } from '@/lib/supabase/server';
import UrbanlinksLanding from './UrbanlinksLanding';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { absolute: 'URBANLINKS｜一個網址，放進你的全部' },
  description: '從個人名片，到你的品牌商店。先從一頁開始，需要時再慢慢長大。',
};

export default async function CardServicePage() {
  const user = await getSessionUser();
  return <UrbanlinksLanding startHref={user ? '/mycard' : '/card/register'} loggedIn={Boolean(user)} />;
}
