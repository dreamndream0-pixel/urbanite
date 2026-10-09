import { notFound } from 'next/navigation';
import { getAdminUser } from '@/lib/supabase/server';
import { isCampaignLive } from '@/lib/campaign';
import type { Campaign } from '@/lib/types';
import Storefront from '@/app/components/Storefront';
import { shopAdminClient } from '@/lib/shop';

export const dynamic = 'force-dynamic';

export default async function CampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { slug } = await params;
  const preview = (await searchParams).preview === '1' && Boolean(await getAdminUser());
  const { data } = await (await shopAdminClient()).from('campaigns').select('*').eq('slug', slug).maybeSingle();
  const campaign = data as Campaign | null;
  if (!campaign) notFound();
  if (!preview && !isCampaignLive(campaign)) notFound();

  // 活動頁與主站首頁使用同一個商店畫面,只顯示該活動的商品
  return <Storefront campaign={campaign} preview={preview} />;
}
