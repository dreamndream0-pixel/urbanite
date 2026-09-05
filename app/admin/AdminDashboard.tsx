'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase/client';
import type {
  Banner,
  Category,
  CouponUsage,
  Customer,
  Discount,
  Order,
  OrderDetail,
  OrderStatusHistory,
  Product,
  ReturnRequest,
  SiteSettings,
  StockMovement,
  UserCoupon,
  Variant,
} from '@/lib/types';
import {
  ORDER_STATUS_LABEL,
  PAYMENT_STATUS_LABEL,
  FULFILLMENT_STATUS_LABEL,
  RETURN_STATUS_LABEL,
  buildProgress,
} from '@/lib/order-status';
import { uiAlert, uiConfirm, uiPrompt } from '@/lib/ui-dialog';
import { OrderStatusBadge, orderNeedsAttention, AttentionDot, isPaymentReported } from '@/app/components/OrderStatusBadge';

const formatter = new Intl.NumberFormat('zh-TW', {
  style: 'currency',
  currency: 'TWD',
  maximumFractionDigits: 0,
});

const ORDER_STATUSES = ['尚未付款', '待出貨', '已出貨', '已完成', '取消', '退貨'];
const PAYMENT_REPORTED_TAB = '通知已付款';
const PRODUCT_STATUSES = ['上架中', '加購品', '已下架'];
const DEFAULT_PAYMENT_METHODS = ['信用卡付款', 'Apple Pay', '轉帳匯款'];
const DEFAULT_SHIPPING_METHODS = ['全家取貨付款', '全家取貨不付款', '7-11取貨付款', '7-11取貨不付款', '宅配到府'];
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
  shipping_fee_overrides: Record<string, number>;
  colors: string;
  sizes: string;
  unit: string;
  sale_mode: string;
  colorImages: Record<string, string>;
  specs: { name: string; optionsText: string }[];
  variantStock: Record<string, number>; // key = 各選項用 ' / ' 串起來
  variantCost: Record<string, number>; // 各規格單位成本
  variantSafety: Record<string, number>; // 各規格安全庫存
  is_featured: boolean;
  sort_order: number;
};

type DiscountDraft = {
  name: string;
  code: string;
  type: 'percent' | 'amount' | 'free_shipping';
  value: number;
  min_spend: number;
  max_discount: number;
  start_at: string;
  end_at: string;
  total_limit: number;
  per_user_limit: number;
  applicable_products: string;
  applicable_categories: string;
  applicable_users: 'all' | 'new' | 'vip';
  is_first_purchase_only: boolean;
  stackable: boolean;
  status: '草稿' | '啟用' | '停用' | '已結束';
};

function blankDiscountDraft(): DiscountDraft {
  return {
    name: '',
    code: '',
    type: 'percent',
    value: 10,
    min_spend: 0,
    max_discount: 0,
    start_at: '',
    end_at: '',
    total_limit: 0,
    per_user_limit: 1,
    applicable_products: '',
    applicable_categories: '',
    applicable_users: 'all',
    is_first_purchase_only: false,
    stackable: false,
    status: '啟用',
  };
}

