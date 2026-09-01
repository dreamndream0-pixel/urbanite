'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase/client';
import type {
  Banner,
  Category,
  Customer,
  Discount,
  Order,
  Product,
  SiteSettings,
  StockMovement,
  Variant,
} from '@/lib/types';

const formatter = new Intl.NumberFormat('zh-TW', {
  style: 'currency',
  currency: 'TWD',
  maximumFractionDigits: 0,
});

const ORDER_STATUSES = ['尚未付款', '待出貨', '已出貨', '已完成', '取消', '退貨'];
const PRODUCT_STATUSES = ['上架中', '加購品', '已下架'];
const DEFAULT_PAYMENT_METHODS = ['綠界金流', 'Line Pay', 'Apple Pay', '取貨付款', '轉帳匯款'];
const DEFAULT_SHIPPING_METHODS = ['綠界物流-超商取貨', '綠界物流-宅配', '7-11 取貨付款', '全家 取貨付款'];
const DEFAULT_FOOTER_SOCIAL_LINKS = [
  { label: 'Instagram', image: '', url: '' },
  { label: 'LINE', image: '', url: '' },
  { label: 'Email', image: '', url: '' },
];
const FOOTER_SOCIAL_SECTION_TITLE = '__footer_social_buttons__';

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
  unit: string;
  specs: { name: string; optionsText: string }[];
  variantStock: Record<string, number>; // key = 各選項用 ' / ' 串起來
  variantCost: Record<string, number>; // 各規格單位成本
  variantSafety: Record<string, number>; // 各規格安全庫存
  is_featured: boolean;
  sort_order: number;
};

// 每個商品最多可放的圖片數
const MAX_PRODUCT_IMAGES = 10;

// 由規格維度算出所有組合(笛卡兒積),回傳每個組合的選項陣列
function specCombos(specs: { name: string; options: string[] }[]): string[][] {
  const valid = specs.filter((s) => s.options.length > 0);
  if (valid.length === 0) return [];
  return valid.reduce<string[][]>(
    (acc, dim) => acc.flatMap((combo) => dim.options.map((o) => [...combo, o])),
    [[]],
  );
}

