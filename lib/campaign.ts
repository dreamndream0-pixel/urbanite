import type { Campaign } from '@/lib/types';

type CampaignWindow = Pick<Campaign, 'status' | 'start_at' | 'end_at'>;

// 活動是否對顧客開放:已發佈且在活動期間內
export function isCampaignLive(campaign: CampaignWindow | null | undefined, now = Date.now()) {
  if (!campaign || campaign.status !== 'published') return false;
  if (campaign.start_at && new Date(campaign.start_at).getTime() > now) return false;
  if (campaign.end_at && new Date(campaign.end_at).getTime() < now) return false;
  return true;
}

// 活動頁網址(活動頁即該活動的商店首頁)
export function campaignHomeHref(slug: string) {
  return `/promo/${encodeURIComponent(slug)}`;
}