function splitLines(value: string) {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function couponText(d: Discount) {
  if (d.type === 'free_shipping') return '免運';
  if (d.type === 'amount') return `折 ${formatter.format(d.value)}`;
  return `折 ${d.value}%`;
}

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

function getVariantOptionIndexes(product: Product) {
  const colorIndex = product.specs.findIndex((spec) => /顏色|色|color/i.test(spec.name));
  const sizeIndex = product.specs.findIndex((spec) => /尺寸|尺碼|size/i.test(spec.name));
  return {
    colorIndex: colorIndex >= 0 ? colorIndex : 0,
    sizeIndex: sizeIndex >= 0 ? sizeIndex : 1,
  };
}

function getLineVariantKey(product: Product | undefined, line: MovementLine) {
  if (!product?.variants.length) return '';
  const { colorIndex, sizeIndex } = getVariantOptionIndexes(product);
  const variant = product.variants.find((item) => {
    const colorMatched = !line.color || item.options[colorIndex] === line.color;
    const sizeMatched = !line.size || item.options[sizeIndex] === line.size;
    return colorMatched && sizeMatched;
  });
  return variant?.options.join(' / ') ?? '';
}

function parseMovementNote(note?: string) {
  const result = {
    document_no: '',
    document_date: '',
    status: '',
    payment_status: '',
    payment_no: '',
    note: '',
  };
  if (!note) return result;
  const parts = note.split(' | ').map((part) => part.trim()).filter(Boolean);
  const loose: string[] = [];
  for (const part of parts) {
    const [key, ...rest] = part.split(':');
    const value = rest.join(':').trim();
    if (key === '單號') result.document_no = value;
    else if (key === '日期') result.document_date = value;
    else if (key === '狀態') result.status = value;
    else if (key === '請款狀態') result.payment_status = value;
    else if (key === '請款單號') result.payment_no = value;
    else loose.push(part);
  }
  result.note = loose.join(' | ');
  return result;
}

function todayDocumentPrefix() {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

function currentDateTimeValue() {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function nextDocumentNo(movements: StockMovement[]) {
  const prefix = todayDocumentPrefix();
  const used = movements
    .map((movement) => parseMovementNote(movement.note).document_no)
    .filter((no) => no.startsWith(prefix))
    .map((no) => Number(no.slice(prefix.length)))
    .filter((n) => Number.isFinite(n));
  const next = Math.max(0, ...used) + 1;
  return `${prefix}${String(next).padStart(3, '0')}`;
}

// 把扁平分類依 parent_id 組成樹狀順序(父後面接子,附深度供縮排)
function buildCategoryTree(cats: Category[]): { cat: Category; depth: number }[] {
  const byParent = new Map<string, Category[]>();
  for (const c of cats) {
    const key = c.parent_id || '';
    const list = byParent.get(key) ?? [];
    list.push(c);
    byParent.set(key, list);
  }
  for (const list of byParent.values())
    list.sort((a, b) => Math.abs(a.sort_order) - Math.abs(b.sort_order));
  const result: { cat: Category; depth: number }[] = [];
  const walk = (parentKey: string, depth: number) => {
    for (const c of byParent.get(parentKey) ?? []) {
      result.push({ cat: c, depth });
      walk(c.id, depth + 1);
    }
  };
  walk('', 0);
  // 保底:萬一有分類的 parent 不存在(孤兒),補在最後
  if (result.length < cats.length) {
    const seen = new Set(result.map((r) => r.cat.id));
    for (const c of cats) if (!seen.has(c.id)) result.push({ cat: c, depth: 0 });
  }
  return result;
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
    shipping_fee_overrides: {},
    colors: '',
    sizes: '',
    unit: '',
    sale_mode: '現貨',
    colorImages: {},
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
    shipping_fee_overrides: p.shipping_fee_overrides ?? {},
    colors: p.colors.join(', '),
    sizes: p.sizes.join(', '),
    unit: p.unit ?? '',
    sale_mode: p.sale_mode ?? '現貨',
    colorImages: p.color_images ?? {},
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
  initialUserCoupons,
  initialCouponUsages,
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
  initialUserCoupons: UserCoupon[];
  initialCouponUsages: CouponUsage[];
  initialLogoUrl: string;
  initialSettings: SiteSettings | null;
  userEmail: string;
}) {
  const router = useRouter();
  const [section, setSection] = useState<SectionKey>('overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true); // 桌機側邊選單預設常開
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [discounts, setDiscounts] = useState<Discount[]>(initialDiscounts);
  const [customers] = useState<Customer[]>(initialCustomers);
  const [banners, setBanners] = useState<Banner[]>(initialBanners);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'general' | 'banners' | 'footer' | 'payments' | 'shippings'>('general');
  const [orderFilter, setOrderFilter] = useState<string>('全部');
  const [orderSearch, setOrderSearch] = useState('');
  const [orderPaidFilter, setOrderPaidFilter] = useState<'全部' | '已付款' | '未付款'>('全部');
  const [orderCancelOnly, setOrderCancelOnly] = useState(false);
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const [productsTab, setProductsTab] = useState<'items' | 'categories'>('items');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [categoryProductQuery, setCategoryProductQuery] = useState('');
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
    { id: 'line-1', product_id: '', variant_key: '', color: '', size: '', quantity: 1, unit_price: 0 },
  ]);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [editBannerId, setEditBannerId] = useState<string | null>(null);
  const [newCat, setNewCat] = useState({ slug: '', name: '', en: '', parent_id: '' });
  const [newDiscount, setNewDiscount] = useState<DiscountDraft>(blankDiscountDraft());
  const [couponModalOpen, setCouponModalOpen] = useState(false);
  const [discountQuery, setDiscountQuery] = useState('');
  const [discountStatus, setDiscountStatus] = useState('全部');
  const [userCoupons, setUserCoupons] = useState<UserCoupon[]>(initialUserCoupons);
  const [couponUsages] = useState<CouponUsage[]>(initialCouponUsages);
  const [manualCouponByUser, setManualCouponByUser] = useState<Record<string, string>>({});
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
  const [paymentAccounts, setPaymentAccounts] = useState<{ name: string; info: string }[]>(
    initialSettings?.payment_accounts ?? [],
  );
  const [returnInfo, setReturnInfo] = useState(initialSettings?.return_info ?? '');
  const [shippingFees, setShippingFees] = useState<{ name: string; fee: number }[]>(
    initialSettings?.shipping_fees ?? [],
  );
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
        phone: c.phone ?? '',
        address: c.address ?? '',
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
  const selectedCategory = categories.find((category) => category.id === selectedCategoryId) ?? null;
  const selectedCategoryProducts = selectedCategory
    ? products.filter((product) => product.category === selectedCategory.slug)
    : [];
  const categoryCandidateProducts = selectedCategory
    ? products.filter((product) => {
        if (product.category === selectedCategory.slug) return false;
        const q = categoryProductQuery.trim().toLowerCase();
        if (!q) return true;
        return [product.id, product.name, product.status].some((value) => value.toLowerCase().includes(q));
      })
    : [];
  const filteredDiscounts = useMemo(() => {
    const q = discountQuery.trim().toLowerCase();
    return discounts.filter((d) => {
      const status = d.status ?? (d.active ? '啟用' : '停用');
      const passStatus = discountStatus === '全部' || status === discountStatus;
      const passQuery = !q || [d.code, d.name ?? '', d.type].some((value) => String(value).toLowerCase().includes(q));
      return passStatus && passQuery;
    });
  }, [discountQuery, discountStatus, discounts]);
  const couponStats = useMemo(() => {
    const month = new Date().toISOString().slice(0, 7);
    const monthIssued = userCoupons.filter((item) => (item.received_at ?? '').startsWith(month)).length;
    const claimed = userCoupons.length;
    const used = couponUsages.length;
    const discountTotal = couponUsages.reduce((sum, item) => sum + item.discount_amount, 0);
    const revenue = couponUsages.reduce((sum, item) => sum + item.final_amount, 0);
    return { monthIssued, claimed, used, usageRate: claimed ? Math.round((used / claimed) * 100) : 0, discountTotal, revenue };
  }, [couponUsages, userCoupons]);

  // ---- 操作 ----
  async function signOut() {
    await createBrowserSupabase().auth.signOut();
    router.refresh();
  }

  async function updateOrder(id: string, patch: Partial<Pick<Order, 'status' | 'paid' | 'admin_note' | 'refund_amount'>>) {
    const res = await fetch(`/api/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const updated = (await res.json()) as Order;
      setOrders((list) => list.map((o) => (o.id === id ? updated : o)));
    } else void uiAlert('更新失敗');
  }

  async function reviewCancel(id: string, action: 'approve' | 'reject', response: string) {
    const res = await fetch(`/api/orders/${id}/cancel`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, response }),
    });
    const data = await res.json();
    if (res.ok) {
      setOrders((list) => list.map((o) => (o.id === id ? (data as Order) : o)));
    } else void uiAlert(data.error ?? '審核失敗');
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
    const inventory = isNew ? 0 : specs.length > 0 ? variants.reduce((n, v) => n + v.inventory, 0) : editing.inventory;
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
      color_images: editing.colorImages,
      colors: colorDim
        ? colorDim.options
        : editing.colors.split(',').map((s) => s.trim()).filter(Boolean),
      sizes: sizeDim
        ? sizeDim.options
        : editing.sizes.split(',').map((s) => s.trim()).filter(Boolean),
    };
    if (isNew) {
      if (!payload.id || !payload.name) return void uiAlert('請填寫商品代碼與名稱');
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setProducts((l) => [...l, data as Product]);
        setEditing(null);
      } else void uiAlert(data.error ?? '新增失敗');
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
      } else void uiAlert(data.error ?? '更新失敗');
    }
  }

  async function deleteProduct(id: string) {
    const product = products.find((p) => p.id === id);
    const relatedMovements = movements.filter((m) => m.product_id === id).length;
    const variantCount = product?.variants.length ?? 0;
    if (!await uiConfirm(
      `確定刪除商品「${product?.name ?? id}」嗎?\n\n會一併刪除/影響:\n- 商品管理中的商品資料\n- ${variantCount} 筆規格資料與庫存列\n- 前台商品頁與購物車可選商品\n\n既有進出庫紀錄 ${relatedMovements} 筆會保留作為歷史紀錄。`,
    )) return;
    const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
    if (res.ok) setProducts((l) => l.filter((p) => p.id !== id));
    else void uiAlert('刪除失敗');
  }

  async function deleteStockRow(productId: string, variantKey: string) {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    if (variantKey) {
      if (!await uiConfirm(
        `確定刪除庫存列「${product.name} / ${variantKey}」嗎?\n\n會一併刪除/影響:\n- 此商品的這一筆顏色/尺寸規格\n- 商品管理的規格組合\n- 入庫單可選規格\n\n商品本身與進出庫歷史紀錄會保留。`,
      )) return;
      const variants = product.variants.filter((v) => v.options.join(' / ') !== variantKey);
      const inventory = variants.reduce((sum, variant) => sum + (variant.inventory ?? 0), 0);
      const res = await fetch(`/api/products/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variants, inventory }),
      });
      if (!res.ok) return void uiAlert('刪除庫存列失敗');
      setProducts((list) => list.map((p) => (p.id === productId ? { ...p, variants, inventory } : p)));
      return;
    }

    if (!await uiConfirm(
      `確定刪除庫存列「${product.name}」嗎?\n\n此商品沒有規格,刪除庫存列會將目前庫存歸零。\n商品資料與進出庫歷史紀錄會保留。`,
    )) return;
    const res = await fetch(`/api/products/${productId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inventory: 0 }),
    });
    if (!res.ok) return void uiAlert('刪除庫存列失敗');
    setProducts((list) => list.map((p) => (p.id === productId ? { ...p, inventory: 0 } : p)));
  }

  async function deleteMovement(movement: StockMovement) {
    const doc = parseMovementNote(movement.note);
    if (!await uiConfirm(
      `確定刪除進出庫紀錄「${doc.document_no || movement.id}」嗎?\n\n會一併刪除/影響:\n- 這筆進出庫紀錄\n- 商品 ${movement.product_id} 的庫存會反向調整\n- ${movement.variant_key || '無規格'} 數量會${movement.type === 'in' ? '扣回' : '加回'} ${movement.quantity}\n\n商品資料本身會保留。`,
    )) return;
    const res = await fetch(`/api/stock-movements?id=${encodeURIComponent(movement.id)}`, { method: 'DELETE' });
    const data = await res.json().catch(() => null);
    if (!res.ok) return void uiAlert(data?.error ?? '刪除進出庫紀錄失敗');
    const delta = movement.type === 'in' ? -movement.quantity : movement.quantity;
    setMovements((list) => list.filter((m) => m.id !== movement.id));
    setProducts((list) =>
      list.map((p) => {
        if (p.id !== movement.product_id) return p;
        if (p.variants.length && movement.variant_key) {
          const variants = p.variants.map((v) =>
            v.options.join(' / ') === movement.variant_key
              ? { ...v, inventory: Math.max(0, (v.inventory ?? 0) + delta) }
              : v,
          );
          return { ...p, variants, inventory: variants.reduce((sum, v) => sum + (v.inventory ?? 0), 0) };
        }
        return { ...p, inventory: Math.max(0, (p.inventory ?? 0) + delta) };
      }),
    );
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
    if (!mvForm.document_no.trim()) return void uiAlert('請填寫單號');
    if (!mvForm.document_date.trim()) return void uiAlert('請填寫日期');
    if (!mvForm.status.trim()) return void uiAlert('請填寫狀態');
    if (!mvForm.handler.trim()) return void uiAlert(`請填寫${mvForm.type === 'in' ? '入庫人' : '出庫人'}`);
    const validLines = movementLines.filter((line) => line.product_id && line.quantity > 0);
    if (validLines.length === 0) return void uiAlert('請至少新增一筆商品明細');

    for (const line of validLines) {
      const product = products.find((p) => p.id === line.product_id);
      if (product?.variants.length) {
        if (!line.color) return void uiAlert(`請選擇 ${product.name} 的顏色`);
        if (!line.size) return void uiAlert(`請選擇 ${product.name} 的尺寸`);
        if (!getLineVariantKey(product, line)) return void uiAlert(`${product.name} 找不到符合的顏色 / 尺寸`);
      }
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
          variant_key: getLineVariantKey(products.find((p) => p.id === line.product_id), line),
          type: mvForm.type,
          quantity: line.quantity,
          unit_price: line.unit_price,
          location: mvForm.location,
          handler: mvForm.handler,
          note: documentNote,
        }),
      });
      const data = await res.json();
      if (!res.ok) return void uiAlert(data.error ?? '新增失敗');
      createdMovements.push(data as StockMovement);
    }

    setMovements((l) => [...createdMovements.reverse(), ...l]);
    setProducts((l) => {
      let nextProducts = l;
      for (const line of validLines) {
        const delta = mvForm.type === 'in' ? line.quantity : -line.quantity;
        nextProducts = nextProducts.map((p) => {
          if (p.id !== line.product_id) return p;
        const lineVariantKey = getLineVariantKey(p, line);
        if (p.variants.length > 0 && lineVariantKey) {
          const variants = p.variants.map((v) =>
            v.options.join(' / ') === lineVariantKey
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
    setMovementLines([{ id: `line-${Date.now()}`, product_id: '', variant_key: '', color: '', size: '', quantity: 1, unit_price: 0 }]);
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

  async function importInventoryRows(rows: InventoryImportRow[]) {
    if (rows.length === 0) return void uiAlert('匯入檔沒有資料');
    if (!await uiConfirm(`確定匯入 ${rows.length} 筆庫存資料嗎?\n\n會直接更新資料庫中的目前庫存、安全庫存、單位成本與儲位。`)) return;

    const productMap = new Map(products.map((product) => [product.id, product]));
    const nextById = new Map<string, Product>();
    let changed = 0;
    const missing: string[] = [];

    for (const row of rows) {
      const product = nextById.get(row.productId) ?? productMap.get(row.productId);
      if (!product) {
        missing.push(row.productId);
        continue;
      }
      if (row.variantKey) {
        const variants = product.variants.map((variant) =>
          variant.options.join(' / ') === row.variantKey
            ? {
                ...variant,
                inventory: row.inventory,
                safety: row.safety,
                cost: row.cost,
                location: row.location,
              }
            : variant,
        );
        if (!variants.some((variant) => variant.options.join(' / ') === row.variantKey)) {
          missing.push(`${row.productId} / ${row.variantKey}`);
          continue;
        }
        nextById.set(row.productId, {
          ...product,
          variants,
          inventory: variants.reduce((sum, variant) => sum + (variant.inventory ?? 0), 0),
        });
      } else {
        nextById.set(row.productId, {
          ...product,
          inventory: row.inventory,
        });
      }
      changed += 1;
    }

    for (const product of nextById.values()) {
      const res = await fetch(`/api/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inventory: product.inventory,
          variants: product.variants,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) return void uiAlert(data?.error ?? `匯入 ${product.id} 失敗`);
    }

    setProducts((list) => list.map((product) => nextById.get(product.id) ?? product));
    void uiAlert(`匯入完成: 更新 ${changed} 筆庫存${missing.length ? `,略過 ${missing.length} 筆找不到的資料` : ''}`);
  }

  async function saveNewCategory() {
    const slug = newCat.slug.trim().toLowerCase();
    if (!slug || !newCat.name.trim()) return void uiAlert('請填寫代碼(英文)與名稱');
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug,
        name: newCat.name.trim(),
        en: newCat.en.trim() || slug.toUpperCase(),
        sort_order: categories.length + 1,
        parent_id: newCat.parent_id || null,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setCategories((l) => [...l, data as Category]);
      setNewCat({ slug: '', name: '', en: '', parent_id: '' });
    } else void uiAlert(data.error ?? '新增失敗(代碼可能重複)');
  }

  async function patchCategory(id: string, patch: Partial<Pick<Category, 'name' | 'en' | 'sort_order'>>) {
    setCategories((l) => l.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    await fetch(`/api/categories/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
  }

  async function setCategoryVisible(category: Category, visible: boolean) {
    const value = Math.max(1, Math.abs(category.sort_order || categories.length + 1));
    await patchCategory(category.id, { sort_order: visible ? value : -value });
  }

  async function moveCategory(category: Category, direction: -1 | 1) {
    const sorted = [...categories].sort((a, b) => Math.abs(a.sort_order) - Math.abs(b.sort_order));
    const index = sorted.findIndex((item) => item.id === category.id);
    const swap = sorted[index + direction];
    if (!swap) return;
    const currentSign = category.sort_order < 0 ? -1 : 1;
    const swapSign = swap.sort_order < 0 ? -1 : 1;
    const currentOrder = Math.abs(category.sort_order || 1);
    const swapOrder = Math.abs(swap.sort_order || 1);
    await patchCategory(category.id, { sort_order: swapOrder * currentSign });
    await patchCategory(swap.id, { sort_order: currentOrder * swapSign });
  }

  async function assignProductCategory(product: Product, slug: string) {
    const res = await fetch(`/api/products/${product.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: slug }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return void uiAlert(data?.error ?? '更新商品分類失敗');
    setProducts((list) => list.map((item) => (item.id === product.id ? (data as Product) : item)));
  }

  async function deleteCategory(id: string) {
    const category = categories.find((c) => c.id === id);
    const count = products.filter((product) => product.category === category?.slug).length;
    if (!await uiConfirm(`確定刪除分類「${category?.name ?? id}」嗎?\n\n會一併影響:\n- 此分類會從分類管理消失\n- ${count} 個商品會失去這個分類標籤\n- 首頁分類選單不再顯示此分類\n\n商品本身不會被刪除。`)) return;
    if (category) {
      await Promise.all(products
        .filter((product) => product.category === category.slug)
        .map((product) => fetch(`/api/products/${product.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: '' }),
        })));
      setProducts((list) => list.map((product) => (product.category === category.slug ? { ...product, category: '' } : product)));
    }
    const res = await fetch(`/api/categories/${id}`, { method: 'DELETE' });
    if (res.ok) setCategories((l) => l.filter((c) => c.id !== id));
    else void uiAlert('刪除失敗');
  }

  async function addDiscount() {
    const code = newDiscount.code.trim().toUpperCase();
    if (!code) return void uiAlert('請填寫折扣碼');
    const res = await fetch('/api/discounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...newDiscount,
        code,
        applicable_products: splitLines(newDiscount.applicable_products),
        applicable_categories: splitLines(newDiscount.applicable_categories),
        active: newDiscount.status === '啟用',
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setDiscounts((l) => [data as Discount, ...l]);
      setNewDiscount(blankDiscountDraft());
      setCouponModalOpen(false);
    } else void uiAlert(data.error ?? '新增失敗(折扣碼可能重複)');
  }

  async function toggleDiscount(id: string, active: boolean) {
    const status = active ? '啟用' : '停用';
    setDiscounts((l) => l.map((d) => (d.id === id ? { ...d, active, status } : d)));
    await fetch(`/api/discounts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active, status }),
    });
  }

  async function deleteDiscount(id: string) {
    const d = discounts.find((item) => item.id === id);
    const claimed = userCoupons.filter((item) => item.coupon_id === id).length;
    const used = couponUsages.filter((item) => item.coupon_id === id).length;
    if (!await uiConfirm(`確定刪除優惠券「${d?.code ?? id}」嗎?\n\n會一併刪除/影響:\n- 優惠券主檔\n- ${claimed} 筆會員持券資料\n- ${used} 筆優惠券使用紀錄\n- 後續結帳無法再套用此券\n\n舊訂單仍保留當時的折抵快照。`)) return;
    const res = await fetch(`/api/discounts/${id}`, { method: 'DELETE' });
    if (res.ok) setDiscounts((l) => l.filter((d) => d.id !== id));
    else void uiAlert('刪除失敗');
  }

  async function copyDiscount(d: Discount) {
    const nextCode = `${d.code}-COPY`;
    const res = await fetch('/api/discounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...d,
        id: undefined,
        code: nextCode,
        name: `${d.name || d.code} 複製`,
        active: false,
        status: '草稿',
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return void uiAlert(data?.error ?? '複製失敗');
    setDiscounts((list) => [data as Discount, ...list]);
  }

  function exportDiscounts() {
    const rows = [
      ['優惠碼', '名稱', '類型', '折扣值', '最低消費', '最高折抵', '開始', '結束', '已領取', '已使用', '折抵總額', '帶來營收', '狀態'],
      ...discounts.map((d) => {
        const usage = couponUsages.filter((item) => item.coupon_id === d.id);
        return [
          d.code,
          d.name ?? '',
          d.type,
          String(d.value),
          String(d.min_spend ?? 0),
          String(d.max_discount ?? ''),
          d.start_at ?? '',
          d.end_at ?? '',
          String(userCoupons.filter((item) => item.coupon_id === d.id).length),
          String(usage.length),
          String(usage.reduce((sum, item) => sum + item.discount_amount, 0)),
          String(usage.reduce((sum, item) => sum + item.final_amount, 0)),
          d.status ?? (d.active ? '啟用' : '停用'),
        ];
      }),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `urbanite-coupons-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function issueCouponToUser(userId: string) {
    const couponId = manualCouponByUser[userId];
    if (!couponId) return void uiAlert('請選擇要補發的優惠券');
    const res = await fetch('/api/admin/user-coupons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, coupon_id: couponId }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return void uiAlert(data?.error ?? '補發失敗');
    setUserCoupons((list) => [data as UserCoupon, ...list.filter((item) => !(item.user_id === userId && item.coupon_id === couponId))]);
  }

  async function revokeUserCoupon(id: string) {
    if (!await uiConfirm('確定撤回這張尚未使用的會員優惠券嗎?')) return;
    const res = await fetch('/api/admin/user-coupons', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return void uiAlert(data?.error ?? '撤回失敗');
    setUserCoupons((list) => list.map((item) => (item.id === id ? (data as UserCoupon) : item)));
  }

  async function uploadLogo(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/settings/logo', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok) setLogoUrl(data.logo_url);
      else void uiAlert(data.error ?? '上傳失敗');
    } catch {
      void uiAlert('上傳發生問題');
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
      void uiAlert(error instanceof Error ? error.message : '上傳失敗');
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
    else void uiAlert(data.error ?? '更新失敗');
  }

  async function deleteBanner(id: string) {
    if (!await uiConfirm('確定要刪除這張輪播圖嗎?')) return;
    const res = await fetch(`/api/banners/${id}`, { method: 'DELETE' });
    if (res.ok) setBanners((l) => l.filter((b) => b.id !== id));
    else void uiAlert('刪除失敗');
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
      void uiAlert('頁尾資訊已更新');
    } catch (error) {
      void uiAlert(error instanceof Error ? error.message : '儲存失敗');
    } finally {
      setSavingSettings(false);
    }
  }

  async function saveMethodSettings(kind: 'payments' | 'shippings') {
    setSavingSettings(true);
    try {
      const toLines = (value: string) =>
        value
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);
      const methods = kind === 'payments' ? toLines(footerDraft.payments) : toLines(footerDraft.shippings);
      // 只保留仍在啟用清單內、且有填帳號資訊的收款資料
      const accounts = paymentAccounts.filter((a) => methods.includes(a.name) && (a.info ?? '').trim());
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          kind === 'payments'
            ? { payment_methods: methods, enabled_payment_methods: methods, payment_accounts: accounts }
            : { shipping_methods: methods, enabled_shipping_methods: methods, return_info: returnInfo, shipping_fees: shippingFees.filter((f) => methods.includes(f.name)) },
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '儲存失敗');
      void uiAlert(kind === 'payments' ? '金流設定已更新' : '物流設定已更新');
    } catch (error) {
      void uiAlert(error instanceof Error ? error.message : '儲存失敗');
    } finally {
      setSavingSettings(false);
    }
  }

  async function applyMethodsToProducts(
    field: 'available_payment_methods' | 'available_shipping_methods',
    methods: string[],
    scope: 'all' | 'category',
    category: string,
  ) {
    const targets = scope === 'category' ? products.filter((p) => p.category === category) : products;
    if (targets.length === 0) { void uiAlert('沒有符合的商品。'); return; }
    const kindLabel = field === 'available_payment_methods' ? '付款' : '物流';
    const scopeLabel = scope === 'category'
      ? `分類「${categories.find((c) => c.slug === category)?.name ?? category}」`
      : '全部商品';
    const methodLabel = methods.length ? methods.join('、') : '允許全部(清除商品限制)';
    if (!await uiConfirm(`確定將${kindLabel}方式套用到${scopeLabel}(${targets.length} 件)?\n\n${methodLabel}`)) return;
    const res = await fetch('/api/products/methods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field, methods, scope, category: scope === 'category' ? category : undefined }),
    });
    const data = await res.json();
    if (!res.ok) { void uiAlert(data.error ?? '套用失敗'); return; }
    const ids = new Set(targets.map((p) => p.id));
    setProducts((list) => list.map((p) => (ids.has(p.id) ? { ...p, [field]: methods } : p)));
    void uiAlert(`已套用到 ${data.updated} 件商品。`);
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
              className="rounded-md p-1 text-[#1f1b19] hover:bg-[#efe8dd] lg:hidden"
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

      {/* 手機:遮罩(桌機不顯示) */}
      <div
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity duration-300 lg:hidden ${
          menuOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={() => setMenuOpen(false)}
      />

      <div className="lg:flex lg:items-stretch">
        <aside
          className={`fixed inset-y-0 left-0 z-50 flex w-full max-w-xs flex-col bg-[#faf7f2] shadow-2xl transition-transform duration-300 lg:relative lg:z-auto lg:max-w-none lg:shadow-none lg:transition-[width] ${
            menuOpen ? 'translate-x-0' : '-translate-x-full'
          } lg:translate-x-0 lg:shrink-0 lg:border-r lg:border-[#e5ded4] ${
            sidebarOpen ? 'lg:w-60' : 'lg:w-0 lg:overflow-hidden lg:border-r-0'
          }`}
        >
          <div className="flex items-center justify-between border-b border-[#e5ded4] px-5 py-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold tracking-[0.2em] text-[#8a7f72]">ADMIN</span>
              <span className="rounded bg-[#f3ede4] px-1.5 py-0.5 text-[10px] font-semibold text-[#8a7f72]">
                {activeNav.label}
              </span>
            </div>
            <button onClick={() => setMenuOpen(false)} aria-label="關閉選單" className="rounded-md p-1 hover:bg-[#efe8dd] lg:hidden">
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

        {/* 桌機:側邊選單開合小箭頭(貼在側欄右緣中間) */}
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          aria-label={sidebarOpen ? '收起選單' : '展開選單'}
          className="fixed top-1/2 z-[45] hidden h-12 -translate-y-1/2 items-center rounded-r-lg border border-l-0 border-[#e5ded4] bg-[#faf7f2] px-0.5 text-[#6b6156] shadow-sm transition-[left] hover:bg-[#efe8dd] lg:flex"
          style={{ left: sidebarOpen ? '15rem' : '0px' }}
        >
          {sidebarOpen ? <IconChevronLeft /> : <IconChevronRight />}
        </button>

        {/* 主內容 */}
        <div className="lg:min-w-0 lg:flex-1">
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
              {/* 搜尋 + 篩選 */}
              <div className="mb-3 flex flex-wrap gap-2">
                <input
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                  placeholder="搜尋:單號 / 姓名 / Email / 手機 / 商品 / SKU"
                  className="min-w-[200px] flex-1 rounded-lg border border-[#d7c9bd] px-3 py-2 text-sm"
                />
                <select
                  value={orderPaidFilter}
                  onChange={(e) => setOrderPaidFilter(e.target.value as '全部' | '已付款' | '未付款')}
                  className="rounded-lg border border-[#d7c9bd] bg-white px-3 py-2 text-sm"
                >
                  <option value="全部">付款:全部</option>
                  <option value="已付款">已付款</option>
                  <option value="未付款">未付款</option>
                </select>
                {(() => {
                  const pending = orders.filter((o) => o.cancel_status === 'REQUESTED').length;
                  return (
                    <button
                      onClick={() => setOrderCancelOnly((v) => !v)}
                      className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                        orderCancelOnly ? 'border-[#c0392b] bg-[#c0392b] text-white' : 'border-[#e0b4b4] text-[#c0392b]'
                      }`}
                    >
                      待審核取消 <span className={orderCancelOnly ? 'text-white/80' : 'text-[#c0392b]'}>{pending}</span>
                    </button>
                  );
                })()}
              </div>

              {/* 狀態分類 */}
              <div className="mb-4 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {['全部', '尚未付款', PAYMENT_REPORTED_TAB, '待出貨', '已出貨', '已完成', '取消', '退貨'].map((s) => {
                  const tabOrders = s === '全部'
                    ? orders
                    : s === PAYMENT_REPORTED_TAB
                      ? orders.filter(isPaymentReported)
                      : orders.filter((o) => o.status === s);
                  const n = tabOrders.length;
                  const attention = tabOrders.some((o) => orderNeedsAttention(o, 'admin'));
                  return (
                    <button
                      key={s}
                      onClick={() => setOrderFilter(s)}
                      className={`relative shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                        orderFilter === s
                          ? 'border-[#1f1b19] bg-[#1f1b19] text-white'
                          : 'border-[#d7c9bd] text-[#6b6156]'
                      }`}
                    >
                      {attention ? <AttentionDot className="absolute -right-0.5 -top-0.5" /> : null}
                      {s}
                      <span className={`ml-1 ${orderFilter === s ? 'text-white/70' : 'text-[#a99e8f]'}`}>{n}</span>
                    </button>
                  );
                })}
              </div>

              {(() => {
                const q = orderSearch.trim().toLowerCase();
                const shown = orders.filter((o) => {
                  if (orderFilter === PAYMENT_REPORTED_TAB) {
                    if (!isPaymentReported(o)) return false;
                  } else if (orderFilter !== '全部' && o.status !== orderFilter) return false;
                  if (orderPaidFilter === '已付款' && !o.paid) return false;
                  if (orderPaidFilter === '未付款' && o.paid) return false;
                  if (orderCancelOnly && o.cancel_status !== 'REQUESTED') return false;
                  if (q) {
                    const hay = [
                      o.order_no, o.customer_name, o.email, o.phone,
                      ...o.items.flatMap((it) => [it.name, it.sku ?? '']),
                    ].join(' ').toLowerCase();
                    if (!hay.includes(q)) return false;
                  }
                  return true;
                });
                if (shown.length === 0) return <Empty>沒有符合條件的訂單。</Empty>;
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
                              <p className="flex items-center gap-1.5 font-semibold">
                                {orderNeedsAttention(order, 'admin') ? <AttentionDot /> : null}
                                {order.order_no}
                              </p>
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
                            <OrderStatusBadge order={order} className="!text-xs" />
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                order.paid ? 'bg-[#e9f7ee] text-[#1f7a44]' : 'bg-[#fdf3e7] text-[#9a6a1f]'
                              }`}
                            >
                              {order.paid ? '已付款' : '未付款'}
                            </span>
                            {isPaymentReported(order) ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-[#eaf1fb] px-3 py-1 text-xs font-semibold text-[#2b5fa5]">
                                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
                                通知已付款
                              </span>
                            ) : null}
                            {order.cancel_status === 'REQUESTED' ? (
                              <span className="rounded-full bg-[#fbe9e7] px-3 py-1 text-xs font-semibold text-[#c0392b]">
                                取消審核中
                              </span>
                            ) : null}
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
              <Card
                title="我的賣場分類"
                action={
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const ordered = [...categories].sort((a, b) => Math.abs(a.sort_order) - Math.abs(b.sort_order));
                        ordered.forEach((category, index) => {
                          const sign = category.sort_order < 0 ? -1 : 1;
                          patchCategory(category.id, { sort_order: (index + 1) * sign });
                        });
                      }}
                      className="rounded-lg border border-[#ef4b31] px-4 py-2 text-sm font-semibold text-[#ef4b31]"
                    >
                      調整順序
                    </button>
                    <button
                      type="button"
                      onClick={saveNewCategory}
                      className="rounded-lg bg-[#ef4b31] px-4 py-2 text-sm font-semibold text-white"
                    >
                      新增分類
                    </button>
                  </div>
                }
              >
                <div className="mb-4 rounded-lg border border-[#ffcf54] bg-[#fff8e8] px-4 py-3 text-sm text-[#8a7f72]">
                  新增分類前請先在下方填好分類代碼與名稱；詳情可加入或移出商品。
                </div>
                <div className="mb-4 grid gap-2 md:grid-cols-2 lg:grid-cols-4">
                  <input
                    value={newCat.slug}
                    onChange={(e) => setNewCat({ ...newCat, slug: e.target.value })}
                    placeholder="分類代碼,如 tops"
                    className="rounded border border-[#e5ded4] px-3 py-2 text-sm"
                  />
                  <input
                    value={newCat.name}
                    onChange={(e) => setNewCat({ ...newCat, name: e.target.value })}
                    placeholder="分類顯示名稱"
                    className="rounded border border-[#e5ded4] px-3 py-2 text-sm"
                  />
                  <input
                    value={newCat.en}
                    onChange={(e) => setNewCat({ ...newCat, en: e.target.value })}
                    placeholder="英文名稱"
                    className="rounded border border-[#e5ded4] px-3 py-2 text-sm"
                  />
                  <select
                    value={newCat.parent_id}
                    onChange={(e) => setNewCat({ ...newCat, parent_id: e.target.value })}
                    className="rounded border border-[#e5ded4] px-3 py-2 text-sm"
                  >
                    <option value="">上層分類(留空=主分類)</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.parent_id ? '— ' : ''}
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="overflow-x-auto rounded-lg border border-[#e5ded4]">
                  <table className="w-full min-w-[760px] whitespace-nowrap text-sm">
                    <thead>
                      <tr className="border-b border-[#e5ded4] bg-[#f7f7f7] text-left text-[#8a7f72]">
                        <th className="px-4 py-3">分類顯示名稱</th>
                        <th className="px-4 py-3 text-center">商品</th>
                        <th className="px-4 py-3 text-center">顯示</th>
                        <th className="px-4 py-3 text-center">排序</th>
                        <th className="px-4 py-3 text-center">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {buildCategoryTree(categories).map(({ cat: c, depth }) => {
                        const count = products.filter((product) => product.category === c.slug).length;
                        const image = products.find((product) => product.category === c.slug && product.image)?.image;
                        const visible = c.sort_order >= 0;
                        return (
                          <tr key={c.id} className="border-b border-[#e5ded4] last:border-0">
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-4" style={{ paddingLeft: depth * 24 }}>
                                {depth > 0 && <span className="text-[#c9bdb0]">└</span>}
                                <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded bg-[#f1f1f1]">
                                  {image ? <img src={image} alt="" className="h-full w-full object-cover" /> : <span className="text-xs text-[#bbb]">無圖</span>}
                                </div>
                                <div className="min-w-0">
                                  <input
                                    value={c.name}
                                    onChange={(e) =>
                                      setCategories((l) => l.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)))
                                    }
                                    onBlur={() => patchCategory(c.id, { name: c.name, en: c.en, sort_order: c.sort_order })}
                                    className="w-56 rounded border border-transparent px-2 py-1 font-semibold hover:border-[#e5ded4]"
                                  />
                                  <p className="mt-1 text-xs text-[#8a7f72]">{c.slug} / {c.en}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-4 text-center font-semibold">{count}</td>
                            <td className="px-4 py-4 text-center">
                              <button
                                type="button"
                                onClick={() => setCategoryVisible(c, !visible)}
                                className={`relative inline-flex h-8 w-16 items-center rounded-full transition ${visible ? 'bg-[#51cc78]' : 'bg-[#d8d0c8]'}`}
                              >
                                <span className={`h-7 w-7 rounded-full bg-white shadow transition ${visible ? 'translate-x-8' : 'translate-x-1'}`} />
                              </button>
                            </td>
                            <td className="px-4 py-4 text-center">
                              <div className="flex justify-center gap-1">
                                <button type="button" onClick={() => moveCategory(c, -1)} className="rounded border border-[#d7c9bd] px-2 py-1">上</button>
                                <button type="button" onClick={() => moveCategory(c, 1)} className="rounded border border-[#d7c9bd] px-2 py-1">下</button>
                              </div>
                            </td>
                            <td className="px-4 py-4 text-center">
                              <div className="flex justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedCategoryId(c.id);
                                    setCategoryProductQuery('');
                                  }}
                                  className="font-semibold text-[#2868d8]"
                                >
                                  查看詳情
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteCategory(c.id)}
                                  className="font-semibold text-[#c0392b]"
                                >
                                  刪除
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
              )}
              {selectedCategory && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSelectedCategoryId(null)}>
                  <div
                    className="max-h-[86vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e5ded4] p-5">
                      <div>
                        <p className="text-sm text-[#8a7f72]">分類詳情</p>
                        <h3 className="text-2xl font-bold">{selectedCategory.name}</h3>
                        <p className="mt-1 text-sm text-[#8a7f72]">
                          {selectedCategory.slug} / 目前 {selectedCategoryProducts.length} 個商品
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedCategoryId(null)}
                        className="rounded-full border border-[#d7c9bd] px-4 py-2 text-sm font-semibold"
                      >
                        關閉
                      </button>
                    </div>
                    <div className="grid max-h-[72vh] gap-5 overflow-auto p-5 lg:grid-cols-2">
                      <section>
                        <h4 className="mb-3 font-semibold">此分類商品</h4>
                        {selectedCategoryProducts.length === 0 ? (
                          <Empty>此分類目前沒有商品。</Empty>
                        ) : (
                          <div className="space-y-2">
                            {selectedCategoryProducts.map((product) => (
                              <div key={product.id} className="flex items-center gap-3 rounded-lg border border-[#e5ded4] p-3">
                                {product.image ? (
                                  <img src={product.image} alt="" className="h-12 w-12 rounded object-cover" />
                                ) : (
                                  <div className="h-12 w-12 rounded bg-[#f1e3dc]" />
                                )}
                                <div className="min-w-0 flex-1">
                                  <p className="truncate font-semibold">{product.name}</p>
                                  <p className="text-xs text-[#8a7f72]">{product.id} / {product.status}</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => assignProductCategory(product, '')}
                                  className="rounded-full border border-[#e0b4b4] px-3 py-1.5 text-xs font-semibold text-[#c0392b]"
                                >
                                  移出
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </section>
                      <section>
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <h4 className="font-semibold">加入商品</h4>
                          <input
                            value={categoryProductQuery}
                            onChange={(e) => setCategoryProductQuery(e.target.value)}
                            placeholder="搜尋商品"
                            className="w-52 rounded-lg border border-[#e5ded4] px-3 py-2 text-sm"
                          />
                        </div>
                        {categoryCandidateProducts.length === 0 ? (
                          <Empty>沒有可加入的商品。</Empty>
                        ) : (
                          <div className="space-y-2">
                            {categoryCandidateProducts.map((product) => (
                              <div key={product.id} className="flex items-center gap-3 rounded-lg border border-[#e5ded4] p-3">
                                {product.image ? (
                                  <img src={product.image} alt="" className="h-12 w-12 rounded object-cover" />
                                ) : (
                                  <div className="h-12 w-12 rounded bg-[#f1e3dc]" />
                                )}
                                <div className="min-w-0 flex-1">
                                  <p className="truncate font-semibold">{product.name}</p>
                                  <p className="text-xs text-[#8a7f72]">
                                    {product.id} / {product.category ? categories.find((c) => c.slug === product.category)?.name ?? product.category : '未分類'}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => assignProductCategory(product, selectedCategory.slug)}
                                  className="rounded-full bg-[#1f1b19] px-3 py-1.5 text-xs font-semibold text-white"
                                >
                                  加入
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </section>
                    </div>
                  </div>
                </div>
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
              onDeleteProduct={deleteProduct}
              onDeleteStockRow={deleteStockRow}
              onDeleteMovement={deleteMovement}
              onImportInventory={importInventoryRows}
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
                        <th className="py-2 pr-4">電話</th>
                        <th className="py-2 pr-4">地址</th>
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
                              <td className="py-3 pr-4 text-[#6b6156]">{c.phone || '-'}</td>
                              <td className="max-w-xs py-3 pr-4 text-[#6b6156]">
                                <span className="line-clamp-2">{c.address || '-'}</span>
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
                                <td colSpan={7} className="bg-[#faf7f2] px-4 py-3">
                                  <div className="mb-3 grid gap-2 rounded-lg bg-white p-3 text-sm text-[#6b6156] md:grid-cols-3">
                                    <div>
                                      <p className="text-xs text-[#8a7f72]">姓名</p>
                                      <p className="font-semibold">{c.name || '-'}</p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-[#8a7f72]">電話</p>
                                      <p className="font-semibold">{c.phone || '-'}</p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-[#8a7f72]">地址</p>
                                      <p className="font-semibold">{c.address || '-'}</p>
                                    </div>
                                  </div>
                                  <div className="mb-3 rounded-lg bg-white p-3">
                                    <div className="flex flex-wrap items-end gap-2">
                                      <div className="flex-1">
                                        <p className="mb-1 text-sm font-semibold">會員優惠券</p>
                                        <select
                                          value={manualCouponByUser[c.user_id] ?? ''}
                                          onChange={(e) => setManualCouponByUser((map) => ({ ...map, [c.user_id]: e.target.value }))}
                                          className="w-full rounded-lg border border-[#e5ded4] px-3 py-2 text-sm"
                                        >
                                          <option value="">選擇要補發的優惠券</option>
                                          {discounts.map((d) => (
                                            <option key={d.id} value={d.id}>
                                              {d.code} / {d.name || couponText(d)}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => issueCouponToUser(c.user_id)}
                                        className="rounded-full bg-[#1f1b19] px-4 py-2 text-sm font-semibold text-white"
                                      >
                                        補發優惠券
                                      </button>
                                    </div>
                                    <div className="mt-3 space-y-2">
                                      {userCoupons.filter((item) => item.user_id === c.user_id).length === 0 ? (
                                        <p className="text-sm text-[#8a7f72]">尚未領取優惠券。</p>
                                      ) : (
                                        userCoupons
                                          .filter((item) => item.user_id === c.user_id)
                                          .map((item) => (
                                            <div key={item.id} className="flex flex-wrap items-center gap-2 rounded border border-[#efe8dd] px-3 py-2 text-sm">
                                              <span className="font-mono font-semibold">{item.coupon?.code ?? item.coupon_id}</span>
                                              <span>{item.coupon?.name || (item.coupon ? couponText(item.coupon) : '')}</span>
                                              <span className="rounded-full bg-[#f3ede4] px-2 py-0.5 text-xs text-[#6b6156]">
                                                {item.status === 'available' ? '可使用' : item.status === 'used' ? '已使用' : item.status === 'revoked' ? '已撤回' : '已過期'}
                                              </span>
                                              {item.used_at ? <span className="text-xs text-[#8a7f72]">使用: {new Date(item.used_at).toLocaleString('zh-TW')}</span> : null}
                                              {item.order_id ? <span className="text-xs text-[#8a7f72]">訂單: {item.order_id}</span> : null}
                                              {item.status === 'available' && (
                                                <button
                                                  type="button"
                                                  onClick={() => revokeUserCoupon(item.id)}
                                                  className="ml-auto font-semibold text-[#c0392b]"
                                                >
                                                  撤回
                                                </button>
                                              )}
                                            </div>
                                          ))
                                      )}
                                    </div>
                                  </div>
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
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
                <StatCard label="本月發放" value={`${couponStats.monthIssued} 張`} />
                <StatCard label="已領取" value={`${couponStats.claimed} 張`} />
                <StatCard label="已使用" value={`${couponStats.used} 張`} />
                <StatCard label="使用率" value={`${couponStats.usageRate}%`} />
                <StatCard label="優惠券折抵" value={formatter.format(couponStats.discountTotal)} />
                <StatCard label="帶來營收" value={formatter.format(couponStats.revenue)} />
              </div>
              <Card
                title="優惠券管理"
                action={
                  <button
                    onClick={() => setCouponModalOpen(true)}
                    className="rounded-full bg-[#1f1b19] px-4 py-2 text-sm font-semibold text-white hover:bg-black"
                  >
                    ＋ 新增優惠券
                  </button>
                }
              >
                <div className="mb-4 flex flex-wrap gap-2">
                  <input
                    value={discountQuery}
                    onChange={(e) => setDiscountQuery(e.target.value)}
                    placeholder="搜尋優惠碼 / 名稱"
                    className="min-w-56 rounded-lg border border-[#e5ded4] px-3 py-2 text-sm"
                  />
                  <select
                    value={discountStatus}
                    onChange={(e) => setDiscountStatus(e.target.value)}
                    className="rounded-lg border border-[#e5ded4] px-3 py-2 text-sm"
                  >
                    {['全部', '草稿', '啟用', '停用', '已結束'].map((status) => (
                      <option key={status}>{status}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={exportDiscounts}
                    className="rounded-full border border-[#d7c9bd] px-4 py-2 text-sm font-semibold"
                  >
                    匯出
                  </button>
                </div>
                {filteredDiscounts.length === 0 ? (
                  <Empty>沒有符合條件的優惠券。</Empty>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#e5ded4] text-left text-[#8a7f72]">
                          <th className="py-2 pr-3">優惠碼</th>
                          <th className="py-2 pr-3">內容</th>
                          <th className="py-2 pr-3">期間</th>
                          <th className="py-2 pr-3">限制</th>
                          <th className="py-2 pr-3">已領 / 已用</th>
                          <th className="py-2 pr-3">折抵 / 營收</th>
                          <th className="py-2">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDiscounts.map((d) => {
                          const usage = couponUsages.filter((item) => item.coupon_id === d.id);
                          const claimed = userCoupons.filter((item) => item.coupon_id === d.id).length;
                          const status = d.status ?? (d.active ? '啟用' : '停用');
                          return (
                            <tr key={d.id} className="border-b border-[#efe8dd] align-top">
                              <td className="py-3 pr-3">
                                <p className="font-mono font-bold text-[#2b8bd8]">{d.code}</p>
                                <p className="text-xs text-[#8a7f72]">{status}</p>
                              </td>
                              <td className="py-3 pr-3">
                                <p className="font-semibold">{d.name || couponText(d)}</p>
                                <p className="text-xs text-[#6b6156]">
                                  {couponText(d)}
                                  {d.min_spend ? ` / 滿 ${formatter.format(d.min_spend)}` : ''}
                                  {d.max_discount ? ` / 最高 ${formatter.format(d.max_discount)}` : ''}
                                </p>
                              </td>
                              <td className="py-3 pr-3 text-xs text-[#6b6156]">
                                <p>{d.start_at ? new Date(d.start_at).toLocaleDateString('zh-TW') : '不限開始'}</p>
                                <p>{d.end_at ? new Date(d.end_at).toLocaleDateString('zh-TW') : '不限結束'}</p>
                              </td>
                              <td className="py-3 pr-3 text-xs text-[#6b6156]">
                                <p>總上限 {d.total_limit ?? '不限'} / 每會員 {d.per_user_limit ?? 1}</p>
                                <p>{d.applicable_users === 'new' || d.is_first_purchase_only ? '新會員首購' : d.applicable_users === 'vip' ? 'VIP' : '全部會員'}</p>
                                <p>{d.stackable ? '可併用' : '單張使用'}</p>
                              </td>
                              <td className="py-3 pr-3">{claimed} / {usage.length}</td>
                              <td className="py-3 pr-3 text-xs">
                                <p>{formatter.format(usage.reduce((sum, item) => sum + item.discount_amount, 0))}</p>
                                <p className="text-[#8a7f72]">{formatter.format(usage.reduce((sum, item) => sum + item.final_amount, 0))}</p>
                              </td>
                              <td className="py-3">
                                <div className="flex flex-wrap gap-2">
                                  <button onClick={() => toggleDiscount(d.id, !d.active)} className="rounded-full border border-[#d7c9bd] px-3 py-1 text-xs font-semibold">
                                    {d.active ? '暫停' : '啟用'}
                                  </button>
                                  <button onClick={() => copyDiscount(d)} className="rounded-full border border-[#d7c9bd] px-3 py-1 text-xs font-semibold">
                                    複製
                                  </button>
                                  <button onClick={() => deleteDiscount(d.id)} className="rounded-full border border-[#e0b4b4] px-3 py-1 text-xs font-semibold text-[#c0392b]">
                                    刪除
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
              {couponModalOpen && (
              <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={() => setCouponModalOpen(false)}>
              <div className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex shrink-0 items-center justify-between border-b border-[#e5ded4] px-5 py-4">
                  <h2 className="text-lg font-semibold">新增優惠券</h2>
                  <button onClick={() => setCouponModalOpen(false)} aria-label="關閉" className="rounded-md p-1 text-2xl leading-none hover:bg-[#efe8dd]">×</button>
                </div>
                <div className="flex-1 overflow-y-auto overscroll-contain p-5">
                <div className="grid gap-4 md:grid-cols-3">
                  <Labeled label="優惠券名稱"><input value={newDiscount.name} onChange={(e) => setNewDiscount({ ...newDiscount, name: e.target.value })} className="w-full rounded border border-[#e5ded4] px-3 py-2" /></Labeled>
                  <Labeled label="優惠碼"><input value={newDiscount.code} onChange={(e) => setNewDiscount({ ...newDiscount, code: e.target.value })} className="w-full rounded border border-[#e5ded4] px-3 py-2" /></Labeled>
                  <Labeled label="狀態"><select value={newDiscount.status} onChange={(e) => setNewDiscount({ ...newDiscount, status: e.target.value as DiscountDraft['status'] })} className="w-full rounded border border-[#e5ded4] px-3 py-2">{['草稿', '啟用', '停用', '已結束'].map((s) => <option key={s}>{s}</option>)}</select></Labeled>
                  <Labeled label="優惠類型"><select value={newDiscount.type} onChange={(e) => setNewDiscount({ ...newDiscount, type: e.target.value as DiscountDraft['type'] })} className="w-full rounded border border-[#e5ded4] px-3 py-2"><option value="percent">百分比</option><option value="amount">固定金額</option><option value="free_shipping">免運</option></select></Labeled>
                  <Labeled label="折扣值"><input type="number" value={newDiscount.value} onChange={(e) => setNewDiscount({ ...newDiscount, value: Number(e.target.value) })} disabled={newDiscount.type === 'free_shipping'} className="w-full rounded border border-[#e5ded4] px-3 py-2 disabled:bg-[#f6f2ec]" /></Labeled>
                  <Labeled label="最低消費"><input type="number" value={newDiscount.min_spend} onChange={(e) => setNewDiscount({ ...newDiscount, min_spend: Number(e.target.value) })} className="w-full rounded border border-[#e5ded4] px-3 py-2" /></Labeled>
                  <Labeled label="最高折抵"><input type="number" value={newDiscount.max_discount} onChange={(e) => setNewDiscount({ ...newDiscount, max_discount: Number(e.target.value) })} className="w-full rounded border border-[#e5ded4] px-3 py-2" /></Labeled>
                  <Labeled label="開始時間"><input type="datetime-local" value={newDiscount.start_at} onChange={(e) => setNewDiscount({ ...newDiscount, start_at: e.target.value })} className="w-full rounded border border-[#e5ded4] px-3 py-2" /></Labeled>
                  <Labeled label="結束時間"><input type="datetime-local" value={newDiscount.end_at} onChange={(e) => setNewDiscount({ ...newDiscount, end_at: e.target.value })} className="w-full rounded border border-[#e5ded4] px-3 py-2" /></Labeled>
                  <Labeled label="發放 / 使用上限"><input type="number" value={newDiscount.total_limit} onChange={(e) => setNewDiscount({ ...newDiscount, total_limit: Number(e.target.value) })} className="w-full rounded border border-[#e5ded4] px-3 py-2" /></Labeled>
                  <Labeled label="每會員限用"><input type="number" value={newDiscount.per_user_limit} onChange={(e) => setNewDiscount({ ...newDiscount, per_user_limit: Number(e.target.value) })} className="w-full rounded border border-[#e5ded4] px-3 py-2" /></Labeled>
                  <Labeled label="適用會員"><select value={newDiscount.applicable_users} onChange={(e) => setNewDiscount({ ...newDiscount, applicable_users: e.target.value as DiscountDraft['applicable_users'] })} className="w-full rounded border border-[#e5ded4] px-3 py-2"><option value="all">全部</option><option value="new">新會員</option><option value="vip">VIP</option></select></Labeled>
                  <Labeled label="適用商品代碼"><textarea value={newDiscount.applicable_products} onChange={(e) => setNewDiscount({ ...newDiscount, applicable_products: e.target.value })} rows={3} placeholder="一行一個商品代碼,空白代表全站" className="w-full rounded border border-[#e5ded4] px-3 py-2" /></Labeled>
                  <Labeled label="適用分類代碼"><textarea value={newDiscount.applicable_categories} onChange={(e) => setNewDiscount({ ...newDiscount, applicable_categories: e.target.value })} rows={3} placeholder="一行一個分類 slug,空白代表全站" className="w-full rounded border border-[#e5ded4] px-3 py-2" /></Labeled>
                  <div className="flex flex-col justify-end gap-3 text-sm font-semibold">
                    <label className="flex items-center gap-2"><input type="checkbox" checked={newDiscount.is_first_purchase_only} onChange={(e) => setNewDiscount({ ...newDiscount, is_first_purchase_only: e.target.checked })} /> 新會員首購限定</label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={newDiscount.stackable} onChange={(e) => setNewDiscount({ ...newDiscount, stackable: e.target.checked })} /> 可與其他優惠併用</label>
                  </div>
                </div>
                </div>
                <div className="flex shrink-0 justify-end gap-2 border-t border-[#e5ded4] px-5 py-4">
                  <button onClick={() => setCouponModalOpen(false)} className="rounded-full border border-[#d7c9bd] px-5 py-2.5 text-sm font-semibold text-[#6b6156] hover:bg-[#efe8dd]">取消</button>
                  <button onClick={() => { addDiscount(); }} className="rounded-full bg-[#1f1b19] px-5 py-2.5 text-sm font-semibold text-white">新增優惠券</button>
                </div>
              </div>
              </div>
              )}
            </div>
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
                  { key: 'payments', label: '金流設定' },
                  { key: 'shippings', label: '物流設定' },
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
                </div>
              </Card>
              )}
              {settingsTab === 'payments' && (
              <Card
                title="金流設定"
                action={
                  <button
                    onClick={() => saveMethodSettings('payments')}
                    disabled={savingSettings}
                    className="rounded-full bg-[#1f1b19] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {savingSettings ? '儲存中...' : '儲存金流'}
                  </button>
                }
              >
                <MethodToggles
                  label="金流方式(勾選=啟用,可套用到各商品)"
                  defaults={DEFAULT_PAYMENT_METHODS}
                  value={footerDraft.payments}
                  onChange={(v) => setFooterDraft({ ...footerDraft, payments: v })}
                />
                <PaymentAccountsEditor
                  methods={footerDraft.payments.split('\n').map((s) => s.trim()).filter(Boolean)}
                  accounts={paymentAccounts}
                  onChange={setPaymentAccounts}
                />
                <BulkMethodApply
                  field="available_payment_methods"
                  methodOptions={footerDraft.payments.split('\n').map((s) => s.trim()).filter(Boolean)}
                  categories={categories}
                  onApply={applyMethodsToProducts}
                />
              </Card>
              )}

              {settingsTab === 'shippings' && (
              <Card
                title="物流設定"
                action={
                  <button
                    onClick={() => saveMethodSettings('shippings')}
                    disabled={savingSettings}
                    className="rounded-full bg-[#1f1b19] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {savingSettings ? '儲存中...' : '儲存物流'}
                  </button>
                }
              >
                <ShippingMethodsEditor
                  defaults={DEFAULT_SHIPPING_METHODS}
                  value={footerDraft.shippings}
                  onChange={(v) => setFooterDraft({ ...footerDraft, shippings: v })}
                  fees={shippingFees}
                  onFeesChange={setShippingFees}
                />
                <BulkMethodApply
                  field="available_shipping_methods"
                  methodOptions={footerDraft.shippings.split('\n').map((s) => s.trim()).filter(Boolean)}
                  categories={categories}
                  onApply={applyMethodsToProducts}
                />
                <Field label="退貨收件資訊(顯示給申請退貨的買家)">
                  <textarea
                    value={returnInfo}
                    onChange={(e) => setReturnInfo(e.target.value)}
                    rows={3}
                    placeholder="例:退貨請寄至 100 台北市中正區 XX 路 1 號,收件人:Urbanite 退貨組,電話 02-1234-5678。請務必附上訂單編號。"
                    className="w-full rounded-lg border border-[#e5ded4] px-3 py-2 text-sm"
                  />
                  <p className="mt-1 text-xs text-[#a99e8f]">按上方「儲存物流」一併儲存。</p>
                </Field>
              </Card>
              )}
            </div>
          )}
        </main>
        </div>
      </div>

      {editing && (
        <ProductModal
          draft={editing}
          isNew={isNew}
          categories={categories}
          paymentMethods={enabledPaymentMethods}
          shippingMethods={enabledShippingMethods}
          shippingFees={shippingFees}
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
          onReviewCancel={(action, response) => reviewCancel(openOrderId, action, response)}
          onOrderChange={(o) => setOrders((list) => list.map((x) => (x.id === o.id ? o : x)))}
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
      void uiAlert(error instanceof Error ? error.message : '上傳發生問題');
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

// 非藍新收款方式的帳號資訊編輯(例:銀行轉帳填銀行/戶名/帳號)
function isEcpayName(method: string): boolean {
  return /藍新|信用卡|line\s?pay|apple\s?pay/i.test(method);
}

function PaymentAccountsEditor({
  methods,
  accounts,
  onChange,
}: {
  methods: string[];
  accounts: { name: string; info: string }[];
  onChange: (next: { name: string; info: string }[]) => void;
}) {
  const nonEcpay = methods.filter((m) => !isEcpayName(m));
  function setInfo(name: string, info: string) {
    const rest = accounts.filter((a) => a.name !== name);
    onChange(info.trim() ? [...rest, { name, info }] : rest);
  }
  return (
    <Field label="收款帳號資訊(非藍新方式,結帳時顯示給買家)">
      {nonEcpay.length === 0 ? (
        <p className="text-sm text-[#a99e8f]">目前沒有非藍新的付款方式。新增「銀行轉帳」等方式後即可在此填寫收款帳號。</p>
      ) : (
        <div className="space-y-3">
          {nonEcpay.map((m) => (
            <div key={m} className="rounded-lg border border-[#e5ded4] p-3">
              <p className="mb-1 text-sm font-semibold text-[#1f1b19]">{m}</p>
              <textarea
                value={accounts.find((a) => a.name === m)?.info ?? ''}
                onChange={(e) => setInfo(m, e.target.value)}
                rows={2}
                placeholder="例:玉山銀行(808) / 戶名:王小明 / 帳號:1234-567-890123"
                className="w-full rounded-lg border border-[#e5ded4] px-3 py-2 text-sm"
              />
            </div>
          ))}
          <p className="text-xs text-[#a99e8f]">留空的方式結帳時不顯示收款資訊。記得按上方「儲存金流」。</p>
        </div>
      )}
    </Field>
  );
}

// 物流方式(啟用 + 運費同一列) + 新增自訂方式
function ShippingMethodsEditor({
  defaults,
  value,
  onChange,
  fees,
  onFeesChange,
}: {
  defaults: string[];
  value: string; // 一行一筆的啟用中方式
  onChange: (next: string) => void;
  fees: { name: string; fee: number }[];
  onFeesChange: (next: { name: string; fee: number }[]) => void;
}) {
  const [custom, setCustom] = useState('');
  const enabled = value.split('\n').map((s) => s.trim()).filter(Boolean);
  const master = Array.from(new Set([...defaults, ...enabled]));

  function toggle(method: string, on: boolean) {
    const set = new Set(enabled);
    if (on) set.add(method); else set.delete(method);
    onChange(master.filter((m) => set.has(m)).join('\n'));
  }
  function setFee(name: string, fee: number) {
    const rest = fees.filter((f) => f.name !== name);
    onFeesChange([...rest, { name, fee: Math.max(0, Math.floor(fee) || 0) }]);
  }
  function addCustom() {
    const m = custom.trim();
    if (!m) return;
    if (!enabled.includes(m)) onChange([...enabled, m].join('\n'));
    setCustom('');
  }

  return (
    <Field label="物流方式與運費(勾選=啟用,自動同步前台;運費為預設,商品可於編輯頁覆寫)">
      <div className="space-y-2">
        {master.map((method) => {
          const on = enabled.includes(method);
          return (
            <div key={method} className="flex flex-wrap items-center gap-3 rounded-lg border border-[#e5ded4] px-3 py-2.5">
              <span className={`min-w-0 flex-1 text-sm ${on ? 'font-semibold text-[#1f1b19]' : 'text-[#8a7f72]'}`}>{method}</span>
              <span className="flex items-center gap-1 text-sm text-[#8a7f72]">
                NT$
                <input
                  type="number"
                  min={0}
                  value={fees.find((f) => f.name === method)?.fee ?? 0}
                  onChange={(e) => setFee(method, Number(e.target.value))}
                  className="w-20 rounded-lg border border-[#d7c9bd] px-2 py-1 text-right text-[#1f1b19]"
                />
              </span>
              <span className="flex items-center gap-1.5 text-xs text-[#8a7f72]">
                {on ? '啟用' : '停用'}
                <input type="checkbox" checked={on} onChange={(e) => toggle(method, e.target.checked)} className="h-4 w-4" />
              </span>
            </div>
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
          <button type="button" onClick={addCustom} className="rounded-lg border border-[#1f1b19] px-4 py-2 text-sm font-semibold">
            新增
          </button>
        </div>
        <p className="text-xs text-[#a99e8f]">滿額免運門檻與「商品免運」設定仍優先;記得按上方「儲存物流」。</p>
      </div>
    </Field>
  );
}

// 批次把「可用付款 / 物流方式」套用到全部或指定分類的商品
function BulkMethodApply({
  field,
  methodOptions,
  categories,
  onApply,
}: {
  field: 'available_payment_methods' | 'available_shipping_methods';
  methodOptions: string[];
  categories: Category[];
  onApply: (
    field: 'available_payment_methods' | 'available_shipping_methods',
    methods: string[],
    scope: 'all' | 'category',
    category: string,
  ) => void;
}) {
  const [scope, setScope] = useState<'all' | 'category'>('all');
  const [category, setCategory] = useState('');
  const [allowAll, setAllowAll] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const kindLabel = field === 'available_payment_methods' ? '付款' : '物流';

  function toggle(m: string, on: boolean) {
    setSelected((list) => (on ? [...list, m] : list.filter((x) => x !== m)));
  }

  return (
    <Field label={`批次套用${kindLabel}方式到商品`}>
      <div className="space-y-3 rounded-lg border border-[#e5ded4] p-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select value={scope} onChange={(e) => setScope(e.target.value as 'all' | 'category')} className="rounded-lg border border-[#d7c9bd] bg-white px-3 py-2">
            <option value="all">全部商品</option>
            <option value="category">指定分類</option>
          </select>
          {scope === 'category' ? (
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-lg border border-[#d7c9bd] bg-white px-3 py-2">
              <option value="">選擇分類…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.slug}>{c.name}</option>
              ))}
            </select>
          ) : null}
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={allowAll} onChange={(e) => setAllowAll(e.target.checked)} className="h-4 w-4" />
          允許全部(清除商品限制)
        </label>

        {!allowAll ? (
          <div className="flex flex-wrap gap-2">
            {methodOptions.map((m) => (
              <label key={m} className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm ${selected.includes(m) ? 'border-[#1f1b19] bg-[#1f1b19] text-white' : 'border-[#d7c9bd] text-[#6b6156]'}`}>
                <input type="checkbox" className="hidden" checked={selected.includes(m)} onChange={(e) => toggle(m, e.target.checked)} />
                {m}
              </label>
            ))}
          </div>
        ) : null}

        <button
          onClick={() => onApply(field, allowAll ? [] : selected, scope, category)}
          disabled={scope === 'category' && !category}
          className="rounded-full bg-[#ada265] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          套用到商品
        </button>
        <p className="text-xs text-[#a99e8f]">商品未設定限制時 = 開放所有已啟用方式。此操作會直接覆寫所選商品的可用{kindLabel}方式。</p>
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

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// 退貨狀態推進(賣家):已收到退貨 / 處理中 / 已退款 / 已完成
function ReturnStatusControl({
  r,
  busy,
  onAction,
}: {
  r: ReturnRequest;
  busy: boolean;
  onAction: (action: 'received' | 'processing' | 'refund' | 'complete') => void;
}) {
  const [sel, setSel] = useState<'received' | 'processing' | 'refund' | 'complete'>('received');
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={sel}
        onChange={(e) => setSel(e.target.value as typeof sel)}
        className="rounded-lg border border-[#d7c9bd] bg-white px-2 py-1 text-xs"
      >
        <option value="received">已收到退貨(回補庫存)</option>
        <option value="processing">退款處理中</option>
        <option value="refund">已退款(建立退款單)</option>
        <option value="complete">已完成</option>
      </select>
      <button
        onClick={async () => {
          if (sel === 'received' && !(await uiConfirm('標記已收到退貨?將回補庫存。'))) return;
          if (sel === 'refund' && !(await uiConfirm(`退款 ${formatter.format(r.refund_amount)}?\n(實際退刷仍需至金流後台操作)`))) return;
          onAction(sel);
        }}
        disabled={busy}
        className="rounded-full bg-[#1f1b19] px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
      >
        更新
      </button>
    </div>
  );
}

