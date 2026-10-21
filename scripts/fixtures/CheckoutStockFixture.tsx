import CheckoutPage from '@/app/checkout/page';
import ProductDetailClient from '@/app/products/[id]/ProductDetailClient';
import Storefront from '@/app/components/Storefront';
import product from './variant-pricing.json';

// Only exposed through a temporary local route; all API traffic is intercepted in tests.
export default async function CheckoutStockFixture({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode } = await searchParams;
  if (mode === 'detail') return <ProductDetailClient product={product} />;
  if (mode === 'store') return <Storefront />;
  return <CheckoutPage />;
}
