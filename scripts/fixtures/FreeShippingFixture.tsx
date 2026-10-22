import PromoActivitiesManager from '@/app/admin/PromoActivitiesManager';
import CheckoutStockFixture from './CheckoutStockFixture';

export default async function FreeShippingFixture({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const params = await searchParams;
  if (params.mode === 'activities') return <main className="mx-auto max-w-3xl p-4"><PromoActivitiesManager /></main>;
  return <CheckoutStockFixture searchParams={Promise.resolve(params)} />;
}
