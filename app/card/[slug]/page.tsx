import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminUser, getSessionUser } from '@/lib/supabase/server';
import { getAdminEmails } from '@/lib/integrations';
import ProfileCardView, { type CardProduct } from '@/app/components/ProfileCardView';
import type { ProfileCard, ProfileCardBlock } from '@/lib/profile-card';
import type { SiteSettings } from '@/lib/types';
import { getCheckoutLine, lineAddFriendUrl } from '@/lib/checkout-line';

export const dynamic = 'force-dynamic';

// 對外網址為 /@代稱(next.config 改寫到這裡)
async function load(slug: string) {
  const supabase = createAdminClient();
  const { data: card } = await supabase.from('profile_cards').select('*').eq('slug', slug.toLowerCase()).maybeSingle();
  if (!card) return null;
  const [{ data: blocks }, { data: settings }] = await Promise.all([
    supabase.from('profile_card_blocks').select('*').eq('card_id', card.id).order('sort_order'),
    supabase.from('site_settings').select('logo_url, footer_sections').eq('id', 1).maybeSingle(),
  ]);
  const productIds = [...new Set((blocks ?? []).filter((b) => b.type === 'product' && b.product_id).map((b) => b.product_id as string))];
  const { data: rows } = productIds.length
    ? await supabase.from('products').select('id,name,price,original_price,image,images,status').in('id', productIds)
    : { data: [] };
  const products: Record<string, CardProduct> = {};
  for (const p of rows ?? []) {
    if (p.status === '已下架') continue;
    products[p.id] = { id: p.id, name: p.name, price: p.price, original_price: p.original_price, image: p.image || p.images?.[0] || '' };
  }
  // 店家的名片(擁有者是管理員):LINE 區塊未填網址時沿用「結帳頁 LINE 設定」;會員的名片不帶店家 LINE
  let isStore = !card.owner_user_id;
  if (card.owner_user_id) {
    const { data: owner } = await supabase.auth.admin.getUserById(card.owner_user_id);
    isStore = (await getAdminEmails()).includes((owner.user?.email ?? '').toLowerCase());
  }
  // 免費版會員的名片:最上方顯示「加入 URBANLINKS」橫幅
  let free = false;
  if (!isStore && card.owner_user_id) {
    const { data: sub } = await supabase.from('card_subscriptions').select('expires_at').eq('user_id', card.owner_user_id).maybeSingle();
    free = !(sub?.expires_at && new Date(sub.expires_at).getTime() > Date.now());
  }
  const lineUrl = isStore ? lineAddFriendUrl(getCheckoutLine(settings as Pick<SiteSettings, 'footer_sections'> | null)) : '';
  return { card: card as ProfileCard & { owner_user_id?: string | null }, blocks: (blocks ?? []) as ProfileCardBlock[], products: isStore ? products : {}, logoUrl: settings?.logo_url ?? '', lineUrl, isStore, free };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await load(slug);
  if (!data) return { title: '找不到頁面' };
  const { card, isStore } = data;
  // 分享預覽卡:後台「設定」的分享標題 / 說明 / 圖片優先
  const title = card.seo_title || card.display_name || card.slug;
  const description = card.seo_description || card.bio || undefined;
  const image = card.seo_image || card.avatar_url;
  return {
    // 店家名片沿用 | Urbanite;會員名片用 URBANLINKS
    title: isStore ? title : { absolute: `${title} | URBANLINKS` },
    description,
    openGraph: { title, description, images: image ? [{ url: image }] : undefined },
    twitter: { card: 'summary_large_image', title, description, images: image ? [image] : undefined },
  };
}

export default async function CardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await load(slug);
  if (!data) notFound();
  // 頁面關閉時只有擁有者與管理員看得到(方便預覽)
  const viewer = data.card.published ? null : await getSessionUser();
  if (!data.card.published && !(viewer && viewer.id === data.card.owner_user_id) && !(await getAdminUser())) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f2ec] px-6 text-center text-sm text-[#8a7f72]">
        這個頁面暫停中
      </main>
    );
  }
  return (
    <main>
      {data.free ? (
        <a href={`/card?ref=${encodeURIComponent(data.card.slug)}`} className="sticky top-0 z-50 flex h-10 items-center justify-center gap-2 bg-[#121b33] px-4 text-[13px] text-white shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
          <img src="/brand/uplus-badge.png" alt="" className="h-6 w-6 shrink-0 rounded-full" />
          <span className="truncate">加入 URBANLINKS,免費建立你的名片</span>
          <span className="shrink-0 rounded-full bg-[#dcbc84] px-2.5 py-0.5 text-[11px] font-semibold text-[#121b33]">立即建立</span>
        </a>
      ) : null}
      <ProfileCardView card={data.card} blocks={data.blocks} products={data.products} logoUrl={data.logoUrl} lineUrl={data.lineUrl} serviceFooter={!data.isStore} fullScreen />
    </main>
  );
}
