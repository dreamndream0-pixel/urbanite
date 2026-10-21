'use client';

import { useEffect, useState } from 'react';
import AdminDashboard from '@/app/admin/AdminDashboard';
import type { Campaign, Product } from '@/lib/types';

const campaigns: Campaign[] = [{ id: 'campaign-a', name: '活動 A', slug: 'test-a', eyebrow: '', title: '', description: '', hero_image: '', status: 'draft', start_at: null, end_at: null, theme_color: '#702838' }];

export default function ProductOrderFixture() {
  const [products, setProducts] = useState<Product[] | null>(null);
  useEffect(() => { fetch('/api/products?fixture=1').then((r) => r.json()).then(setProducts); }, []);
  if (!products) return <p>讀取中</p>;
  return <AdminDashboard initialProducts={products} initialOrders={[]} initialCategories={[]} initialDiscounts={[]} initialCustomers={[]}
    initialBanners={[]} initialMovements={[]} initialUserCoupons={[]} initialCouponUsages={[]} initialCampaigns={campaigns}
    initialLogoUrl="" initialSettings={null} userEmail="fixture@example.invalid" platform={false} shopName="Order fixture" />;
}
