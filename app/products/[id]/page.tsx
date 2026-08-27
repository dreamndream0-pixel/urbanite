import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Product } from '@/lib/types';
import ProductDetailClient from './ProductDetailClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = createAdminClient();
  const { data } = await supabase.from('products').select('*').eq('id', id).maybeSingle();
  const product = data as Product | null;

  if (!product) return { title: '商品不存在' };

  return {
    title: product.name,
    description: product.tagline,
    openGraph: {
      title: product.name,
      description: product.tagline,
      images: product.image ? [{ url: product.image }] : undefined,
    },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();
  const { data } = await supabase.from('products').select('*').eq('id', id).maybeSingle();
  const product = data as Product | null;

  if (!product || product.status === '已下架') notFound();

  return <ProductDetailClient product={product} />;
}
