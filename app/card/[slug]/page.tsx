import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminUser } from '@/lib/supabase/server';
import ProfileCardView, { type CardProduct } from '@/app/components/ProfileCardView';
import type { ProfileCard, ProfileCardBlock } from '@/lib/profile-card';

export const dynamic = 'force-dynamic';

// 對外網址為 /@代稱(next.config 改寫到這裡)
async function load(slug: string) {
  const supabase = createAdminClient();
  const { data: card } = await supabase.from('profile_cards').select('*').eq('slug', slug.toLowerCase()).maybeSingle();
  if (!card) return null;
  const [{ data: blocks }, { data: settings }] = await Promise.all([
    supabase.from('profile_card_blocks').select('*').eq('card_id', card.id).order('sort_order'),
    supabase.from('site_settings').select('logo_url').eq('id', 1).maybeSingle(),
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
  return { card: card as ProfileCard, blocks: (blocks ?? []) as ProfileCardBlock[], products, logoUrl: settings?.logo_url ?? '' };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await load(slug);
  if (!data) return { title: '找不到頁面' };
  const { card } = data;
  return {
    title: card.display_name || card.slug,
    description: card.bio || undefined,
    openGraph: { title: card.display_name || card.slug, description: card.bio || undefined, images: card.avatar_url ? [{ url: card.avatar_url }] : undefined },
  };
}

export default async function CardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await load(slug);
  if (!data) notFound();
  // 頁面關閉時只有管理員看得到(方便預覽)
  if (!data.card.published && !(await getAdminUser())) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f6f2ec] px-6 text-center text-sm text-[#8a7f72]">
        這個頁面暫停中
      </main>
    );
  }
  return (
    <main className="min-h-screen bg-[#f6f2ec]">
      <ProfileCardView card={data.card} blocks={data.blocks} products={data.products} logoUrl={data.logoUrl} />
    </main>
  );
}