function parseOptions(text: string): string[] {
  return text
    .split(/[,，/、\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function getProductVariantRows(product: Product) {
  if (product.variants.length === 0) {
    return [
      {
        key: `${product.id}-default`,
        label: '—',
        color: '',
        size: '',
        inventory: product.inventory,
        safety: 0,
        cost: 0,
        location: '',
      },
    ];
  }

  const colorIndex = product.specs.findIndex((spec) => /顏色|色|color/i.test(spec.name));
  const sizeIndex = product.specs.findIndex((spec) => /尺寸|尺碼|size/i.test(spec.name));

  return product.variants.map((variant, index) => ({
    key: `${product.id}-${variant.options.join('-') || index}`,
    label: variant.options.join(' / '),
    color: colorIndex >= 0 ? variant.options[colorIndex] ?? '' : variant.options[0] ?? '',
    size: sizeIndex >= 0 ? variant.options[sizeIndex] ?? '' : variant.options[1] ?? '',
    inventory: variant.inventory ?? 0,
    safety: variant.safety ?? 0,
    cost: variant.cost ?? 0,
    location: variant.location ?? '',
  }));
}

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
    unit: '',
    specs: [],
    variantStock: {},
    variantCost: {},
    variantSafety: {},
    is_featured: false,
    sort_order: 0,
  };
}

function toDraft(p: Product): Draft {
  const images = p.images?.length ? p.images : p.image ? [p.image] : [];
  const specs = (p.specs ?? []).map((s) => ({ name: s.name, optionsText: s.options.join(', ') }));
  const variantStock: Record<string, number> = {};
  const variantCost: Record<string, number> = {};
  const variantSafety: Record<string, number> = {};
  for (const v of p.variants ?? []) {
    const k = v.options.join(' / ');
    variantStock[k] = v.inventory;
    if (v.cost != null) variantCost[k] = v.cost;
    if (v.safety != null) variantSafety[k] = v.safety;
  }
  return {
    ...p,
    images,
    available_payment_methods: p.available_payment_methods ?? [],
    available_shipping_methods: p.available_shipping_methods ?? [],
    colors: p.colors.join(', '),
    sizes: p.sizes.join(', '),
    unit: p.unit ?? '',
    specs,
    variantStock,
    variantCost,
    variantSafety,
  };
}

export default function AdminDashboard({
  initialProducts,
  initialOrders,
  initialCategories,
  initialDiscounts,
  initialCustomers,
  initialBanners,
  initialMovements,
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
  initialMovements: StockMovement[];
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
  const [settingsTab, setSettingsTab] = useState<'general' | 'banners' | 'footer'>('general');
  const [orderFilter, setOrderFilter] = useState<string>('全部');
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const [productsTab, setProductsTab] = useState<'items' | 'categories'>('items');
  const [movements, setMovements] = useState<StockMovement[]>(initialMovements);
  const [mvForm, setMvForm] = useState({
    document_no: '',
    document_date: '',
    type: 'in' as 'in' | 'out',
    status: '進貨',
    payment_status: '',
    payment_no: '',
    location: '',
    handler: '',
    note: '',
  });
  const [movementLines, setMovementLines] = useState<MovementLine[]>([
    { id: 'line-1', product_id: '', variant_key: '', quantity: 1, unit_price: 0 },
  ]);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [editBannerId, setEditBannerId] = useState<string | null>(null);
  const [newCat, setNewCat] = useState({ slug: '', name: '', en: '' });
  const [newDiscount, setNewDiscount] = useState({ code: '', type: 'percent', value: 0, min_spend: 0 });
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [footerDraft, setFooterDraft] = useState({
    sections: JSON.stringify(initialSettings?.footer_sections ?? [], null, 2),
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
    socialLinks: JSON.stringify(
      initialSettings?.footer_social_links?.length
        ? initialSettings.footer_social_links.slice(0, 3)
        : getFooterSocialLinksFromSections(initialSettings?.footer_sections).length
          ? getFooterSocialLinksFromSections(initialSettings?.footer_sections)
        : DEFAULT_FOOTER_SOCIAL_LINKS,
      null,
      2,
    ),
    payments: (initialSettings?.payment_methods?.length
      ? initialSettings.payment_methods
      : DEFAULT_PAYMENT_METHODS
    ).join('\n'),
    shippings: (initialSettings?.shipping_methods?.length
      ? initialSettings.shipping_methods
      : DEFAULT_SHIPPING_METHODS
    ).join('\n'),
    enabledPayments: initialSettings?.enabled_payment_methods?.length
      ? initialSettings.enabled_payment_methods
      : initialSettings?.payment_methods?.length
        ? initialSettings.payment_methods
        : DEFAULT_PAYMENT_METHODS,
    enabledShippings: initialSettings?.enabled_shipping_methods?.length
      ? initialSettings.enabled_shipping_methods
      : initialSettings?.shipping_methods?.length
        ? initialSettings.shipping_methods
        : DEFAULT_SHIPPING_METHODS,
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
  // 舊訂單品項沒存圖片,用商品名稱對應現有商品圖當備援
  const imageByName = useMemo(
    () => new Map(products.filter((p) => p.image).map((p) => [p.name, p.image])),
    [products],
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
  const enabledPaymentMethods = useMemo(
    () => paymentMethods,
    [paymentMethods],
  );
  const enabledShippingMethods = useMemo(
    () => shippingMethods,
    [shippingMethods],
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

    // 規格制:整理規格維度 + 各組合庫存
    const specs = editing.specs
      .map((s) => ({ name: s.name.trim(), options: parseOptions(s.optionsText) }))
      .filter((s) => s.name && s.options.length > 0);
    const variants = specCombos(specs).map((opts) => {
      const k = opts.join(' / ');
      return {
        options: opts,
        inventory: Math.max(0, Math.floor(Number(editing.variantStock[k] ?? 0))),
        cost: Math.max(0, Math.floor(Number(editing.variantCost[k] ?? 0))),
        safety: Math.max(0, Math.floor(Number(editing.variantSafety[k] ?? 0))),
      };
    });
    // 有規格時,總庫存 = 各規格庫存加總;沒規格時沿用手填的庫存
    const inventory =
      specs.length > 0 ? variants.reduce((n, v) => n + v.inventory, 0) : editing.inventory;
    // 顏色/尺寸:有對應維度就帶入(向下相容前台舊欄位)
    const colorDim = specs.find((s) => s.name.includes('色'));
    const sizeDim = specs.find((s) => s.name.includes('尺寸') || /size/i.test(s.name));

    const payload = {
      ...editing,
      images,
      image: images[0] ?? '', // 第一張作為封面,前台商品卡沿用 image 欄位
      inventory,
      specs,
      variants,
      colors: colorDim
        ? colorDim.options
        : editing.colors.split(',').map((s) => s.trim()).filter(Boolean),
      sizes: sizeDim
        ? sizeDim.options
        : editing.sizes.split(',').map((s) => s.trim()).filter(Boolean),
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

  // 進銷存:更新某商品某規格的庫存,並同步總庫存
  async function adjustVariantStock(id: string, index: number, inventory: number) {
    const product = products.find((p) => p.id === id);
    if (!product) return;
    const value = Math.max(0, Math.floor(inventory) || 0);
    const variants = product.variants.map((v, i) => (i === index ? { ...v, inventory: value } : v));
    const total = variants.reduce((n, v) => n + v.inventory, 0);
    setProducts((l) => l.map((p) => (p.id === id ? { ...p, variants, inventory: total } : p)));
    await fetch(`/api/products/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variants, inventory: total }),
    });
  }

  // 進出庫:新增一筆入庫/出庫,後端會自動更新庫存
  async function addMovement() {
    const validLines = movementLines.filter((line) => line.product_id && line.quantity > 0);
    if (validLines.length === 0) return alert('請至少新增一筆商品明細');

    for (const line of validLines) {
      const product = products.find((p) => p.id === line.product_id);
      if (product?.variants.length && !line.variant_key) return alert(`請選擇 ${product.name} 的規格`);
    }

    const documentNote = [
      mvForm.document_no ? `單號:${mvForm.document_no}` : '',
      mvForm.document_date ? `日期:${mvForm.document_date}` : '',
      mvForm.status ? `狀態:${mvForm.status}` : '',
      mvForm.payment_status ? `請款狀態:${mvForm.payment_status}` : '',
      mvForm.payment_no ? `請款單號:${mvForm.payment_no}` : '',
      mvForm.note,
    ].filter(Boolean).join(' | ');
    const createdMovements: StockMovement[] = [];

    for (const line of validLines) {
      const res = await fetch('/api/stock-movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: line.product_id,
          variant_key: line.variant_key,
          type: mvForm.type,
          quantity: line.quantity,
          unit_price: line.unit_price,
          location: mvForm.location,
          handler: mvForm.handler,
          note: documentNote,
        }),
      });
      const data = await res.json();
      if (!res.ok) return alert(data.error ?? '新增失敗');
      createdMovements.push(data as StockMovement);
    }

    setMovements((l) => [...createdMovements.reverse(), ...l]);
    setProducts((l) => {
      let nextProducts = l;
      for (const line of validLines) {
        const delta = mvForm.type === 'in' ? line.quantity : -line.quantity;
        nextProducts = nextProducts.map((p) => {
          if (p.id !== line.product_id) return p;
          if (p.variants.length > 0 && line.variant_key) {
            const variants = p.variants.map((v) =>
              v.options.join(' / ') === line.variant_key
                ? { ...v, inventory: Math.max(0, v.inventory + delta) }
                : v,
            );
            return { ...p, variants, inventory: variants.reduce((n, v) => n + v.inventory, 0) };
          }
          return { ...p, inventory: Math.max(0, p.inventory + delta) };
        });
      }
      return nextProducts;
    });
    setMovementLines([{ id: `line-${Date.now()}`, product_id: '', variant_key: '', quantity: 1, unit_price: 0 }]);
    setMvForm({ ...mvForm, document_no: '', payment_status: '', payment_no: '', location: '', note: '' });
  }

  // 在庫存管理直接修改某規格的成本 / 安全庫存 / 儲位(不動庫存數量)
  async function updateVariantMeta(
    productId: string,
    variantKey: string,
    patch: Partial<Pick<Variant, 'cost' | 'safety' | 'location'>>,
  ) {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    const variants = product.variants.map((v) =>
      v.options.join(' / ') === variantKey ? { ...v, ...patch } : v,
    );
    setProducts((l) => l.map((p) => (p.id === productId ? { ...p, variants } : p)));
    await fetch(`/api/products/${productId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variants }),
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

      if (editBannerId) {
        // 更換現有輪播圖的圖片
        const res = await fetch(`/api/banners/${editBannerId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: upData.image_url, title }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? '更新失敗');
        setBanners((l) => l.map((b) => (b.id === editBannerId ? (data as Banner) : b)));
      } else {
        const res = await fetch('/api/banners', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: upData.image_url, title, sort_order: banners.length }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? '新增失敗');
        setBanners((l) => [...l, data as Banner]);
      }
      setCropFile(null);
      setEditBannerId(null);
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
      const footerSections = mergeFooterSocialLinksIntoSections(
        JSON.parse(footerDraft.sections || '[]'),
        JSON.parse(footerDraft.socialLinks || '[]'),
      );
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
          footer_sections: footerSections,
          payment_methods: toLines(footerDraft.payments),
          shipping_methods: toLines(footerDraft.shippings),
          enabled_payment_methods: toLines(footerDraft.payments),
          enabled_shipping_methods: toLines(footerDraft.shippings),
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
              {/* 狀態分類 */}
              <div className="mb-4 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {['全部', ...ORDER_STATUSES].map((s) => {
                  const n = s === '全部' ? orders.length : orders.filter((o) => o.status === s).length;
                  return (
                    <button
                      key={s}
                      onClick={() => setOrderFilter(s)}
                      className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                        orderFilter === s
                          ? 'border-[#1f1b19] bg-[#1f1b19] text-white'
                          : 'border-[#d7c9bd] text-[#6b6156]'
                      }`}
                    >
                      {s}
                      <span className={`ml-1 ${orderFilter === s ? 'text-white/70' : 'text-[#a99e8f]'}`}>{n}</span>
                    </button>
                  );
                })}
              </div>

              {(() => {
                const shown = orderFilter === '全部' ? orders : orders.filter((o) => o.status === orderFilter);
                if (shown.length === 0) return <Empty>此分類目前沒有訂單。</Empty>;
                return (
                  <div className="space-y-3">
                    {shown.map((order) => {
                      const name =
                        (order.user_id && customerByUser.get(order.user_id)?.name) || order.customer_name;
                      return (
                        <button
                          key={order.id}
                          onClick={() => setOpenOrderId(order.id)}
                          className="block w-full rounded-lg border border-[#e5ded4] p-4 text-left transition hover:border-[#c9b8a8] hover:shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-semibold">{order.order_no}</p>
                              <p className="text-sm text-[#8a7f72]">
                                {name}
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
                            <span className="shrink-0 font-semibold">{formatter.format(order.total)}</span>
                          </div>

                          {/* 商品縮圖 */}
                          <div className="mt-3 flex flex-wrap gap-2">
                            {order.items.map((it, i) => (
                              <div
                                key={i}
                                className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border border-[#eee5da] bg-[#e9e1d6]"
                                title={`${it.name} (${it.variant}) ×${it.quantity}`}
                              >
                                {it.image || imageByName.get(it.name) ? (
                                  <img
                                    src={it.image || imageByName.get(it.name)}
                                    alt={it.name}
                                    className="h-full w-full object-cover"
                                  />
                                ) : null}
                                {it.quantity > 1 && (
                                  <span className="absolute bottom-0 right-0 rounded-tl bg-black/60 px-1 text-[10px] font-semibold text-white">
                                    ×{it.quantity}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>

                          {order.note ? (
                            <p className="mt-2 line-clamp-1 rounded-lg bg-[#faf6ee] px-3 py-1.5 text-sm text-[#6b6156]">
                              備註:{order.note}
                            </p>
                          ) : null}

                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-[#f3ede4] px-3 py-1 text-xs font-semibold text-[#6b6156]">
                              {order.status}
                            </span>
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                order.paid ? 'bg-[#e9f7ee] text-[#1f7a44]' : 'bg-[#fdf3e7] text-[#9a6a1f]'
                              }`}
                            >
                              {order.paid ? '已付款' : '未付款'}
                            </span>
                            <span className="ml-auto text-xs text-[#a99e8f]">點看完整訂單 ›</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
            </Card>
          )}

          {/* ===== 商品及分類 ===== */}
          {section === 'products' && (
            <div className="space-y-6">
              <div className="flex gap-2 border-b border-[#e5ded4]">
                {([
                  { key: 'items', label: '我的商品' },
                  { key: 'categories', label: '分類管理' },
                ] as const).map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setProductsTab(t.key)}
                    className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition ${
                      productsTab === t.key
                        ? 'border-[#1f1b19] text-[#1f1b19]'
                        : 'border-transparent text-[#8a7f72] hover:text-[#1f1b19]'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {productsTab === 'items' && (
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
              )}

              {productsTab === 'categories' && (
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
              )}
            </div>
          )}

          {/* ===== 庫存管理(進銷存) ===== */}
          {section === 'inventory' && (
            <InventorySection
              products={products}
              categories={categories}
              movements={movements}
              mvForm={mvForm}
              setMvForm={setMvForm}
              movementLines={movementLines}
              setMovementLines={setMovementLines}
              onAddMovement={addMovement}
              onUpdateVariantMeta={updateVariantMeta}
              onEditProduct={(product) => {
                setEditing(toDraft(product));
                setIsNew(false);
              }}
              onCreateProduct={() => {
                setEditing(blankDraft());
                setIsNew(true);
              }}
            />
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
                  { key: 'footer', label: '頁尾資訊' },
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
                    顯示在首頁最上方,可放多張。第一張(排序小的)先顯示,前台每 4 秒自動切換,也可左右滑動。頁尾內文頁的背景圖也會使用第一張啟用輪播圖；要修改內文頁圖片,請在這裡替換或調整第一張啟用圖片。
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
                        if (file) {
                          setEditBannerId(null);
                          setCropFile(file); // 先進裁切編輯器
                        }
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
                          <label
                            title="點圖編輯 / 換圖"
                            className="group relative aspect-[16/13] w-40 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-[#eee5da] bg-[#e9e1d6]"
                          >
                            <img src={banner.image} alt="" className="h-full w-full object-contain" />
                            <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-xs font-semibold text-white opacity-0 transition group-hover:bg-black/40 group-hover:opacity-100">
                              點圖編輯
                            </span>
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp,image/gif"
                              className="hidden"
                              disabled={uploadingBanner}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                e.target.value = '';
                                if (!file) return;
                                setEditBannerId(banner.id);
                                setCropFile(file);
                              }}
                            />
                          </label>
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
                              換圖/裁切
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp,image/gif"
                                className="hidden"
                                disabled={uploadingBanner}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  e.target.value = '';
                                  if (!file) return;
                                  // 走裁切編輯器,裁好再更新這張輪播圖
                                  setEditBannerId(banner.id);
                                  setCropFile(file);
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
              )}

              {settingsTab === 'footer' && (
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
                  <FooterPagesEditor
                    value={footerDraft.sections}
                    onChange={(sections) => setFooterDraft({ ...footerDraft, sections })}
                  />
                  <FooterSocialLinksEditor
                    value={footerDraft.socialLinks}
                    onChange={(socialLinks) => setFooterDraft({ ...footerDraft, socialLinks })}
                  />
                  <MethodToggles
                    label="金流方式(勾選=啟用,可套用到各商品)"
                    defaults={DEFAULT_PAYMENT_METHODS}
                    value={footerDraft.payments}
                    onChange={(v) => setFooterDraft({ ...footerDraft, payments: v })}
                  />
                  <MethodToggles
                    label="物流方式(勾選=啟用,可套用到各商品)"
                    defaults={DEFAULT_SHIPPING_METHODS}
                    value={footerDraft.shippings}
                    onChange={(v) => setFooterDraft({ ...footerDraft, shippings: v })}
                  />
                </div>
              </Card>
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
          paymentMethods={enabledPaymentMethods}
          shippingMethods={enabledShippingMethods}
          onChange={setEditing}
          onClose={() => setEditing(null)}
          onSave={saveProduct}
        />
      )}

      {cropFile && (
        <FixedBannerCropModal
          file={cropFile}
          busy={uploadingBanner}
          onCancel={() => {
            setCropFile(null);
            setEditBannerId(null);
          }}
          onConfirm={(blob, filename) => uploadBanner(blob, filename, filename)}
        />
      )}

      {openOrderId && orders.find((o) => o.id === openOrderId) && (
        <AdminOrderModal
          order={orders.find((o) => o.id === openOrderId)!}
          imageByName={imageByName}
          onClose={() => setOpenOrderId(null)}
          onUpdate={(patch) => updateOrder(openOrderId, patch)}
        />
      )}
    </div>
  );
}

type CropRect = { x: number; y: number; w: number; h: number };

// 固定首頁比例的取景框:照片移動與縮放,取景框本身不變。
function FixedBannerCropModal({
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
  const [zoom, setZoom] = useState(1);
  const [background, setBackground] = useState('#8a877f');
  const [loaded, setLoaded] = useState({ w: 0, h: 0 });
  const [frameSize, setFrameSize] = useState({ w: 0, h: 0 });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const frameRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const drag = useRef<{ x: number; y: number; start: { x: number; y: number } } | null>(null);

  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const update = () => setFrameSize({ w: frame.clientWidth, h: frame.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  function geometry() {
    if (!loaded.w || !frameSize.w || !frameSize.h) return null;
    const w = frameSize.w;
    const h = frameSize.h;
    const scale = Math.min(w / loaded.w, h / loaded.h);
    const imageW = loaded.w * scale * zoom;
    const imageH = loaded.h * scale * zoom;
    const limitX = Math.abs(imageW - w) / 2;
    const limitY = Math.abs(imageH - h) / 2;
    return { w, h, scale, imageW, imageH, limitX, limitY };
  }

  function clampPan(next: { x: number; y: number }) {
    const g = geometry();
    if (!g) return next;
    return {
      x: Math.min(g.limitX, Math.max(-g.limitX, next.x)),
      y: Math.min(g.limitY, Math.max(-g.limitY, next.y)),
    };
  }

  function changeZoom(nextZoom: number) {
    const old = geometry();
    setZoom(nextZoom);
    if (!old) return;
    const centerRatio = { x: (frameSize.w / 2 + pan.x) / frameSize.w, y: (frameSize.h / 2 + pan.y) / frameSize.h };
    requestAnimationFrame(() => {
      const next = geometry();
      if (!next) return;
      setPan(clampPan({ x: centerRatio.x * frameSize.w - frameSize.w / 2, y: centerRatio.y * frameSize.h - frameSize.h / 2 }));
    });
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, start: pan };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    e.preventDefault();
    setPan(clampPan({ x: drag.current.start.x + e.clientX - drag.current.x, y: drag.current.start.y + e.clientY - drag.current.y }));
  }

  function stopDrag(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    drag.current = null;
  }

  function apply() {
    const g = geometry();
    if (!g || !loaded.w) return;
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 1300;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!imageRef.current) return;
    const canvasScale = canvas.width / g.w;
    const drawW = g.imageW * canvasScale;
    const drawH = g.imageH * canvasScale;
    const drawX = (canvas.width - drawW) / 2 + pan.x * canvasScale;
    const drawY = (canvas.height - drawH) / 2 + pan.y * canvasScale;
    ctx.drawImage(imageRef.current, drawX, drawY, drawW, drawH);
    const base = file.name.replace(/\.[^.]+$/, '') || 'banner';
    canvas.toBlob((blob) => blob && onConfirm(blob, `${base}.jpg`), 'image/jpeg', 0.9);
  }

  const preview = geometry();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-6">
        <h2 className="text-xl font-semibold">輪播圖 — 固定首頁比例取景</h2>
        <p className="mt-1 text-sm text-[#6b6156]">白色框架固定為首頁 16:13；照片會先完整放進框內，再拖曳與縮放調整顯示位置。</p>
        <div ref={frameRef} className="relative mx-auto mt-5 aspect-[16/13] w-full max-w-xl touch-none select-none overflow-hidden border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" style={{ backgroundColor: background }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={stopDrag} onPointerCancel={stopDrag}>
          {loaded.w > 0 && (
            <img
              src={url}
              alt=""
              draggable={false}
              className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
              style={{
                width: `${preview?.imageW ?? 0}px`,
                height: `${preview?.imageH ?? 0}px`,
                transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px)`,
              }}
            />
          )}
          <img
            ref={imageRef}
            src={url}
            alt=""
            draggable={false}
            onLoad={(e) => { setLoaded({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight }); }}
            className="hidden"
          />
          <div className="pointer-events-none absolute inset-0 border-2 border-white/90" />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-[#6b6156]">
          <label className="flex min-w-[260px] flex-1 items-center gap-2">縮放<input type="range" min="1" max="4" step="0.01" value={zoom} onChange={(e) => changeZoom(Number(e.target.value))} className="flex-1 accent-[#1f1b19]" /><span className="w-12 text-right">{zoom.toFixed(2)}x</span></label>
          <label className="flex items-center gap-2">補底色<input type="color" value={background} onChange={(e) => setBackground(e.target.value)} className="h-8 w-10 rounded border border-[#d7c9bd] p-0.5" /></label>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} disabled={busy} className="rounded-full border border-[#d7c9bd] px-5 py-2 text-sm font-semibold">取消</button>
          <button type="button" onClick={apply} disabled={busy || !loaded.w} className="rounded-full bg-[#1f1b19] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? '上傳中...' : '套用並上傳'}</button>
        </div>
      </div>
    </div>
  );
}
type CropHandle = 'move' | 'nw' | 'ne' | 'sw' | 'se';

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
  const [zoom, setZoom] = useState(1);
  const [background, setBackground] = useState('#8a877f');
  const [crop, setCrop] = useState<CropRect>({ x: 0.08, y: 0.08, w: 0.84, h: 0.47 });
  const cropAreaRef = useRef<HTMLDivElement>(null);
  const imgElRef = useRef<HTMLImageElement>(null);
  const drag = useRef<{ mode: CropHandle; px: number; py: number; start: CropRect } | null>(null);
  const inited = useRef(false);

  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  function clamp(next: CropRect) {
    const w = Math.min(1, Math.max(0.12, next.w));
    const h = Math.min(1, Math.max(0.12, next.h));
    const x = Math.min(1 - w, Math.max(0, next.x));
    const y = Math.min(1 - h, Math.max(0, next.y));
    return { x, y, w, h };
  }

  function centerFor(a: number | null) {
    if (!a || !cropAreaRef.current) return { x: 0.08, y: 0.08, w: 0.84, h: 0.84 };
    const rect = cropAreaRef.current.getBoundingClientRect();
    let w = 0.84;
    let h = (w * rect.width) / a / rect.height;
    if (h > 0.84) {
      h = 0.84;
      w = (h * rect.height * a) / rect.width;
    }
    return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
  }

  function setRatio(value: number | null) {
    setAspect(value);
    setZoom(1);
    setCrop(centerFor(value));
  }

  function setZoomLevel(value: number) {
    setZoom(value);
    const base = centerFor(aspect);
    const current = crop;
    const w = Math.min(base.w, base.w / value);
    const h = Math.min(base.h, base.h / value);
    const cx = current.x + current.w / 2;
    const cy = current.y + current.h / 2;
    setCrop(clamp({ x: cx - w / 2, y: cy - h / 2, w, h }));
  }

  function onPointerDown(mode: CropHandle, e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { mode, px: e.clientX, py: e.clientY, start: crop };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current || !cropAreaRef.current) return;
    e.preventDefault();
    const area = cropAreaRef.current.getBoundingClientRect();
    const dx = (e.clientX - drag.current.px) / area.width;
    const dy = (e.clientY - drag.current.py) / area.height;
    const start = drag.current.start;

    if (drag.current.mode === 'move') {
      setCrop(clamp({ ...start, x: start.x + dx, y: start.y + dy }));
      return;
    }

    const next = { ...start };
    if (drag.current.mode.includes('w')) {
      next.x = start.x + dx;
      next.w = start.w - dx;
    }
    if (drag.current.mode.includes('e')) next.w = start.w + dx;
    if (drag.current.mode.includes('n')) {
      next.y = start.y + dy;
      next.h = start.h - dy;
    }
    if (drag.current.mode.includes('s')) next.h = start.h + dy;

    if (aspect) {
      const widthDriven =
        Math.abs(dx * area.width) >= Math.abs(dy * area.height) || drag.current.mode === 'ne' || drag.current.mode === 'sw';
      if (widthDriven) {
        next.h = (next.w * area.width) / aspect / area.height;
        if (drag.current.mode.includes('n')) next.y = start.y + (start.h - next.h);
      } else {
        next.w = (next.h * area.height * aspect) / area.width;
        if (drag.current.mode.includes('w')) next.x = start.x + (start.w - next.w);
      }
    }

    setCrop(clamp(next));
  }

  function onPointerUp(e: React.PointerEvent) {
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    drag.current = null;
  }

  const outW = Math.round(crop.w * natural.w);
  const outH = Math.round(crop.h * natural.h);

  function apply() {
    const img = imgElRef.current;
    if (!img || !natural.w) return;
    const sx = crop.x * natural.w;
    const sy = crop.y * natural.h;
    const sw = crop.w * natural.w;
    const sh = crop.h * natural.h;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sw));
    canvas.height = Math.max(1, Math.round(sh));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" style={{ overscrollBehavior: 'contain' }}>
      <div
        className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-6"
        style={{ overscrollBehavior: 'contain', touchAction: 'pan-y' }}
      >
        <h2 className="text-xl font-semibold">新增輪播圖 — 編輯裁切</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-[#f6f2ec] p-3 text-xs text-[#6b6156] sm:grid-cols-4">
          <span className="truncate">檔名：{file.name}</span>
          <span>類型：{file.type.replace('image/', '') || '-'}</span>
          <span>原始尺寸：{natural.w}×{natural.h}</span>
          <span>檔案大小：{(file.size / 1024).toFixed(0)} KB</span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {ASPECTS.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => setRatio(item.value)}
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${
                aspect === item.value ? 'border-[#1f1b19] bg-[#1f1b19] text-white' : 'border-[#d7c9bd]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mt-4 max-h-[58vh] overflow-auto rounded-lg p-4" style={{ overscrollBehavior: 'contain', backgroundColor: background }}>
          <div ref={cropAreaRef} className="relative mx-auto inline-block max-w-full touch-none select-none">
            <img
              ref={imgElRef}
              src={url}
              alt=""
              draggable={false}
              onLoad={(e) => {
                const img = e.currentTarget;
                setNatural({ w: img.naturalWidth, h: img.naturalHeight });
                if (!inited.current) {
                  inited.current = true;
                  requestAnimationFrame(() => setCrop(centerFor(aspect)));
                }
              }}
              className="block max-h-[52vh] max-w-full object-contain"
            />
            <div className="pointer-events-none absolute inset-0 bg-black/45" />
            <div
              className="absolute cursor-move border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
              style={{
                left: `${crop.x * 100}%`,
                top: `${crop.y * 100}%`,
                width: `${crop.w * 100}%`,
                height: `${crop.h * 100}%`,
                touchAction: 'none',
              }}
              onPointerDown={(e) => onPointerDown('move', e)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              {(['nw', 'ne', 'sw', 'se'] as const).map((handle) => (
                <button
                  key={handle}
                  type="button"
                  aria-label={`調整裁切框 ${handle}`}
                  className={`absolute h-5 w-5 rounded-full border-2 border-[#1f1b19] bg-white ${
                    handle.includes('n') ? '-top-3' : '-bottom-3'
                  } ${handle.includes('w') ? '-left-3' : '-right-3'} ${
                    handle === 'nw' || handle === 'se' ? 'cursor-nwse-resize' : 'cursor-nesw-resize'
                  }`}
                  onPointerDown={(e) => onPointerDown(handle, e)}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-[#6b6156]">
          <label className="flex items-center gap-2">
            縮放
            <input type="range" min="1" max="4" step="0.05" value={zoom} onChange={(e) => setZoomLevel(Number(e.target.value))} className="w-44 accent-[#1f1b19]" />
            <span className="w-12 text-right">{zoom.toFixed(2)}x</span>
          </label>
          <label className="flex items-center gap-2">
            補底色
            <input type="color" value={background} onChange={(e) => setBackground(e.target.value)} className="h-8 w-10 cursor-pointer rounded border border-[#d7c9bd] bg-white p-0.5" />
          </label>
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
            {busy ? '上傳中…' : '套用並上傳'}
          </button>
        </div>
      </div>
    </div>
  );
}

type FooterItemDraft = { subtitle: string; content: string; url: string };
type FooterSectionDraft = { title: string; items: FooterItemDraft[] };
type FooterSocialDraft = { label: string; image: string; url: string };

function FooterPagesEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [active, setActive] = useState(0);
  const [sections, setSections] = useState<FooterSectionDraft[]>(() => {
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((section) => ({
        title: typeof section?.title === 'string' ? section.title : '',
        items: Array.isArray(section?.items)
          ? section.items.map((item: Partial<FooterItemDraft>) => ({
              subtitle: typeof item?.subtitle === 'string' ? item.subtitle : '',
              content: typeof item?.content === 'string' ? item.content : '',
              url: typeof item?.url === 'string' ? item.url : '',
            }))
          : [],
      })).filter((section) => section.title !== FOOTER_SOCIAL_SECTION_TITLE);
    } catch {
      return [];
    }
  });

  function update(next: FooterSectionDraft[]) {
    setSections(next);
    onChange(JSON.stringify(next, null, 2));
  }

  function addSection() {
    const next = [...sections, { title: '新大標題', items: [{ subtitle: '新小標題', content: '', url: '' }] }];
    setActive(next.length - 1);
    update(next);
  }

  function updateSection(index: number, patch: Partial<FooterSectionDraft>) {
    update(sections.map((section, i) => (i === index ? { ...section, ...patch } : section)));
  }

  function deleteSection(index: number) {
    const next = sections.filter((_, i) => i !== index);
    setActive(Math.max(0, Math.min(active, next.length - 1)));
    update(next);
  }

  const section = sections[active];

  return (
    <div className="lg:col-span-2 rounded-lg border border-[#e5ded4] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold">頁尾頁面設定</h3>
          <p className="mt-1 text-sm text-[#8a7f72]">大標題、小標題、內文與網址都可自行新增、刪除與編輯。</p>
        </div>
        <button type="button" onClick={addSection} className="rounded-lg border border-[#1f1b19] px-3 py-2 text-sm font-semibold">
          + 新增大標題
        </button>
      </div>

      <div className="mt-5 flex flex-wrap gap-2 border-b border-[#e5ded4] pb-3">
        {sections.map((entry, index) => (
          <button
            key={`${entry.title}-${index}`}
            type="button"
            onClick={() => setActive(index)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${
              active === index ? 'bg-[#7da185] text-white' : 'border border-[#e5ded4] bg-white'
            }`}
          >
            {entry.title || '未命名大標題'}
          </button>
        ))}
      </div>

      {section ? (
        <div className="mt-5 space-y-5">
          <div className="flex gap-2">
            <label className="block min-w-0 flex-1 text-sm text-[#8a7f72]">
              大標題
              <input
                value={section.title}
                onChange={(e) => updateSection(active, { title: e.target.value })}
                placeholder="例如：關於我們 ABOUT US"
                className="mt-2 w-full rounded-lg border border-[#e5ded4] px-3 py-2 text-base font-semibold text-[#1f1b19]"
              />
            </label>
            <button
              type="button"
              onClick={() => deleteSection(active)}
              className="mt-7 rounded-lg border border-[#e0b4b4] px-3 py-2 text-sm font-semibold text-[#a64d45]"
            >
              刪除大標題
            </button>
          </div>

          <div className="space-y-4">
            {section.items.map((item, itemIndex) => (
              <div key={itemIndex} className="rounded-lg bg-[#f8f5f0] p-4">
                <div className="flex items-center justify-between gap-3">
                  <label className="block min-w-0 flex-1 text-sm text-[#8a7f72]">
                    小標題
                    <input
                      value={item.subtitle}
                      onChange={(e) => updateSection(active, { items: section.items.map((x, i) => i === itemIndex ? { ...x, subtitle: e.target.value } : x) })}
                      placeholder="例如：優惠資訊 / Coupon"
                      className="mt-2 w-full rounded-lg border border-[#e5ded4] bg-white px-3 py-2 text-base text-[#1f1b19]"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => updateSection(active, { items: section.items.filter((_, i) => i !== itemIndex) })}
                    className="mt-7 rounded-lg border border-[#e0b4b4] px-3 py-2 text-sm font-semibold text-[#a64d45]"
                  >
                    刪除
                  </button>
                </div>
                <label className="mt-3 block text-sm text-[#8a7f72]">
                  頁面內容
                  <textarea
                    value={item.content}
                    onChange={(e) => updateSection(active, { items: section.items.map((x, i) => i === itemIndex ? { ...x, content: e.target.value } : x) })}
                    placeholder="輸入這個小標題點開後要顯示的完整內文..."
                    rows={10}
                    className="mt-2 w-full rounded-lg border border-[#e5ded4] bg-white px-3 py-3 text-base leading-7 text-[#1f1b19]"
                  />
                </label>
                <label className="mt-3 block text-sm text-[#8a7f72]">
                  連結網址（選填）
                  <input
                    value={item.url}
                    onChange={(e) => updateSection(active, { items: section.items.map((x, i) => i === itemIndex ? { ...x, url: e.target.value } : x) })}
                    placeholder="https://..."
                    className="mt-2 w-full rounded-lg border border-[#e5ded4] bg-white px-3 py-2 text-base text-[#1f1b19]"
                  />
                </label>
              </div>
            ))}
            <button
              type="button"
              onClick={() => updateSection(active, { items: [...section.items, { subtitle: '新小標題', content: '', url: '' }] })}
              className="rounded-lg border border-[#7da185] px-3 py-2 text-sm font-semibold text-[#5f8066]"
            >
              + 新增小標題
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-5 text-sm text-[#8a7f72]">尚未新增頁尾大標題，按右上角開始建立。</p>
      )}
    </div>
  );
}

function FooterSocialLinksEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [items, setItems] = useState<FooterSocialDraft[]>(() => parseFooterSocialLinks(value));
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);

  function update(next: FooterSocialDraft[]) {
    const normalized = normalizeFooterSocialLinks(next);
    setItems(normalized);
    onChange(JSON.stringify(normalized, null, 2));
  }

  function updateItem(index: number, patch: Partial<FooterSocialDraft>) {
    update(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  async function uploadSocialImage(index: number, file: File) {
    setUploadingIndex(index);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('productId', `footer-social-${index + 1}`);
      const res = await fetch('/api/products/image', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok || !data.image_url) throw new Error(data.error ?? '上傳失敗');
      updateItem(index, { image: data.image_url });
    } catch (error) {
      alert(error instanceof Error ? error.message : '上傳發生問題');
    } finally {
      setUploadingIndex(null);
    }
  }

  return (
    <div className="lg:col-span-2 rounded-lg border border-[#e5ded4] p-4">
      <div>
        <h3 className="text-lg font-bold">頁尾三個按鈕</h3>
        <p className="mt-1 text-sm text-[#8a7f72]">設定頁尾最下方三個圓形按鈕的圖片與連結。</p>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {items.map((item, index) => (
          <div key={index} className="rounded-lg border border-[#e5ded4] bg-white p-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-[#1f1b19] text-xs font-bold text-white">
              {item.image ? <img src={item.image} alt="" className="h-full w-full object-cover" /> : item.label.slice(0, 4) || '@'}
            </div>
            <label className="mt-4 block text-sm text-[#8a7f72]">
              按鈕名稱
              <input
                value={item.label}
                onChange={(e) => updateItem(index, { label: e.target.value })}
                className="mt-2 w-full rounded-lg border border-[#e5ded4] px-3 py-2 text-[#1f1b19]"
              />
            </label>
            <label className="mt-3 block text-sm text-[#8a7f72]">
              連結網址
              <input
                value={item.url}
                onChange={(e) => updateItem(index, { url: e.target.value })}
                placeholder="https:// 或 mailto:"
                className="mt-2 w-full rounded-lg border border-[#e5ded4] px-3 py-2 text-[#1f1b19]"
              />
            </label>
            <label className="mt-3 block text-sm text-[#8a7f72]">
              圖片網址
              <input
                value={item.image}
                onChange={(e) => updateItem(index, { image: e.target.value })}
                placeholder="可貼圖片網址"
                className="mt-2 w-full rounded-lg border border-[#e5ded4] px-3 py-2 text-[#1f1b19]"
              />
            </label>
            <label className="mt-4 inline-block cursor-pointer rounded-full bg-[#1f1b19] px-4 py-2 text-sm font-semibold text-white">
              {uploadingIndex === index ? '上傳中...' : '上傳圖片'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
                className="hidden"
                disabled={uploadingIndex !== null}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) uploadSocialImage(index, file);
                }}
              />
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

function parseFooterSocialLinks(value: string): FooterSocialDraft[] {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return normalizeFooterSocialLinks(parsed as Partial<FooterSocialDraft>[]);
  } catch {
    /* 使用預設值 */
  }
  return normalizeFooterSocialLinks(DEFAULT_FOOTER_SOCIAL_LINKS);
}

function normalizeFooterSocialLinks(items: Partial<FooterSocialDraft>[]): FooterSocialDraft[] {
  const normalized = items.slice(0, 3).map((item, index) => ({
    label: typeof item.label === 'string' ? item.label : DEFAULT_FOOTER_SOCIAL_LINKS[index]?.label ?? '',
    image: typeof item.image === 'string' ? item.image : '',
    url: typeof item.url === 'string' ? item.url : '',
  }));
  while (normalized.length < 3) normalized.push({ ...DEFAULT_FOOTER_SOCIAL_LINKS[normalized.length] });
  return normalized;
}

function getFooterSocialLinksFromSections(sections?: SiteSettings['footer_sections']) {
  const socialSection = sections?.find((section) => section.title === FOOTER_SOCIAL_SECTION_TITLE);
  if (!socialSection?.items?.length) return [];
  return normalizeFooterSocialLinks(
    socialSection.items.map((item) => ({
      label: item.subtitle,
      image: item.content,
      url: item.url,
    })),
  );
}

function mergeFooterSocialLinksIntoSections(
  sections: FooterSectionDraft[],
  socialLinks: Partial<FooterSocialDraft>[],
) {
  const visibleSections = sections.filter((section) => section.title !== FOOTER_SOCIAL_SECTION_TITLE);
  const normalized = normalizeFooterSocialLinks(socialLinks);
  return [
    ...visibleSections,
    {
      title: FOOTER_SOCIAL_SECTION_TITLE,
      items: normalized.map((item) => ({
        subtitle: item.label,
        content: item.image,
        url: item.url,
      })),
    },
  ];
}

function MethodToggles({
  label,
  defaults,
  value,
  onChange,
}: {
  label: string;
  defaults: string[];
  value: string; // 一行一筆的字串,內容即「啟用中」的方式
  onChange: (next: string) => void;
}) {
  const [custom, setCustom] = useState('');
  const enabled = value
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  const master = Array.from(new Set([...defaults, ...enabled]));

  function toggle(method: string, on: boolean) {
    const set = new Set(enabled);
    if (on) set.add(method);
    else set.delete(method);
    onChange(master.filter((m) => set.has(m)).join('\n'));
  }

  function addCustom() {
    const m = custom.trim();
    if (!m) return;
    if (!enabled.includes(m)) onChange([...enabled, m].join('\n'));
    setCustom('');
  }

  return (
    <Field label={label}>
      <div className="space-y-2">
        {master.map((method) => {
          const on = enabled.includes(method);
          return (
            <label
              key={method}
              className="flex items-center justify-between rounded-lg border border-[#e5ded4] px-3 py-2.5"
            >
              <span className={`text-sm ${on ? 'font-semibold text-[#1f1b19]' : 'text-[#8a7f72]'}`}>
                {method}
              </span>
              <span className="flex items-center gap-2 text-xs text-[#8a7f72]">
                {on ? '啟用' : '停用'}
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) => toggle(method, e.target.checked)}
                  className="h-4 w-4"
                />
              </span>
            </label>
          );
        })}
        <div className="flex gap-2 pt-1">
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustom())}
            placeholder="新增自訂方式"
            className="flex-1 rounded-lg border border-[#e5ded4] px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={addCustom}
            className="rounded-lg border border-[#1f1b19] px-4 py-2 text-sm font-semibold"
          >
            新增
          </button>
        </div>
      </div>
    </Field>
  );
}

// 上傳前先在瀏覽器縮圖壓縮 JPEG；透明圖檔保持原檔,避免 PNG/WebP 去背被轉成黑底。
function prepareProductImage(file: File, index: number, maxDim = 1600, quality = 0.85): Promise<{ blob: Blob; filename: string }> {
  if (file.type !== 'image/jpeg') {
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : file.type === 'image/gif' ? 'gif' : 'img';
    return Promise.resolve({ blob: file, filename: `product-${Date.now()}-${index}.${ext}` });
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('無法處理圖片'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => (blob ? resolve({ blob, filename: `product-${Date.now()}-${index}.jpg` }) : reject(new Error('圖片壓縮失敗'))),
        'image/jpeg',
        quality,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('圖片讀取失敗(可能是不支援的格式)'));
    };
    img.src = url;
  });
}

// 用 XMLHttpRequest 上傳,才能拿到上傳進度(fetch 沒有上傳進度事件)
function uploadImageWithProgress(
  blob: Blob,
  filename: string,
  productId: string,
  onProgress: (fraction: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append('file', blob, filename);
    fd.append('productId', productId);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/products/image');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let data: { image_url?: string; error?: string } = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* 忽略解析錯誤 */
      }
      if (xhr.status >= 200 && xhr.status < 300 && data.image_url) resolve(data.image_url);
      else reject(new Error(data.error ?? '上傳失敗'));
    };
    xhr.onerror = () => reject(new Error('連線發生問題'));
    xhr.send(fd);
  });
}

// 後台專用的訂單完整資訊(含出貨狀態 / 付款管理;與客人端的訂單明細分開)
function AdminOrderModal({
  order,
  imageByName,
  onClose,
  onUpdate,
}: {
  order: Order;
  imageByName: Map<string, string>;
  onClose: () => void;
  onUpdate: (patch: Partial<Order>) => void;
}) {
  const dateStr = order.created_at ? new Date(order.created_at).toLocaleString('zh-TW') : '';
  const row = (label: string, value?: string) =>
    value ? (
      <div className="flex justify-between gap-3">
        <span className="shrink-0 text-[#8a7f72]">{label}</span>
        <span className="min-w-0 break-words text-right">{value}</span>
      </div>
    ) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#e5ded4] px-5 py-4">
          <h2 className="text-lg font-semibold">{order.order_no}</h2>
          <button onClick={onClose} aria-label="關閉" className="rounded-md p-1 text-2xl leading-none hover:bg-[#efe8dd]">
            ×
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain p-5">
          {/* 出貨狀態 / 付款(管理操作,藏在訂單資訊內) */}
          <div className="rounded-xl bg-[#faf7f2] p-4">
            <p className="mb-2 text-sm font-semibold text-[#6b6156]">出貨狀態</p>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={order.status}
                onChange={(e) => onUpdate({ status: e.target.value })}
                className="rounded-full border border-[#d7c9bd] bg-white px-3 py-1.5 text-sm"
              >
                {ORDER_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <button
                onClick={() => onUpdate({ paid: !order.paid })}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                  order.paid ? 'bg-[#e9f7ee] text-[#1f7a44]' : 'border border-[#d7c9bd] text-[#6b6156]'
                }`}
              >
                {order.paid ? '已付款' : '未付款'}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                disabled
                className="rounded-full border border-dashed border-[#d7c9bd] px-3 py-1.5 text-xs text-[#a99e8f]"
              >
                串接物流(開發中)
              </button>
              <button
                disabled
                className="rounded-full border border-dashed border-[#d7c9bd] px-3 py-1.5 text-xs text-[#a99e8f]"
              >
                串接金流(開發中)
              </button>
            </div>
            <p className="mt-2 text-xs text-[#a99e8f]">串接物流與金流後,出貨與付款狀態可自動更新。</p>
          </div>

          {/* 品項 */}
          <div className="space-y-3">
            {order.items.map((it, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-[#e9e1d6]">
                  {it.image || imageByName.get(it.name) ? (
                    <img src={it.image || imageByName.get(it.name)} alt={it.name} className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{it.name}</p>
                  <p className="text-xs text-[#8a7f72]">
                    {it.variant} × {it.quantity}
                  </p>
                </div>
                <span className="text-sm font-semibold">{formatter.format(it.price * it.quantity)}</span>
              </div>
            ))}
          </div>

          <div className="space-y-1.5 border-t border-[#efe8dd] pt-4 text-sm">
            {row('小計', formatter.format(order.subtotal))}
            {row('運費', order.shipping === 0 ? '免運' : formatter.format(order.shipping))}
            {order.discount > 0 ? row(`折扣 ${order.discount_code || ''}`, `-${formatter.format(order.discount)}`) : null}
            <div className="flex justify-between pt-1 text-base font-semibold">
              <span>合計</span>
              <span className="text-[#c84767]">{formatter.format(order.total)}</span>
            </div>
          </div>

          <div className="border-t border-[#efe8dd] pt-4">
            <h3 className="mb-2 font-semibold">訂單資訊</h3>
            <div className="space-y-1.5 text-sm text-[#6b6156]">
              {row('訂單號碼', order.order_no)}
              {row('訂單日期', dateStr)}
              {row('訂單狀態', order.status)}
              {row('付款狀態', order.paid ? '已付款' : '未付款')}
              {row('備註', order.note)}
            </div>
          </div>

          <div className="border-t border-[#efe8dd] pt-4">
            <h3 className="mb-2 font-semibold">顧客與送貨資訊</h3>
            <div className="space-y-1.5 text-sm text-[#6b6156]">
              {row('姓名', order.customer_name)}
              {row('電話', order.phone)}
              {row('Email', order.email)}
              {row('地址', order.address)}
              {row('送貨方式', order.shipping_method)}
              {row('付款方式', order.payment_method)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type MvForm = {
  document_no: string;
  document_date: string;
  type: 'in' | 'out';
  status: string;
  payment_status: string;
  payment_no: string;
  location: string;
  handler: string;
  note: string;
};

type MovementLine = {
  id: string;
  product_id: string;
  variant_key: string;
  quantity: number;
  unit_price: number;
};

function ProductInventorySummary({
  products,
  categories,
  filters,
  selectedProduct,
  onSelectProduct,
  onCloseProduct,
  onEditProduct,
  onCreateProduct,
}: {
  products: Product[];
  categories: Category[];
  filters: React.ReactNode;
  selectedProduct: Product | null;
  onSelectProduct: (product: Product) => void;
  onCloseProduct: () => void;
  onEditProduct: (product: Product) => void;
  onCreateProduct: () => void;
}) {
  const catName = (slug: string) => categories.find((c) => c.slug === slug)?.name || slug || '—';
  const selectedRows = selectedProduct ? getProductVariantRows(selectedProduct) : [];
  const selectedTotalStock = selectedRows.reduce((sum, row) => sum + row.inventory, 0);
  const selectedStockValue = selectedRows.reduce((sum, row) => sum + row.inventory * row.cost, 0);
  const selectedSafetyTotal = selectedRows.reduce((sum, row) => sum + row.safety, 0);

  return (
    <Card
      title="商品管理總覽"
      action={
        <button
          type="button"
          onClick={onCreateProduct}
          className="rounded-full bg-[#1f1b19] px-3 py-2 text-sm font-semibold text-white"
        >
          新增商品
        </button>
      }
    >
      {filters}
      {products.length === 0 ? (
        <Empty>沒有符合篩選條件的商品。</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-sm">
            <thead>
              <tr className="border-b border-[#e5ded4] text-left text-xs text-[#8a7f72]">
                <th className="px-2 py-2">型號</th>
                <th className="px-2 py-2">商品名稱</th>
                <th className="px-2 py-2">分類</th>
                <th className="px-2 py-2 text-right">規格數</th>
                <th className="px-2 py-2 text-right">總庫存</th>
                <th className="px-2 py-2 text-right">安全庫存</th>
                <th className="px-2 py-2">庫存狀態</th>
                <th className="px-2 py-2 text-right">庫存金額</th>
                <th className="px-2 py-2 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const variantRows = getProductVariantRows(product);
                const totalStock = variantRows.reduce((sum, row) => sum + row.inventory, 0);
                const stockValue = variantRows.reduce((sum, row) => sum + row.inventory * row.cost, 0);
                const safetyTotal = variantRows.reduce((sum, row) => sum + row.safety, 0);
                const low = variantRows.some((row) => row.inventory <= row.safety);

                return (
                  <tr key={product.id} className="border-b border-[#efe8dd] last:border-0">
                    <td className="px-2 py-3 font-mono">
                      <button
                        type="button"
                        onClick={() => onSelectProduct(product)}
                        className="font-semibold text-[#2687c9] underline-offset-4 hover:underline"
                      >
                        {product.id}
                      </button>
                    </td>
                    <td className="max-w-[360px] px-2 py-3">
                      <span className="block truncate font-semibold">{product.name}</span>
                    </td>
                    <td className="px-2 py-3 text-[#8a7f72]">{catName(product.category)}</td>
                    <td className="px-2 py-3 text-right">{variantRows.length}</td>
                    <td className="px-2 py-3 text-right font-semibold">{totalStock}</td>
                    <td className="px-2 py-3 text-right text-[#8a7f72]">{safetyTotal}</td>
                    <td className="px-2 py-3">
                      <span className={low ? 'text-[#c0392b]' : 'text-[#1f7a44]'}>
                        {low ? '需補貨' : '正常'}
                      </span>
                    </td>
                    <td className="px-2 py-3 text-right">{stockValue.toLocaleString()}</td>
                    <td className="px-2 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => onEditProduct(product)}
                        className="rounded-full border border-[#d7c9bd] px-3 py-1.5 text-xs font-semibold"
                      >
                        編輯
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCloseProduct}>
          <div
            className="max-h-[86vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e5ded4] p-5">
              <div>
                <p className="font-mono text-sm text-[#2687c9]">{selectedProduct.id}</p>
                <h3 className="mt-1 text-2xl font-bold">{selectedProduct.name}</h3>
                <p className="mt-1 text-sm text-[#8a7f72]">
                  已載入 {selectedRows.length} 筆顏色 / 尺碼庫存資料
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onEditProduct(selectedProduct)}
                  className="rounded-full bg-[#1f1b19] px-4 py-2 text-sm font-semibold text-white"
                >
                  編輯商品
                </button>
                <button
                  type="button"
                  onClick={onCloseProduct}
                  className="rounded-full border border-[#d7c9bd] px-4 py-2 text-sm font-semibold"
                >
                  關閉
                </button>
              </div>
            </div>
            <div className="grid gap-3 border-b border-[#efe8dd] bg-[#faf7f2] p-4 text-sm sm:grid-cols-4">
              <div>
                <span className="block text-xs text-[#8a7f72]">總庫存</span>
                <strong className="text-xl">{selectedTotalStock}</strong>
              </div>
              <div>
                <span className="block text-xs text-[#8a7f72]">安全庫存</span>
                <strong className="text-xl">{selectedSafetyTotal}</strong>
              </div>
              <div>
                <span className="block text-xs text-[#8a7f72]">庫存金額</span>
                <strong className="text-xl">{selectedStockValue.toLocaleString()}</strong>
              </div>
              <div>
                <span className="block text-xs text-[#8a7f72]">分類</span>
                <strong className="text-xl">{catName(selectedProduct.category)}</strong>
              </div>
            </div>
            <div className="max-h-[52vh] overflow-auto p-4">
              <table className="w-full whitespace-nowrap text-sm">
                <thead>
                  <tr className="border-b border-[#e5ded4] text-left text-xs text-[#8a7f72]">
                    <th className="px-2 py-2">規格</th>
                    <th className="px-2 py-2">顏色</th>
                    <th className="px-2 py-2">尺寸</th>
                    <th className="px-2 py-2 text-right">目前庫存</th>
                    <th className="px-2 py-2 text-right">安全庫存</th>
                    <th className="px-2 py-2 text-right">單位成本</th>
                    <th className="px-2 py-2">儲位</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedRows.map((row) => (
                    <tr key={row.key} className="border-b border-[#efe8dd] last:border-0">
                      <td className="px-2 py-2">{row.label}</td>
                      <td className="px-2 py-2 text-[#6b6156]">{row.color || '—'}</td>
                      <td className="px-2 py-2 text-[#6b6156]">{row.size || '—'}</td>
                      <td className="px-2 py-2 text-right font-semibold">{row.inventory}</td>
                      <td className="px-2 py-2 text-right">{row.safety}</td>
                      <td className="px-2 py-2 text-right">{row.cost}</td>
                      <td className="px-2 py-2 text-[#6b6156]">{row.location || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function InventorySection({
  products,
  categories,
  movements,
  mvForm,
  setMvForm,
  movementLines,
  setMovementLines,
  onAddMovement,
  onUpdateVariantMeta,
  onEditProduct,
  onCreateProduct,
}: {
  products: Product[];
  categories: Category[];
  movements: StockMovement[];
  mvForm: MvForm;
  setMvForm: (f: MvForm) => void;
  movementLines: MovementLine[];
  setMovementLines: (lines: MovementLine[]) => void;
  onAddMovement: () => void;
  onUpdateVariantMeta: (
    productId: string,
    variantKey: string,
    patch: Partial<Pick<Variant, 'cost' | 'safety' | 'location'>>,
  ) => void;
  onEditProduct: (product: Product) => void;
  onCreateProduct: () => void;
}) {
  const [inventoryFilters, setInventoryFilters] = useState({
    query: '',
    category: 'all',
    stockStatus: 'all',
    productId: 'all',
  });
  const [selectedInventoryProduct, setSelectedInventoryProduct] = useState<Product | null>(null);
  const [inventoryTab, setInventoryTab] = useState<'products' | 'stock' | 'movement' | 'history'>('products');
  const catName = (slug: string) => categories.find((c) => c.slug === slug)?.name || slug || '—';
  const nameById = (id: string) => products.find((p) => p.id === id)?.name || id;
  const fmtDate = (s?: string) => (s ? new Date(s).toLocaleDateString('zh-TW') : '—');

  // 最後異動日期(movements 已 desc 排序,第一筆即最新)
  const lastMv = new Map<string, string>();
  for (const m of movements) {
    const k = `${m.product_id}${m.variant_key || ''}`;
    if (!lastMv.has(k)) lastMv.set(k, m.created_at || '');
  }

  const rows = products.flatMap((p) => {
    const base = { pid: p.id, name: p.name, cat: catName(p.category), category: p.category, unit: p.unit || '件' };
    if (p.variants.length > 0) {
      return p.variants.map((v) => ({
        ...base,
        spec: v.options.join(' / '),
        key: v.options.join(' / '),
        inv: v.inventory,
        safety: v.safety ?? 0,
        cost: v.cost ?? 0,
        location: v.location || '—',
      }));
    }
    return [{ ...base, spec: '—', key: '', inv: p.inventory, safety: 0, cost: 0, location: '—' }];
  });
  const filteredRows = rows.filter((r) => {
    const q = inventoryFilters.query.trim().toLowerCase();
    const low = r.inv <= r.safety;
    if (inventoryFilters.productId !== 'all' && r.pid !== inventoryFilters.productId) return false;
    if (inventoryFilters.category !== 'all' && r.category !== inventoryFilters.category) return false;
    if (inventoryFilters.stockStatus === 'low' && !low) return false;
    if (inventoryFilters.stockStatus === 'normal' && low) return false;
    if (!q) return true;
    return [r.pid, r.name, r.cat, r.spec, r.location].some((value) =>
      String(value).toLowerCase().includes(q),
    );
  });
  const filteredProducts = products.filter((p) => filteredRows.some((r) => r.pid === p.id));

  const inventoryTabs = [
    { key: 'products', label: '商品管理' },
    { key: 'stock', label: '庫存總表' },
    { key: 'movement', label: '入庫 / 出庫' },
    { key: 'history', label: '進出庫紀錄' },
  ] as const;
  const updateMovementLine = (id: string, patch: Partial<MovementLine>) => {
    setMovementLines(movementLines.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  };
  const addMovementLine = () => {
    setMovementLines([
      ...movementLines,
      { id: `line-${Date.now()}-${movementLines.length}`, product_id: '', variant_key: '', quantity: 1, unit_price: 0 },
    ]);
  };
  const removeMovementLine = (id: string) => {
    setMovementLines(movementLines.length <= 1 ? movementLines : movementLines.filter((line) => line.id !== id));
  };
  const inventoryFilterControls = (
    <div className="mb-5 rounded-xl border border-[#e5ded4] bg-[#faf7f2] p-4">
      <div className="grid gap-3 md:grid-cols-4">
        <label className="block">
          <span className="mb-1 block text-sm text-[#8a7f72]">搜尋</span>
          <input
            value={inventoryFilters.query}
            onChange={(e) => setInventoryFilters({ ...inventoryFilters, query: e.target.value })}
            placeholder="品項、品名、規格、儲位"
            className="w-full rounded-lg border border-[#e5ded4] bg-white px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-[#8a7f72]">商品</span>
          <select
            value={inventoryFilters.productId}
            onChange={(e) => setInventoryFilters({ ...inventoryFilters, productId: e.target.value })}
            className="w-full rounded-lg border border-[#e5ded4] bg-white px-3 py-2"
          >
            <option value="all">全部商品</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-[#8a7f72]">分類</span>
          <select
            value={inventoryFilters.category}
            onChange={(e) => setInventoryFilters({ ...inventoryFilters, category: e.target.value })}
            className="w-full rounded-lg border border-[#e5ded4] bg-white px-3 py-2"
          >
            <option value="all">全部分類</option>
            {categories.map((c) => (
              <option key={c.id} value={c.slug}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-[#8a7f72]">庫存狀態</span>
          <select
            value={inventoryFilters.stockStatus}
            onChange={(e) => setInventoryFilters({ ...inventoryFilters, stockStatus: e.target.value })}
            className="w-full rounded-lg border border-[#e5ded4] bg-white px-3 py-2"
          >
            <option value="all">全部狀態</option>
            <option value="low">需補貨</option>
            <option value="normal">正常</option>
          </select>
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[#8a7f72]">
          目前顯示 {filteredProducts.length} 個商品、{filteredRows.length} 筆顏色 / 尺碼庫存。
        </p>
        <button
          type="button"
          onClick={() => setInventoryFilters({ query: '', category: 'all', stockStatus: 'all', productId: 'all' })}
          className="rounded-full border border-[#d7c9bd] bg-white px-3 py-1.5 text-sm font-semibold"
        >
          清除篩選
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto rounded-2xl border border-[#e5ded4] bg-white p-2">
        <div className="flex min-w-max gap-2">
          {inventoryTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setInventoryTab(tab.key)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                inventoryTab === tab.key
                  ? 'bg-[#1f1b19] text-white'
                  : 'border border-[#e5ded4] bg-[#faf7f2] text-[#6b6156]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {inventoryTab === 'products' && (
      <ProductInventorySummary
        products={filteredProducts}
        categories={categories}
        filters={inventoryFilterControls}
        selectedProduct={selectedInventoryProduct}
        onSelectProduct={setSelectedInventoryProduct}
        onCloseProduct={() => setSelectedInventoryProduct(null)}
        onEditProduct={onEditProduct}
        onCreateProduct={onCreateProduct}
      />
      )}

      {/* 庫存總表 */}
      {inventoryTab === 'stock' && (
      <Card title="庫存總表">
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-sm">
            <thead>
              <tr className="border-b border-[#e5ded4] text-left text-xs text-[#8a7f72]">
                <th className="px-2 py-2">品項編號</th>
                <th className="px-2 py-2">品名</th>
                <th className="px-2 py-2">分類</th>
                <th className="px-2 py-2">規格</th>
                <th className="px-2 py-2">單位</th>
                <th className="px-2 py-2 text-right">目前庫存</th>
                <th className="px-2 py-2 text-right">安全庫存</th>
                <th className="px-2 py-2">庫存狀態</th>
                <th className="px-2 py-2 text-right">單位成本</th>
                <th className="px-2 py-2 text-right">庫存金額</th>
                <th className="px-2 py-2">儲位</th>
                <th className="px-2 py-2">最後異動</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r, i) => {
                const low = r.inv <= r.safety;
                return (
                  <tr key={`${r.pid}-${r.key}-${i}`} className="border-b border-[#efe8dd]">
                    <td className="px-2 py-2 font-mono text-xs">{r.pid}</td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => {
                          const product = products.find((p) => p.id === r.pid);
                          if (product) onEditProduct(product);
                        }}
                        className="font-semibold underline-offset-4 hover:underline"
                      >
                        {r.name}
                      </button>
                    </td>
                    <td className="px-2 py-2 text-[#8a7f72]">{r.cat}</td>
                    <td className="px-2 py-2">{r.spec}</td>
                    <td className="px-2 py-2 text-[#8a7f72]">{r.unit}</td>
                    <td className="px-2 py-2 text-right font-semibold">{r.inv}</td>
                    <td className="px-2 py-2 text-right text-[#8a7f72]">
                      {r.key ? (
                        <input
                          type="number"
                          min={0}
                          defaultValue={r.safety || ''}
                          placeholder="0"
                          onBlur={(e) =>
                            onUpdateVariantMeta(r.pid, r.key, {
                              safety: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                          className="w-16 rounded border border-[#e5ded4] px-1 py-1 text-right"
                        />
                      ) : (
                        r.safety
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <span className={low ? 'text-[#c0392b]' : 'text-[#1f7a44]'}>
                        {low ? '🔴 需補貨' : '🟢 正常'}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right">
                      {r.key ? (
                        <input
                          type="number"
                          min={0}
                          defaultValue={r.cost || ''}
                          placeholder="0"
                          onBlur={(e) =>
                            onUpdateVariantMeta(r.pid, r.key, {
                              cost: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                          className="w-20 rounded border border-[#e5ded4] px-1 py-1 text-right"
                        />
                      ) : (
                        r.cost
                      )}
                    </td>
                    <td className="px-2 py-2 text-right">{(r.inv * r.cost).toLocaleString()}</td>
                    <td className="px-2 py-2 text-[#8a7f72]">
                      {r.key ? (
                        <input
                          defaultValue={r.location === '—' ? '' : r.location}
                          placeholder="—"
                          onBlur={(e) =>
                            onUpdateVariantMeta(r.pid, r.key, { location: e.target.value.trim() })
                          }
                          className="w-24 rounded border border-[#e5ded4] px-1 py-1"
                        />
                      ) : (
                        r.location
                      )}
                    </td>
                    <td className="px-2 py-2 text-[#8a7f72]">
                      {fmtDate(lastMv.get(`${r.pid}${r.key}`))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredRows.length === 0 && (
            <p className="py-8 text-center text-sm text-[#8a7f72]">沒有符合篩選條件的庫存資料。</p>
          )}
        </div>
        <p className="mt-2 text-xs text-[#8a7f72]">
          庫存數量由「入庫 / 出庫」自動計算,請用下方表單登錄異動,不要直接改數字。
          安全庫存、單位成本、儲位可直接在表格內修改(離開欄位即儲存)。
        </p>
      </Card>
      )}

      {/* 入庫 / 出庫 */}
      {inventoryTab === 'movement' && (
        <Card
          title={mvForm.type === 'in' ? '入庫單' : '出庫單'}
          action={
            <div className="flex gap-2">
              {(['in', 'out'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setMvForm({ ...mvForm, type: t, status: t === 'in' ? '進貨' : '出貨' })}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold ${
                    mvForm.type === t ? 'border-[#1f1b19] bg-[#1f1b19] text-white' : 'border-[#d7c9bd]'
                  }`}
                >
                  {t === 'in' ? '入庫單' : '出庫單'}
                </button>
              ))}
            </div>
          }
        >
          <div className="grid gap-3 rounded-xl border border-[#e5ded4] bg-[#faf7f2] p-4 lg:grid-cols-4">
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-[#8a7f72]">單號</span>
              <input
                value={mvForm.document_no}
                onChange={(e) => setMvForm({ ...mvForm, document_no: e.target.value })}
                placeholder={mvForm.type === 'in' ? 'WI-202609001' : 'WO-202609001'}
                className="w-full rounded-lg border border-[#e5ded4] bg-white px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-[#8a7f72]">日期</span>
              <input
                type="datetime-local"
                value={mvForm.document_date}
                onChange={(e) => setMvForm({ ...mvForm, document_date: e.target.value })}
                className="w-full rounded-lg border border-[#e5ded4] bg-white px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-[#8a7f72]">狀態</span>
              <select
                value={mvForm.status}
                onChange={(e) => setMvForm({ ...mvForm, status: e.target.value })}
                className="w-full rounded-lg border border-[#e5ded4] bg-white px-3 py-2"
              >
                <option value={mvForm.type === 'in' ? '進貨' : '出貨'}>{mvForm.type === 'in' ? '進貨' : '出貨'}</option>
                <option value="暫存">暫存</option>
                <option value="完成">完成</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-[#8a7f72]">{mvForm.type === 'in' ? '入庫人' : '出庫人'}</span>
              <input
                value={mvForm.handler}
                onChange={(e) => setMvForm({ ...mvForm, handler: e.target.value })}
                className="w-full rounded-lg border border-[#e5ded4] bg-white px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-[#8a7f72]">倉別 / 對象</span>
              <input
                value={mvForm.location}
                onChange={(e) => setMvForm({ ...mvForm, location: e.target.value })}
                placeholder="主倉"
                className="w-full rounded-lg border border-[#e5ded4] bg-white px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-[#8a7f72]">請款狀態</span>
              <input
                value={mvForm.payment_status}
                onChange={(e) => setMvForm({ ...mvForm, payment_status: e.target.value })}
                className="w-full rounded-lg border border-[#e5ded4] bg-white px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-[#8a7f72]">請款單號</span>
              <input
                value={mvForm.payment_no}
                onChange={(e) => setMvForm({ ...mvForm, payment_no: e.target.value })}
                className="w-full rounded-lg border border-[#e5ded4] bg-white px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-[#8a7f72]">備註</span>
              <input
                value={mvForm.note}
                onChange={(e) => setMvForm({ ...mvForm, note: e.target.value })}
                className="w-full rounded-lg border border-[#e5ded4] bg-white px-3 py-2"
              />
            </label>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[980px] whitespace-nowrap text-sm">
              <thead>
                <tr className="border-b border-[#e5ded4] bg-[#f3eee7] text-left text-xs text-[#6b6156]">
                  <th className="px-3 py-3">商品</th>
                  <th className="px-3 py-3">規格 / 顏色 / 尺寸</th>
                  <th className="px-3 py-3 text-right">數量</th>
                  <th className="px-3 py-3 text-right">單價</th>
                  <th className="px-3 py-3 text-right">小計</th>
                  <th className="px-3 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {movementLines.map((line) => {
                  const lineProduct = products.find((p) => p.id === line.product_id);
                  return (
                    <tr key={line.id} className="border-b border-[#efe8dd]">
                      <td className="px-3 py-3">
                        <select
                          value={line.product_id}
                          onChange={(e) => updateMovementLine(line.id, { product_id: e.target.value, variant_key: '' })}
                          className="w-64 rounded-lg border border-[#e5ded4] px-3 py-2"
                        >
                          <option value="">請選擇商品</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.id} / {p.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        {lineProduct?.variants.length ? (
                          <select
                            value={line.variant_key}
                            onChange={(e) => updateMovementLine(line.id, { variant_key: e.target.value })}
                            className="w-56 rounded-lg border border-[#e5ded4] px-3 py-2"
                          >
                            <option value="">請選擇規格</option>
                            {lineProduct.variants.map((v) => {
                              const key = v.options.join(' / ');
                              return (
                                <option key={key} value={key}>
                                  {key}，庫存 {v.inventory}
                                </option>
                              );
                            })}
                          </select>
                        ) : (
                          <span className="text-[#8a7f72]">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <input
                          type="number"
                          min={1}
                          value={line.quantity}
                          onChange={(e) => updateMovementLine(line.id, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                          className="w-24 rounded-lg border border-[#e5ded4] px-3 py-2 text-right"
                        />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <input
                          type="number"
                          min={0}
                          value={line.unit_price}
                          onChange={(e) => updateMovementLine(line.id, { unit_price: Math.max(0, Number(e.target.value) || 0) })}
                          className="w-28 rounded-lg border border-[#e5ded4] px-3 py-2 text-right"
                        />
                      </td>
                      <td className="px-3 py-3 text-right font-semibold">
                        {(line.quantity * line.unit_price).toLocaleString()}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => removeMovementLine(line.id)}
                          className="rounded-full border border-[#d7c9bd] px-3 py-1.5 text-xs font-semibold"
                        >
                          刪除
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={addMovementLine}
              className="rounded-full border border-[#d7c9bd] px-4 py-2 text-sm font-semibold"
            >
              新增明細列
            </button>
            <div className="flex items-center gap-4">
              <p className="text-sm text-[#8a7f72]">
                合計 {movementLines.reduce((sum, line) => sum + line.quantity * line.unit_price, 0).toLocaleString()}
              </p>
              <button
                type="button"
                onClick={onAddMovement}
                className="rounded-full bg-[#1f1b19] px-6 py-2.5 text-sm font-semibold text-white"
              >
                登錄{mvForm.type === 'in' ? '入庫單' : '出庫單'}
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* 進出庫紀錄 */}
      {inventoryTab === 'history' && (
      <Card title="進出庫紀錄">
        {movements.length === 0 ? (
          <Empty>目前沒有進出庫紀錄。</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-sm">
              <thead>
                <tr className="border-b border-[#e5ded4] text-left text-xs text-[#8a7f72]">
                  <th className="px-2 py-2">日期</th>
                  <th className="px-2 py-2">品項</th>
                  <th className="px-2 py-2">規格</th>
                  <th className="px-2 py-2">類型</th>
                  <th className="px-2 py-2 text-right">數量</th>
                  <th className="px-2 py-2 text-right">單價</th>
                  <th className="px-2 py-2">地點 / 對象</th>
                  <th className="px-2 py-2">經手人</th>
                  <th className="px-2 py-2">備註</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id} className="border-b border-[#efe8dd]">
                    <td className="px-2 py-2 text-[#8a7f72]">{fmtDate(m.created_at)}</td>
                    <td className="px-2 py-2">{nameById(m.product_id)}</td>
                    <td className="px-2 py-2 text-[#8a7f72]">{m.variant_key || '—'}</td>
                    <td className="px-2 py-2">
                      <span className={m.type === 'in' ? 'text-[#1f7a44]' : 'text-[#c0392b]'}>
                        {m.type === 'in' ? '入庫' : '出庫'}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right font-semibold">
                      {m.type === 'in' ? '+' : '−'}
                      {m.quantity}
                    </td>
                    <td className="px-2 py-2 text-right">{m.unit_price}</td>
                    <td className="px-2 py-2 text-[#8a7f72]">{m.location || '—'}</td>
                    <td className="px-2 py-2 text-[#8a7f72]">{m.handler || '—'}</td>
                    <td className="px-2 py-2 text-[#8a7f72]">{m.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      )}
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
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number; percent: number } | null>(
    null,
  );
  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    onChange({ ...draft, [key]: value });
  }

  // 規格制:即時算出組合與各組合庫存
  const modalSpecs = draft.specs
    .map((s) => ({ name: s.name.trim(), options: parseOptions(s.optionsText) }))
    .filter((s) => s.name && s.options.length > 0);
  const modalCombos = specCombos(modalSpecs);
  const hasSpecs = modalCombos.length > 0;
  const specTotal = modalCombos.reduce(
    (n, opts) => n + (Number(draft.variantStock[opts.join(' / ')]) || 0),
    0,
  );

  function updateSpec(i: number, patch: Partial<{ name: string; optionsText: string }>) {
    onChange({ ...draft, specs: draft.specs.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) });
  }
  function addSpec() {
    onChange({ ...draft, specs: [...draft.specs, { name: '', optionsText: '' }] });
  }
  function removeSpec(i: number) {
    onChange({ ...draft, specs: draft.specs.filter((_, idx) => idx !== i) });
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
    setUploadProgress({ done: 0, total: picked.length, percent: 0 });
    try {
      const uploaded: string[] = [];
      for (let i = 0; i < picked.length; i++) {
        const prepared = await prepareProductImage(picked[i], i);
        const url = await uploadImageWithProgress(
          prepared.blob,
          prepared.filename,
          draft.id || 'new-product',
          (p) => setUploadProgress({ done: i, total: picked.length, percent: Math.round(p * 100) }),
        );
        uploaded.push(url);
        setUploadProgress({ done: i + 1, total: picked.length, percent: 100 });
      }
      onChange({ ...draft, images: [...draft.images, ...uploaded].slice(0, MAX_PRODUCT_IMAGES) });
      if (files.length > room) alert(`最多只能放 ${MAX_PRODUCT_IMAGES} 張,已略過多餘的圖片`);
    } catch (error) {
      alert(error instanceof Error ? error.message : '上傳失敗');
    } finally {
      setUploadingImage(false);
      setUploadProgress(null);
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
            <Field label={hasSpecs ? '總庫存(各規格加總)' : '庫存'}>
              <input
                type="number"
                className="w-full rounded-lg border border-[#e5ded4] px-3 py-2 disabled:bg-[#f5efec]"
                value={hasSpecs ? specTotal : draft.inventory}
                disabled={hasSpecs}
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
          <Field label="單位(例:件 / 串 / 顆 / 入)">
            <input
              className="w-full rounded-lg border border-[#e5ded4] px-3 py-2"
              value={draft.unit}
              placeholder="件"
              onChange={(e) => set('unit', e.target.value)}
            />
          </Field>
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
                      className="group relative aspect-[3/4] overflow-hidden rounded-lg border border-[#e5ded4] bg-[#f6f2ec]"
                    >
                      <img src={url} alt="" className="h-full w-full object-contain drop-shadow-[0_10px_12px_rgba(31,27,25,0.2)]" />
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
              {uploadProgress && (
                <div>
                  <div className="mb-1 flex justify-between text-xs text-[#8a7f72]">
                    <span>
                      上傳中 {uploadProgress.done}/{uploadProgress.total}
                    </span>
                    <span>{uploadProgress.percent}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[#eee5da]">
                    <div
                      className="h-full rounded-full bg-[#1f1b19] transition-all duration-150"
                      style={{ width: `${uploadProgress.percent}%` }}
                    />
                  </div>
                </div>
              )}
              <p className="text-xs text-[#8a7f72]">
                可一次選多張。圖片會上傳到 Supabase Storage,第一張會成為前台封面圖。
              </p>
            </div>
          </Field>
          <Field label="規格設定(例:顏色→紅,綠,藍;尺寸→S,M,L;規格→3入,5入)">
            <div className="space-y-2">
              {draft.specs.map((s, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    placeholder="規格名稱"
                    value={s.name}
                    onChange={(e) => updateSpec(i, { name: e.target.value })}
                    className="w-24 shrink-0 rounded-lg border border-[#e5ded4] px-3 py-2 text-sm"
                  />
                  <input
                    placeholder="選項(用逗號 / 斜線分隔)"
                    value={s.optionsText}
                    onChange={(e) => updateSpec(i, { optionsText: e.target.value })}
                    className="min-w-0 flex-1 rounded-lg border border-[#e5ded4] px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => removeSpec(i)}
                    aria-label="刪除規格"
                    className="shrink-0 rounded-lg border border-[#e0b4b4] px-3 text-sm font-semibold text-[#c0392b]"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addSpec}
                className="rounded-full border border-[#d7c9bd] px-4 py-2 text-sm font-semibold"
              >
                + 新增規格維度
              </button>
            </div>
          </Field>

          {hasSpecs && (
            <Field label="各規格庫存(顯示)">
              <div className="max-h-64 overflow-auto rounded-lg border border-[#eee5da] bg-[#faf7f2] p-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-[#8a7f72]">
                      <th className="px-2 py-1">規格</th>
                      <th className="px-2 py-1 text-right">目前庫存</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modalCombos.map((opts) => {
                      const key = opts.join(' / ');
                      const inv = Number(draft.variantStock[key] ?? 0);
                      return (
                        <tr key={key} className="border-t border-[#efe8dd]">
                          <td className="px-2 py-1">{key}</td>
                          <td className={`px-2 py-1 text-right font-medium ${inv <= 0 ? 'text-[#c0392b]' : ''}`}>
                            {inv}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-1 text-xs text-[#8a7f72]">
                共 {modalCombos.length} 個組合,總庫存 {specTotal}。庫存、成本、安全庫存的異動請到「庫存管理」設定。
              </p>
            </Field>
          )}
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
