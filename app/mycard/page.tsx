import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/supabase/server';
import { getPlanInfo } from '@/lib/card-access';
import { tierInfo } from '@/lib/card-plan';
import ProfileCardManager from '@/app/admin/ProfileCardManager';
import CardServiceHeader from '@/app/card/CardServiceHeader';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: { absolute: '我的名片 | URBANLINKS' }, robots: { index: false } };

// Pro 剩餘天數
function daysLeft(iso: string | null) {
  return iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000) : null;
}

// 會員自己的名片編輯頁(Google / LINE 等任何方式登入)
export default async function MyCardPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login?next=/mycard');
  const [{ data: settings }, plan] = await Promise.all([
    createAdminClient().from('site_settings').select('logo_url').eq('id', 1).maybeSingle(),
    getPlanInfo(user),
  ]);
  const days = daysLeft(plan.expiresAt);

  return (
    <main className="min-h-screen bg-[#f6f2ec] text-[#1f1b19]">
      <CardServiceHeader logoUrl={settings?.logo_url ?? ''} loggedIn current="mycard" />
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {!plan.isAdmin && plan.pro && days !== null && days <= 7 ? (
          <p className="mb-4 rounded-xl border border-[#f0d9b5] bg-[#fff8ec] px-4 py-3 text-sm text-[#8a5a1c]">
            {tierInfo(plan.tier).name} 還有 {days} 天到期,到期後會回到 U Free。<a href="/mycard/upgrade" className="ml-1 font-semibold underline underline-offset-2">續約</a>
          </p>
        ) : null}
        <ProfileCardManager products={[]} upgradeHref="/mycard/upgrade" />
      </div>
    </main>
  );
}
