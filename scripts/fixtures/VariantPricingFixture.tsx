import AdminDashboard from '@/app/admin/AdminDashboard';
import ProductDetailClient from '@/app/products/[id]/ProductDetailClient';
import Storefront from '@/app/components/Storefront';
import CheckoutPage from '@/app/checkout/page';
import product from './variant-pricing.json';

// Mounted only by a temporary local route; browser tests intercept all API writes.
export default async function VariantPricingFixture({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode } = await searchParams;
  if (mode === 'detail') return <ProductDetailClient product={product} />;
  if (mode === 'checkout') return <CheckoutPage />;
  if (mode === 'store') return <Storefront />;
  return <AdminDashboard initialProducts={[product]} initialOrders={[]} initialCategories={[]} initialDiscounts={[]} initialCustomers={[]}
    initialBanners={[]} initialMovements={[]} initialUserCoupons={[]} initialCouponUsages={[]} initialCampaigns={[]}
    initialLogoUrl="" initialSettings={null} userEmail="fixture@example.invalid" platform={false} shopName="Pricing fixture" />;
}
