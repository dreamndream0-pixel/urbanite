import Storefront from '@/app/components/Storefront';
import type { StorefrontBootstrap } from '@/lib/types';

const initialData: StorefrontBootstrap = {
  settings: { id: 1, logo_url: '', shop_name: 'Loading fixture', site_theme: { bannerRatios: { 1: 'wide' }, storefront: { enabled: false } } },
  banners: ['/card/demo-fashion.webp', '/card/demo-collection.webp', '/card/demo-creator.webp'].map((image, index) => ({ id: `banner-${index}`, image, title: `Banner ${index}`, link: index === 0 ? '/products/example' : '', active: true, sort_order: index, group_no: 1 })),
};

// SSR and client-only fallbacks are mounted only through a temporary local test route.
export default async function StorefrontLoadingFixture({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode } = await searchParams;
  return <Storefront initialData={mode === 'client' ? null : initialData} />;
}
