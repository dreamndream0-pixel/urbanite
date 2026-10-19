import AdminDashboard from '@/app/admin/AdminDashboard';

// Local browser test only. Every API request is intercepted by the test runner.
export default function ProductImportFixture() {
  return <AdminDashboard initialProducts={[]} initialOrders={[]} initialCategories={[{ id: 'gift', name: '禮盒', slug: 'gifts', en: 'GIFTS', sort_order: 0 }]} initialDiscounts={[]} initialCustomers={[]}
    initialBanners={[]} initialMovements={[]} initialUserCoupons={[]} initialCouponUsages={[]} initialCampaigns={[]}
    initialLogoUrl="" initialSettings={null} userEmail="fixture@example.invalid" platform={false} shopName="Import fixture" />;
}
