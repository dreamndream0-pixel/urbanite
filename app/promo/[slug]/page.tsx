import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminUser } from '@/lib/supabase/server';
import type { Campaign, CampaignProduct, SiteSettings } from '@/lib/types';
import CampaignPageClient from './CampaignPageClient';

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
  const supabase = createAdminClient();
  const { data: campaign } = await supabase.from('campaigns').select('*').eq('slug', slug).maybeSingle();
  if (!campaign) notFound();
  const item = campaign as Campaign;
  // 此頁為動態伺服器頁面；每次請求都需依實際時間判斷活動是否開放。
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const outsideWindow = (item.start_at && new Date(item.start_at).getTime() > now)
    || (item.end_at && new Date(item.end_at).getTime() < now);
  if (!preview && (item.status !== 'published' || outsideWindow)) notFound();

  const [{ data: products }, { data: settings }] = await Promise.all([
    supabase.from('campaign_products').select('*').eq('campaign_id', item.id).eq('status', '上架中').order('sort_order'),
    supabase.from('site_settings').select('*').eq('id', 1).maybeSingle(),
  ]);

  return (
    <CampaignPageClient
      campaign={item}
      products={(products ?? []) as CampaignProduct[]}
      settings={(settings ?? null) as SiteSettings | null}
      preview={preview}
    />
  );
}
