'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase/client';
import type { Banner, Category, Customer, Discount, Order, Product, SiteSettings } from '@/lib/types';

const formatter = new Intl.NumberFormat('zh-TW', {
  style: 'currency',
  currency: 'TWD',
  maximumFractionDigits: 0,
});

const ORDER_STATUSES = ['待出貨', '備貨中', '已出貨', '已取消'];
const PRODUCT_STATUSES = ['上架中', '加購品', '已下架'];
const DEFAULT_PAYMENT_METHODS = ['綠界金流', 'Line Pay', 'Apple Pay', '取貨付款', '轉帳匯款'];
const DEFAULT_SHIPPING_METHODS = ['綠界物流-超商取貨', '綠界物流-宅配', '7-11 取貨付款', '全家 取貨付款'];

const NAV = [
  { key: 'overview', label: '總覽', Icon: IconGrid },
  { key: 'orders', label: '訂單管理', Icon: IconReceipt },
  { key: 'products', label: '商品及分類', Icon: IconTag },
  { key: 'inventory', label: '庫存管理', Icon: IconBox },
  { key: 'customers', label: '顧客管理', Icon: IconUsers },
  { key: 'promotions', label: '促銷管理', Icon: IconGift },
  { key: 'reports', label: '報表及分析', Icon: IconChart },
  { key: 'settings', label: '系統設定', Icon: IconGear },
] as const;

type SectionKey = (typeof NAV)[number]['key'];

type Draft = {
  id: string;
  name: string;
  tagline: string;
  price: number;
  original_price: number | null;
  inventory: number;
  status: string;
  category: string;
  image: string;
  images: string[];
  available_payment_methods: string[];
  available_shipping_methods: string[];
  colors: string;
  sizes: string;
  is_featured: boolean;
  sort_order: number;
};

// 每個商品最多可放的圖片數
const MAX_PRODUCT_IMAGES = 10;

function blankDraft(): Draft {
  return {
    id: '',
    name: '',
    tagline: '',
    price: 0,
    original_price: null,
    inventory: 0,
    status: '上架中',
    category: '',
    image: '',
    images: [],
    available_payment_methods: [],
    available_shipping_methods: [],
    colors: '',
    sizes: '',
    is_featured: false,
    sort_order: 0,
  };
}

function toDraft(p: Product): Draft {
  const images = p.images?.length ? p.images : p.image ? [p.image] : [];
  return {
    ...p,
    images,
    available_payment_methods: p.available_payment_methods ?? [],
    available_shipping_methods: p.available_shipping_methods ?? [],
    colors: p.colors.join(', '),
    sizes: p.sizes.join(', '),
  };
}

