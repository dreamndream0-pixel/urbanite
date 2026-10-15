import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAdminUser } from '@/lib/supabase/server';
import { campaignHomeHref, isCampaignLive } from '@/lib/campaign';
import { isVisibleInStore } from '@/lib/product-status';
import type { Campaign, Product } from '@/lib/types';
import ProductDetailClient from './ProductDetailClient';
import { shopAdminClient } from '@/lib/shop';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = (await shopAdminClient());
  const { data } = await supabase.from('products').select('*').eq('id', id).maybeSingle();
  const product = data as Product | null;

  if (!product) return { title: '商品不存在' };
  // 描述是 HTML,轉成純文字給搜尋引擎與分享預覽
  const description = (product.tagline ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) || undefined;

  return {
    title: product.name,
    description,
    openGraph: {
      title: product.name,
      description,
      images: product.image ? [{ url: product.image }] : undefined,
    },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = (await shopAdminClient());
  const { data } = await supabase.from('products').select('*').eq('id', id).maybeSingle();
  const product = data as Product | null;

  // 未上架,或售完自動下架的純現貨商品:前台不開放
  if (!product || !isVisibleInStore(product)) notFound();

  // 活動頁商品:活動未開放時只有管理員可預覽;頁面上的回首頁連結都回到該活動頁
  let homeHref = '/';
  if (product.campaign_id) {
    const { data: campaign } = await supabase.from('campaigns').select('*').eq('id', product.campaign_id).maybeSingle();
    if (!campaign || (!isCampaignLive(campaign as Campaign) && !(await getAdminUser()))) notFound();
    homeHref = campaignHomeHref((campaign as Campaign).slug);
  }

  // 標題上方顯示分類名稱(活動分類的代碼是自動產生的,不顯示代碼)
  let categoryName = '';
  if (product.category) {
    const { data: cat } = await supabase.from('categories').select('name').eq('slug', product.category).maybeSingle();
    categoryName = String(cat?.name ?? '');
  }

  return <ProductDetailClient product={product} homeHref={homeHref} categoryName={categoryName} />;
}
