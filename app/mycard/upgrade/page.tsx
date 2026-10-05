import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSessionUser } from '@/lib/supabase/server';
import { getPlanInfo } from '@/lib/card-access';
import CardServiceHeader from '@/app/card/CardServiceHeader';
import UpgradeClient from './UpgradeClient';
import TierTable from '@/app/card/TierTable';
import { CONTACT_LINE_URL } from '@/lib/card-plan';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: { absolute: '方案 | URBANLINKS' }, robots: { index: false } };

// 名片服務方案:目前等級、付款紀錄、選擇等級與月付 / 年付
export default async function UpgradePage({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect('/login?next=/mycard/upgrade');
  const { result } = await searchParams;
  const supabase = createAdminClient();
  const [{ data: settings }, plan, { data: payments }] = await Promise.all([
    supabase.from('site_settings').select('logo_url').eq('id', 1).maybeSingle(),
    getPlanInfo(user),
    supabase.from('card_payments').select('order_no, tier, period, amount, status, paid_at, created_at').eq('user_id', user.id).eq('status', 'paid').order('paid_at', { ascending: false }).limit(10),
  ]);
  return (
    <main className="min-h-screen bg-[#f6f2ec] text-[#1f1b19]">
      <CardServiceHeader logoUrl={settings?.logo_url ?? ''} loggedIn current="upgrade" />
      <UpgradeClient plan={plan} payments={payments ?? []} result={result ?? ''} table={<TierTable current={plan.tier} />} lineUrl={CONTACT_LINE_URL} />
    </main>
  );
}