export default function AdminDashboard({
  initialProducts,
  initialOrders,
  initialCategories,
  initialDiscounts,
  initialCustomers,
  initialBanners,
  initialLogoUrl,
  initialSettings,
  userEmail,
}: {
  initialProducts: Product[];
  initialOrders: Order[];
  initialCategories: Category[];
  initialDiscounts: Discount[];
  initialCustomers: Customer[];
  initialBanners: Banner[];
  initialLogoUrl: string;
  initialSettings: SiteSettings | null;
  userEmail: string;
}) {
  const router = useRouter();
  const [section, setSection] = useState<SectionKey>('overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [discounts, setDiscounts] = useState<Discount[]>(initialDiscounts);
  const [customers] = useState<Customer[]>(initialCustomers);
  const [banners, setBanners] = useState<Banner[]>(initialBanners);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'general' | 'banners'>('general');
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [newCat, setNewCat] = useState({ slug: '', name: '', en: '' });
  const [newDiscount, setNewDiscount] = useState({ code: '', type: 'percent', value: 0, min_spend: 0 });
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [footerDraft, setFooterDraft] = useState({
    about: (initialSettings?.footer_about_links ?? [
      '優惠資訊 / Coupon',
      '商店介紹 / Introduction',
      '與我們合作 / Cooperation',
    ]).join('\n'),
    service: (initialSettings?.footer_service_links ?? [
      '加入會員享折扣 / VIP',
      '挑選尺寸 / About Size',
      '購物須知 / How To Buy',
      '退換貨政策 / After-sales Service',
      '使用者條款 / Terms',
      '隱私權政策 / Privacy',
    ]).join('\n'),
    serviceHours: initialSettings?.footer_service_hours ?? '上班日 11:00 - 18:00',
    email: initialSettings?.footer_email ?? '',
    companyName: initialSettings?.footer_company_name ?? '',
    taxId: initialSettings?.footer_tax_id ?? '',
    instagramUrl: initialSettings?.footer_instagram_url ?? '',
    lineUrl: initialSettings?.footer_line_url ?? '',
    payments: (initialSettings?.payment_methods?.length
      ? initialSettings.payment_methods
      : DEFAULT_PAYMENT_METHODS
    ).join('\n'),
    shippings: (initialSettings?.shipping_methods?.length
      ? initialSettings.shipping_methods
      : DEFAULT_SHIPPING_METHODS
    ).join('\n'),
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  // ---- 衍生資料 ----
  // user_id → 會員檔案,用來把訂單對照回會員
  const customerByUser = useMemo(
    () => new Map(customers.map((c) => [c.user_id, c])),
    [customers],
  );

  // 顧客列表:以「登入建檔的顧客」為主,合併其訂單統計
  const customerRows = useMemo(() => {
    const stat = new Map<string, { count: number; total: number; last: string }>();
    for (const o of orders) {
      if (!o.user_id) continue;
      const ex = stat.get(o.user_id) ?? { count: 0, total: 0, last: '' };
      ex.count += 1;
      ex.total += o.total;
      if (o.created_at && o.created_at > ex.last) ex.last = o.created_at;
      stat.set(o.user_id, ex);
    }
    return customers
      .map((c) => ({
        user_id: c.user_id,
        email: c.email,
        name: c.name,
        joined: c.created_at ?? '',
        ...(stat.get(c.user_id) ?? { count: 0, total: 0, last: '' }),
      }))
      .sort((a, b) => b.total - a.total);
  }, [customers, orders]);

  const report = useMemo(() => {
    const totalRevenue = orders.reduce((s, o) => s + o.total, 0);
    const paidRevenue = orders.filter((o) => o.paid).reduce((s, o) => s + o.total, 0);
    const orderCount = orders.length;
    const avg = orderCount ? Math.round(totalRevenue / orderCount) : 0;
    const prodMap = new Map<string, number>();
    for (const o of orders) for (const it of o.items) prodMap.set(it.name, (prodMap.get(it.name) || 0) + it.quantity);
    const topProducts = [...prodMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    return { totalRevenue, paidRevenue, orderCount, avg, topProducts };
  }, [orders]);

  const todayRevenue = useMemo(() => {
    const today = new Date().toDateString();
    return orders
      .filter((o) => o.created_at && new Date(o.created_at).toDateString() === today)
      .reduce((s, o) => s + o.total, 0);
  }, [orders]);

  const pendingCount = orders.filter((o) => o.status === '待出貨').length;
  const lowStock = products.filter((p) => p.inventory <= 10).length;
  const paymentMethods = useMemo(
    () =>
      footerDraft.payments
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    [footerDraft.payments],
  );
  const shippingMethods = useMemo(
    () =>
      footerDraft.shippings
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    [footerDraft.shippings],
  );

  // ---- 操作 ----
  async function signOut() {
    await createBrowserSupabase().auth.signOut();
    router.refresh();
  }

  async function updateOrder(id: string, patch: Partial<Pick<Order, 'status' | 'paid'>>) {
    const res = await fetch(`/api/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const updated = (await res.json()) as Order;
      setOrders((list) => list.map((o) => (o.id === id ? updated : o)));
    } else alert('更新失敗');
  }

  async function saveProduct() {
    if (!editing) return;
    const images = editing.images.filter(Boolean).slice(0, MAX_PRODUCT_IMAGES);
    const payload = {
      ...editing,
      images,
      image: images[0] ?? '', // 第一張作為封面,前台商品卡沿用 image 欄位
      colors: editing.colors.split(',').map((s) => s.trim()).filter(Boolean),
      sizes: editing.sizes.split(',').map((s) => s.trim()).filter(Boolean),
    };
    if (isNew) {
      if (!payload.id || !payload.name) return alert('請填寫商品代碼與名稱');
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setProducts((l) => [...l, data as Product]);
        setEditing(null);
      } else alert(data.error ?? '新增失敗');
    } else {
      const res = await fetch(`/api/products/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setProducts((l) => l.map((p) => (p.id === editing.id ? (data as Product) : p)));
        setEditing(null);
      } else alert(data.error ?? '更新失敗');
    }
  }

  async function deleteProduct(id: string) {
    if (!confirm('確定要刪除這個商品嗎?')) return;
    const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
    if (res.ok) setProducts((l) => l.filter((p) => p.id !== id));
    else alert('刪除失敗');
  }

  async function adjustInventory(id: string, inventory: number) {
    const value = Math.max(0, inventory);
    setProducts((l) => l.map((p) => (p.id === id ? { ...p, inventory: value } : p)));
    await fetch(`/api/products/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inventory: value }),
    });
  }

  async function saveNewCategory() {
    const slug = newCat.slug.trim().toLowerCase();
    if (!slug || !newCat.name.trim()) return alert('請填寫代碼(英文)與名稱');
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug,
        name: newCat.name.trim(),
        en: newCat.en.trim() || slug.toUpperCase(),
        sort_order: categories.length + 1,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setCategories((l) => [...l, data as Category]);
      setNewCat({ slug: '', name: '', en: '' });
    } else alert(data.error ?? '新增失敗(代碼可能重複)');
  }

  async function patchCategory(id: string, patch: Partial<Pick<Category, 'name' | 'en' | 'sort_order'>>) {
    setCategories((l) => l.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    await fetch(`/api/categories/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
  }

  async function deleteCategory(id: string) {
    if (!confirm('確定刪除這個分類嗎?(商品不會被刪,只是失去這個分類標籤)')) return;
    const res = await fetch(`/api/categories/${id}`, { method: 'DELETE' });
    if (res.ok) setCategories((l) => l.filter((c) => c.id !== id));
    else alert('刪除失敗');
  }

  async function addDiscount() {
    const code = newDiscount.code.trim().toUpperCase();
    if (!code) return alert('請填寫折扣碼');
    const res = await fetch('/api/discounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newDiscount, code }),
    });
    const data = await res.json();
    if (res.ok) {
      setDiscounts((l) => [data as Discount, ...l]);
      setNewDiscount({ code: '', type: 'percent', value: 0, min_spend: 0 });
    } else alert(data.error ?? '新增失敗(折扣碼可能重複)');
  }

  async function toggleDiscount(id: string, active: boolean) {
    setDiscounts((l) => l.map((d) => (d.id === id ? { ...d, active } : d)));
    await fetch(`/api/discounts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active }),
    });
  }

  async function deleteDiscount(id: string) {
    if (!confirm('確定刪除這個折扣碼嗎?')) return;
    const res = await fetch(`/api/discounts/${id}`, { method: 'DELETE' });
    if (res.ok) setDiscounts((l) => l.filter((d) => d.id !== id));
    else alert('刪除失敗');
  }

  async function uploadLogo(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/settings/logo', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok) setLogoUrl(data.logo_url);
      else alert(data.error ?? '上傳失敗');
    } catch {
      alert('上傳發生問題');
    } finally {
      setUploading(false);
    }
  }

  async function uploadBanner(blob: Blob, filename: string, title: string) {
    setUploadingBanner(true);
    try {
      const fd = new FormData();
      fd.append('file', blob, filename);
      fd.append('folder', 'banners');
      fd.append('productId', 'banner');
      const up = await fetch('/api/products/image', { method: 'POST', body: fd });
      const upData = await up.json();
      if (!up.ok) throw new Error(upData.error ?? '上傳失敗');
      const res = await fetch('/api/banners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: upData.image_url, title, sort_order: banners.length }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '新增失敗');
      setBanners((l) => [...l, data as Banner]);
      setCropFile(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : '上傳失敗');
    } finally {
      setUploadingBanner(false);
    }
  }

  async function updateBanner(id: string, patch: Partial<Banner>) {
    const res = await fetch(`/api/banners/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (res.ok) setBanners((l) => l.map((b) => (b.id === id ? (data as Banner) : b)));
    else alert(data.error ?? '更新失敗');
  }

  async function deleteBanner(id: string) {
    if (!confirm('確定要刪除這張輪播圖嗎?')) return;
    const res = await fetch(`/api/banners/${id}`, { method: 'DELETE' });
    if (res.ok) setBanners((l) => l.filter((b) => b.id !== id));
    else alert('刪除失敗');
  }

  async function saveFooterSettings() {
    setSavingSettings(true);
    try {
      const toLines = (value: string) =>
        value
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          footer_about_links: toLines(footerDraft.about),
          footer_service_links: toLines(footerDraft.service),
          footer_service_hours: footerDraft.serviceHours.trim(),
          footer_email: footerDraft.email.trim(),
          footer_company_name: footerDraft.companyName.trim(),
          footer_tax_id: footerDraft.taxId.trim(),
          footer_instagram_url: footerDraft.instagramUrl.trim(),
          footer_line_url: footerDraft.lineUrl.trim(),
          payment_methods: toLines(footerDraft.payments),
          shipping_methods: toLines(footerDraft.shippings),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '儲存失敗');
      alert('頁尾資訊已更新');
    } catch (error) {
      alert(error instanceof Error ? error.message : '儲存失敗');
    } finally {
      setSavingSettings(false);
    }
  }

  const activeNav = NAV.find((n) => n.key === section) ?? NAV[0];

  return (
    <div className="min-h-screen bg-[#f6f2ec] text-[#1f1b19]">
      <header className="sticky top-0 z-30 border-b border-[#e5ded4] bg-[#faf7f2]/95 backdrop-blur">
        <nav className="mx-auto grid max-w-7xl grid-cols-[1fr_auto_1fr] items-center px-4 py-4 sm:px-6">
          <div className="flex items-center">
            <button
              onClick={() => setMenuOpen(true)}
              aria-label="開啟後台選單"
              className="rounded-md p-1 text-[#1f1b19] hover:bg-[#efe8dd]"
            >
              <IconMenu />
            </button>
          </div>

          <Link href="/admin" className="justify-self-center px-2 text-center">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="mx-auto h-8 w-auto object-contain sm:h-10" />
            ) : (
              <span className="font-serif text-2xl italic tracking-wide sm:text-3xl">URBANITE</span>
            )}
          </Link>

          <div className="flex items-center justify-end">
            <Link
              href="/"
              aria-label="回到首頁"
              className="rounded-md p-2 text-[#1f1b19] hover:bg-[#efe8dd]"
            >
              <IconHome />
            </Link>
          </div>
        </nav>
      </header>

      <div
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity duration-300 ${
          menuOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={() => setMenuOpen(false)}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-full max-w-xs flex-col bg-[#faf7f2] shadow-2xl transition-transform duration-300 ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-[#e5ded4] px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tracking-[0.2em] text-[#8a7f72]">ADMIN</span>
            <span className="rounded bg-[#f3ede4] px-1.5 py-0.5 text-[10px] font-semibold text-[#8a7f72]">
              {activeNav.label}
            </span>
          </div>
          <button onClick={() => setMenuOpen(false)} aria-label="關閉選單" className="rounded-md p-1 hover:bg-[#efe8dd]">
            <IconClose />
          </button>
        </div>
        <nav className="flex flex-col gap-1 p-3">
          {NAV.map((n) => (
            <button
              key={n.key}
              onClick={() => {
                setSection(n.key);
                setMenuOpen(false);
              }}
              className={`flex items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium transition ${
                section === n.key
                  ? 'bg-[#1f1b19] text-white'
                  : 'text-[#6b6156] hover:bg-[#f3ede4]'
              }`}
            >
              <n.Icon />
              <span>{n.label}</span>
            </button>
          ))}
        </nav>
        <div className="mt-auto border-t border-[#e5ded4] p-3">
          <button
            onClick={signOut}
            className="block w-full rounded-lg px-3 py-3 text-left text-sm font-semibold text-[#c84767] hover:bg-[#f3ede4]"
          >
            登出
          </button>
        </div>
      </aside>

      {/* 主內容 */}
      <div>
        <div className="border-b border-[#e5ded4] bg-[#faf7f2] px-4 py-4 sm:px-6">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
            <h1 className="text-lg font-semibold">{activeNav.label}</h1>
            <p className="truncate text-xs text-[#8a7f72]">{userEmail}</p>
          </div>
        </div>

        <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
          {/* ===== 總覽 ===== */}
          {section === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard label="今日營收" value={formatter.format(todayRevenue)} />
                <StatCard label="待出貨訂單" value={String(pendingCount)} />
                <StatCard label="總訂單" value={String(orders.length)} />
                <StatCard label="會員數" value={String(customers.length)} />
                <StatCard label="商品數" value={String(products.length)} />
                <StatCard label="低庫存(≤10)" value={String(lowStock)} />
                <StatCard label="折扣碼" value={String(discounts.filter((d) => d.active).length)} />
                <StatCard label="總營收" value={formatter.format(report.totalRevenue)} />
              </div>
              <Card title="最近訂單">
                {orders.length === 0 ? (
                  <Empty>目前還沒有訂單。</Empty>
                ) : (
                  <div className="divide-y divide-[#efe8dd]">
                    {orders.slice(0, 6).map((o) => (
                      <div key={o.id} className="flex items-center justify-between py-3">
                        <div>
                          <p className="font-semibold">{o.order_no}</p>
                          <p className="text-sm text-[#8a7f72]">{o.customer_name}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="rounded-full bg-[#f3ede4] px-3 py-1 text-xs font-semibold text-[#6b6156]">
                            {o.status}
                          </span>
                          <span className="font-semibold">{formatter.format(o.total)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* ===== 訂單管理 ===== */}
          {section === 'orders' && (
            <Card title={`訂單(${orders.length})`}>
              {orders.length === 0 ? (
                <Empty>目前還沒有訂單。</Empty>
              ) : (
                <div className="space-y-3">
                  {orders.map((order) => (
                    <div key={order.id} className="rounded-lg border border-[#e5ded4] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{order.order_no}</p>
                          <p className="text-sm text-[#8a7f72]">
                            {(order.user_id && customerByUser.get(order.user_id)?.name) ||
                              order.customer_name}{' '}
                            ·{' '}
                            {(order.user_id && customerByUser.get(order.user_id)?.email) ||
                              order.email}
                            {order.user_id && customerByUser.has(order.user_id) ? (
                              <span className="ml-2 rounded-full bg-[#eef3ec] px-2 py-0.5 text-xs font-semibold text-[#4a7a44]">
                                會員
                              </span>
                            ) : (
                              <span className="ml-2 rounded-full bg-[#f3ede4] px-2 py-0.5 text-xs font-semibold text-[#8a7f72]">
                                訪客
                              </span>
                            )}
                          </p>
                        </div>
                        <span className="font-semibold">{formatter.format(order.total)}</span>
                      </div>
                      <ul className="mt-2 text-sm text-[#6b6156]">
                        {order.items.map((it, i) => (
                          <li key={i}>
                            {it.name} × {it.quantity}({it.variant})
                          </li>
                        ))}
                      </ul>
                      {(order.shipping_method || order.payment_method) && (
                        <p className="mt-2 text-sm text-[#8a7f72]">
                          {order.shipping_method && `送貨:${order.shipping_method}`}
                          {order.shipping_method && order.payment_method ? ' · ' : ''}
                          {order.payment_method && `付款:${order.payment_method}`}
                        </p>
                      )}
                      {order.discount > 0 && (
                        <p className="mt-1 text-sm text-[#c84767]">
                          折扣碼 {order.discount_code}:-{formatter.format(order.discount)}
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <select
                          value={order.status}
                          onChange={(e) => updateOrder(order.id, { status: e.target.value })}
                          className="rounded-full border border-[#d7c9bd] bg-white px-3 py-1.5 text-sm"
                        >
                          {ORDER_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => updateOrder(order.id, { paid: !order.paid })}
                          className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                            order.paid
                              ? 'bg-[#e9f7ee] text-[#1f7a44]'
                              : 'border border-[#d7c9bd] text-[#6b6156]'
                          }`}
                        >
                          {order.paid ? '已付款' : '未付款'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* ===== 商品及分類 ===== */}
          {section === 'products' && (
            <div className="space-y-6">
              <Card
                title="商品"
                action={
                  <button
                    onClick={() => {
                      setEditing(blankDraft());
                      setIsNew(true);
                    }}
                    className="rounded-full bg-[#1f1b19] px-3 py-2 text-sm font-semibold text-white"
                  >
                    新增商品
                  </button>
                }
              >
                <div className="space-y-3">
                  {products.map((product) => (
                    <div
                      key={product.id}
                      className="flex items-center gap-4 rounded-lg border border-[#e5ded4] p-3"
                    >
                      {product.image ? (
                        <img className="h-14 w-14 rounded-md object-cover" src={product.image} alt="" />
                      ) : (
                        <div className="h-14 w-14 rounded-md bg-[#f1e3dc]" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">
                          {product.name}
                          {product.is_featured && (
                            <span className="ml-2 rounded-full bg-[#fff1ed] px-2 py-0.5 text-xs text-[#c84767]">
                              主打
                            </span>
                          )}
                        </p>
                        <p className="text-sm text-[#8a7f72]">
                          {formatter.format(product.price)} · 庫存 {product.inventory} · {product.status}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditing(toDraft(product));
                            setIsNew(false);
                          }}
                          className="rounded-full border border-[#d7c9bd] px-3 py-2 text-sm font-semibold"
                        >
                          編輯
                        </button>
                        <button
                          onClick={() => deleteProduct(product.id)}
                          className="rounded-full border border-[#e0b4b4] px-3 py-2 text-sm font-semibold text-[#c0392b]"
                        >
                          刪除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card title="分類管理(首頁分類選單)">
                <div className="space-y-2">
                  {categories.map((c) => (
                    <div
                      key={c.id}
                      className="flex flex-wrap items-center gap-2 rounded-lg border border-[#e5ded4] p-3"
                    >
                      <input
                        value={c.en}
                        onChange={(e) =>
                          setCategories((l) => l.map((x) => (x.id === c.id ? { ...x, en: e.target.value } : x)))
                        }
                        onBlur={() => patchCategory(c.id, { name: c.name, en: c.en, sort_order: c.sort_order })}
                        placeholder="EN"
                        className="w-20 rounded border border-[#e5ded4] px-2 py-1 text-sm"
                      />
                      <input
                        value={c.name}
                        onChange={(e) =>
                          setCategories((l) => l.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)))
                        }
                        onBlur={() => patchCategory(c.id, { name: c.name, en: c.en, sort_order: c.sort_order })}
                        placeholder="名稱"
                        className="min-w-24 flex-1 rounded border border-[#e5ded4] px-2 py-1 text-sm"
                      />
                      <span className="text-xs text-[#a99e8f]">{c.slug}</span>
                      <input
                        type="number"
                        value={c.sort_order}
                        onChange={(e) =>
                          setCategories((l) =>
                            l.map((x) => (x.id === c.id ? { ...x, sort_order: Number(e.target.value) } : x)),
                          )
                        }
                        onBlur={() => patchCategory(c.id, { name: c.name, en: c.en, sort_order: c.sort_order })}
                        className="w-14 rounded border border-[#e5ded4] px-2 py-1 text-sm"
                      />
                      <button
                        onClick={() => deleteCategory(c.id)}
                        className="rounded-full border border-[#e0b4b4] px-3 py-1 text-sm font-semibold text-[#c0392b]"
                      >
                        刪除
                      </button>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#e5ded4] pt-4">
                  <input
                    value={newCat.slug}
                    onChange={(e) => setNewCat({ ...newCat, slug: e.target.value })}
                    placeholder="代碼(英文,如 dress)"
                    className="w-44 rounded border border-[#e5ded4] px-2 py-1.5 text-sm"
                  />
                  <input
                    value={newCat.name}
                    onChange={(e) => setNewCat({ ...newCat, name: e.target.value })}
                    placeholder="名稱(如 洋裝)"
                    className="w-32 rounded border border-[#e5ded4] px-2 py-1.5 text-sm"
                  />
                  <input
                    value={newCat.en}
                    onChange={(e) => setNewCat({ ...newCat, en: e.target.value })}
                    placeholder="EN(可空)"
                    className="w-24 rounded border border-[#e5ded4] px-2 py-1.5 text-sm"
                  />
                  <button
                    onClick={saveNewCategory}
                    className="rounded-full bg-[#1f1b19] px-4 py-1.5 text-sm font-semibold text-white"
                  >
                    新增分類
                  </button>
                </div>
              </Card>
            </div>
          )}

          {/* ===== 庫存管理 ===== */}
          {section === 'inventory' && (
            <Card title="庫存管理">
              <div className="space-y-2">
                {products.map((p) => (
                  <div
                    key={p.id}
                    className={`flex items-center gap-3 rounded-lg border p-3 ${
                      p.inventory <= 10 ? 'border-[#e0b4b4] bg-[#fdf5f3]' : 'border-[#e5ded4]'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{p.name}</p>
                      <p className="text-sm text-[#8a7f72]">
                        {p.status}
                        {p.inventory <= 10 && <span className="ml-2 text-[#c0392b]">庫存偏低</span>}
                      </p>
                    </div>
                    <div className="inline-flex items-center rounded-full border border-[#d7c9bd] bg-white">
                      <button className="px-3 py-1.5 text-lg" onClick={() => adjustInventory(p.id, p.inventory - 1)}>
                        -
                      </button>
                      <input
                        type="number"
                        value={p.inventory}
                        onChange={(e) => adjustInventory(p.id, Number(e.target.value))}
                        className="w-16 border-x border-[#e5ded4] px-2 py-1 text-center text-sm"
                      />
                      <button className="px-3 py-1.5 text-lg" onClick={() => adjustInventory(p.id, p.inventory + 1)}>
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* ===== 顧客管理 ===== */}
          {section === 'customers' && (
            <Card title={`會員(${customerRows.length})`}>
              {customerRows.length === 0 ? (
                <Empty>還沒有會員登入。客人用 Google 登入後就會自動建檔。</Empty>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#e5ded4] text-left text-[#8a7f72]">
                        <th className="py-2 pr-4">會員</th>
                        <th className="py-2 pr-4">訂單數</th>
                        <th className="py-2 pr-4">總消費</th>
                        <th className="py-2 pr-4">最近下單</th>
                        <th className="py-2">加入日</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customerRows.map((c) => {
                        const isOpen = expandedUser === c.user_id;
                        const memberOrders = isOpen
                          ? orders.filter((o) => o.user_id === c.user_id)
                          : [];
                        return (
                          <Fragment key={c.user_id}>
                            <tr
                              className="cursor-pointer border-b border-[#efe8dd] hover:bg-[#faf7f2]"
                              onClick={() => setExpandedUser(isOpen ? null : c.user_id)}
                            >
                              <td className="py-3 pr-4">
                                <p className="font-semibold">{c.name}</p>
                                <p className="text-xs text-[#8a7f72]">{c.email}</p>
                              </td>
                              <td className="py-3 pr-4">{c.count}</td>
                              <td className="py-3 pr-4 font-semibold">{formatter.format(c.total)}</td>
                              <td className="py-3 pr-4 text-[#6b6156]">
                                {c.last ? new Date(c.last).toLocaleDateString('zh-TW') : '-'}
                              </td>
                              <td className="py-3 text-[#6b6156]">
                                {c.joined ? new Date(c.joined).toLocaleDateString('zh-TW') : '-'}
                              </td>
                            </tr>
                            {isOpen && (
                              <tr>
                                <td colSpan={5} className="bg-[#faf7f2] px-4 py-3">
                                  {memberOrders.length === 0 ? (
                                    <p className="text-sm text-[#8a7f72]">這位會員還沒有訂單。</p>
                                  ) : (
                                    <div className="space-y-1">
                                      {memberOrders.map((o) => (
                                        <div key={o.id} className="flex justify-between text-sm">
                                          <span>
                                            {o.order_no}{' '}
                                            <span className="text-[#a99e8f]">
                                              {o.created_at
                                                ? new Date(o.created_at).toLocaleDateString('zh-TW')
                                                : ''}
                                            </span>
                                          </span>
                                          <span>
                                            <span className="mr-3 text-[#8a7f72]">{o.status}</span>
                                            {formatter.format(o.total)}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          {/* ===== 促銷管理 ===== */}
          {section === 'promotions' && (
            <Card title="折扣碼">
              <div className="space-y-2">
                {discounts.length === 0 ? (
                  <Empty>還沒有折扣碼,在下方新增一個。</Empty>
                ) : (
                  discounts.map((d) => (
                    <div
                      key={d.id}
                      className="flex flex-wrap items-center gap-3 rounded-lg border border-[#e5ded4] p-3"
                    >
                      <span className="rounded bg-[#1f1b19] px-2 py-1 text-sm font-semibold text-white">
                        {d.code}
                      </span>
                      <span className="text-sm text-[#6b6156]">
                        {d.type === 'percent' ? `折 ${d.value}%` : `折 ${formatter.format(d.value)}`}
                        {d.min_spend > 0 && ` · 滿 ${formatter.format(d.min_spend)}`}
                      </span>
                      <div className="ml-auto flex items-center gap-2">
                        <button
                          onClick={() => toggleDiscount(d.id, !d.active)}
                          className={`rounded-full px-3 py-1 text-sm font-semibold ${
                            d.active ? 'bg-[#e9f7ee] text-[#1f7a44]' : 'border border-[#d7c9bd] text-[#8a7f72]'
                          }`}
                        >
                          {d.active ? '啟用中' : '已停用'}
                        </button>
                        <button
                          onClick={() => deleteDiscount(d.id)}
                          className="rounded-full border border-[#e0b4b4] px-3 py-1 text-sm font-semibold text-[#c0392b]"
                        >
                          刪除
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-[#e5ded4] pt-4">
                <Labeled label="折扣碼">
                  <input
                    value={newDiscount.code}
                    onChange={(e) => setNewDiscount({ ...newDiscount, code: e.target.value })}
                    placeholder="SALE10"
                    className="w-28 rounded border border-[#e5ded4] px-2 py-1.5 text-sm"
                  />
                </Labeled>
                <Labeled label="類型">
                  <select
                    value={newDiscount.type}
                    onChange={(e) => setNewDiscount({ ...newDiscount, type: e.target.value })}
                    className="rounded border border-[#e5ded4] px-2 py-1.5 text-sm"
                  >
                    <option value="percent">打折 %</option>
                    <option value="amount">折抵金額</option>
                  </select>
                </Labeled>
                <Labeled label={newDiscount.type === 'percent' ? '折幾 %' : '折多少元'}>
                  <input
                    type="number"
                    value={newDiscount.value}
                    onChange={(e) => setNewDiscount({ ...newDiscount, value: Number(e.target.value) })}
                    className="w-20 rounded border border-[#e5ded4] px-2 py-1.5 text-sm"
                  />
                </Labeled>
                <Labeled label="最低消費">
                  <input
                    type="number"
                    value={newDiscount.min_spend}
                    onChange={(e) => setNewDiscount({ ...newDiscount, min_spend: Number(e.target.value) })}
                    className="w-24 rounded border border-[#e5ded4] px-2 py-1.5 text-sm"
                  />
                </Labeled>
                <button
                  onClick={addDiscount}
                  className="rounded-full bg-[#1f1b19] px-4 py-1.5 text-sm font-semibold text-white"
                >
                  新增
                </button>
              </div>
            </Card>
          )}

          {/* ===== 報表及分析 ===== */}
          {section === 'reports' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard label="總營收" value={formatter.format(report.totalRevenue)} />
                <StatCard label="已付款營收" value={formatter.format(report.paidRevenue)} />
                <StatCard label="總訂單數" value={String(report.orderCount)} />
                <StatCard label="平均客單價" value={formatter.format(report.avg)} />
              </div>
              <Card title="熱銷商品 Top 5">
                {report.topProducts.length === 0 ? (
                  <Empty>還沒有銷售資料。</Empty>
                ) : (
                  <div className="space-y-2">
                    {report.topProducts.map(([name, qty], i) => (
                      <div key={name} className="flex items-center gap-3">
                        <span className="w-6 text-center font-semibold text-[#8a7f72]">{i + 1}</span>
                        <span className="flex-1 truncate">{name}</span>
                        <span className="font-semibold">{qty} 件</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* ===== 系統設定 ===== */}
          {section === 'settings' && (
            <div className="space-y-6">
              <div className="flex gap-2 border-b border-[#e5ded4]">
                {([
                  { key: 'general', label: '一般設定' },
                  { key: 'banners', label: '輪播圖' },
                ] as const).map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setSettingsTab(t.key)}
                    className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition ${
                      settingsTab === t.key
                        ? 'border-[#1f1b19] text-[#1f1b19]'
                        : 'border-transparent text-[#8a7f72] hover:text-[#1f1b19]'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {settingsTab === 'banners' && (
                <Card title="首頁輪播圖">
                  <p className="mb-4 text-sm text-[#8a7f72]">
                    顯示在首頁最上方,可放多張。第一張(排序小的)先顯示,前台每 4 秒自動切換,也可左右滑動。
                  </p>
                  <label className="mb-5 inline-flex cursor-pointer items-center rounded-full bg-[#1f1b19] px-5 py-2.5 text-sm font-semibold text-white">
                    {uploadingBanner ? '處理中…' : '+ 新增輪播圖'}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="hidden"
                      disabled={uploadingBanner}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) uploadBanner(file, file.name, file.name);
                        e.target.value = '';
                      }}
                    />
                  </label>

                  {banners.length === 0 ? (
                    <p className="rounded-lg bg-[#f6f2ec] p-5 text-sm text-[#6b6156]">
                      還沒有輪播圖,上傳一張開始吧。
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {banners.map((banner, index) => (
                        <div
                          key={banner.id}
                          className="flex flex-col gap-3 rounded-xl border border-[#e5ded4] p-3 sm:flex-row sm:items-center"
                        >
                          <div className="h-20 w-36 shrink-0 overflow-hidden rounded-lg bg-[#f6f2ec]">
                            <img src={banner.image} alt="" className="h-full w-full object-contain" />
                          </div>
                          <div className="flex-1">
                            {banner.title && (
                              <p className="mb-1 truncate text-xs text-[#8a7f72]">檔名：{banner.title}</p>
                            )}
                            <input
                              className="w-full rounded-lg border border-[#e5ded4] px-3 py-2 text-sm"
                              placeholder="點擊後前往的網址(可空)"
                              defaultValue={banner.link}
                              onBlur={(e) => {
                                if (e.target.value !== banner.link) updateBanner(banner.id, { link: e.target.value });
                              }}
                            />
                            <label className="mt-2 flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={banner.active}
                                onChange={(e) => updateBanner(banner.id, { active: e.target.checked })}
                              />
                              <span>{banner.active ? '顯示中' : '已隱藏'}</span>
                            </label>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="cursor-pointer rounded-lg border border-[#d7c9bd] px-3 py-2 text-sm font-semibold">
                              換圖
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp,image/gif"
                                className="hidden"
                                disabled={uploadingBanner}
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  e.target.value = '';
                                  if (!file) return;
                                  setUploadingBanner(true);
                                  try {
                                    const fd = new FormData();
                                    fd.append('file', file);
                                    fd.append('folder', 'banners');
                                    fd.append('productId', 'banner');
                                    const up = await fetch('/api/products/image', { method: 'POST', body: fd });
                                    const upData = await up.json();
                                    if (!up.ok) throw new Error(upData.error ?? '上傳失敗');
                                    await updateBanner(banner.id, { image: upData.image_url, title: file.name });
                                  } catch (error) {
                                    alert(error instanceof Error ? error.message : '上傳失敗');
                                  } finally {
                                    setUploadingBanner(false);
                                  }
                                }}
                              />
                            </label>
                            <button
                              onClick={() => {
                                if (index === 0) return;
                                const prev = banners[index - 1];
                                updateBanner(banner.id, { sort_order: prev.sort_order });
                                updateBanner(prev.id, { sort_order: banner.sort_order });
                                setBanners((l) => {
                                  const next = [...l];
                                  [next[index - 1], next[index]] = [next[index], next[index - 1]];
                                  return next;
                                });
                              }}
                              disabled={index === 0}
                              className="rounded-lg border border-[#d7c9bd] px-3 py-2 text-sm disabled:opacity-30"
                              aria-label="上移"
                            >
                              ↑
                            </button>
                            <button
                              onClick={() => deleteBanner(banner.id)}
                              className="rounded-lg border border-[#e0b4b4] px-3 py-2 text-sm font-semibold text-[#c0392b]"
                            >
                              刪除
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              )}

              {settingsTab === 'general' && (
              <>
              <Card title="網站 Logo">
                <div className="flex flex-wrap items-center gap-5">
                  <div className="flex h-16 w-40 items-center justify-center rounded-lg border border-[#e5ded4] bg-white">
                    {logoUrl ? (
                      <img src={logoUrl} alt="Logo" className="max-h-12 max-w-full object-contain" />
                    ) : (
                      <span className="text-sm text-[#a99e8f]">目前用文字 Logo</span>
                    )}
                  </div>
                  <div>
                    <label className="inline-block cursor-pointer rounded-full bg-[#1f1b19] px-4 py-2 text-sm font-semibold text-white">
                      {uploading ? '上傳中…' : '上傳 Logo 圖片'}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
                        className="hidden"
                        disabled={uploading}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) uploadLogo(f);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    <p className="mt-2 max-w-xs text-xs text-[#8a7f72]">
                      PNG / JPG / WEBP / SVG,建議寬版、透明背景,小於 3MB。上傳後首頁與後台 Logo 都會更新。
                    </p>
                  </div>
                </div>
              </Card>

              <Card
                title="頁尾資訊"
                action={
                  <button
                    onClick={saveFooterSettings}
                    disabled={savingSettings}
                    className="rounded-full bg-[#1f1b19] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {savingSettings ? '儲存中...' : '儲存頁尾'}
                  </button>
                }
              >
                <div className="grid gap-4 lg:grid-cols-2">
                  <Field label="關於我們連結(一行一筆)">
                    <textarea
                      value={footerDraft.about}
                      onChange={(e) => setFooterDraft({ ...footerDraft, about: e.target.value })}
                      rows={5}
                      className="w-full rounded-lg border border-[#e5ded4] px-3 py-2"
                    />
                  </Field>
                  <Field label="顧客服務連結(一行一筆)">
                    <textarea
                      value={footerDraft.service}
                      onChange={(e) => setFooterDraft({ ...footerDraft, service: e.target.value })}
                      rows={5}
                      className="w-full rounded-lg border border-[#e5ded4] px-3 py-2"
                    />
                  </Field>
                  <Field label="服務時間">
                    <input
                      value={footerDraft.serviceHours}
                      onChange={(e) => setFooterDraft({ ...footerDraft, serviceHours: e.target.value })}
                      className="w-full rounded-lg border border-[#e5ded4] px-3 py-2"
                    />
                  </Field>
                  <Field label="信箱">
                    <input
                      value={footerDraft.email}
                      onChange={(e) => setFooterDraft({ ...footerDraft, email: e.target.value })}
                      className="w-full rounded-lg border border-[#e5ded4] px-3 py-2"
                    />
                  </Field>
                  <Field label="公司名稱">
                    <input
                      value={footerDraft.companyName}
                      onChange={(e) => setFooterDraft({ ...footerDraft, companyName: e.target.value })}
                      className="w-full rounded-lg border border-[#e5ded4] px-3 py-2"
                    />
                  </Field>
                  <Field label="統一編號">
                    <input
                      value={footerDraft.taxId}
                      onChange={(e) => setFooterDraft({ ...footerDraft, taxId: e.target.value })}
                      className="w-full rounded-lg border border-[#e5ded4] px-3 py-2"
                    />
                  </Field>
                  <Field label="Instagram 連結">
                    <input
                      value={footerDraft.instagramUrl}
                      onChange={(e) => setFooterDraft({ ...footerDraft, instagramUrl: e.target.value })}
                      className="w-full rounded-lg border border-[#e5ded4] px-3 py-2"
                    />
                  </Field>
                  <Field label="LINE 連結">
                    <input
                      value={footerDraft.lineUrl}
                      onChange={(e) => setFooterDraft({ ...footerDraft, lineUrl: e.target.value })}
                      className="w-full rounded-lg border border-[#e5ded4] px-3 py-2"
                    />
                  </Field>
                  <Field label="金流方式(一行一筆)">
                    <textarea
                      value={footerDraft.payments}
                      onChange={(e) => setFooterDraft({ ...footerDraft, payments: e.target.value })}
                      rows={5}
                      className="w-full rounded-lg border border-[#e5ded4] px-3 py-2"
                    />
                  </Field>
                  <Field label="物流方式(一行一筆)">
                    <textarea
                      value={footerDraft.shippings}
                      onChange={(e) => setFooterDraft({ ...footerDraft, shippings: e.target.value })}
                      rows={5}
                      className="w-full rounded-lg border border-[#e5ded4] px-3 py-2"
                    />
                  </Field>
                </div>
              </Card>
              </>
              )}
            </div>
          )}
        </main>
      </div>

      {editing && (
        <ProductModal
          draft={editing}
          isNew={isNew}
          categories={categories}
          paymentMethods={paymentMethods}
          shippingMethods={shippingMethods}
          onChange={setEditing}
          onClose={() => setEditing(null)}
          onSave={saveProduct}
        />
      )}

      {cropFile && (
        <BannerCropModal
          file={cropFile}
          busy={uploadingBanner}
          onCancel={() => setCropFile(null)}
          onConfirm={(blob, filename) => uploadBanner(blob, filename, filename)}
        />
      )}
    </div>
  );
}

type CropRect = { x: number; y: number; w: number; h: number };
const ASPECTS: { label: string; value: number | null }[] = [
  { label: '自由', value: null },
  { label: '16:9', value: 16 / 9 },
  { label: '3:2', value: 3 / 2 },
  { label: '4:3', value: 4 / 3 },
  { label: '1:1', value: 1 },
];

function BannerCropModal({
  file,
  busy,
  onCancel,
  onConfirm,
}: {
  file: File;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (blob: Blob, filename: string) => void;
}) {
  const [url] = useState(() => URL.createObjectURL(file));
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [aspect, setAspect] = useState<number | null>(16 / 9);
  const [crop, setCrop] = useState<CropRect>({ x: 0.05, y: 0.05, w: 0.9, h: 0.5 });
  const boxRef = useRef<HTMLDivElement>(null);
  const imgElRef = useRef<HTMLImageElement>(null);
  const drag = useRef<{ mode: 'move' | 'resize'; px: number; py: number; start: CropRect } | null>(null);

  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  // 依所選比例把裁切框置中
  function centerFor(a: number | null): CropRect {
    if (!a || !natural.w || !boxRef.current) return { x: 0.05, y: 0.05, w: 0.9, h: 0.5 };
    const rect = boxRef.current.getBoundingClientRect();
    let w = 0.9;
    const hPx = (w * rect.width) / a;
    let h = hPx / rect.height;
    if (h > 0.9) {
      h = 0.9;
      const wPx = h * rect.height * a;
      w = wPx / rect.width;
    }
    return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
  }

  function pickAspect(a: number | null) {
    setAspect(a);
    if (a) setCrop(centerFor(a));
  }

  function clamp(c: CropRect): CropRect {
    const w = Math.min(1, Math.max(0.1, c.w));
    const h = Math.min(1, Math.max(0.1, c.h));
    const x = Math.min(1 - w, Math.max(0, c.x));
    const y = Math.min(1 - h, Math.max(0, c.y));
    return { x, y, w, h };
  }

  function onPointerDown(mode: 'move' | 'resize', e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { mode, px: e.clientX, py: e.clientY, start: crop };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current || !boxRef.current) return;
    const rect = boxRef.current.getBoundingClientRect();
    const dx = (e.clientX - drag.current.px) / rect.width;
    const dy = (e.clientY - drag.current.py) / rect.height;
    const s = drag.current.start;
    if (drag.current.mode === 'move') {
      setCrop(clamp({ ...s, x: s.x + dx, y: s.y + dy }));
    } else {
      let w = s.w + dx;
      let h: number;
      if (aspect) {
        w = Math.min(1 - s.x, Math.max(0.1, w));
        h = (w * rect.width) / aspect / rect.height;
      } else {
        h = s.h + dy;
      }
      setCrop(clamp({ ...s, w, h }));
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    drag.current = null;
  }

  const outW = Math.round(crop.w * natural.w);
  const outH = Math.round(crop.h * natural.h);

  function apply() {
    const img = imgElRef.current;
    if (!img) return;
    const sw = crop.w * natural.w;
    const sh = crop.h * natural.h;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sw));
    canvas.height = Math.max(1, Math.round(sh));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, crop.x * natural.w, crop.y * natural.h, sw, sh, 0, 0, canvas.width, canvas.height);
    const base = file.name.replace(/\.[^.]+$/, '') || 'banner';
    canvas.toBlob(
      (blob) => {
        if (blob) onConfirm(blob, `${base}.jpg`);
      },
      'image/jpeg',
      0.9,
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-6">
        <h2 className="text-xl font-semibold">新增輪播圖 — 編輯裁切</h2>

        {/* 檔案資訊 */}
        <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-[#f6f2ec] p-3 text-xs text-[#6b6156] sm:grid-cols-4">
          <span className="truncate">檔名：{file.name}</span>
          <span>類型：{file.type.replace('image/', '') || '—'}</span>
          <span>原始尺寸：{natural.w}×{natural.h}</span>
          <span>檔案大小：{(file.size / 1024).toFixed(0)} KB</span>
        </div>

        {/* 比例選擇 */}
        <div className="mt-4 flex flex-wrap gap-2">
          {ASPECTS.map((a) => (
            <button
              key={a.label}
              onClick={() => pickAspect(a.value)}
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${
                aspect === a.value ? 'border-[#1f1b19] bg-[#1f1b19] text-white' : 'border-[#d7c9bd]'
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>

        {/* 裁切區 */}
        <div
          ref={boxRef}
          className="relative mt-4 select-none overflow-hidden rounded-lg bg-[#eee8e1]"
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <img
            ref={imgElRef}
            src={url}
            alt=""
            draggable={false}
            onLoad={(e) => {
              const el = e.currentTarget;
              setNatural({ w: el.naturalWidth, h: el.naturalHeight });
            }}
            className="pointer-events-none block max-h-[50vh] w-full object-contain"
          />
          {/* 遮罩 + 裁切框 */}
          <div
            className="absolute cursor-move border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
            style={{
              left: `${crop.x * 100}%`,
              top: `${crop.y * 100}%`,
              width: `${crop.w * 100}%`,
              height: `${crop.h * 100}%`,
            }}
            onPointerDown={(e) => onPointerDown('move', e)}
          >
            <div
              className="absolute -bottom-2 -right-2 h-4 w-4 cursor-se-resize rounded-full border-2 border-[#1f1b19] bg-white"
              onPointerDown={(e) => onPointerDown('resize', e)}
            />
          </div>
        </div>

        <p className="mt-3 text-sm text-[#6b6156]">
          顯示大小(裁切後):<span className="font-semibold">{outW}×{outH}</span> px
        </p>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-full border border-[#d7c9bd] px-5 py-2 text-sm font-semibold disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={apply}
            disabled={busy || !natural.w}
            className="rounded-full bg-[#1f1b19] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? '上傳中…' : '裁切並上傳'}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#e5ded4] bg-white p-4">
      <p className="text-sm text-[#8a7f72]">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function Card({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[#e5ded4] bg-white p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg bg-[#f6f2ec] p-6 text-center text-[#6b6156]">{children}</p>;
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-[#8a7f72]">{label}</span>
      {children}
    </label>
  );
}

function ProductModal({
  draft,
  isNew,
  categories,
  paymentMethods,
  shippingMethods,
  onChange,
  onClose,
  onSave,
}: {
  draft: Draft;
  isNew: boolean;
  categories: Category[];
  paymentMethods: string[];
  shippingMethods: string[];
  onChange: (d: Draft) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const [uploadingImage, setUploadingImage] = useState(false);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    onChange({ ...draft, [key]: value });
  }

  function toggleMethod(
    key: 'available_payment_methods' | 'available_shipping_methods',
    method: string,
    checked: boolean,
  ) {
    const current = draft[key];
    const next = checked ? [...current, method] : current.filter((item) => item !== method);
    set(key, next);
  }

  async function uploadProductImages(files: File[]) {
    const room = MAX_PRODUCT_IMAGES - draft.images.length;
    if (room <= 0) {
      alert(`最多只能放 ${MAX_PRODUCT_IMAGES} 張圖片`);
      return;
    }
    const picked = files.slice(0, room);
    setUploadingImage(true);
    try {
      const uploaded: string[] = [];
      for (const file of picked) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('productId', draft.id || 'new-product');
        const res = await fetch('/api/products/image', { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? '上傳失敗');
        uploaded.push(data.image_url);
      }
      onChange({ ...draft, images: [...draft.images, ...uploaded].slice(0, MAX_PRODUCT_IMAGES) });
      if (files.length > room) alert(`最多只能放 ${MAX_PRODUCT_IMAGES} 張,已略過多餘的圖片`);
    } catch (error) {
      alert(error instanceof Error ? error.message : '上傳失敗');
    } finally {
      setUploadingImage(false);
    }
  }

  function removeImage(index: number) {
    onChange({ ...draft, images: draft.images.filter((_, i) => i !== index) });
  }

  function moveImageToFront(index: number) {
    if (index === 0) return;
    const next = [...draft.images];
    const [picked] = next.splice(index, 1);
    next.unshift(picked);
    onChange({ ...draft, images: next });
  }

  function addImageByUrl() {
    const url = prompt('貼上圖片網址')?.trim();
    if (!url) return;
    if (draft.images.length >= MAX_PRODUCT_IMAGES) {
      alert(`最多只能放 ${MAX_PRODUCT_IMAGES} 張圖片`);
      return;
    }
    onChange({ ...draft, images: [...draft.images, url] });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-6">
        <h2 className="text-xl font-semibold">{isNew ? '新增商品' : '編輯商品'}</h2>
        <div className="mt-4 grid gap-3">
          <Field label="商品代碼(英文,新增後不可改)">
            <input
              className="w-full rounded-lg border border-[#e5ded4] px-3 py-2 disabled:bg-[#f5efec]"
              value={draft.id}
              disabled={!isNew}
              onChange={(e) => set('id', e.target.value)}
            />
          </Field>
          <Field label="名稱">
            <input
              className="w-full rounded-lg border border-[#e5ded4] px-3 py-2"
              value={draft.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </Field>
          <Field label="介紹">
            <input
              className="w-full rounded-lg border border-[#e5ded4] px-3 py-2"
              value={draft.tagline}
              onChange={(e) => set('tagline', e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="售價">
              <input
                type="number"
                className="w-full rounded-lg border border-[#e5ded4] px-3 py-2"
                value={draft.price}
                onChange={(e) => set('price', Number(e.target.value))}
              />
            </Field>
            <Field label="原價(可空)">
              <input
                type="number"
                className="w-full rounded-lg border border-[#e5ded4] px-3 py-2"
                value={draft.original_price ?? ''}
                onChange={(e) => set('original_price', e.target.value === '' ? null : Number(e.target.value))}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="庫存">
              <input
                type="number"
                className="w-full rounded-lg border border-[#e5ded4] px-3 py-2"
                value={draft.inventory}
                onChange={(e) => set('inventory', Number(e.target.value))}
              />
            </Field>
            <Field label="狀態">
              <select
                className="w-full rounded-lg border border-[#e5ded4] px-3 py-2"
                value={draft.status}
                onChange={(e) => set('status', e.target.value)}
              >
                {PRODUCT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="分類(首頁篩選用)">
            <select
              className="w-full rounded-lg border border-[#e5ded4] px-3 py-2"
              value={draft.category}
              onChange={(e) => set('category', e.target.value)}
            >
              <option value="">未分類</option>
              {categories.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="可用金流(未勾選=全部)">
              <div className="space-y-2 rounded-lg border border-[#e5ded4] p-3">
                {paymentMethods.length === 0 ? (
                  <p className="text-sm text-[#8a7f72]">請先到系統設定新增金流方式。</p>
                ) : (
                  paymentMethods.map((method) => (
                    <label key={method} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={draft.available_payment_methods.includes(method)}
                        onChange={(e) => toggleMethod('available_payment_methods', method, e.target.checked)}
                      />
                      <span>{method}</span>
                    </label>
                  ))
                )}
              </div>
            </Field>
            <Field label="可用物流(未勾選=全部)">
              <div className="space-y-2 rounded-lg border border-[#e5ded4] p-3">
                {shippingMethods.length === 0 ? (
                  <p className="text-sm text-[#8a7f72]">請先到系統設定新增物流方式。</p>
                ) : (
                  shippingMethods.map((method) => (
                    <label key={method} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={draft.available_shipping_methods.includes(method)}
                        onChange={(e) => toggleMethod('available_shipping_methods', method, e.target.checked)}
                      />
                      <span>{method}</span>
                    </label>
                  ))
                )}
              </div>
            </Field>
          </div>
          <Field label={`商品圖片(最多 ${MAX_PRODUCT_IMAGES} 張,第一張為封面)`}>
            <div className="grid gap-3">
              {draft.images.length > 0 && (
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                  {draft.images.map((url, index) => (
                    <div
                      key={`${url}-${index}`}
                      className="group relative aspect-square overflow-hidden rounded-lg border border-[#e5ded4] bg-[#f6f2ec]"
                    >
                      <img src={url} alt="" className="h-full w-full object-cover" />
                      {index === 0 ? (
                        <span className="absolute left-1 top-1 rounded bg-[#1f1b19] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          封面
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => moveImageToFront(index)}
                          className="absolute left-1 top-1 rounded bg-white/85 px-1.5 py-0.5 text-[10px] font-semibold text-[#1f1b19] opacity-0 transition group-hover:opacity-100"
                        >
                          設為封面
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeImage(index)}
                        aria-label="移除圖片"
                        className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-xs font-bold text-white hover:bg-[#c0392b]"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <label
                  className={`inline-flex cursor-pointer items-center rounded-full bg-[#1f1b19] px-4 py-2 text-sm font-semibold text-white ${
                    draft.images.length >= MAX_PRODUCT_IMAGES ? 'pointer-events-none opacity-40' : ''
                  }`}
                >
                  {uploadingImage ? '上傳中...' : '上傳圖片'}
                  <input
                    type="file"
                    multiple
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    disabled={uploadingImage || draft.images.length >= MAX_PRODUCT_IMAGES}
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? []);
                      if (files.length) uploadProductImages(files);
                      e.target.value = '';
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={addImageByUrl}
                  disabled={draft.images.length >= MAX_PRODUCT_IMAGES}
                  className="rounded-full border border-[#d7c9bd] px-4 py-2 text-sm font-semibold disabled:opacity-40"
                >
                  貼上網址
                </button>
                <span className="text-xs text-[#8a7f72]">
                  {draft.images.length}/{MAX_PRODUCT_IMAGES}
                </span>
              </div>
              <p className="text-xs text-[#8a7f72]">
                可一次選多張。圖片會上傳到 Supabase Storage,第一張會成為前台封面圖。
              </p>
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="顏色(逗號分隔)">
              <input
                className="w-full rounded-lg border border-[#e5ded4] px-3 py-2"
                value={draft.colors}
                onChange={(e) => set('colors', e.target.value)}
              />
            </Field>
            <Field label="尺寸(逗號分隔)">
              <input
                className="w-full rounded-lg border border-[#e5ded4] px-3 py-2"
                value={draft.sizes}
                onChange={(e) => set('sizes', e.target.value)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="排序(小的在前)">
              <input
                type="number"
                className="w-full rounded-lg border border-[#e5ded4] px-3 py-2"
                value={draft.sort_order}
                onChange={(e) => set('sort_order', Number(e.target.value))}
              />
            </Field>
            <label className="flex items-end gap-2 pb-2">
              <input
                type="checkbox"
                checked={draft.is_featured}
                onChange={(e) => set('is_featured', e.target.checked)}
              />
              <span className="text-sm font-semibold">設為首頁主打</span>
            </label>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="rounded-full border border-[#d7c9bd] px-5 py-2 text-sm font-semibold">
            取消
          </button>
          <button onClick={onSave} className="rounded-full bg-[#1f1b19] px-5 py-2 text-sm font-semibold text-white">
            儲存
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-[#8a7f72]">{label}</span>
      {children}
    </label>
  );
}

/* ---------- 側邊欄圖示(SVG 線條) ---------- */
const svgProps = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function IconMenu() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
    </svg>
  );
}

function IconHome() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 11.5 12 4l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 10.5V20h13v-9.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 20v-5h4v5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconGrid() {
  return (
    <svg {...svgProps}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}
function IconReceipt() {
  return (
    <svg {...svgProps}>
      <path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2z" />
      <path d="M9 7h6M9 11h6" />
    </svg>
  );
}
function IconTag() {
  return (
    <svg {...svgProps}>
      <path d="M20.6 12.6 12 21l-9-9V3h9l8.6 8.6a1 1 0 0 1 0 1z" />
      <circle cx="7" cy="7" r="1.3" />
    </svg>
  );
}
function IconBox() {
  return (
    <svg {...svgProps}>
      <path d="M12 2 3 7v10l9 5 9-5V7z" />
      <path d="M3 7l9 5 9-5M12 12v10" />
    </svg>
  );
}
function IconUsers() {
  return (
    <svg {...svgProps}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.4 2.7-5 6-5s6 1.6 6 5" />
      <path d="M16 5.5a3.2 3.2 0 0 1 0 6M21.5 20c0-2.7-1.6-4.3-3.6-4.9" />
    </svg>
  );
}
function IconGift() {
  return (
    <svg {...svgProps}>
      <rect x="3" y="8" width="18" height="13" rx="1" />
      <path d="M3 12h18M12 8v13" />
      <path d="M12 8S9.5 3.5 7 4.8 8.5 8 12 8zM12 8s2.5-4.5 5-3.2S15.5 8 12 8z" />
    </svg>
  );
}
function IconChart() {
  return (
    <svg {...svgProps}>
      <path d="M3 3v18h18" />
      <path d="M7 14l3-4 3 2 4-6" />
    </svg>
  );
}
function IconGear() {
  return (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2v2.6M12 19.4V22M4.2 4.2l1.9 1.9M17.9 17.9l1.9 1.9M2 12h2.6M19.4 12H22M4.2 19.8l1.9-1.9M17.9 6.1l1.9-1.9" />
    </svg>
  );
}
