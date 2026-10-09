import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPlatformAdmin, getSessionUser } from '@/lib/supabase/server';
import { getPlanInfo } from '@/lib/card-access';
import { tierRank } from '@/lib/card-plan';
import { getCurrentShop, isPlatformShop, ROOT_DOMAIN, shopUrl } from '@/lib/shop';
import { SITE_TEMPLATES } from '@/lib/site-theme';
import CardServiceHeader from '@/app/card/CardServiceHeader';
import ShopWizard from './ShopWizard';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: { absolute: '開設官網 | URBANLINKS' }, robots: { index: false } };

// 開店精靈(主網站):U Pro / U Max 會員自己開一家店,網址 slug.urbanite.com.tw
export default async function NewShopPage() {
  if (!isPlatformShop(await getCurrentShop())) redirect(`https://www.${ROOT_DOMAIN}/shop/new`);
  const user = await getSessionUser();
  if (!user) redirect('/card/login?next=/shop/new');

  const platformAdmin = Boolean(await getPlatformAdmin());
  const plan = await getPlanInfo(user);
  const eligible = platformAdmin || tierRank(plan.tier) >= tierRank('pro');
  const { data: owned } = await createAdminClient().from('shop_members').select('shop:shops(slug, name)').eq('user_id', user.id).eq('role', 'owner');
  const existing = (owned ?? []).map((m) => m.shop as unknown as { slug: string; name: string }).filter(Boolean)[0] ?? null;

  return (
    <main className="min-h-screen bg-[#f6f2ec] text-[#1f1b19]">
      <CardServiceHeader loggedIn />
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <ShopWizard
          eligible={eligible}
          promo={Boolean(plan.promo)}
          existing={existing && !platformAdmin ? { ...existing, url: shopUrl(existing.slug), adminUrl: shopUrl(existing.slug, '/admin') } : null}
          rootDomain={ROOT_DOMAIN}
          templates={SITE_TEMPLATES.map((t) => ({ key: t.key, name: t.name, note: t.note, colors: t.colors }))}
        />
      </div>
    </main>
  );
}
