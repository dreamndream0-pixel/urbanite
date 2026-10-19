'use client';

import AdminDashboard from '@/app/admin/AdminDashboard';
import type { Product } from '@/lib/types';

const base: Product = { id: 'plain', name: '無規格商品', inventory: 5, specs: [], variants: [], colors: [], sizes: [], price: 100, original_price: null, tagline: '', status: '上架中', category: '', image: '/card/demo-fashion.webp', images: [], is_featured: false, sort_order: 0 };
const products: Product[] = [
  base,
  { ...base, id: 'default-variant', name: '預設單一品項', variants: [{ options: [], inventory: 5 }] },
  { ...base, id: 'color-only', name: '只有顏色', specs: [{ name: '顏色', options: ['紅', '藍'] }], variants: [{ options: ['紅'], inventory: 2 }, { options: ['藍'], inventory: 3 }] },
  { ...base, id: 'size-only', name: '只有尺寸', specs: [{ name: '尺寸', options: ['S', 'M'] }], variants: [{ options: ['S'], inventory: 2 }, { options: ['M'], inventory: 3 }] },
  { ...base, id: 'single', name: '唯一規格', specs: [{ name: '容量', options: ['100ml'] }], variants: [{ options: ['100ml'], inventory: 5 }] },
  { ...base, id: 'complex', name: '三維規格', specs: [{ name: '顏色', options: ['紅'] }, { name: '尺寸', options: ['M'] }, { name: '材質', options: ['棉', '麻'] }], variants: [{ options: ['紅', 'M', '棉'], inventory: 2 }, { options: ['紅', 'M', '麻'], inventory: 3 }] },
  { ...base, id: 'same-a', name: '同名商品' },
  { ...base, id: 'same-b', name: '同名商品' },
];

// Local browser fixture only. Mount in a temporary route with all writes intercepted.
export default function StockMovementFixture() {
  return <AdminDashboard initialProducts={products} initialOrders={[]} initialCategories={[]} initialDiscounts={[]} initialCustomers={[]}
    initialBanners={[]} initialMovements={[]} initialUserCoupons={[]} initialCouponUsages={[]} initialCampaigns={[]}
    initialLogoUrl="" initialSettings={null} userEmail="fixture@example.invalid" platform={false} shopName="Stock fixture" />;
}