// 後台訂單進度條(圖示 + 時間戳)
function AdminOrderProgress({ order, createdAt, paidAt }: { order: Order; createdAt?: string; paidAt?: string }) {
  const steps = buildProgress(order);
  const cancelled = order.status === '取消';
  const fmt = (s?: string) => (s ? new Date(s).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
  const stepIcon = (key: string) => {
    const p = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
    if (key === 'created') return (<svg {...p}><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4M9 12h7M9 16h7" /></svg>);
    if (key === 'paid') return (<svg {...p}><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18" /></svg>);
    if (key === 'shipped' || key === 'transit') return (<svg {...p}><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" /><circle cx="7" cy="18" r="1.5" /><circle cx="17.5" cy="18" r="1.5" /></svg>);
    if (key === 'done') return (<svg {...p}><path d="M5 13l4 4L19 7" strokeWidth={2.2} /></svg>);
    return (<svg {...p}><path d="M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7" /></svg>);
  };
  const timeFor = (key: string) => (key === 'created' ? fmt(createdAt) : key === 'paid' ? fmt(paidAt) : '');
  return (
    <div className="flex items-start">
      {steps.map((s, i) => {
        const active = s.done || s.current;
        const bg = cancelled ? '#c0392b' : active ? '#1f1b19' : '#efe8dd';
        const fg = active || cancelled ? '#fff' : '#b3a897';
        return (
          <div key={s.key} className="flex flex-1 flex-col items-center">
            <div className="flex w-full items-center">
              <div className={`h-0.5 flex-1 ${i === 0 ? 'opacity-0' : ''}`} style={{ background: active ? '#1f1b19' : '#e5ded4' }} />
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: bg, color: fg }}>
                {stepIcon(s.key)}
              </div>
              <div className={`h-0.5 flex-1 ${i === steps.length - 1 ? 'opacity-0' : ''}`} style={{ background: (steps[i + 1]?.done || steps[i + 1]?.current) ? '#1f1b19' : '#e5ded4' }} />
            </div>
            <span className={`mt-1.5 text-center text-[11px] leading-tight ${active ? 'font-semibold text-[#2c2826]' : 'text-[#a99e8f]'}`}>{s.label}</span>
            {timeFor(s.key) ? <span className="mt-0.5 text-center text-[10px] text-[#a99e8f]">{timeFor(s.key)}</span> : null}
          </div>
        );
      })}
    </div>
  );
}

// 後台專用的訂單完整資訊(含出貨狀態 / 付款管理;與客人端的訂單明細分開)
function AdminOrderModal({
  order,
  imageByName,
  onClose,
  onUpdate,
  onReviewCancel,
  onOrderChange,
}: {
  order: Order;
  imageByName: Map<string, string>;
  onClose: () => void;
  onUpdate: (patch: Partial<Order>) => void;
  onReviewCancel: (action: 'approve' | 'reject', response: string) => void;
  onOrderChange?: (o: Order) => void;
}) {
  const dateStr = order.created_at ? new Date(order.created_at).toLocaleString('zh-TW') : '';
  const [cancelReply, setCancelReply] = useState('');
  const [adminNote, setAdminNote] = useState(order.admin_note ?? '');
  const row = (label: string, value?: string) =>
    value ? (
      <div className="flex justify-between gap-3">
        <span className="shrink-0 text-[#8a7f72]">{label}</span>
        <span className="min-w-0 break-words text-right">{value}</span>
      </div>
    ) : null;

  const [detail, setDetail] = useState<Pick<OrderDetail, 'payments' | 'shipments' | 'history' | 'returns' | 'refunds'> | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const paidAt = detail?.history?.find((h) => h.type === 'payment' && h.to_status === 'PAID')?.created_at
    ?? detail?.payments?.find((p) => p.status === 'PAID')?.paid_at
    ?? undefined;
  const hasShipment = (detail?.shipments?.length ?? 0) > 0;
  const [shipForm, setShipForm] = useState({ provider: '', tracking_number: '' });
  const [eventForm, setEventForm] = useState({ status: '', description: '', location: '' });
  const [busy, setBusy] = useState(false);

  const loadDetail = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/${order.id}`);
      if (res.ok) {
        const d = (await res.json()) as OrderDetail;
        setDetail({ payments: d.payments, shipments: d.shipments, history: d.history, returns: d.returns, refunds: d.refunds });
        onOrderChange?.(d.order);
      }
    } finally {
      setDetailLoading(false);
    }
  }, [order.id, onOrderChange]);
  useEffect(() => { loadDetail(); }, [loadDetail]);

  async function reviewReturn(returnId: string, action: 'approve' | 'reject' | 'received' | 'processing' | 'refund' | 'complete', response = '') {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/returns`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ return_id: returnId, action, response }),
      });
      if (!res.ok) { void uiAlert((await res.json()).error ?? '操作失敗'); return; }
      await loadDetail();
    } finally { setBusy(false); }
  }

  async function createShipment(useNewebpay = false) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/shipment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(useNewebpay ? { use_newebpay: true } : shipForm),
      });
      if (!res.ok) { void uiAlert((await res.json()).error ?? '建立出貨失敗'); return; }
      onUpdate(useNewebpay ? { status: '待出貨', fulfillment_status: 'READY_TO_SHIP' } : { status: '已出貨', fulfillment_status: 'SHIPPED' });
      setShipForm({ provider: '', tracking_number: '' });
      await loadDetail();
    } finally { setBusy(false); }
  }

  async function traceShipment(shipmentId: string) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/shipment`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shipment_id: shipmentId, action: 'trace' }),
      });
      if (!res.ok) { void uiAlert((await res.json()).error ?? '查詢貨態失敗'); return; }
      await loadDetail();
    } finally { setBusy(false); }
  }

  async function reGetShipmentNo(shipmentId: string) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/shipment`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shipment_id: shipmentId, action: 'getno' }),
      });
      const data = await res.json();
      if (!res.ok) { void uiAlert(data.error ?? '取號失敗'); return; }
      void uiAlert(data.lgs_no ? `取號成功:${data.lgs_no}` : '已重新取號');
      await loadDetail();
    } finally { setBusy(false); }
  }

  async function queryShipment(shipmentId: string) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/shipment`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shipment_id: shipmentId, action: 'query' }),
      });
      const data = await res.json();
      if (!res.ok) { void uiAlert(data.error ?? '查詢配送單失敗'); return; }
      void uiAlert('已查詢配送單並更新資料。');
      await loadDetail();
    } finally { setBusy(false); }
  }

  async function modifyShipment(shipmentId: string) {
    if (busy) return;
    const name = await uiPrompt('修改收件人姓名(留空不改):');
    if (name === null) return;
    const phone = await uiPrompt('修改收件人電話(留空不改):');
    if (phone === null) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/shipment`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shipment_id: shipmentId, action: 'modify', recipient_name: name.trim(), recipient_phone: phone.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { void uiAlert(data.error ?? '修改配送單失敗'); return; }
      void uiAlert('已送出修改配送單。');
      await loadDetail();
    } finally { setBusy(false); }
  }

  async function markPickup(shipmentId: string, action: 'at_store' | 'picked_up') {
    if (busy) return;
    if (action === 'picked_up' && !(await uiConfirm('標記為「已取貨」?\n若為門市取貨付款,將同時完成收款。'))) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/shipment`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shipment_id: shipmentId, action }),
      });
      const data = await res.json();
      if (!res.ok) { void uiAlert(data.error ?? '更新失敗'); return; }
      onUpdate({ fulfillment_status: data.fulfillment_status, ...(data.paid ? { paid: true } : {}), ...(data.status ? { status: data.status } : {}) });
      await loadDetail();
    } finally { setBusy(false); }
  }

  async function addEvent(shipmentId: string) {
    if (busy || (!eventForm.status && !eventForm.description)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/shipment`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shipment_id: shipmentId, ...eventForm }),
      });
      if (!res.ok) { void uiAlert((await res.json()).error ?? '新增失敗'); return; }
      setEventForm({ status: '', description: '', location: '' });
      await loadDetail();
    } finally { setBusy(false); }
  }

  function printOrder() {
    const rows = order.items
      .map((it) => `<tr><td>${escapeHtml(it.name)}</td><td>${escapeHtml(it.variant)}</td><td style="text-align:center">${it.quantity}</td><td style="text-align:right">${formatter.format(it.price * it.quantity)}</td></tr>`)
      .join('');
    const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>${escapeHtml(order.order_no)}</title>
<style>body{font-family:system-ui,"PingFang TC","Microsoft JhengHei",sans-serif;color:#1f1b19;padding:32px;max-width:640px;margin:0 auto}
h1{font-size:20px;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin:16px 0}
th,td{border-bottom:1px solid #e5ded4;padding:8px;font-size:14px;text-align:left}
.muted{color:#6b6156;font-size:13px}.tot{text-align:right;font-weight:700;font-size:16px;margin-top:8px}
.sec{margin-top:20px}.sec h2{font-size:14px;margin:0 0 6px}</style></head><body>
<h1>訂單 ${escapeHtml(order.order_no)}</h1>
<p class="muted">${dateStr} · ${order.status} · ${order.paid ? '已付款' : '未付款'}</p>
<table><thead><tr><th>商品</th><th>規格</th><th style="text-align:center">數量</th><th style="text-align:right">小計</th></tr></thead><tbody>${rows}</tbody></table>
<p class="muted">小計 ${formatter.format(order.subtotal)}｜運費 ${order.shipping === 0 ? '免運' : formatter.format(order.shipping)}${order.discount > 0 ? `｜折扣 -${formatter.format(order.discount)}` : ''}</p>
<p class="tot">合計 ${formatter.format(order.total)}</p>
<div class="sec"><h2>收件資訊</h2><p class="muted">${escapeHtml(order.customer_name)}｜${escapeHtml(order.phone ?? '')}<br>${escapeHtml(order.address ?? '')}<br>${escapeHtml(order.shipping_method ?? '')}｜${escapeHtml(order.payment_method ?? '')}</p></div>
${order.note ? `<div class="sec"><h2>備註</h2><p class="muted">${escapeHtml(order.note)}</p></div>` : ''}
<script>window.onload=function(){window.print()}</script></body></html>`;
    const w = window.open('', '_blank', 'width=720,height=800');
    if (w) { w.document.write(html); w.document.close(); }
  }

  async function markRefund() {
    const input = await uiPrompt(`標記退款金額(此訂單合計 ${order.total})。\n注意:這只記錄退款,實際退刷需至金流後台操作。`, { defaultValue: String(order.total) });
    if (input === null) return;
    const amount = Math.floor(Number(input));
    if (!Number.isFinite(amount) || amount < 0) { void uiAlert('金額不正確'); return; }
    onUpdate({ refund_amount: amount });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#e5ded4] bg-white px-5 pb-4 pt-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-[0.28em] text-[#b3a897]">ORDER DETAIL</p>
            <h2 className="mt-1 text-2xl font-bold leading-tight">訂單詳情</h2>
            <p className="mt-0.5 text-sm text-[#8a7f72]">{order.order_no}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden rounded-xl bg-[#f3ede4] px-3 py-1.5 text-right sm:block">
              <p className="text-[10px] text-[#a99e8f]">訂單日期</p>
              <p className="text-xs font-semibold text-[#6b6156]">{dateStr}</p>
            </div>
            <button onClick={onClose} aria-label="關閉" className="rounded-md p-1 hover:bg-[#efe8dd]">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain p-5">
          {/* 進度(含圖示) */}
          <AdminOrderProgress order={order} createdAt={order.created_at} paidAt={paidAt} />

          {/* 三套狀態卡 */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-[#eee5da] bg-[#faf7f2] p-3">
              <p className="text-xs text-[#a99e8f]">訂單狀態</p>
              <p className="mt-1 text-sm font-bold">{ORDER_STATUS_LABEL[order.order_status ?? ''] ?? order.status}</p>
              <p className="mt-1 flex items-center gap-1 text-[11px] text-[#8a7f72]"><span className="h-1.5 w-1.5 rounded-full bg-[#c9b8a8]" />{order.status === '取消' ? '已取消' : order.status === '已完成' ? '已完成' : '處理中'}</p>
            </div>
            <div className="rounded-xl border border-[#eee5da] bg-[#faf7f2] p-3">
              <p className="text-xs text-[#a99e8f]">付款狀態</p>
              <p className={`mt-1 inline-block rounded-md px-2 py-0.5 text-sm font-bold ${order.paid ? 'bg-[#e9f7ee] text-[#1f7a44]' : 'bg-[#fdf3e7] text-[#9a6a1f]'}`}>{order.paid ? '已付款' : '未付款'}</p>
              <p className="mt-1 text-[11px] text-[#8a7f72]">{order.paid ? (paidAt ? new Date(paidAt).toLocaleString('zh-TW') : '已收款') : '尚未付款'}</p>
            </div>
            <div className="rounded-xl border border-[#eee5da] bg-[#faf7f2] p-3">
              <p className="text-xs text-[#a99e8f]">物流狀態</p>
              <p className="mt-1 text-sm font-bold">{FULFILLMENT_STATUS_LABEL[order.fulfillment_status ?? ''] ?? '未出貨'}</p>
              <p className="mt-1 flex items-center gap-1 text-[11px] text-[#8a7f72]"><span className="h-1.5 w-1.5 rounded-full bg-[#c9b8a8]" />{hasShipment ? '已建立物流單' : '尚未建立物流單'}</p>
            </div>
          </div>

          {/* 操作 */}
          <div className="flex flex-wrap gap-2">
            <button onClick={printOrder} className="inline-flex h-10 items-center rounded-full bg-[#1f1b19] px-6 text-sm font-semibold text-white hover:bg-black">列印訂單</button>
            <button onClick={markRefund} className="inline-flex h-10 items-center rounded-full border border-[#d7c9bd] px-6 text-sm font-semibold text-[#6b6156] hover:bg-[#efe8dd]">標記退款</button>
            {order.status !== '取消' && order.status !== '退貨' ? (
              <button onClick={async () => { if (await uiConfirm('直接取消訂單?將回補庫存。', { danger: true })) onUpdate({ status: '取消' }); }} className="inline-flex h-10 items-center rounded-full border border-[#e0b4b4] px-6 text-sm font-semibold text-[#c0392b] hover:bg-[#fbf3f0]">取消訂單</button>
            ) : null}
          </div>

          {/* 客人取消申請審核 */}
          {order.cancel_status === 'REQUESTED' ? (
            <div className="rounded-xl border border-[#e0b4b4] bg-[#fbf3f0] p-4">
              <p className="text-sm font-semibold text-[#c0392b]">客人申請取消,待審核</p>
              {order.cancel_reason ? <p className="mt-1 text-sm text-[#6b6156]">原因:{order.cancel_reason}</p> : null}
              {order.paid ? <p className="mt-1 text-xs text-[#9a6a1f]">此訂單已付款,核准後需至金流後台退刷。</p> : null}
              <textarea
                value={cancelReply}
                onChange={(e) => setCancelReply(e.target.value)}
                placeholder="回覆客人(選填)"
                rows={2}
                className="mt-2 w-full rounded-lg border border-[#d7c9bd] px-3 py-2 text-sm"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  onClick={async () => { if (await uiConfirm('核准取消?將取消訂單並回補庫存。')) onReviewCancel('approve', cancelReply.trim()); }}
                  className="rounded-full bg-[#c0392b] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#a83226]"
                >
                  核准取消
                </button>
                <button
                  onClick={() => onReviewCancel('reject', cancelReply.trim())}
                  className="rounded-full border border-[#d7c9bd] px-4 py-1.5 text-sm font-semibold text-[#6b6156] hover:bg-[#efe8dd]"
                >
                  婉拒
                </button>
              </div>
            </div>
          ) : order.cancel_status === 'REJECTED' || order.cancel_status === 'APPROVED' ? (
            <div className="rounded-xl bg-[#faf7f2] p-3 text-sm text-[#6b6156]">
              取消申請:{order.cancel_status === 'APPROVED' ? '已核准' : '已婉拒'}
              {order.cancel_response ? `(${order.cancel_response})` : ''}
            </div>
          ) : null}

          {/* 出貨狀態 / 付款(管理操作) */}
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
          </div>

          {/* 物流 */}
          <div className="rounded-xl border border-[#efe8dd] p-4">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f3ede4] text-[#6b6156]">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" /><circle cx="7" cy="18" r="1.5" /><circle cx="17.5" cy="18" r="1.5" /></svg>
              </span>
              <div>
                <p className="text-sm font-semibold text-[#2c2826]">物流資訊</p>
                <p className="text-xs text-[#8a7f72]">建立物流單號後,系統將自動更新物流進度</p>
              </div>
            </div>
            {order.store_id ? (
              <div className="mb-3 rounded-lg bg-[#faf7f2] p-3 text-xs leading-5 text-[#6b6156]">
                <p className="font-semibold text-[#1f1b19]">取貨門市：{order.store_name || order.store_id}</p>
                <p>{order.store_address}</p>
                <p>門市代號：{order.store_id}{order.store_phone ? `｜${order.store_phone}` : ''}</p>
              </div>
            ) : null}
            {detailLoading ? (
              <p className="text-xs text-[#a99e8f]">載入中…</p>
            ) : detail && detail.shipments.length > 0 ? (
              <div className="space-y-3">
                {detail.shipments.map((s) => (
                  <div key={s.id} className="rounded-lg bg-[#faf7f2] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="font-medium">{s.provider || '物流'}</span>
                      <span className="text-[#8a7f72]">{FULFILLMENT_STATUS_LABEL[s.status] ?? s.status}</span>
                    </div>
                    {s.tracking_number ? <p className="mt-1 text-xs text-[#6b6156]">單號：{s.tracking_number}</p> : null}
                    {s.store_print_no ? <p className="mt-1 text-xs text-[#6b6156]">寄件代碼：{s.store_print_no}</p> : null}
                    {s.store_name ? <p className="mt-1 text-xs text-[#6b6156]">門市：{s.store_name}（{s.store_id}）</p> : null}
                    {s.events && s.events.length > 0 ? (
                      <ul className="mt-2 space-y-1 border-t border-[#efe8dd] pt-2 text-xs text-[#6b6156]">
                        {s.events.map((ev) => (
                          <li key={ev.id} className="flex gap-2">
                            <span className="shrink-0 text-[#a99e8f]">{new Date(ev.event_at).toLocaleString('zh-TW')}</span>
                            <span>{ev.description || (FULFILLMENT_STATUS_LABEL[ev.status ?? ''] ?? ev.status)}{ev.location ? `（${ev.location}）` : ''}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {s.lgs_type && s.ship_type ? (
                        <>
                          <button
                            onClick={() => traceShipment(s.id)}
                            disabled={busy}
                            className="rounded-full border border-[#d7c9bd] px-3 py-1 text-xs font-semibold text-[#6b6156] disabled:opacity-50"
                          >
                            更新藍新貨態
                          </button>
                          <a
                            href={`/api/orders/${order.id}/shipment/label?shipment_id=${s.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-full border border-[#d7c9bd] px-3 py-1 text-xs font-semibold text-[#6b6156]"
                          >
                            列印寄件單
                          </a>
                          <button
                            onClick={() => reGetShipmentNo(s.id)}
                            disabled={busy}
                            className="rounded-full border border-[#d7c9bd] px-3 py-1 text-xs font-semibold text-[#6b6156] disabled:opacity-50"
                          >
                            重新取號
                          </button>
                          <button
                            onClick={() => queryShipment(s.id)}
                            disabled={busy}
                            className="rounded-full border border-[#d7c9bd] px-3 py-1 text-xs font-semibold text-[#6b6156] disabled:opacity-50"
                          >
                            查詢配送單
                          </button>
                          <button
                            onClick={() => modifyShipment(s.id)}
                            disabled={busy}
                            className="rounded-full border border-[#d7c9bd] px-3 py-1 text-xs font-semibold text-[#6b6156] disabled:opacity-50"
                          >
                            修改配送單
                          </button>
                        </>
                      ) : null}
                      {order.store_id ? (
                        <>
                          <button
                            onClick={() => markPickup(s.id, 'at_store')}
                            disabled={busy || ['AT_STORE', 'PICKED_UP'].includes(s.status)}
                            className="rounded-full border border-[#c6b8e0] px-3 py-1 text-xs font-semibold text-[#6f5b9c] disabled:opacity-40"
                          >
                            標記到店(待取貨)
                          </button>
                          <button
                            onClick={() => markPickup(s.id, 'picked_up')}
                            disabled={busy || s.status === 'PICKED_UP'}
                            className="rounded-full border border-[#a9cbb4] px-3 py-1 text-xs font-semibold text-[#2f8f5b] disabled:opacity-40"
                          >
                            標記已取貨
                          </button>
                        </>
                      ) : null}
                      <select
                        value={eventForm.status}
                        onChange={(e) => setEventForm({ ...eventForm, status: e.target.value })}
                        className="rounded-lg border border-[#d7c9bd] bg-white px-2 py-1 text-xs"
                      >
                        <option value="">狀態…</option>
                        <option value="IN_TRANSIT">配送中</option>
                        <option value="DELIVERED">已送達</option>
                      </select>
                      <input
                        value={eventForm.description}
                        onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })}
                        placeholder="說明(例:已抵達門市)"
                        className="min-w-0 flex-1 rounded-lg border border-[#d7c9bd] px-2 py-1 text-xs"
                      />
                      <button
                        onClick={() => addEvent(s.id)}
                        disabled={busy}
                        className="rounded-full bg-[#1f1b19] px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        新增
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                {order.store_id ? (
                  <button
                    onClick={() => createShipment(true)}
                    disabled={busy}
                    className="rounded-full bg-[#1f1b19] px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    建立藍新物流單
                  </button>
                ) : null}
                <input
                  value={shipForm.provider}
                  onChange={(e) => setShipForm({ ...shipForm, provider: e.target.value })}
                  placeholder="物流商(例:黑貓)"
                  className="min-w-0 flex-1 rounded-lg border border-[#d7c9bd] px-2.5 py-1.5 text-sm"
                />
                <input
                  value={shipForm.tracking_number}
                  onChange={(e) => setShipForm({ ...shipForm, tracking_number: e.target.value })}
                  placeholder="物流單號"
                  className="min-w-0 flex-1 rounded-lg border border-[#d7c9bd] px-2.5 py-1.5 text-sm"
                />
                <button
                  onClick={() => createShipment(false)}
                  disabled={busy}
                  className="rounded-full bg-[#ada265] px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  建立出貨
                </button>
              </div>
            )}
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
            {order.member_discount && order.member_discount > 0 ? row('會員折扣', `-${formatter.format(order.member_discount)}`) : null}
            {order.point_discount && order.point_discount > 0 ? row('點數折抵', `-${formatter.format(order.point_discount)}`) : null}
            {order.shipping_discount && order.shipping_discount > 0 ? row('運費優惠', `-${formatter.format(order.shipping_discount)}`) : null}
            <div className="flex justify-between pt-1 text-base font-semibold">
              <span>合計</span>
              <span className="text-[#c84767]">{formatter.format(order.total)}</span>
            </div>
            {order.paid ? row('實收', formatter.format(order.paid_amount ?? order.total)) : null}
            {order.refund_amount && order.refund_amount > 0 ? row('已退款', `-${formatter.format(order.refund_amount)}`) : null}
            {order.refund_amount && order.refund_amount > 0 ? row('淨額', formatter.format(order.net_amount ?? (order.total - order.refund_amount))) : null}
          </div>

          <div className="border-t border-[#efe8dd] pt-4">
            <h3 className="mb-2 font-semibold">訂單資訊</h3>
            <div className="space-y-1.5 text-sm text-[#6b6156]">
              {row('訂單號碼', order.order_no)}
              {row('訂單日期', dateStr)}
              {row('訂單狀態', order.status)}
              {row('付款狀態', order.paid ? '已付款' : '未付款')}
              {row('客人備註', order.note)}
            </div>
          </div>

          {/* 買家付款回報(非藍新) */}
          {order.payment_ref || order.payment_proof_url || order.payment_proof_note ? (
            <div className="rounded-xl border border-[#d8c7a8] bg-[#faf6ea] p-4">
              <p className="mb-2 text-sm font-semibold text-[#8a6d1b]">買家付款回報</p>
              <div className="space-y-1.5 text-sm text-[#6b6156]">
                {row('帳號後五碼', order.payment_ref)}
                {row('買家備註', order.payment_proof_note)}
                {order.payment_proof_url ? (
                  <a href={order.payment_proof_url} target="_blank" rel="noreferrer" className="inline-block text-sm font-semibold text-[#c84767] underline">
                    查看付款截圖
                  </a>
                ) : null}
              </div>
              {!order.paid ? (
                <button
                  onClick={() => onUpdate({ paid: true })}
                  className="mt-3 rounded-full bg-[#1f7a44] px-4 py-1.5 text-sm font-semibold text-white"
                >
                  對帳完成,標記已付款
                </button>
              ) : null}
            </div>
          ) : null}

          {/* 後台備註(客人看不到) */}
          <div className="border-t border-[#efe8dd] pt-4">
            <h3 className="mb-2 font-semibold">後台備註 <span className="text-xs font-normal text-[#a99e8f]">(客人看不到)</span></h3>
            <textarea
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
              rows={2}
              placeholder="內部備註,例:VIP、換過尺寸…"
              className="w-full rounded-lg border border-[#d7c9bd] px-3 py-2 text-sm"
            />
            <button
              onClick={() => onUpdate({ admin_note: adminNote })}
              disabled={adminNote === (order.admin_note ?? '')}
              className="mt-2 rounded-full bg-[#1f1b19] px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              儲存備註
            </button>
          </div>

          <div className="border-t border-[#efe8dd] pt-4">
            <h3 className="mb-2 font-semibold">顧客與送貨資訊</h3>
            <div className="space-y-1.5 text-sm text-[#6b6156]">
              {row('姓名', order.customer_name)}
              {row('電話', order.phone)}
              {row('Email', order.email)}
              {row('地址', order.address)}
              {row('送貨方式', order.shipping_method)}
              {row('取貨門市', order.store_name ? `${order.store_name}（${order.store_id ?? ''}）` : order.store_id)}
              {row('門市地址', order.store_address)}
              {row('付款方式', order.payment_method)}
            </div>
          </div>

          {/* 退貨 / 退款 */}
          {detail && (detail.returns.length > 0 || detail.refunds.length > 0) ? (
            <div className="border-t border-[#efe8dd] pt-4">
              <h3 className="mb-3 font-semibold">退貨 / 退款</h3>
              <div className="space-y-3">
                {detail.returns.map((r) => (
                  <div key={r.id} className="rounded-xl border border-[#e5ded4] p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{r.return_no}</span>
                      <span className="rounded-full bg-[#fbe9e7] px-2.5 py-1 text-xs font-semibold text-[#c0392b]">{RETURN_STATUS_LABEL[r.status] ?? r.status}</span>
                    </div>
                    <p className="mt-1 text-xs text-[#6b6156]">{r.items.map((it) => `${it.name}${it.variant ? `(${it.variant})` : ''}×${it.quantity}`).join('、')}</p>
                    <p className="mt-0.5 text-xs text-[#8a7f72]">原因：{r.reason || '—'}｜退款 {formatter.format(r.refund_amount)}</p>
                    {r.response ? <p className="mt-0.5 text-xs text-[#8a7f72]">回覆：{r.response}</p> : null}
                    {r.return_tracking || r.return_carrier ? (
                      <p className="mt-0.5 text-xs text-[#1f7a44]">買家已寄回：{r.return_carrier} {r.return_tracking}</p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {r.status === 'REQUESTED' ? (
                        <>
                          <button onClick={() => reviewReturn(r.id, 'approve')} disabled={busy} className="rounded-full bg-[#1f7a44] px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">核准退貨</button>
                          <button onClick={async () => { const resp = await uiPrompt('婉拒退貨,回覆客人(選填):'); if (resp !== null) reviewReturn(r.id, 'reject', resp); }} disabled={busy} className="rounded-full border border-[#e0b4b4] px-3 py-1 text-xs font-semibold text-[#c0392b] disabled:opacity-50">婉拒</button>
                        </>
                      ) : r.status !== 'REJECTED' && r.status !== 'REFUNDED' && r.status !== 'COMPLETED' ? (
                        <ReturnStatusControl r={r} busy={busy} onAction={(action) => reviewReturn(r.id, action)} />
                      ) : null}
                    </div>
                  </div>
                ))}
                {detail.refunds.map((rf) => (
                  <div key={rf.id} className="rounded-lg bg-[#faf7f2] p-3 text-xs text-[#6b6156]">
                    退款單 {rf.refund_no}｜{formatter.format(rf.amount)}｜{new Date(rf.created_at ?? '').toLocaleString('zh-TW')}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {detail && detail.history.length > 0 ? (
            <div className="border-t border-[#efe8dd] pt-4">
              <h3 className="mb-3 font-semibold">訂單歷程</h3>
              <ol className="space-y-3">
                {detail.history.map((h: OrderStatusHistory) => (
                  <li key={h.id} className="flex gap-3">
                    <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#ada265]" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-[#3f3a34]">{historyLabel(h)}</p>
                      <p className="text-xs text-[#a99e8f]">
                        {new Date(h.created_at).toLocaleString('zh-TW')} · {h.created_by || 'SYSTEM'}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function historyLabel(h: OrderStatusHistory): string {
  const map =
    h.type === 'payment' ? PAYMENT_STATUS_LABEL
    : h.type === 'fulfillment' ? FULFILLMENT_STATUS_LABEL
    : ORDER_STATUS_LABEL;
  const to = map[h.to_status ?? ''] ?? h.to_status ?? '';
  const kind = h.type === 'payment' ? '付款' : h.type === 'fulfillment' ? '物流' : '訂單';
  return h.note ? `${kind}：${h.note}` : `${kind}狀態 → ${to}`;
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
  color: string;
  size: string;
  quantity: number;
  unit_price: number;
};

type InventoryImportRow = {
  productId: string;
  variantKey: string;
  inventory: number;
  safety: number;
  cost: number;
  location: string;
};

type StockSortKey = 'pid' | 'name' | 'cat' | 'spec' | 'unit' | 'inv' | 'safety' | 'status' | 'cost' | 'value' | 'location' | 'last';

function ProductInventorySummary({
  products,
  categories,
  filters,
  selectedProduct,
  onSelectProduct,
  onCloseProduct,
  onEditProduct,
  onCreateProduct,
  onDeleteProduct,
}: {
  products: Product[];
  categories: Category[];
  filters: React.ReactNode;
  selectedProduct: Product | null;
  onSelectProduct: (product: Product) => void;
  onCloseProduct: () => void;
  onEditProduct: (product: Product) => void;
  onCreateProduct: () => void;
  onDeleteProduct: (id: string) => void;
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
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => onEditProduct(product)}
                          className="rounded-full border border-[#d7c9bd] px-3 py-1.5 text-xs font-semibold"
                        >
                          編輯
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteProduct(product.id)}
                          className="rounded-full border border-[#e0b4b4] px-3 py-1.5 text-xs font-semibold text-[#c0392b]"
                        >
                          刪除
                        </button>
                      </div>
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
  onDeleteProduct,
  onDeleteStockRow,
  onDeleteMovement,
  onImportInventory,
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
  onDeleteProduct: (id: string) => void;
  onDeleteStockRow: (productId: string, variantKey: string) => void;
  onDeleteMovement: (movement: StockMovement) => void;
  onImportInventory: (rows: InventoryImportRow[]) => void;
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
  const [movementPicker, setMovementPicker] = useState<{
    lineId: string;
    field: 'product' | 'color' | 'size';
  } | null>(null);
  const [pickerQuery, setPickerQuery] = useState('');
  const [stockSort, setStockSort] = useState<{ key: StockSortKey; dir: 'asc' | 'desc' }>({
    key: 'pid',
    dir: 'asc',
  });
  const [selectedDocumentNo, setSelectedDocumentNo] = useState<string | null>(null);
  const inventoryImportRef = useRef<HTMLInputElement | null>(null);
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
      const { colorIndex, sizeIndex } = getVariantOptionIndexes(p);
      return p.variants.map((v) => ({
        ...base,
        spec: v.options.join(' / '),
        key: v.options.join(' / '),
        color: v.options[colorIndex] ?? '',
        size: v.options[sizeIndex] ?? '',
        inv: v.inventory,
        safety: v.safety ?? 0,
        cost: v.cost ?? 0,
        location: v.location || '—',
      }));
    }
    return [{ ...base, spec: '—', key: '', color: '', size: '', inv: p.inventory, safety: 0, cost: 0, location: '—' }];
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
  const sortedRows = [...filteredRows].sort((a, b) => {
    const valueFor = (row: (typeof filteredRows)[number]) => {
      if (stockSort.key === 'status') return row.inv <= row.safety ? '需補貨' : '正常';
      if (stockSort.key === 'value') return row.inv * row.cost;
      if (stockSort.key === 'last') return lastMv.get(`${row.pid}${row.key}`) ?? '';
      return row[stockSort.key];
    };
    const av = valueFor(a);
    const bv = valueFor(b);
    const result = typeof av === 'number' && typeof bv === 'number'
      ? av - bv
      : String(av).localeCompare(String(bv), 'zh-Hant');
    return stockSort.dir === 'asc' ? result : -result;
  });
  const setStockSortKey = (key: StockSortKey) => {
    setStockSort((current) => ({
      key,
      dir: current.key === key && current.dir === 'asc' ? 'desc' : 'asc',
    }));
  };
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
      {
        id: `line-${Date.now()}-${movementLines.length}`,
        product_id: '',
        variant_key: '',
        color: '',
        size: '',
        quantity: 1,
        unit_price: 0,
      },
    ]);
  };
  const removeMovementLine = (id: string) => {
    setMovementLines(movementLines.length <= 1 ? movementLines : movementLines.filter((line) => line.id !== id));
  };
  const clearMovementDocument = async () => {
    if (!await uiConfirm(
      `確定刪除此${mvForm.type === 'in' ? '入庫單' : '出庫單'}嗎?\n\n會一併清除:\n- 單號、日期、狀態、人員等單頭資料\n- 目前尚未送出的所有商品明細列\n\n已送出的進出庫紀錄不會被刪除。`,
    )) return;
    setMvForm({
      document_no: nextDocumentNo(movements),
      document_date: currentDateTimeValue(),
      type: mvForm.type,
      status: mvForm.type === 'in' ? '進貨' : '出貨',
      payment_status: '',
      payment_no: '',
      location: '',
      handler: '',
      note: '',
    });
    setMovementLines([{ id: `line-${Date.now()}`, product_id: '', variant_key: '', color: '', size: '', quantity: 1, unit_price: 0 }]);
  };
  useEffect(() => {
    if (inventoryTab !== 'movement') return;
    if (mvForm.document_no && mvForm.document_date) return;
    setMvForm({
      ...mvForm,
      document_no: mvForm.document_no || nextDocumentNo(movements),
      document_date: mvForm.document_date || currentDateTimeValue(),
    });
  }, [inventoryTab, mvForm, movements, setMvForm]);
  useEffect(() => {
    setPickerQuery('');
  }, [movementPicker?.lineId, movementPicker?.field]);
  const stockHeaders: { key: StockSortKey; label: string; align?: 'right' }[] = [
    { key: 'pid', label: '品項編號' },
    { key: 'name', label: '品名' },
    { key: 'cat', label: '分類' },
    { key: 'spec', label: '規格' },
    { key: 'unit', label: '單位' },
    { key: 'inv', label: '目前庫存', align: 'right' },
    { key: 'safety', label: '安全庫存', align: 'right' },
    { key: 'status', label: '庫存狀態' },
    { key: 'cost', label: '單位成本', align: 'right' },
    { key: 'value', label: '庫存金額', align: 'right' },
    { key: 'location', label: '儲位' },
    { key: 'last', label: '最後異動' },
  ];
  const documentGroups = movements.reduce<Record<string, StockMovement[]>>((groups, movement) => {
    const documentNo = parseMovementNote(movement.note).document_no || '';
    if (!documentNo) return groups;
    groups[documentNo] = [...(groups[documentNo] ?? []), movement];
    return groups;
  }, {});
  const selectedDocumentMovements = selectedDocumentNo ? documentGroups[selectedDocumentNo] ?? [] : [];
  const pickerLine = movementPicker ? movementLines.find((line) => line.id === movementPicker.lineId) : null;
  const pickerProduct = pickerLine ? products.find((p) => p.id === pickerLine.product_id) : null;
  const pickerRows = pickerProduct ? getProductVariantRows(pickerProduct) : [];
  const pickerColors = uniqueValues(pickerRows.map((row) => row.color));
  const filteredPickerProducts = products.filter((product) => {
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return true;
    return [product.id, product.name, catName(product.category)].some((value) =>
      String(value).toLowerCase().includes(q),
    );
  });
  const filteredPickerColors = pickerColors.filter((color) =>
    color.toLowerCase().includes(pickerQuery.trim().toLowerCase()),
  );
  const pickerSizes = uniqueValues(
    pickerRows
      .filter((row) => !pickerLine?.color || row.color === pickerLine.color)
      .map((row) => row.size),
  );
  const chooseMovementOption = (value: string) => {
    if (!movementPicker) return;
    if (movementPicker.field === 'product') {
      updateMovementLine(movementPicker.lineId, { product_id: value, variant_key: '', color: '', size: '' });
    } else if (movementPicker.field === 'color') {
      updateMovementLine(movementPicker.lineId, { color: value, size: '', variant_key: '' });
    } else {
      const product = products.find((p) => p.id === pickerLine?.product_id);
      const nextLine = { ...(pickerLine as MovementLine), size: value };
      updateMovementLine(movementPicker.lineId, {
        size: value,
        variant_key: getLineVariantKey(product, nextLine),
      });
    }
    setMovementPicker(null);
  };
  const csvEscape = (value: string | number) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const splitCsvLine = (line: string) => {
    const cells: string[] = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const next = line[i + 1];
      if (char === '"' && quoted && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === ',' && !quoted) {
        cells.push(cell);
        cell = '';
      } else {
        cell += char;
      }
    }
    cells.push(cell);
    return cells;
  };
  const exportInventoryCsv = () => {
    const headers = ['品項編號', '品名', '分類', '規格', '單位', '目前庫存', '安全庫存', '單位成本', '儲位'];
    const body = sortedRows.map((row) => [
      row.pid,
      row.name,
      row.cat,
      row.key,
      row.unit,
      row.inv,
      row.safety,
      row.cost,
      row.location === '—' ? '' : row.location,
    ]);
    const csv = [headers, ...body].map((line) => line.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `urbanite-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const importInventoryCsv = async (file: File) => {
    const text = await file.text();
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2) return void uiAlert('匯入檔沒有資料');
    const headers = splitCsvLine(lines[0]).map((header) => header.trim());
    const indexOf = (names: string[]) => names.map((name) => headers.indexOf(name)).find((index) => index >= 0) ?? -1;
    const productIdIndex = indexOf(['品項編號', '商品編號', 'product_id']);
    const variantIndex = indexOf(['規格', 'variant_key']);
    const inventoryIndex = indexOf(['目前庫存', '可用庫存', 'inventory']);
    const safetyIndex = indexOf(['安全庫存', 'safety']);
    const costIndex = indexOf(['單位成本', 'cost']);
    const locationIndex = indexOf(['儲位', 'location']);
    if (productIdIndex < 0 || inventoryIndex < 0) return void uiAlert('CSV 需要包含「品項編號」與「目前庫存」欄位');

    const rows = lines.slice(1).map((line) => {
      const cells = splitCsvLine(line);
      return {
        productId: cells[productIdIndex]?.trim() ?? '',
        variantKey: variantIndex >= 0 ? cells[variantIndex]?.trim() ?? '' : '',
        inventory: Math.max(0, Math.floor(Number(cells[inventoryIndex]) || 0)),
        safety: Math.max(0, Math.floor(Number(cells[safetyIndex]) || 0)),
        cost: Math.max(0, Math.floor(Number(cells[costIndex]) || 0)),
        location: locationIndex >= 0 ? cells[locationIndex]?.trim() ?? '' : '',
      };
    }).filter((row) => row.productId);
    onImportInventory(rows);
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
        onDeleteProduct={onDeleteProduct}
      />
      )}

      {/* 庫存總表 */}
      {inventoryTab === 'stock' && (
      <Card
        title="庫存總表"
        action={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={exportInventoryCsv}
              className="rounded-full border border-[#d7c9bd] px-4 py-2 text-sm font-semibold"
            >
              匯出庫存
            </button>
            <button
              type="button"
              onClick={() => inventoryImportRef.current?.click()}
              className="rounded-full bg-[#1f1b19] px-4 py-2 text-sm font-semibold text-white"
            >
              匯入庫存
            </button>
            <input
              ref={inventoryImportRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) importInventoryCsv(file);
              }}
            />
          </div>
        }
      >
        {inventoryFilterControls}
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-sm">
            <thead>
              <tr className="border-b border-[#e5ded4] text-left text-xs text-[#8a7f72]">
                {stockHeaders.map((header) => (
                  <th key={header.key} className={`px-2 py-2 ${header.align === 'right' ? 'text-right' : ''}`}>
                    <button
                      type="button"
                      onClick={() => setStockSortKey(header.key)}
                      className="inline-flex items-center gap-1 font-semibold hover:text-[#1f1b19]"
                    >
                      {header.label}
                      <span className="text-[10px]">
                        {stockSort.key === header.key ? (stockSort.dir === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    </button>
                  </th>
                ))}
                <th className="px-2 py-2 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((r, i) => {
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
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => onDeleteStockRow(r.pid, r.key)}
                        className="rounded-full border border-[#e0b4b4] px-3 py-1.5 text-xs font-semibold text-[#c0392b]"
                      >
                        刪除
                      </button>
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
            <div className="flex flex-wrap gap-2">
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
              <button
                type="button"
                onClick={clearMovementDocument}
                className="rounded-full border border-[#e0b4b4] px-4 py-2 text-sm font-semibold text-[#c0392b]"
              >
                刪除此單
              </button>
            </div>
          }
        >
          <div className="grid gap-3 rounded-xl border border-[#e5ded4] bg-[#faf7f2] p-4 lg:grid-cols-4">
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-[#8a7f72]">* 單號</span>
              <input
                required
                value={mvForm.document_no}
                onChange={(e) => setMvForm({ ...mvForm, document_no: e.target.value })}
                placeholder={mvForm.type === 'in' ? 'WI-202609001' : 'WO-202609001'}
                className="w-full rounded-lg border border-[#e5ded4] bg-white px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-[#8a7f72]">* 日期</span>
              <input
                required
                type="datetime-local"
                value={mvForm.document_date}
                onChange={(e) => setMvForm({ ...mvForm, document_date: e.target.value })}
                className="w-full rounded-lg border border-[#e5ded4] bg-white px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-[#8a7f72]">* 狀態</span>
              <select
                required
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
              <span className="mb-1 block text-sm font-semibold text-[#8a7f72]">* {mvForm.type === 'in' ? '入庫人' : '出庫人'}</span>
              <input
                required
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
            <table className="w-full min-w-[1180px] whitespace-nowrap text-sm">
              <thead>
                <tr className="border-b border-[#e5ded4] bg-[#f3eee7] text-left text-xs text-[#6b6156]">
                  <th className="px-3 py-3">型號</th>
                  <th className="px-3 py-3">品名</th>
                  <th className="px-3 py-3">顏色</th>
                  <th className="px-3 py-3">尺寸</th>
                  <th className="px-3 py-3 text-right">數量</th>
                  <th className="px-3 py-3 text-right">單價</th>
                  <th className="px-3 py-3 text-right">小計</th>
                  <th className="px-3 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {movementLines.map((line) => {
                  const lineProduct = products.find((p) => p.id === line.product_id);
                  const lineVariantRows = lineProduct ? getProductVariantRows(lineProduct) : [];
                  const selectedVariant = lineVariantRows.find(
                    (row) => (!line.color || row.color === line.color) && (!line.size || row.size === line.size),
                  );
                  return (
                    <tr key={line.id} className="border-b border-[#efe8dd]">
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => setMovementPicker({ lineId: line.id, field: 'product' })}
                          className="w-44 rounded-lg border border-[#e5ded4] bg-white px-3 py-2 text-left font-semibold"
                        >
                          {line.product_id || '選擇型號'}
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <span className="block w-56 truncate font-semibold">{lineProduct?.name || '—'}</span>
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          disabled={!lineProduct?.variants.length}
                          onClick={() => setMovementPicker({ lineId: line.id, field: 'color' })}
                          className="w-36 rounded-lg border border-[#e5ded4] bg-white px-3 py-2 text-left disabled:bg-[#f3eee7] disabled:text-[#aaa]"
                        >
                          {line.color || (lineProduct?.variants.length ? '選擇顏色' : '—')}
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          disabled={!lineProduct?.variants.length || !line.color}
                          onClick={() => setMovementPicker({ lineId: line.id, field: 'size' })}
                          className="w-28 rounded-lg border border-[#e5ded4] bg-white px-3 py-2 text-left disabled:bg-[#f3eee7] disabled:text-[#aaa]"
                        >
                          {line.size || (line.color ? '選擇尺寸' : '先選顏色')}
                        </button>
                        {selectedVariant && (
                          <p className="mt-1 text-xs text-[#8a7f72]">庫存 {selectedVariant.inventory}</p>
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
                  <th className="px-2 py-2">單號</th>
                  <th className="px-2 py-2">單據日期</th>
                  <th className="px-2 py-2">登錄日期</th>
                  <th className="px-2 py-2">狀態</th>
                  <th className="px-2 py-2">品項</th>
                  <th className="px-2 py-2">規格</th>
                  <th className="px-2 py-2">類型</th>
                  <th className="px-2 py-2 text-right">數量</th>
                  <th className="px-2 py-2 text-right">單價</th>
                  <th className="px-2 py-2">請款狀態</th>
                  <th className="px-2 py-2">請款單號</th>
                  <th className="px-2 py-2">地點 / 對象</th>
                  <th className="px-2 py-2">經手人</th>
                  <th className="px-2 py-2">備註</th>
                  <th className="px-2 py-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => {
                  const doc = parseMovementNote(m.note);
                  return (
                    <tr key={m.id} className="border-b border-[#efe8dd]">
                      <td className="px-2 py-2 font-mono text-xs">
                        {doc.document_no ? (
                          <button
                            type="button"
                            onClick={() => setSelectedDocumentNo(doc.document_no)}
                            className="text-[#2687c9] underline-offset-4 hover:underline"
                          >
                            {doc.document_no}
                          </button>
                        ) : (
                          <span className="text-[#2687c9]">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-[#8a7f72]">{doc.document_date || '—'}</td>
                      <td className="px-2 py-2 text-[#8a7f72]">{fmtDate(m.created_at)}</td>
                      <td className="px-2 py-2 text-[#8a7f72]">{doc.status || '—'}</td>
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
                      <td className="px-2 py-2 text-[#8a7f72]">{doc.payment_status || '—'}</td>
                      <td className="px-2 py-2 text-[#8a7f72]">{doc.payment_no || '—'}</td>
                      <td className="px-2 py-2 text-[#8a7f72]">{m.location || '—'}</td>
                      <td className="px-2 py-2 text-[#8a7f72]">{m.handler || '—'}</td>
                      <td className="px-2 py-2 text-[#8a7f72]">{doc.note || '—'}</td>
                      <td className="px-2 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => onDeleteMovement(m)}
                          className="rounded-full border border-[#e0b4b4] px-3 py-1.5 text-xs font-semibold text-[#c0392b]"
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
        )}
      </Card>
      )}

      {selectedDocumentNo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setSelectedDocumentNo(null)}
        >
          <div
            className="max-h-[86vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e5ded4] p-5">
              <div>
                <p className="text-sm text-[#8a7f72]">進出庫單據</p>
                <h3 className="font-mono text-2xl font-bold">{selectedDocumentNo}</h3>
                <p className="mt-1 text-sm text-[#8a7f72]">
                  共 {selectedDocumentMovements.length} 筆明細
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const first = selectedDocumentMovements[0];
                    const doc = parseMovementNote(first?.note);
                    setMvForm({
                      document_no: selectedDocumentNo,
                      document_date: doc.document_date || currentDateTimeValue(),
                      type: first?.type ?? 'in',
                      status: doc.status || (first?.type === 'out' ? '出貨' : '進貨'),
                      payment_status: doc.payment_status || '',
                      payment_no: doc.payment_no || '',
                      location: first?.location || '',
                      handler: first?.handler || '',
                      note: doc.note || '',
                    });
                    setMovementLines([{ id: `line-${Date.now()}`, product_id: '', variant_key: '', color: '', size: '', quantity: 1, unit_price: 0 }]);
                    setInventoryTab('movement');
                    setSelectedDocumentNo(null);
                  }}
                  className="rounded-full bg-[#1f1b19] px-4 py-2 text-sm font-semibold text-white"
                >
                  用此單號新增明細
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDocumentNo(null)}
                  className="rounded-full border border-[#d7c9bd] px-4 py-2 text-sm font-semibold"
                >
                  關閉
                </button>
              </div>
            </div>
            <div className="max-h-[68vh] overflow-auto p-5">
              <table className="w-full min-w-[820px] whitespace-nowrap text-sm">
                <thead>
                  <tr className="border-b border-[#e5ded4] bg-[#f3eee7] text-left text-xs text-[#6b6156]">
                    <th className="px-3 py-3">商品</th>
                    <th className="px-3 py-3">規格</th>
                    <th className="px-3 py-3">類型</th>
                    <th className="px-3 py-3 text-right">數量</th>
                    <th className="px-3 py-3 text-right">單價</th>
                    <th className="px-3 py-3 text-right">小計</th>
                    <th className="px-3 py-3">地點 / 對象</th>
                    <th className="px-3 py-3">經手人</th>
                    <th className="px-3 py-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedDocumentMovements.map((movement) => (
                    <tr key={movement.id} className="border-b border-[#efe8dd]">
                      <td className="px-3 py-3 font-semibold">{nameById(movement.product_id)}</td>
                      <td className="px-3 py-3 text-[#8a7f72]">{movement.variant_key || '—'}</td>
                      <td className="px-3 py-3">
                        <span className={movement.type === 'in' ? 'text-[#1f7a44]' : 'text-[#c0392b]'}>
                          {movement.type === 'in' ? '入庫' : '出庫'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right font-semibold">
                        {movement.type === 'in' ? '+' : '−'}
                        {movement.quantity}
                      </td>
                      <td className="px-3 py-3 text-right">{movement.unit_price}</td>
                      <td className="px-3 py-3 text-right">{(movement.quantity * movement.unit_price).toLocaleString()}</td>
                      <td className="px-3 py-3 text-[#8a7f72]">{movement.location || '—'}</td>
                      <td className="px-3 py-3 text-[#8a7f72]">{movement.handler || '—'}</td>
                      <td className="px-3 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => onDeleteMovement(movement)}
                          className="rounded-full border border-[#e0b4b4] px-3 py-1.5 text-xs font-semibold text-[#c0392b]"
                        >
                          刪除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {movementPicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setMovementPicker(null)}
        >
          <div
            className="max-h-[82vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#e5ded4] p-5">
              <div>
                <p className="text-sm text-[#8a7f72]">點選項目</p>
                <h3 className="text-2xl font-bold">
                  {movementPicker.field === 'product' ? '選擇型號' : movementPicker.field === 'color' ? '選擇顏色' : '選擇尺寸'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setMovementPicker(null)}
                className="rounded-full border border-[#d7c9bd] px-4 py-2 text-sm font-semibold"
              >
                關閉
              </button>
            </div>
            <div className="max-h-[62vh] overflow-auto p-4">
              {movementPicker.field !== 'size' && (
                <input
                  value={pickerQuery}
                  onChange={(e) => setPickerQuery(e.target.value)}
                  placeholder={movementPicker.field === 'product' ? '搜尋型號、品名、分類' : '搜尋顏色'}
                  className="mb-4 w-full rounded-xl border border-[#e5ded4] px-4 py-3"
                />
              )}
              {movementPicker.field === 'product' && (
                <div className="grid gap-2">
                  {filteredPickerProducts.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => chooseMovementOption(product.id)}
                      className="rounded-xl border border-[#e5ded4] p-4 text-left hover:border-[#1f1b19]"
                    >
                      <span className="block font-mono text-sm text-[#2687c9]">{product.id}</span>
                      <span className="mt-1 block font-semibold">{product.name}</span>
                      <span className="mt-1 block text-xs text-[#8a7f72]">{catName(product.category)}</span>
                    </button>
                  ))}
                </div>
              )}
              {movementPicker.field === 'color' && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {filteredPickerColors.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => chooseMovementOption(color)}
                      className="rounded-xl border border-[#e5ded4] p-4 text-left font-semibold hover:border-[#1f1b19]"
                    >
                      {color}
                    </button>
                  ))}
                </div>
              )}
              {movementPicker.field === 'size' && (
                <div className="grid gap-2 sm:grid-cols-3">
                  {pickerSizes.map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => chooseMovementOption(size)}
                      className="rounded-xl border border-[#e5ded4] p-4 text-left font-semibold hover:border-[#1f1b19]"
                    >
                      {size}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
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
  shippingFees,
  onChange,
  onClose,
  onSave,
}: {
  draft: Draft;
  isNew: boolean;
  categories: Category[];
  paymentMethods: string[];
  shippingMethods: string[];
  shippingFees: { name: string; fee: number }[];
  onChange: (d: Draft) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const [uploadingImage, setUploadingImage] = useState(false);
  const [removeBg, setRemoveBg] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number; percent: number } | null>(
    null,
  );
  const [specInputs, setSpecInputs] = useState<Record<number, string>>({});
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const descriptionRef = useRef<HTMLDivElement | null>(null);
  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    onChange({ ...draft, [key]: value });
  }
  useEffect(() => {
    if (!descriptionRef.current) return;
    descriptionRef.current.innerHTML = draft.tagline || '';
  }, [draft.id]);

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
  function addSpecOption(i: number) {
    const value = (specInputs[i] ?? '').trim();
    if (!value) return;
    const current = parseOptions(draft.specs[i]?.optionsText ?? '');
    if (current.includes(value)) {
      setSpecInputs({ ...specInputs, [i]: '' });
      return;
    }
    updateSpec(i, { optionsText: [...current, value].join(', ') });
    setSpecInputs({ ...specInputs, [i]: '' });
  }
  function removeSpecOption(i: number, value: string) {
    updateSpec(i, { optionsText: parseOptions(draft.specs[i]?.optionsText ?? '').filter((item) => item !== value).join(', ') });
  }
  async function uploadColorImage(color: string, file: File) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('folder', 'products');
    fd.append('productId', draft.id || 'new');
    const res = await fetch('/api/products/image', { method: 'POST', body: fd });
    const data = await res.json();
    if (res.ok) set('colorImages', { ...draft.colorImages, [color]: data.image_url });
    else void uiAlert(data.error ?? '圖片上傳失敗');
  }
  const colorDim = modalSpecs.find((s) => s.name.includes('色'));
  function toggleMethod(
    key: 'available_payment_methods' | 'available_shipping_methods',
    method: string,
    checked: boolean,
  ) {
    const current = draft[key];
    const next = checked ? [...current, method] : current.filter((item) => item !== method);
    set(key, next);
  }
  function toggleFreeShipping(checked: boolean) {
    const current = draft.available_shipping_methods.filter((item) => item !== '免運');
    const baseMethods = current.length ? current : shippingMethods;
    set('available_shipping_methods', checked ? ['免運', ...baseMethods] : current);
  }
  function syncDescription() {
    set('tagline', descriptionRef.current?.innerHTML ?? '');
  }
  function runDescriptionCommand(command: string, value?: string) {
    descriptionRef.current?.focus();
    document.execCommand(command, false, value);
    syncDescription();
  }
  function addDescriptionLink() {
    const url = prompt('貼上連結網址')?.trim();
    if (!url) return;
    runDescriptionCommand('createLink', url);
  }
  function addDescriptionImage() {
    const url = prompt('貼上圖片網址')?.trim();
    if (!url) return;
    runDescriptionCommand('insertImage', url);
  }
  function addDescriptionTable() {
    runDescriptionCommand(
      'insertHTML',
      '<table><tbody><tr><th>欄位</th><th>內容</th></tr><tr><td>文字</td><td>文字</td></tr></tbody></table>',
    );
  }
  function addDescriptionVideo() {
    const url = prompt('貼上影片網址')?.trim();
    if (!url) return;
    runDescriptionCommand('insertHTML', `<p><a href="${url}" target="_blank" rel="noreferrer">影片連結</a></p>`);
  }

  async function uploadProductImages(files: File[]) {
    const room = MAX_PRODUCT_IMAGES - draft.images.length;
    if (room <= 0) {
      void uiAlert(`最多只能放 ${MAX_PRODUCT_IMAGES} 張圖片`);
      return;
    }
    const picked = files.slice(0, room);
    setUploadingImage(true);
    setUploadProgress({ done: 0, total: picked.length, percent: 0 });
    try {
      const uploaded: string[] = [];
      for (let i = 0; i < picked.length; i++) {
        let blob: Blob;
        let filename: string;
        if (removeBg) {
          // 在瀏覽器端去背(第一次會下載去背模型,需要幾秒)
          setUploadProgress({ done: i, total: picked.length, percent: 0 });
          const { removeBackground } = await import('@imgly/background-removal');
          blob = await removeBackground(picked[i]);
          filename = `product-${Date.now()}-${i}.png`;
        } else {
          const prepared = await prepareProductImage(picked[i], i);
          blob = prepared.blob;
          filename = prepared.filename;
        }
        const url = await uploadImageWithProgress(
          blob,
          filename,
          draft.id || 'new-product',
          (p) => setUploadProgress({ done: i, total: picked.length, percent: Math.round(p * 100) }),
        );
        uploaded.push(url);
        setUploadProgress({ done: i + 1, total: picked.length, percent: 100 });
      }
      onChange({ ...draft, images: [...draft.images, ...uploaded].slice(0, MAX_PRODUCT_IMAGES) });
      if (files.length > room) void uiAlert(`最多只能放 ${MAX_PRODUCT_IMAGES} 張,已略過多餘的圖片`);
    } catch (error) {
      void uiAlert(error instanceof Error ? error.message : '上傳失敗');
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
      void uiAlert(`最多只能放 ${MAX_PRODUCT_IMAGES} 張圖片`);
      return;
    }
    onChange({ ...draft, images: [...draft.images, url] });
  }

	  return (
	    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
	      <div className="max-h-[90vh] w-full max-w-5xl overflow-auto rounded-2xl bg-[#f2f5f8] p-4 sm:p-6">
	        <h2 className="text-xl font-semibold">{isNew ? '新增商品' : '編輯商品'}</h2>
	        <div className="mt-4 grid gap-5">
	          <section className="rounded-2xl bg-white p-5">
	          <div className="grid gap-3 sm:grid-cols-2">
	            <Field label="商品代碼(英文,新增後不可改)">
	              <input
	                className="w-full rounded-lg border border-[#e5ded4] px-3 py-2 disabled:bg-[#f5efec]"
	                value={draft.id}
	                disabled={!isNew}
	                onChange={(e) => set('id', e.target.value)}
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
	          <div className="mt-4">
	          <Field label="銷售模式">
              <select
                className="w-full rounded-lg border border-[#e5ded4] px-3 py-2 sm:w-1/2"
                value={draft.sale_mode}
                onChange={(e) => set('sale_mode', e.target.value)}
              >
                {['現貨', '預購', '預購+現貨'].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="mt-4">
          <Field label="商品名稱">
	            <input
	              className="w-full rounded-lg border border-[#e5ded4] px-3 py-2"
	              value={draft.name}
	              placeholder="為您的商品命名"
	              onChange={(e) => set('name', e.target.value)}
	            />
	          </Field>
	          </div>
	          <div className="mt-4">
	          <Field label="商品描述">
	            <div className="rounded-lg border border-[#e5ded4]">
	              <div className="flex flex-wrap items-center gap-1 border-b border-[#e5ded4] bg-[#f7f9fc] p-2 text-sm text-[#666]">
	                <EditorButton label="粗體" onClick={() => runDescriptionCommand('bold')}>B</EditorButton>
	                <EditorButton label="斜體" onClick={() => runDescriptionCommand('italic')}>I</EditorButton>
	                <EditorButton label="底線" onClick={() => runDescriptionCommand('underline')}>U</EditorButton>
	                <EditorButton label="標題" onClick={() => runDescriptionCommand('formatBlock', 'H2')}>Aa</EditorButton>
	                <EditorButton label="文字色" onClick={() => runDescriptionCommand('foreColor', '#1f1b19')}>A</EditorButton>
	                <EditorButton label="段落" onClick={() => runDescriptionCommand('formatBlock', 'P')}>¶</EditorButton>
	                <EditorButton label="靠左" onClick={() => runDescriptionCommand('justifyLeft')}>≡</EditorButton>
	                <EditorButton label="編號清單" onClick={() => runDescriptionCommand('insertOrderedList')}>1.</EditorButton>
	                <EditorButton label="項目清單" onClick={() => runDescriptionCommand('insertUnorderedList')}>•</EditorButton>
	                <EditorButton label="分隔線" onClick={() => runDescriptionCommand('insertHorizontalRule')}>—</EditorButton>
	                <EditorButton label="連結" onClick={addDescriptionLink}>Link</EditorButton>
	                <EditorButton label="圖片" onClick={addDescriptionImage}>▧</EditorButton>
	                <EditorButton label="影片" onClick={addDescriptionVideo}>▻</EditorButton>
	                <EditorButton label="表格" onClick={addDescriptionTable}>▦</EditorButton>
	                <EditorButton label="清除格式" onClick={() => runDescriptionCommand('removeFormat')}>Tx</EditorButton>
	                <EditorButton label="程式碼" onClick={() => runDescriptionCommand('formatBlock', 'PRE')}>{'</>'}</EditorButton>
	                <EditorButton label="展開編輯器" onClick={() => setDescriptionExpanded(!descriptionExpanded)}>⛶</EditorButton>
	              </div>
	            <div
	              ref={descriptionRef}
	              contentEditable
	              suppressContentEditableWarning
	              className={`w-full overflow-auto px-3 py-3 outline-none empty:before:text-[#b9b0a8] empty:before:content-[attr(data-placeholder)] ${
	                descriptionExpanded ? 'min-h-[420px]' : 'min-h-44'
	              }`}
	              data-placeholder="請在此輸入您的商品描述內容"
	              onInput={syncDescription}
	              onBlur={syncDescription}
	            />
	            </div>
	          </Field>
	          </div>
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
	          <div className="mt-4 rounded-xl border border-[#e5ded4] p-4">
	            <Field label="商品規格">
	              <div className="space-y-2">
	                {draft.specs.map((s, i) => (
	                  <div key={i} className="grid gap-3 rounded-xl border border-[#e5ded4] p-3 md:grid-cols-[220px_1fr_auto]">
	                    <input
	                      placeholder="規格"
	                      value={s.name}
	                      onChange={(e) => updateSpec(i, { name: e.target.value })}
	                      className="rounded-lg border border-[#e5ded4] px-3 py-2 text-sm"
	                    />
	                    <div className="flex min-h-11 flex-wrap items-center gap-2 rounded-lg border border-[#e5ded4] px-2 py-1">
	                      {parseOptions(s.optionsText).map((option) => (
	                        <span key={option} className="inline-flex items-center gap-1 rounded-lg bg-[#e9eefc] px-3 py-1.5 text-sm font-semibold text-[#2868d8]">
	                          {option}
	                          <button type="button" onClick={() => removeSpecOption(i, option)} className="text-[#88a8ea]">×</button>
	                        </span>
	                      ))}
	                      <input
	                        placeholder="輸入選項後按 Enter"
	                        value={specInputs[i] ?? ''}
	                        onChange={(e) => setSpecInputs({ ...specInputs, [i]: e.target.value })}
	                        onKeyDown={(e) => {
	                          if (e.key === 'Enter') {
	                            e.preventDefault();
	                            addSpecOption(i);
	                          }
	                        }}
	                        className="min-w-40 flex-1 border-0 px-2 py-1 text-sm outline-none"
	                      />
	                    </div>
	                    <button
	                      type="button"
	                      onClick={() => removeSpec(i)}
	                      aria-label="刪除規格"
	                      className="shrink-0 rounded-lg border border-[#e0b4b4] px-3 text-sm font-semibold text-[#c0392b]"
	                    >
	                      刪除
	                    </button>
	                  </div>
	                ))}
	                <button
	                  type="button"
	                  onClick={addSpec}
	                  className="rounded-full border border-[#d7c9bd] px-4 py-2 text-sm font-semibold"
	                >
	                  為商品新增更多規格
	                </button>
                {colorDim && colorDim.options.length > 0 && (
                  <div className="mt-3 rounded-xl border border-[#e5ded4] p-3">
                    <p className="mb-2 text-sm font-semibold text-[#8a7f72]">
                      顏色圖片(前台點該顏色會切換主圖)
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {colorDim.options.map((color) => (
                        <div key={color} className="flex items-center gap-3 rounded-lg border border-[#e5ded4] p-2">
                          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-[#f1e3dc]">
                            {draft.colorImages[color] && (
                              <img src={draft.colorImages[color]} alt={color} className="h-full w-full object-cover" />
                            )}
                          </div>
                          <span className="flex-1 truncate text-sm font-medium">{color}</span>
                          <label className="cursor-pointer rounded-full border border-[#d7c9bd] px-3 py-1.5 text-xs font-semibold hover:bg-[#f3ede4]">
                            上傳
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) uploadColorImage(color, f);
                                e.target.value = '';
                              }}
                            />
                          </label>
                          {draft.colorImages[color] && (
                            <button
                              type="button"
                              onClick={() => {
                                const next = { ...draft.colorImages };
                                delete next[color];
                                set('colorImages', next);
                              }}
                              className="text-xs font-semibold text-[#c0392b]"
                            >
                              移除
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
	              </div>
	            </Field>
	            {hasSpecs && (
	              <p className="mt-3 text-xs text-[#8a7f72]">
	                已建立 {modalCombos.length} 個規格組合。新增商品時不建庫存,請到「庫存管理」使用入庫單登錄。
	              </p>
	            )}
	          </div>
	          <div className="grid gap-3 sm:grid-cols-2">
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
	            <Field label="單位(例:件 / 串 / 顆 / 入)">
	              <input
	                className="w-full rounded-lg border border-[#e5ded4] px-3 py-2"
	                value={draft.unit}
	                placeholder="件"
	                onChange={(e) => set('unit', e.target.value)}
	              />
	            </Field>
	          </div>
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
            <Field label="可用物流與運費(未勾選=全部;運費留空=用後台預設)">
              <div className="space-y-2 rounded-lg border border-[#e5ded4] p-3">
                {shippingMethods.length === 0 ? (
                  <p className="text-sm text-[#8a7f72]">請先到系統設定新增物流方式。</p>
                ) : (
                  shippingMethods.map((method) => {
                    const baseFee = shippingFees.find((f) => f.name === method)?.fee;
                    const override = draft.shipping_fee_overrides[method];
                    return (
                      <div key={method} className="flex items-center justify-between gap-2 text-sm">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={draft.available_shipping_methods.includes(method)}
                            onChange={(e) => toggleMethod('available_shipping_methods', method, e.target.checked)}
                          />
                          <span>{method}</span>
                        </label>
                        <div className="flex items-center gap-1 text-[#8a7f72]">
                          <span>運費 NT$</span>
                          <input
                            type="number"
                            min={0}
                            value={override ?? ''}
                            placeholder={String(baseFee ?? 120)}
                            onChange={(e) => {
                              const next = { ...draft.shipping_fee_overrides };
                              if (e.target.value.trim() === '') delete next[method];
                              else next[method] = Math.max(0, Math.floor(Number(e.target.value)) || 0);
                              onChange({ ...draft, shipping_fee_overrides: next });
                            }}
                            className="w-20 rounded-lg border border-[#d7c9bd] px-2 py-1 text-right text-[#1f1b19]"
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
	            </Field>
	          </div>
	          </section>
	          <section className="rounded-2xl bg-white p-5">
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
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-[#3d3935]">
                  <input
                    type="checkbox"
                    checked={removeBg}
                    onChange={(e) => setRemoveBg(e.target.checked)}
                    className="h-4 w-4"
                  />
                  上傳時自動去背
                </label>
                <label
                  className={`inline-flex cursor-pointer items-center rounded-full bg-[#1f1b19] px-4 py-2 text-sm font-semibold text-white ${
                    draft.images.length >= MAX_PRODUCT_IMAGES ? 'pointer-events-none opacity-40' : ''
                  }`}
                >
                  {uploadingImage ? (removeBg ? '去背並上傳中...' : '上傳中...') : '上傳圖片'}
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
	          </section>
		          <div className="grid gap-3 sm:grid-cols-3">
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
	            <label className="flex items-end gap-2 pb-2">
	              <input
	                type="checkbox"
	                checked={draft.available_shipping_methods.includes('免運')}
	                onChange={(e) => toggleFreeShipping(e.target.checked)}
	              />
	              <span className="text-sm font-semibold">此商品免運</span>
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

function EditorButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className="min-w-8 rounded px-2 py-1 font-semibold hover:bg-white"
    >
      {children}
    </button>
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

function IconChevronLeft() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconChevronRight() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
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
