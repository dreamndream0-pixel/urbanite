'use client';

import AdminDashboard from '@/app/admin/AdminDashboard';
import { useEffect, useState } from 'react';
import type { Banner, SiteSettings } from '@/lib/types';

const banners: Banner[] = [
  { id: 'first', image: '/card/demo-fashion.webp', title: 'First banner', link: '', active: true, sort_order: 0 },
  { id: 'second', image: '/card/demo-collection.webp', title: 'Second banner', link: '', active: true, sort_order: 1, group_no: 1 },
  { id: 'other', image: '/card/demo-creator.webp', title: 'Other group', link: '', active: true, sort_order: 0, group_no: 2 },
];

// Mount only through a temporary local test route; all mutations are intercepted by Playwright.
export default function BannerSyncFixture() {
  const [settings, setSettings] = useState<SiteSettings | undefined>(undefined);
  useEffect(() => { void fetch('/api/settings').then((res) => res.json()).then(setSettings); }, []);
  if (!settings) return <p>Loading fixture</p>;
  return <AdminDashboard initialProducts={[]} initialOrders={[]} initialCategories={[]} initialDiscounts={[]} initialCustomers={[]}
    initialBanners={banners} initialMovements={[]} initialUserCoupons={[]} initialCouponUsages={[]} initialCampaigns={[]}
    initialLogoUrl="" initialSettings={settings} userEmail="fixture@example.invalid" platform={false} shopName="Banner fixture" />;
}
