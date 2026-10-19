'use client';
import { useScrollLock } from '@/app/components/useScrollLock';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase/client';
import type {
  Banner,
  CategoryImageStyle,
  Category,
  CouponUsage,
  Customer,
  Discount,
  Order,
  OrderDetail,
  OrderStatusHistory,
  Product,
  ReturnRequest,
  Refund,
  SiteSettings,
  Shipment,
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
import { uiToast } from '@/lib/ui-toast';
import NumberInput from './NumberInput';
import { formatProductPrice, productPriceError } from '@/lib/product-price';
import DraggableChips from './DraggableChips';
import { useLongPressReorder } from './useLongPressReorder';
import { cleanRichText } from '@/lib/rich-text';
import { orderRevenue, productRevenue, refundableShipping, shippingRevenue } from '@/lib/revenue';
import OrderNotificationSettingsPanel from './OrderNotificationSettings';
import ManualFulfillmentAction from '@/app/components/ManualFulfillmentAction';
import { PRIMARY_SITE_URL } from '@/lib/site-url';
import { defaultSelfShipCarrier, NO_TRACKING_CARRIERS, needsTracking } from '@/lib/self-ship';
import { uiAlert, uiConfirm, uiPrompt } from '@/lib/ui-dialog';
import { OrderCardBadges, orderNeedsAttention, AttentionDot, isPaymentReported } from '@/app/components/OrderStatusBadge';
import { COUPON_PRESETS } from '@/lib/coupon-presets';
import { isoToTaipeiInput } from '@/lib/taipei-time';
import CampaignManager from './CampaignManager';
import FixedBannerCropModal from './FixedBannerCropModal';
import IntegrationSettings from './IntegrationSettings';
import ProfileCardManager from './ProfileCardManager';
import CardMembersManager from './CardMembersManager';
import ShopsManager from './ShopsManager';
import { POLICY_LABEL, policyText, stripPolicies, withPolicies } from '@/lib/footer-policies';
import SiteThemeEditor from './SiteThemeEditor';
import { BANNER_RATIOS, bannerImageSize, type BannerRatio } from '@/lib/banner-ratio';
import { resolveSiteTheme } from '@/lib/site-theme';
import { resolveStockMovementTarget } from '@/lib/stock-movement-target';
import LineBotManager from './line-bot/LineBotManager';
import LoyaltyManager from './LoyaltyManager';
import StocktakeManager, { type StocktakeApplied } from './StocktakeManager';
import PromoActivitiesManager from './PromoActivitiesManager';
import { downloadCsv } from '@/lib/stocktake';
import { isCollectOnDelivery } from '@/lib/payment';
import { buildReturnSteps, historyKind, isReturnOrder } from '@/lib/return-progress';
import { getCheckoutLine, getNewsletter, HIDDEN_FOOTER_SECTION_TITLES, lineAddFriendUrl, withCheckoutLine, withNewsletter } from '@/lib/checkout-line';
import { ADMIN_PRODUCT_TABS, adminProductTab, UNLISTED_STATUS, type AdminProductTab } from '@/lib/product-status';
import SocialBrandIcon, { detectSocialBrand } from '@/app/components/SocialBrandIcon';

const formatter = new Intl.NumberFormat('zh-TW', {
  style: 'currency',
  currency: 'TWD',
  maximumFractionDigits: 0,
});
const numberFormatter = new Intl.NumberFormat('zh-TW');

function formatOverviewCurrency(value: number) {
  return `NT$ ${numberFormatter.format(value)}`;
}

const CANCEL_REVIEW_TAB = '待審核取消';
const PROCESSED_TAB = '已處理';
const ORDER_TAB_KEYS = ['全部', CANCEL_REVIEW_TAB, '尚未付款', '待出貨', PROCESSED_TAB, '已出貨', '已完成', '取消', '退貨'];


function orderMatchesTab(order: Order, tab: string) {
  if (tab === '全部') return true;
  if (tab === CANCEL_REVIEW_TAB) return order.cancel_status === 'REQUESTED';
  if (tab === '尚未付款') return order.status === '尚未付款' && !order.paid;
  if (tab === '待出貨') return order.status === '待出貨' && order.fulfillment_status !== 'READY_TO_SHIP';
  if (tab === PROCESSED_TAB) return order.status === '待出貨' && order.fulfillment_status === 'READY_TO_SHIP';
  return order.status === tab;
}
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
  { key: 'loyalty', label: '會員回饋', Icon: IconGift },
  { key: 'promotions', label: '促銷管理', Icon: IconGift },
  { key: 'campaign-pages', label: '促銷活動頁', Icon: IconGrid },
  { key: 'profile-card', label: '個人名片', Icon: IconIdCard },
  { key: 'card-members', label: '名片會員', Icon: IconUsers },
  { key: 'line-bot', label: 'LINE 機器人', Icon: IconChat },
  { key: 'shops', label: '店家管理', Icon: IconGrid },
  { key: 'reports', label: '報表及分析', Icon: IconChart },
  { key: 'settings', label: '系統設定', Icon: IconGear },
] as const;

type SectionKey = (typeof NAV)[number]['key'];
// 個人名片:店家(U Pro 以上)也能在官網後台編輯自己的名片
// LINE 機器人:主站與店家共用(店家用自己的官方帳號)
const PLATFORM_SECTIONS = new Set<string>(['card-members', 'shops']);

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
  specs: { name: string; optionsText: string; display?: 'text' | 'image' }[];
  variantStock: Record<string, number>; // key = 各選項用 ' / ' 串起來
  variantCost: Record<string, number>; // 各規格單位成本
  variantPrice: Record<string, number>; // 未填的規格沿用基本售價
  variantSafety: Record<string, number>; // 各規格安全庫存
  is_featured: boolean;
  sort_order: number;
  campaign_id: string | null; // 一頁式活動頁商品;null = 主站商品
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
  image: string;
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
    image: 'preset-1',
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
  const target = resolveStockMovementTarget(product, line.variant_key);
  return target.ok ? target.variantKey : '';
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

// 新商品代碼預設:接著最後一個「英文 + 數字」代碼往下編(例:A00001 → A00002),店家前綴(chue-)不顯示
function suggestProductCode(products: Pick<Product, 'id'>[]) {
  const codes = new Set(products.map((p) => p.id.replace(/^[a-z0-9]+-(?=[A-Za-z]*d+$)/, '')));
  let best: { prefix: string; num: number; width: number } | null = null;
  for (const c of codes) {
    const m = c.match(/^([A-Za-z]*)(d+)$/);
    if (m && (!best || Number(m[2]) > best.num)) best = { prefix: m[1], num: Number(m[2]), width: m[2].length };
  }
  if (!best) return '';
  for (let n = best.num + 1; n < best.num + 1000; n++) {
    const code = `${best.prefix}${String(n).padStart(best.width, '0')}`;
    if (!codes.has(code)) return code;
  }
  return '';
}

function blankDraft(campaignId: string | null = null, products: Pick<Product, 'id'>[] = []): Draft {
  return {
    id: suggestProductCode(products),
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
    variantPrice: {},
    variantSafety: {},
    is_featured: false,
    sort_order: 0,
    campaign_id: campaignId,
  };
}

function toDraft(p: Product): Draft {
  const images = p.images?.length ? p.images : p.image ? [p.image] : [];
  const specs = (p.specs ?? []).map((s) => ({ name: s.name, optionsText: s.options.join(', '), display: s.display }));
  const variantStock: Record<string, number> = {};
  const variantCost: Record<string, number> = {};
  const variantPrice: Record<string, number> = {};
  const variantSafety: Record<string, number> = {};
  for (const v of p.variants ?? []) {
    const k = v.options.join(' / ');
    variantStock[k] = v.inventory;
    if (v.cost != null) variantCost[k] = v.cost;
    if (v.price != null) variantPrice[k] = v.price;
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
    variantPrice,
    variantSafety,
    campaign_id: p.campaign_id ?? null,
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
  initialCampaigns,
  initialLogoUrl,
  initialSettings,
  userEmail,
  platform = true,
  shopName = 'URBANITE',
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
  initialCampaigns: import('@/lib/types').Campaign[];
  initialLogoUrl: string;
  initialSettings: SiteSettings | null;
  userEmail: string;
  platform?: boolean; // 主網站(URBANITE)= 平台;店家子網域 = false
  shopName?: string;
}) {
  // 店家後台不顯示平台功能(名片會員、LINE 機器人、店家管理)
  const nav = platform ? NAV : NAV.filter((n) => !PLATFORM_SECTIONS.has(n.key));
  const router = useRouter();
  const [section, setSection] = useState<SectionKey>('overview');
  // 重新整理停留在目前分頁:進頁時讀網址 ?section=,切換時寫回網址
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get('section');
    if (s && nav.some((n) => n.key === s)) setSection(s as SectionKey);
  }, []);
  const changeSection = (key: SectionKey) => {
    setSection(key);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('section', key);
      window.history.replaceState(null, '', url);
    } catch { /* 略過 */ }
  };
  // 後台不要平滑捲動(iPhone 捲動時容易跑位)
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.style.scrollBehavior;
    html.style.scrollBehavior = 'auto';
    return () => {
      html.style.scrollBehavior = prev;
    };
  }, []);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true); // 桌機側邊選單預設常開
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  // 主站分類;促銷活動頁的專屬分類另外放(不出現在主站分類管理與首頁)
  const [categories, setCategories] = useState<Category[]>(() => initialCategories.filter((c) => !c.campaign_id));
  const [campaignCategories, setCampaignCategories] = useState<Category[]>(() => initialCategories.filter((c) => c.campaign_id));
  const [discounts, setDiscounts] = useState<Discount[]>(initialDiscounts);
  const [customers] = useState<Customer[]>(initialCustomers);
  const [banners, setBanners] = useState<Banner[]>(initialBanners);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'general' | 'templates' | 'banners' | 'footer' | 'payments' | 'shippings' | 'integrations' | 'shopline' | 'notifications'>('general');
  const [orderFilter, setOrderFilter] = useState<string>('全部');
  const [orderSearch, setOrderSearch] = useState('');
  const [orderPaidFilter, setOrderPaidFilter] = useState<'全部' | '已付款' | '未付款'>('全部');
  const [overviewOrderFilter, setOverviewOrderFilter] = useState<'全部' | '待出貨' | '尚未付款' | '已完成'>('全部');
  const [overviewOrderSearch, setOverviewOrderSearch] = useState('');
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  const [productsTab, setProductsTab] = useState<'items' | 'categories'>('items');
  const [productListTab, setProductListTab] = useState<AdminProductTab>('上架中');
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
    { id: 'line-1', product_id: '', variant_key: '', quantity: 1, unit_price: 0 },
  ]);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [editBannerId, setEditBannerId] = useState<string | null>(null);
  // 輪播圖組:上傳目標組、還沒放圖片的新組
  const [bannerGroup, setBannerGroup] = useState(1);
  const [extraBannerGroups, setExtraBannerGroups] = useState<number[]>([]);
  const [newCat, setNewCat] = useState({ slug: '', name: '', en: '', parent_id: '' });
  const [newDiscount, setNewDiscount] = useState<DiscountDraft>(blankDiscountDraft());
  const [couponImgBusy, setCouponImgBusy] = useState(false);
  const [editingCouponId, setEditingCouponId] = useState<string | null>(null);
  const [promoTab, setPromoTab] = useState<'coupons' | 'activities'>('coupons');
  const [couponMenuId, setCouponMenuId] = useState<string | null>(null);
  const [couponModalOpen, setCouponModalOpen] = useState(false);
  const [discountQuery, setDiscountQuery] = useState('');
  const [discountStatus, setDiscountStatus] = useState('全部');
  const [userCoupons, setUserCoupons] = useState<UserCoupon[]>(initialUserCoupons);
  const [couponUsages] = useState<CouponUsage[]>(initialCouponUsages);
  const [manualCouponByUser, setManualCouponByUser] = useState<Record<string, string>>({});
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [siteTheme, setSiteTheme] = useState(initialSettings?.site_theme);
  const [savingBannerRatio, setSavingBannerRatio] = useState(false);
  const bannerRatios = resolveSiteTheme(siteTheme).bannerRatios;
  const bannerOutput = bannerImageSize(bannerRatios?.[String(bannerGroup)]);
  const [couponHero, setCouponHero] = useState(initialSettings?.coupon_hero_image ?? '');
  const [heroBusy, setHeroBusy] = useState(false);
  const [memberStamp, setMemberStamp] = useState(initialSettings?.member_stamp_image ?? '');
  // 網頁頁籤圖示
  const [faviconUrl, setFaviconUrl] = useState(initialSettings?.favicon_url ?? '');
  const [faviconBusy, setFaviconBusy] = useState(false);
  const [stampBusy, setStampBusy] = useState(false);
  const [footerDraft, setFooterDraft] = useState({
    sections: JSON.stringify(stripPolicies(initialSettings?.footer_sections ?? []), null, 2),
    privacy: policyText(initialSettings?.footer_sections, 'privacy'),
    terms: policyText(initialSettings?.footer_sections, 'terms'),
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
    newsletterShow: getNewsletter(initialSettings).show,
    newsletterTitle: getNewsletter(initialSettings).title,
    newsletterText: getNewsletter(initialSettings).text,
    checkoutLineId: getCheckoutLine(initialSettings).id,
    checkoutLineUrl: getCheckoutLine(initialSettings).url,
    socialLinks: JSON.stringify(
      initialSettings?.footer_sections?.some((section) => section.title === FOOTER_SOCIAL_SECTION_TITLE)
        ? getFooterSocialLinksFromSections(initialSettings?.footer_sections)
        : initialSettings?.footer_social_links?.length
          ? normalizeFooterSocialLinks(initialSettings.footer_social_links)
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
      ex.total += orderRevenue(o);
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
        line: c.line_user_id ? c.line_display_name || 'LINE' : '',
        ...(stat.get(c.user_id) ?? { count: 0, total: 0, last: '' }),
      }))
      .sort((a, b) => b.total - a.total);
  }, [customers, orders]);

  const report = useMemo(() => {
    // 營收只算已付款訂單:總營收含運費,運費另外列「代收款(運費)」
    const counted = orders.filter((o) => o.status !== '取消');
    const paid = orders.filter((o) => o.paid);
    const totalRevenue = paid.reduce((s, o) => s + orderRevenue(o), 0);
    const shippingIncome = paid.reduce((s, o) => s + shippingRevenue(o), 0);
    const productIncome = paid.reduce((s, o) => s + productRevenue(o), 0);
    const orderCount = counted.length;
    const paidCount = paid.filter((o) => orderRevenue(o) > 0).length;
    const avg = paidCount ? Math.round(totalRevenue / paidCount) : 0;
    const prodMap = new Map<string, number>();
    for (const o of counted) for (const it of o.items) prodMap.set(it.name, (prodMap.get(it.name) || 0) + it.quantity);
    const topProducts = [...prodMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    return { totalRevenue, shippingIncome, productIncome, orderCount, avg, topProducts };
  }, [orders]);

  const todayRevenue = useMemo(() => {
    const today = new Date().toDateString();
    return orders
      .filter((o) => o.created_at && new Date(o.created_at).toDateString() === today)
      .reduce((s, o) => s + orderRevenue(o), 0);
  }, [orders]);

  const pendingCount = orders.filter((o) => orderMatchesTab(o, '待出貨')).length;
  const lowStock = products.filter((p) => p.inventory <= 10).length;
  const activeDiscountCount = discounts.filter((d) => d.active).length;
  const overviewRecentOrders = useMemo(() => {
    const q = overviewOrderSearch.trim().toLowerCase();
    return orders
      .filter((o) => {
        if (overviewOrderFilter !== '全部' && o.status !== overviewOrderFilter) return false;
        if (!q) return true;
        const hay = [
          o.order_no,
          o.customer_name,
          o.email,
          o.phone ?? '',
          ...o.items.flatMap((it) => [it.name, it.variant, it.sku ?? '']),
        ].join(' ').toLowerCase();
        return hay.includes(q);
      })
      .slice()
      .sort((a, b) => new Date(b.created_at ?? '').getTime() - new Date(a.created_at ?? '').getTime())
      .slice(0, 6);
  }, [orders, overviewOrderFilter, overviewOrderSearch]);
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
    ? products.filter((product) => product.category === selectedCategory.slug).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    : [];
  // 分類內商品拖曳排序:前台依商品 sort_order 顯示。把這個分類的商品放回原本在整體順序中的位置,
  // 再把主站商品重新編號(只更新有變動的),其他分類的相對順序不受影響。
  const { listRef: categoryListRef, order: categoryOrder, sorting: categorySorting, start: startCategorySort } = useLongPressReorder(selectedCategoryProducts.map((p) => p.id), (ids) => {
    const main = products.filter((p) => !p.campaign_id).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const moved = new Set(ids);
    const queue = [...ids];
    const nextIds = main.map((p) => (moved.has(p.id) ? queue.shift()! : p.id));
    const updates = nextIds.map((id, i) => ({ id, sort_order: i })).filter(({ id, sort_order }) => products.find((p) => p.id === id)?.sort_order !== sort_order);
    if (!updates.length) return;
    const order = new Map(updates.map((u) => [u.id, u.sort_order]));
    setProducts((list) => list.map((p) => (order.has(p.id) ? { ...p, sort_order: order.get(p.id)! } : p)));
    void (async () => {
      for (let i = 0; i < updates.length; i += 8) {
        const results = await Promise.all(updates.slice(i, i + 8).map((u) => fetch(`/api/products/${encodeURIComponent(u.id)}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sort_order: u.sort_order }),
        }).then((r) => r.ok).catch(() => false)));
        if (results.includes(false)) return void uiAlert('排序儲存失敗,請重新整理後再試');
      }
      uiToast('已更新商品排序');
    })();
  });
  const shownCategoryProducts = categoryOrder.map((id) => selectedCategoryProducts.find((p) => p.id === id)!).filter(Boolean);
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

  async function updateOrder(id: string, patch: Partial<Pick<Order, 'status' | 'paid' | 'admin_note' | 'refund_amount' | 'shipping_refund'>>) {
    const res = await fetch(`/api/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const updated = (await res.json()) as Order;
      setOrders((list) => list.map((o) => (o.id === id ? { ...o, ...updated } : o)));
    } else void uiAlert('更新失敗');
  }

  async function reviewCancel(id: string, action: 'approve' | 'reject', response: string, markRefunded = false) {
    const res = await fetch(`/api/orders/${id}/cancel`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, response, mark_refunded: markRefunded }),
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
      .map((s) => ({ name: s.name.trim(), options: parseOptions(s.optionsText), ...(s.display === 'image' ? { display: 'image' as const } : {}) }))
      .filter((s) => s.name && s.options.length > 0);
    const variants = specCombos(specs).map((opts) => {
      const k = opts.join(' / ');
      return {
        ...products.find((p) => p.id === editing.id)?.variants?.find((v) => v.options.join(' / ') === k),
        options: opts,
        price: editing.variantPrice[k] ?? null,
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
    const priceError = productPriceError(payload);
    if (priceError) return void uiAlert(priceError);
    // 勾滿店家目前所有方式 = 不限制(存空陣列),之後店家在系統設定新增的物流/金流才會自動出現在結帳頁
    const coversAll = (list: string[], all: string[]) => all.length > 0 && all.every((m) => list.includes(m));
    if (!payload.available_shipping_methods.includes('免運') && coversAll(payload.available_shipping_methods, enabledShippingMethods)) payload.available_shipping_methods = [];
    if (coversAll(payload.available_payment_methods, enabledPaymentMethods)) payload.available_payment_methods = [];
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
        const target = resolveStockMovementTarget(p, movement.variant_key);
        if (!target.ok) return p;
        if (target.variantIndex !== null) {
          const variants = p.variants.map((v, index) =>
            index === target.variantIndex
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
    const validLines = movementLines.filter((line) => line.product_id);
    if (validLines.length === 0) return void uiAlert('請至少新增一筆商品明細');

    for (const line of validLines) {
      if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) return void uiAlert('數量需為大於 0 的整數');
      const product = products.find((p) => p.id === line.product_id);
      const target = resolveStockMovementTarget(product, line.variant_key);
      if (!target.ok) return void uiAlert(target.error);
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
        const target = resolveStockMovementTarget(p, line.variant_key);
        if (!target.ok) return p;
        if (target.variantIndex !== null) {
          const variants = p.variants.map((v, index) =>
            index === target.variantIndex
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
    uiToast(`${mvForm.type === 'in' ? '已入庫' : '已出庫'} ${createdMovements.length} 筆`);
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

  async function patchCategory(id: string, patch: Partial<Pick<Category, 'name' | 'en' | 'sort_order' | 'image'>>) {
    setCategories((l) => l.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    await fetch(`/api/categories/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
  }

  // 分類圖片(首頁分類導覽顯示)
  const [categoryUploading, setCategoryUploading] = useState('');
  const [categoryImageStyle, setCategoryImageStyle] = useState<CategoryImageStyle>(initialSettings?.category_image_style ?? 'circle');
  async function saveCategoryImageStyle(style: CategoryImageStyle) {
    setCategoryImageStyle(style);
    const res = await fetch('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category_image_style: style }) });
    if (!res.ok) void uiAlert('樣式儲存失敗,請再試一次');
  }
  async function uploadCategoryImage(category: Category, file: File | undefined) {
    if (!file) return;
    setCategoryUploading(category.id);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'categories');
      fd.append('productId', category.slug);
      const res = await fetch('/api/products/image', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '圖片上傳失敗');
      await patchCategory(category.id, { image: data.image_url });
    } catch (e) {
      void uiAlert(e instanceof Error ? e.message : '圖片上傳失敗');
    } finally {
      setCategoryUploading('');
    }
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

  async function uploadCouponImage(file: File) {
    setCouponImgBusy(true);
    try {
      const prepared = await prepareProductImage(file, 0);
      const fd = new FormData();
      fd.append('file', prepared.blob, prepared.filename);
      fd.append('folder', 'coupons');
      fd.append('productId', 'coupon');
      const up = await fetch('/api/products/image', { method: 'POST', body: fd });
      const data = await up.json().catch(() => null);
      if (!up.ok || !data?.image_url) return void uiAlert(data?.error ?? '上傳失敗');
      setNewDiscount((d) => ({ ...d, image: data.image_url }));
    } catch (error) {
      void uiAlert(error instanceof Error ? error.message : '上傳失敗');
    } finally { setCouponImgBusy(false); }
  }

  // 開啟「編輯優惠券」:把既有券填回表單(含券樣式圖)
  function openEditCoupon(d: Discount) {
    setEditingCouponId(d.id);
    setNewDiscount({
      name: d.name ?? '',
      code: d.code,
      type: (d.type === 'amount' || d.type === 'free_shipping' ? d.type : 'percent') as DiscountDraft['type'],
      value: d.value ?? 0,
      min_spend: d.min_spend ?? 0,
      max_discount: d.max_discount ?? 0,
      start_at: isoToTaipeiInput(d.start_at),
      end_at: isoToTaipeiInput(d.end_at),
      total_limit: d.total_limit ?? 0,
      per_user_limit: d.per_user_limit ?? 1,
      applicable_products: (d.applicable_products ?? []).join('\n'),
      applicable_categories: (d.applicable_categories ?? []).join('\n'),
      applicable_users: (d.applicable_users === 'new' || d.applicable_users === 'vip' ? d.applicable_users : 'all') as DiscountDraft['applicable_users'],
      is_first_purchase_only: Boolean(d.is_first_purchase_only),
      stackable: Boolean(d.stackable),
      status: (d.status ?? (d.active ? '啟用' : '停用')) as DiscountDraft['status'],
      image: d.image ?? 'preset-1',
    });
    setCouponModalOpen(true);
  }

  async function addDiscount() {
    const code = newDiscount.code.trim().toUpperCase();
    if (!code) return void uiAlert('請填寫折扣碼');
    const payload = {
      ...newDiscount,
      code,
      applicable_products: splitLines(newDiscount.applicable_products),
      applicable_categories: splitLines(newDiscount.applicable_categories),
      active: newDiscount.status === '啟用',
    };
    const editing = editingCouponId;
    const res = await fetch(editing ? `/api/discounts/${editing}` : '/api/discounts', {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (res.ok) {
      setDiscounts((l) => (editing ? l.map((x) => (x.id === editing ? (data as Discount) : x)) : [data as Discount, ...l]));
      setNewDiscount(blankDiscountDraft());
      setEditingCouponId(null);
      setCouponModalOpen(false);
    } else void uiAlert(data.error ?? (editing ? '更新失敗' : '新增失敗(折扣碼可能重複)'));
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

  // 優惠券頁 hero 背景圖:上傳後存進 site_settings.coupon_hero_image
  async function uploadCouponHero(file: File) {
    setHeroBusy(true);
    try {
      const prepared = await prepareProductImage(file, 0);
      const fd = new FormData();
      fd.append('file', prepared.blob, prepared.filename);
      fd.append('folder', 'coupons');
      fd.append('productId', 'hero');
      const up = await fetch('/api/products/image', { method: 'POST', body: fd });
      const data = await up.json().catch(() => null);
      if (!up.ok || !data?.image_url) return void uiAlert(data?.error ?? '上傳失敗');
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coupon_hero_image: data.image_url }),
      });
      if (!res.ok) return void uiAlert((await res.json()).error ?? '儲存失敗');
      setCouponHero(data.image_url);
    } catch (error) {
      void uiAlert(error instanceof Error ? error.message : '上傳失敗');
    } finally { setHeroBusy(false); }
  }

  async function clearCouponHero() {
    setHeroBusy(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coupon_hero_image: '' }),
      });
      if (!res.ok) return void uiAlert((await res.json()).error ?? '移除失敗');
      setCouponHero('');
    } finally { setHeroBusy(false); }
  }

  // 會員中心右上角的會員印章圖片:上傳後存進 site_settings.member_stamp_image
  async function uploadMemberStamp(file: File) {
    setStampBusy(true);
    try {
      const prepared = await prepareProductImage(file, 0);
      const fd = new FormData();
      fd.append('file', prepared.blob, prepared.filename);
      fd.append('folder', 'member');
      fd.append('productId', 'stamp');
      const up = await fetch('/api/products/image', { method: 'POST', body: fd });
      const data = await up.json().catch(() => null);
      if (!up.ok || !data?.image_url) return void uiAlert(data?.error ?? '上傳失敗');
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_stamp_image: data.image_url }),
      });
      if (!res.ok) return void uiAlert((await res.json()).error ?? '儲存失敗');
      setMemberStamp(data.image_url);
    } catch (error) {
      void uiAlert(error instanceof Error ? error.message : '上傳失敗');
    } finally { setStampBusy(false); }
  }

  async function clearMemberStamp() {
    setStampBusy(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_stamp_image: '' }),
      });
      if (!res.ok) return void uiAlert((await res.json()).error ?? '移除失敗');
      setMemberStamp('');
    } finally { setStampBusy(false); }
  }

  async function uploadFavicon(file: File) {
    setFaviconBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/settings/favicon', { method: 'POST', body: fd });
      const data = await res.json().catch(() => null);
      if (!res.ok) return void uiAlert(data?.error ?? '上傳失敗');
      setFaviconUrl(data.favicon_url);
      uiToast('已更新網頁頁籤圖示');
    } catch {
      void uiAlert('上傳發生問題');
    } finally {
      setFaviconBusy(false);
    }
  }

  async function clearFavicon() {
    setFaviconBusy(true);
    try {
      const res = await fetch('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ favicon_url: '' }) });
      if (!res.ok) return void uiAlert((await res.json().catch(() => null))?.error ?? '移除失敗');
      setFaviconUrl('');
    } finally {
      setFaviconBusy(false);
    }
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
          body: JSON.stringify({ image: upData.image_url, title, group_no: bannerGroup, sort_order: banners.filter((b) => (b.group_no ?? 1) === bannerGroup).length }),
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

  async function saveBannerRatio(group: number, ratio: BannerRatio) {
    setSavingBannerRatio(true);
    try {
      const res = await fetch('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ banner_ratio: { group, ratio } }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '顯示比例儲存失敗');
      setSiteTheme(data.site_theme);
    } catch (error) {
      void uiAlert(error instanceof Error ? error.message : '顯示比例儲存失敗');
    } finally { setSavingBannerRatio(false); }
  }

  function moveBanner(group: number, index: number, delta: number) {
    const list = banners.filter((b) => (b.group_no ?? 1) === group);
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    const next = [...list];
    [next[index], next[target]] = [next[target], next[index]];
    next.forEach((b, i) => { if (b.sort_order !== i) void updateBanner(b.id, { sort_order: i }); });
    const order = new Map(next.map((b, i) => [b.id, i]));
    setBanners((l) => l.map((b) => (order.has(b.id) ? { ...b, sort_order: order.get(b.id)! } : b)).sort((a, b) => a.sort_order - b.sort_order));
  }

  async function deleteBanner(id: string) {
    if (!await uiConfirm('確定要刪除這張輪播圖嗎?')) return;
    const res = await fetch(`/api/banners/${id}`, { method: 'DELETE' });
    if (res.ok) setBanners((l) => l.filter((b) => b.id !== id));
    else void uiAlert('刪除失敗');
  }

  async function saveFooterSettings(override?: typeof footerDraft) {
    const d = override ?? footerDraft;
    setSavingSettings(true);
    try {
      const toLines = (value: string) =>
        value
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);
      const footerSections = withPolicies(
        mergeFooterSocialLinksIntoSections(JSON.parse(d.sections || '[]'), JSON.parse(d.socialLinks || '[]')),
        { privacy: d.privacy, terms: d.terms },
      );
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          footer_about_links: toLines(d.about),
          footer_service_links: toLines(d.service),
          footer_service_hours: d.serviceHours.trim(),
          footer_email: d.email.trim(),
          footer_company_name: d.companyName.trim(),
          footer_tax_id: d.taxId.trim(),
          footer_instagram_url: d.instagramUrl.trim(),
          footer_line_url: d.lineUrl.trim(),
          footer_sections: withNewsletter(
            withCheckoutLine(footerSections, { id: d.checkoutLineId, url: d.checkoutLineUrl }),
            { show: d.newsletterShow, title: d.newsletterTitle, text: d.newsletterText },
          ),
          // 金流/物流各自在「金流設定」「物流設定」儲存,頁尾不要覆蓋
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
    // 套用全部方式 = 不限制,之後新增的方式也會自動可用
    const all = field === 'available_payment_methods' ? enabledPaymentMethods : enabledShippingMethods;
    if (!methods.includes('免運') && all.length > 0 && all.every((m) => methods.includes(m))) methods = [];
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

  const activeNav = nav.find((n) => n.key === section) ?? nav[0];

  return (
    <div className="admin-root min-h-screen bg-[#f6f2ec] text-[#1f1b19]">
      <header className="page-header sticky top-0 z-30 border-b border-[#e5ded4] bg-[#faf7f2]">
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
              <span className="font-serif text-2xl italic tracking-wide sm:text-3xl">{shopName}</span>
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
          {/* 選單項目比畫面高時可以在選單內捲動(手機) */}
          <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain p-3">
            {nav.map((n) => (
              <button
                key={n.key}
                onClick={() => {
                  changeSection(n.key);
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
            <div className="space-y-5">
              <section>
                <p className="text-[11px] font-semibold uppercase tracking-[0.38em] text-[#8a7f72]">Store Overview</p>
                <h2 className="font-serif-tc mt-2 text-3xl font-bold tracking-[0.06em] text-[#1f1b19]">營運總覽</h2>
                <p className="mt-1 text-sm font-medium text-[#6f665d]">商店大小事，一目了然。</p>
              </section>

              <section className="overflow-hidden rounded-xl bg-[#7d1f34] bg-[linear-gradient(135deg,rgba(255,255,255,0.12),transparent_34%),linear-gradient(90deg,#6f1b2d,#8f243c_58%,#64192a)] p-6 text-white shadow-[0_14px_34px_rgba(86,31,41,0.18)]">
                <div className="flex items-start gap-3">
                  <h3 className="text-xl font-bold tracking-[0.08em]">總營收</h3>
                  <span className="mt-1 text-sm text-white/70">累計</span>
                </div>
                <p className="font-serif-tc mt-5 text-[44px] font-semibold leading-none tracking-normal sm:text-[58px]">
                  {formatOverviewCurrency(report.totalRevenue)}
                </p>
                <div className="mt-7 grid grid-cols-3 border-t border-white/55 pt-4">
                  <div className="min-w-0">
                    <p className="text-xs text-white/70 sm:text-sm">今日營收</p>
                    <p className="font-serif-tc mt-1 break-all text-lg font-semibold sm:text-2xl">{formatOverviewCurrency(todayRevenue)}</p>
                  </div>
                  <div className="min-w-0 border-l border-white/45 pl-3 sm:pl-4">
                    <p className="text-xs text-white/70 sm:text-sm">代收款(運費)</p>
                    <p className="font-serif-tc mt-1 break-all text-lg font-semibold sm:text-2xl">{formatOverviewCurrency(report.shippingIncome)}</p>
                  </div>
                  <div className="min-w-0 border-l border-white/45 pl-3 sm:pl-4">
                    <p className="text-xs text-white/70 sm:text-sm">總訂單</p>
                    <p className="font-serif-tc mt-1 break-all text-lg font-semibold sm:text-2xl">{orders.length}</p>
                  </div>
                </div>
              </section>

              <div className="grid grid-cols-2 gap-3">
                <OverviewActionCard
                  tone="plain"
                  icon={<IconBox />}
                  title="待出貨訂單"
                  value={String(pendingCount)}
                  caption=""
                  action="處理訂單"
                  onClick={() => {
                    setOrderFilter('待出貨');
                    setOrderPaidFilter('全部');
                    setOrderSearch('');
                    changeSection('orders');
                  }}
                />
                <OverviewActionCard
                  tone="soft"
                  icon={<IconBox />}
                  title="低庫存"
                  value={String(lowStock)}
                  caption="庫存 ≤ 10"
                  action="查看"
                  onClick={() => changeSection('inventory')}
                />
              </div>

              <section className="grid grid-cols-3 rounded-xl border border-[#e5ded4] bg-white py-4 shadow-sm">
                <OverviewMiniStat label="商品" value={products.length} />
                <OverviewMiniStat label="會員" value={customers.length} bordered />
                <OverviewMiniStat label="折扣碼" value={activeDiscountCount} bordered />
              </section>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setProductsTab('items');
                    changeSection('products');
                    setEditing(blankDraft(null, products));
                    setIsNew(true);
                  }}
                  className="inline-flex h-14 items-center justify-center gap-3 rounded-xl bg-[#7d1f34] px-4 text-sm font-bold tracking-[0.08em] text-white shadow-[0_8px_20px_rgba(125,31,52,0.18)]"
                >
                  <span className="text-2xl leading-none">＋</span>
                  新增商品
                </button>
                <button
                  type="button"
                  onClick={() => changeSection('promotions')}
                  className="inline-flex h-14 items-center justify-center gap-2 rounded-xl border border-[#8f6f76] bg-white px-4 text-sm font-bold tracking-[0.08em] text-[#7d1f34]"
                >
                  管理優惠券 <span aria-hidden>↗</span>
                </button>
              </div>

              <section className="space-y-3">
                <div className="flex items-end justify-between gap-3">
                  <h3 className="font-serif-tc text-2xl font-bold tracking-[0.08em]">最近訂單</h3>
                  <button
                    type="button"
                    onClick={() => {
                      setOrderFilter('全部');
                      setOrderPaidFilter('全部');
                      setOrderSearch('');
                      changeSection('orders');
                    }}
                    className="inline-flex items-center gap-1 text-sm font-bold text-[#7d1f34]"
                  >
                    查看全部 <span aria-hidden>→</span>
                  </button>
                </div>

                <div className="flex h-12 items-center gap-2 rounded-xl border border-[#e5ded4] bg-white px-4 shadow-sm">
                  <IconSearchCompact />
                  <input
                    value={overviewOrderSearch}
                    onChange={(e) => setOverviewOrderSearch(e.target.value)}
                    placeholder="搜尋訂單編號或會員"
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#a99e8f]"
                  />
                </div>

                <div className="grid grid-cols-4 border-b border-[#ded5c8]">
                  {(['全部', '待出貨', '尚未付款', '已完成'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setOverviewOrderFilter(s)}
                      className={`-mb-px border-b-2 px-2 py-3 text-sm font-semibold transition ${
                        overviewOrderFilter === s ? 'border-[#7d1f34] text-[#7d1f34]' : 'border-transparent text-[#8a7f72]'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>

                {overviewRecentOrders.length === 0 ? (
                  <Empty>沒有符合條件的訂單。</Empty>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-[#e5ded4] bg-white shadow-sm">
                    {overviewRecentOrders.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => setOpenOrderId(o.id)}
                        className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-b border-[#efe8dd] px-4 py-3 text-left last:border-b-0 hover:bg-[#fbf8f3]"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold tracking-[0.04em] text-[#1f1b19]">{o.order_no}</span>
                          <span className="mt-0.5 block truncate text-xs text-[#8a7f72]">{o.customer_name || o.email}</span>
                        </span>
                        <AdminOverviewStatus status={o.status} />
                        <span className="flex items-center gap-2 whitespace-nowrap text-sm font-bold text-[#1f1b19]">
                          {formatOverviewCurrency(o.total)}
                          <IconChevronRight />
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* ===== 訂單管理 ===== */}
          {section === 'orders' && (
           <div className="space-y-4">
            {/* 搜尋 + 篩選(獨立在最上方) */}
            <div className="flex flex-wrap gap-2">
              <input
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                placeholder="搜尋:單號 / 姓名 / Email / 手機 / 商品 / SKU"
                className="min-w-[200px] flex-1 rounded-lg border border-[#d7c9bd] bg-white px-3 py-2.5 text-sm"
              />
              <select
                value={orderPaidFilter}
                onChange={(e) => setOrderPaidFilter(e.target.value as '全部' | '已付款' | '未付款')}
                className="rounded-lg border border-[#d7c9bd] bg-white px-3 py-2.5 text-sm"
              >
                <option value="全部">付款:全部</option>
                <option value="已付款">已付款</option>
                <option value="未付款">未付款</option>
              </select>
            </div>

            <section className="rounded-xl border border-[#e5ded4] bg-white p-5">
              {/* 狀態分類(底線式,可左右滑動) */}
              <div className="mb-4 -mx-4 overflow-x-auto overflow-y-hidden border-b border-[#e5ded4] px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="flex min-w-max gap-6">
                  {ORDER_TAB_KEYS.map((s) => {
                    const tabOrders = orders.filter((o) => orderMatchesTab(o, s));
                    const n = tabOrders.length;
                    const attention = s === CANCEL_REVIEW_TAB
                      ? n > 0
                      : s === '尚未付款'
                        ? tabOrders.some(isPaymentReported)
                        : tabOrders.some((o) => orderNeedsAttention(o, 'admin'));
                    const active = orderFilter === s;
                    return (
                      <button
                        key={s}
                        onClick={() => setOrderFilter(s)}
                        className={`relative -mb-px shrink-0 border-b-2 pb-2 pt-1 text-center transition ${active ? 'border-[#1f1b19]' : 'border-transparent'}`}
                      >
                        {attention ? <AttentionDot className="absolute right-0 top-0" /> : null}
                        <span className={`block whitespace-nowrap text-sm font-semibold ${active ? 'text-[#1f1b19]' : 'text-[#8a7f72]'}`}>{s}</span>
                        <span className={`block text-sm ${active ? 'font-semibold text-[#1f1b19]' : 'text-[#a99e8f]'}`}>{n}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {(() => {
                const q = orderSearch.trim().toLowerCase();
                const shown = orders.filter((o) => {
                  if (!orderMatchesTab(o, orderFilter)) return false;
                  if (orderPaidFilter === '已付款' && !o.paid) return false;
                  if (orderPaidFilter === '未付款' && o.paid) return false;
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
                  <div className="space-y-4">
                    {shown.map((order) => {
                      const dateShort = order.created_at ? new Date(order.created_at).toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
                      return (
                        <div key={order.id} className="rounded-2xl border border-[#eee5da] bg-white p-4 shadow-sm sm:p-5">
                          {/* 標題列 */}
                          <button onClick={() => setOpenOrderId(order.id)} className="flex w-full items-start justify-between gap-3 text-left">
                            <div className="min-w-0">
                              <p className="flex items-center gap-1.5 text-lg font-bold">
                                {orderNeedsAttention(order, 'admin') ? <AttentionDot /> : null}
                                {order.order_no}
                              </p>
                              <p className="mt-0.5 text-xs text-[#8a7f72]">{dateShort}</p>
                            </div>
                            <span className="mt-1 inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold text-[#8a7f72]">
                              查看完整訂單
                              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                            </span>
                          </button>

                          {/* 狀態徽章 */}
                          <div className="mt-3">
                            <OrderCardBadges order={order} />
                          </div>

                          {(order.store_id || order.shipment_provider || order.shipment_code) ? (
                            <div className="mt-3 grid gap-1 rounded-lg bg-[#faf7f2] px-3 py-2 text-xs text-[#6b6156] sm:grid-cols-2">
                              <p><span className="text-[#a99e8f]">超商／物流：</span>{order.shipment_provider || order.shipping_method || '-'}</p>
                              <p><span className="text-[#a99e8f]">取貨門市：</span>{order.shipment_store_name || order.store_name || '-'}{(order.shipment_store_id || order.store_id) ? `（${order.shipment_store_id || order.store_id}）` : ''}</p>
                              {order.shipment_code ? <p className="font-semibold text-[#1f1b19] sm:col-span-2"><span className="font-normal text-[#a99e8f]">寄件代碼：</span>{order.shipment_code}</p> : null}
                            </div>
                          ) : null}

                          {/* 商品列 */}
                          <div className="mt-3 space-y-2 border-t border-[#f1ebe1] pt-3">
                            {order.items.map((it, i) => (
                              <div key={i} className="flex items-center gap-3">
                                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-[#eee5da] bg-[#e9e1d6]">
                                  {it.image || imageByName.get(it.name) ? (
                                    <img src={it.image || imageByName.get(it.name)} alt={it.name} className="h-full w-full object-cover" />
                                  ) : null}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-medium">{it.name}</p>
                                  <p className="text-xs text-[#8a7f72]">{it.variant} × {it.quantity}</p>
                                </div>
                                <span className="shrink-0 text-sm font-semibold">{formatter.format(it.price * it.quantity)}</span>
                              </div>
                            ))}
                          </div>

                          {/* 金額 */}
                          <div className="mt-3 space-y-1 border-t border-[#f1ebe1] pt-3 text-sm">
                            <div className="flex justify-between text-[#8a7f72]"><span>商品金額</span><span>{formatter.format(order.subtotal)}</span></div>
                            <div className="flex justify-between text-[#8a7f72]"><span>運費</span><span>{order.shipping === 0 ? '免運' : formatter.format(order.shipping)}</span></div>
                            {order.discount > 0 ? <div className="flex justify-between text-[#8a7f72]"><span>折扣 {order.discount_code || ''}</span><span>-{formatter.format(order.discount)}</span></div> : null}
                            <div className="flex justify-between pt-1 text-base font-bold"><span>訂單合計</span><span>{formatter.format(order.total)}</span></div>
                          </div>

                          {order.note ? (
                            <p className="mt-3 line-clamp-1 rounded-lg bg-[#faf6ee] px-3 py-1.5 text-sm text-[#6b6156]">備註:{order.note}</p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </section>
           </div>
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
                      setEditing(blankDraft(null, products));
                      setIsNew(true);
                    }}
                    className="rounded-full bg-[#1f1b19] px-3 py-2 text-sm font-semibold text-white"
                  >
                    新增商品
                  </button>
                }
              >
                {/* 商品分類標籤:上架中 / 未上架 / 已售完(純現貨售完自動歸到已售完,補貨後自動回到上架中) */}
                <div className="mb-4 flex gap-2 overflow-x-auto overflow-y-hidden">
                  {ADMIN_PRODUCT_TABS.map((tab) => {
                    const count = products.filter((product) => !product.campaign_id && adminProductTab(product) === tab).length;
                    return (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setProductListTab(tab)}
                        className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
                          productListTab === tab
                            ? 'border-[#1f1b19] bg-[#1f1b19] text-white'
                            : 'border-[#e5ded4] bg-white text-[#6b6156] hover:border-[#1f1b19]'
                        }`}
                      >
                        {tab}（{count}）
                      </button>
                    );
                  })}
                </div>
                <div className="space-y-3">
                  {products.filter((product) => !product.campaign_id && adminProductTab(product) === productListTab).length === 0 && (
                    <p className="py-8 text-center text-sm text-[#a99e8f]">沒有{productListTab}的商品。</p>
                  )}
                  {products.filter((product) => !product.campaign_id && adminProductTab(product) === productListTab).map((product) => (
                    <div
                      key={product.id}
                      className="flex items-center gap-4 rounded-lg border border-[#e5ded4] p-3"
                    >
                      {/* 點縮圖開啟前台商品頁 */}
                      <a href={`/products/${encodeURIComponent(product.id)}`} target="_blank" rel="noopener noreferrer" title="查看商品頁" className="shrink-0">
                        {product.image ? (
                          <img className="h-14 w-14 rounded-md object-cover" src={product.image} alt="" />
                        ) : (
                          <div className="h-14 w-14 rounded-md bg-[#f1e3dc]" />
                        )}
                      </a>
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
                          {formatProductPrice(product, formatter.format)} · 庫存 {product.inventory} · {product.status}
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
                <p className="mb-4 text-xs text-[#8a7f72]">
                  點分類左邊的圖片框可以上傳分類圖片;顯示成圓形、方形或去背 PNG,到「系統設定 → 模板設定 → 分類樣式」切換。
                  {categoryImageStyle === 'cutout' ? ' 目前是去背 PNG,請上傳透明背景的 PNG。' : ' 建議上傳正方形照片(600×600 以上)。'}
                </p>
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
                                <div className="flex shrink-0 flex-col items-center gap-1">
                                  <label title="上傳分類圖片(首頁分類導覽顯示)" className={`relative flex h-14 w-14 cursor-pointer items-center justify-center overflow-hidden ring-1 ring-[#e5ded4] hover:ring-[#1f1b19]/40 ${categoryImageStyle === 'circle' ? 'rounded-full bg-[#f1f1f1]' : categoryImageStyle === 'square' ? 'rounded-xl bg-[#f1f1f1]' : 'rounded-xl bg-[repeating-conic-gradient(#f1f1f1_0%_25%,#ffffff_0%_50%)] bg-[length:12px_12px]'}`}>
                                    {c.image ? (
                                      <img src={c.image} alt="" className={`h-full w-full ${categoryImageStyle === 'cutout' ? 'object-contain p-1' : 'object-cover'}`} />
                                    ) : image ? (
                                      <img src={image} alt="" className="h-full w-full object-cover opacity-40" />
                                    ) : null}
                                    {!c.image ? <span className="absolute text-[10px] font-semibold text-[#6b6156]">{categoryUploading === c.id ? '上傳中' : '＋圖片'}</span> : null}
                                    <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={categoryUploading === c.id} onChange={(e) => { void uploadCategoryImage(c, e.target.files?.[0]); e.target.value = ''; }} />
                                  </label>
                                  {c.image ? <button type="button" onClick={() => patchCategory(c.id, { image: '' })} className="text-[10px] text-[#8a7f72]">移除</button> : null}
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
                        <h4 className="font-semibold">此分類商品</h4>
                        <p className="mb-3 mt-1 text-xs text-[#8a7f72]">長按商品(或按住左側 ⋮⋮)上下拖曳,前台依這個順序顯示。</p>
                        {selectedCategoryProducts.length === 0 ? (
                          <Empty>此分類目前沒有商品。</Empty>
                        ) : (
                          <div ref={categoryListRef} className="space-y-2">
                            {shownCategoryProducts.map((product) => (
                              <div
                                key={product.id}
                                data-sort-row
                                onPointerDown={(e) => startCategorySort(e, product.id)}
                                onContextMenu={(e) => e.preventDefault()}
                                className={`flex select-none items-center gap-3 rounded-lg border p-3 [-webkit-touch-callout:none] ${categorySorting === product.id ? 'border-[#1f1b19] bg-[#faf3ea] shadow-md' : 'border-[#e5ded4]'}`}
                              >
                                <span
                                  onPointerDown={(e) => { e.stopPropagation(); startCategorySort(e, product.id, true); }}
                                  className="cursor-grab touch-none px-1 text-[#b3a897]"
                                  aria-hidden="true"
                                >
                                  ⋮⋮
                                </span>
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
              onStocktakeApplied={(r) => {
                const byId = new Map(r.products.map((p) => [p.id, p]));
                setProducts((list) => list.map((p) => (byId.has(p.id) ? { ...p, ...byId.get(p.id)! } : p)));
                if (r.movements.length) setMovements((l) => [...r.movements, ...l]);
              }}
              onEditProduct={(product) => {
                setEditing(toDraft(product));
                setIsNew(false);
              }}
              onCreateProduct={() => {
                setEditing(blankDraft(null, products));
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
                                <p className="flex items-center gap-1.5 font-semibold">
                                  {c.name}
                                  {c.line ? <span title={`LINE:${c.line}`} className="rounded-full bg-[#e9f7ee] px-1.5 py-0.5 text-[10px] font-semibold text-[#1f7a44]">LINE 已綁定</span> : null}
                                </p>
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
              {/* 標題 */}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold tracking-[0.25em] text-[#b3a897]">MARKETING / OVERVIEW</p>
                  <h2 className="font-serif-tc mt-1 text-[26px] font-bold leading-tight">促銷管理</h2>
                  <p className="mt-1 text-sm text-[#8a7f72]">掌握優惠成效，管理每一次回購。</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#ded5c8] px-3.5 text-sm font-semibold text-[#6b6156]">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
                    本月
                  </span>
                  <button onClick={exportDiscounts} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#ded5c8] px-3.5 text-sm font-semibold text-[#6b6156] hover:bg-[#efe8dd]">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4M8 8l4-4 4 4M5 20h14" /></svg>
                    匯出
                  </button>
                </div>
              </div>

              {/* 分頁:優惠券管理 / 活動管理 */}
              <div className="flex gap-1 rounded-xl border border-[#e5ded4] bg-white p-1">
                {([['coupons', '優惠券管理'], ['activities', '活動管理']] as const).map(([k, label]) => (
                  <button key={k} type="button" onClick={() => setPromoTab(k)} className={`flex-1 rounded-lg px-4 py-2 text-sm ${promoTab === k ? 'bg-[#1f1b19] font-semibold text-white' : 'text-[#6b6156] hover:bg-[#f6f2ec]'}`}>{label}</button>
                ))}
              </div>
              {promoTab === 'activities' ? <PromoActivitiesManager /> : (<>
              {/* 營收卡 */}
              <div className="rounded-2xl bg-[#414a33] p-5 text-white sm:p-6">
                <p className="text-sm text-white/70">優惠券帶來營收</p>
                <p className="font-serif-tc mt-1 text-[34px] font-semibold leading-none">{formatter.format(couponStats.revenue)}</p>
                <div className="my-4 h-px bg-white/20" />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-white/70">優惠券折抵</p>
                    <p className="mt-1 text-xl font-bold leading-none">{formatter.format(couponStats.discountTotal)}</p>
                  </div>
                  <div className="border-l border-white/20 pl-4">
                    <p className="text-xs text-white/70">使用率</p>
                    <div className="mt-1 flex items-center gap-3">
                      <p className="text-xl font-bold leading-none">{couponStats.usageRate}%</p>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/20">
                        <span className="block h-full rounded-full bg-[#cddba9]" style={{ width: `${Math.min(100, couponStats.usageRate)}%` }} />
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 三欄統計 */}
              <div className="grid grid-cols-3 rounded-2xl bg-white py-4">
                {([['本月發放', couponStats.monthIssued], ['已領取', couponStats.claimed], ['已使用', couponStats.used]] as const).map(([label, n], i) => (
                  <div key={label} className={i > 0 ? 'border-l border-[#efe8dd] px-4 text-center' : 'px-4 text-center'}>
                    <p className="text-xs text-[#8a7f72]">{label}</p>
                    <p className="mt-1 text-xl font-bold leading-none">{n} 張</p>
                  </div>
                ))}
              </div>

              {/* 優惠券管理 */}
              <div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <h3 className="font-serif-tc text-xl font-bold">優惠券管理</h3>
                    <span className="rounded-full bg-[#eee7db] px-2.5 py-1 text-xs font-semibold text-[#8a7f72]">{String(discounts.length).padStart(2, '0')}</span>
                  </div>
                  <button
                    onClick={() => { setEditingCouponId(null); setNewDiscount(blankDiscountDraft()); setCouponModalOpen(true); }}
                    className="inline-flex h-10 items-center gap-1.5 rounded-full bg-[#414a33] px-5 text-sm font-semibold text-white hover:bg-[#39412c]"
                  >
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
                    新增優惠券
                  </button>
                </div>

                {/* 搜尋 */}
                <div className="mt-3 flex items-center gap-2">
                  <div className="relative flex-1">
                    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#a99e8f" strokeWidth="1.9" strokeLinecap="round" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
                    <input
                      value={discountQuery}
                      onChange={(e) => setDiscountQuery(e.target.value)}
                      placeholder="搜尋優惠碼或名稱"
                      className="h-11 w-full rounded-full border border-[#e5ded4] bg-white pl-10 pr-4 text-sm"
                    />
                  </div>
                  <select
                    value={discountStatus}
                    onChange={(e) => setDiscountStatus(e.target.value)}
                    aria-label="狀態篩選"
                    className="h-11 rounded-full border border-[#e5ded4] bg-white px-3.5 text-sm"
                  >
                    {['全部', '草稿', '啟用', '停用', '已結束'].map((status) => <option key={status}>{status}</option>)}
                  </select>
                </div>

                {/* 狀態分頁 */}
                <div className="mt-3 -mx-1 overflow-x-auto overflow-y-hidden border-b border-[#e5ded4] px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <div className="flex min-w-max gap-6">
                    {([['全部', '全部'], ['啟用', '啟用中'], ['草稿', '草稿'], ['停用', '已停用']] as const).map(([value, label]) => {
                      const n = value === '全部'
                        ? discounts.length
                        : discounts.filter((x) => (x.status ?? (x.active ? '啟用' : '停用')) === value).length;
                      const active = discountStatus === value;
                      return (
                        <button
                          key={value}
                          onClick={() => setDiscountStatus(value)}
                          className={`-mb-px shrink-0 border-b-2 pb-2 pt-1 text-sm font-semibold transition ${active ? 'border-[#414a33] text-[#2c2826]' : 'border-transparent text-[#8a7f72]'}`}
                        >
                          {label} <span className={active ? 'text-[#414a33]' : 'text-[#a99e8f]'}>{n}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 優惠券卡片 */}
                {filteredDiscounts.length === 0 ? (
                  <div className="mt-5"><Empty>沒有符合條件的優惠券。</Empty></div>
                ) : (
                  <div className="mt-5 space-y-2">
                    {filteredDiscounts.map((d) => {
                      const usage = couponUsages.filter((item) => item.coupon_id === d.id);
                      const claimed = userCoupons.filter((item) => item.coupon_id === d.id).length;
                      const status = d.status ?? (d.active ? '啟用' : '停用');
                      const statusTone = status === '啟用' ? 'bg-[#e6ecdb] text-[#414a33]'
                        : status === '停用' ? 'bg-[#fbe9e7] text-[#c0392b]'
                        : 'bg-[#efe9e0] text-[#8a7f72]';
                      const statusLabel = status === '啟用' ? '啟用中' : status === '停用' ? '已停用' : status;
                      return (
                        <div key={d.id} className="rounded-2xl bg-white p-3">
                          <div className="flex items-start justify-between gap-3">
                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusTone}`}>{statusLabel}</span>
                            <div className="relative">
                              <button onClick={() => setCouponMenuId(couponMenuId === d.id ? null : d.id)} aria-label="更多操作" className="rounded-full p-1 text-[#8a7f72] hover:bg-[#f3ede4]">
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
                              </button>
                              {couponMenuId === d.id ? (
                                <>
                                  <button aria-hidden tabIndex={-1} onClick={() => setCouponMenuId(null)} className="fixed inset-0 z-[64] cursor-default" />
                                  <div className="absolute right-0 top-full z-[65] mt-1 w-28 overflow-hidden rounded-lg border border-[#e5ded4] bg-white shadow-lg">
                                    <button onClick={() => { setCouponMenuId(null); copyDiscount(d); }} className="block w-full px-3.5 py-2 text-left text-sm hover:bg-[#f6f2ec]">複製</button>
                                    <button onClick={() => { setCouponMenuId(null); deleteDiscount(d.id); }} className="block w-full px-3.5 py-2 text-left text-sm text-[#c0392b] hover:bg-[#fbf3f0]">刪除</button>
                                  </div>
                                </>
                              ) : null}
                            </div>
                          </div>

                          <div className="mt-1.5 flex items-start gap-4">
                            <div className="min-w-0 flex-1">
                              <p className="text-base font-bold">{d.name || couponText(d)}</p>
                              <span className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-[#f4f0e8] px-2.5 py-1">
                                <span className="font-mono text-sm">{d.code}</span>
                                <button
                                  onClick={() => { navigator.clipboard?.writeText(d.code); }}
                                  aria-label="複製優惠碼"
                                  className="text-[#a99e8f] hover:text-[#6b6156]"
                                >
                                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
                                </button>
                              </span>
                              <p className="mt-1 text-sm text-[#8a7f72]">
                                {d.min_spend ? `滿 ${formatter.format(d.min_spend)}，` : ''}
                                {d.type === 'free_shipping' ? '免運' : d.type === 'percent' ? `${d.value}% 折扣` : `折抵 ${formatter.format(d.value)}`}
                                {d.max_discount ? `，最高折抵 ${formatter.format(d.max_discount)}` : ''}
                              </p>
                            </div>
                            <div className="shrink-0 rounded-xl bg-[#eef1e6] px-3 py-2 text-center text-[#414a33]">
                              {d.type === 'free_shipping' ? (
                                <p className="font-serif-tc text-xl font-semibold">免運</p>
                              ) : d.type === 'percent' ? (
                                <p className="font-serif-tc text-2xl font-semibold leading-none">{d.value}%<span className="ml-1 text-xs font-sans">OFF</span></p>
                              ) : (
                                <p className="font-serif-tc text-2xl font-semibold leading-none"><span className="mr-1 text-xs font-sans">NT$</span>{d.value}<span className="ml-1 text-xs font-sans">OFF</span></p>
                              )}
                            </div>
                          </div>

                          <div className="mt-2 flex flex-nowrap items-center justify-between gap-2 border-t border-[#f0ebe2] pt-2">
                            <div className="min-w-0 flex-1 space-y-0.5 text-[clamp(9px,2.3vw,14px)] text-[#6b6156]">
                              <p className="flex items-center gap-1 overflow-hidden text-ellipsis whitespace-nowrap">
                                <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="#a99e8f" strokeWidth="1.7" className="shrink-0" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.5-6 8-6s8 2 8 6" strokeLinecap="round" /></svg>
                                {d.applicable_users === 'new' || d.is_first_purchase_only ? '新會員首購' : d.applicable_users === 'vip' ? 'VIP 會員' : '全部會員'}・每人限用 {d.per_user_limit ?? 1} 次
                              </p>
                              <p className="flex items-center gap-1 overflow-hidden text-ellipsis whitespace-nowrap">
                                <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="#a99e8f" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true"><path d="M12 3l9 4-9 4-9-4 9-4zM3 12l9 4 9-4M3 17l9 4 9-4" /></svg>
                                {d.total_limit ? `發放上限 ${d.total_limit.toLocaleString()} 張` : '發放數量不限'}・{d.end_at ? `到 ${new Date(d.end_at).toLocaleDateString('zh-TW')}` : '無期限'}
                              </p>
                            </div>
                            <div className="shrink-0 whitespace-nowrap text-[clamp(9px,2.3vw,14px)] text-[#6b6156]">
                              <p>已領取 {claimed}</p>
                              <p>已使用 {usage.length}</p>
                            </div>
                            <div className="flex shrink-0 gap-1.5">
                              <button onClick={() => openEditCoupon(d)} className="inline-flex h-7 items-center whitespace-nowrap rounded-full border border-[#ded5c8] px-3 text-[clamp(9px,2.3vw,14px)] font-semibold text-[#6b6156] hover:bg-[#efe8dd]">編輯</button>
                              <button onClick={() => toggleDiscount(d.id, !d.active)} className="inline-flex h-7 items-center whitespace-nowrap rounded-full bg-[#414a33] px-3 text-[clamp(9px,2.3vw,14px)] font-semibold text-white hover:bg-[#39412c]">
                                {d.active ? '暫停' : '啟用'}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              {couponModalOpen && (
              <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={() => { setCouponModalOpen(false); setEditingCouponId(null); }}>
              <div className="flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex shrink-0 items-center justify-between border-b border-[#e5ded4] px-5 py-4">
                  <h2 className="text-lg font-semibold">{editingCouponId ? '編輯優惠券' : '新增優惠券'}</h2>
                  <button onClick={() => { setCouponModalOpen(false); setEditingCouponId(null); }} aria-label="關閉" className="rounded-md p-1 text-2xl leading-none hover:bg-[#efe8dd]">×</button>
                </div>
                <div className="flex-1 overflow-y-auto overscroll-contain p-5">
                <div className="grid gap-4 md:grid-cols-3">
                  <Labeled label="優惠券名稱"><input value={newDiscount.name} onChange={(e) => setNewDiscount({ ...newDiscount, name: e.target.value })} className="w-full rounded border border-[#e5ded4] px-3 py-2" /></Labeled>
                  <Labeled label="優惠碼"><input value={newDiscount.code} onChange={(e) => setNewDiscount({ ...newDiscount, code: e.target.value })} className="w-full rounded border border-[#e5ded4] px-3 py-2" /></Labeled>
                  <Labeled label="狀態"><select value={newDiscount.status} onChange={(e) => setNewDiscount({ ...newDiscount, status: e.target.value as DiscountDraft['status'] })} className="w-full rounded border border-[#e5ded4] px-3 py-2">{['草稿', '啟用', '停用', '已結束'].map((s) => <option key={s}>{s}</option>)}</select></Labeled>
                  <Labeled label="優惠類型"><select value={newDiscount.type} onChange={(e) => setNewDiscount({ ...newDiscount, type: e.target.value as DiscountDraft['type'] })} className="w-full rounded border border-[#e5ded4] px-3 py-2"><option value="percent">百分比</option><option value="amount">固定金額</option><option value="free_shipping">免運</option></select></Labeled>
                  <Labeled label="折扣值"><NumberInput value={newDiscount.value} onChange={(e) => setNewDiscount({ ...newDiscount, value: Number(e.target.value) })} disabled={newDiscount.type === 'free_shipping'} className="w-full rounded border border-[#e5ded4] px-3 py-2 disabled:bg-[#f6f2ec]" /></Labeled>
                  <Labeled label="最低消費"><NumberInput value={newDiscount.min_spend} onChange={(e) => setNewDiscount({ ...newDiscount, min_spend: Number(e.target.value) })} className="w-full rounded border border-[#e5ded4] px-3 py-2" /></Labeled>
                  <Labeled label="最高折抵"><NumberInput value={newDiscount.max_discount} onChange={(e) => setNewDiscount({ ...newDiscount, max_discount: Number(e.target.value) })} className="w-full rounded border border-[#e5ded4] px-3 py-2" /></Labeled>
                  <Labeled label="開始時間"><input type="datetime-local" value={newDiscount.start_at} onChange={(e) => setNewDiscount({ ...newDiscount, start_at: e.target.value })} className="w-full rounded border border-[#e5ded4] px-3 py-2" /></Labeled>
                  <Labeled label="結束時間"><input type="datetime-local" value={newDiscount.end_at} onChange={(e) => setNewDiscount({ ...newDiscount, end_at: e.target.value })} className="w-full rounded border border-[#e5ded4] px-3 py-2" /></Labeled>
                  <Labeled label="發放 / 使用上限"><NumberInput value={newDiscount.total_limit} onChange={(e) => setNewDiscount({ ...newDiscount, total_limit: Number(e.target.value) })} className="w-full rounded border border-[#e5ded4] px-3 py-2" /></Labeled>
                  <Labeled label="每會員限用"><NumberInput value={newDiscount.per_user_limit} onChange={(e) => setNewDiscount({ ...newDiscount, per_user_limit: Number(e.target.value) })} className="w-full rounded border border-[#e5ded4] px-3 py-2" /></Labeled>
                  <Labeled label="適用會員"><select value={newDiscount.applicable_users} onChange={(e) => setNewDiscount({ ...newDiscount, applicable_users: e.target.value as DiscountDraft['applicable_users'] })} className="w-full rounded border border-[#e5ded4] px-3 py-2"><option value="all">全部</option><option value="new">新會員</option><option value="vip">VIP</option></select></Labeled>
                  <Labeled label="適用商品代碼"><textarea value={newDiscount.applicable_products} onChange={(e) => setNewDiscount({ ...newDiscount, applicable_products: e.target.value })} rows={3} placeholder="一行一個商品代碼,空白代表全站" className="w-full rounded border border-[#e5ded4] px-3 py-2" /></Labeled>
                  <Labeled label="適用分類代碼"><textarea value={newDiscount.applicable_categories} onChange={(e) => setNewDiscount({ ...newDiscount, applicable_categories: e.target.value })} rows={3} placeholder="一行一個分類 slug,空白代表全站" className="w-full rounded border border-[#e5ded4] px-3 py-2" /></Labeled>
                  <div className="flex flex-col justify-end gap-3 text-sm font-semibold">
                    <label className="flex items-center gap-2"><input type="checkbox" checked={newDiscount.is_first_purchase_only} onChange={(e) => setNewDiscount({ ...newDiscount, is_first_purchase_only: e.target.checked })} /> 新會員首購限定</label>
                    <label className="flex items-center gap-2"><input type="checkbox" checked={newDiscount.stackable} onChange={(e) => setNewDiscount({ ...newDiscount, stackable: e.target.checked })} /> 可與其他優惠併用</label>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="mb-2 text-sm font-medium text-[#6b6156]">券樣式圖(顯示在客人優惠券左側)</p>
                    <div className="flex flex-wrap items-center gap-2">
                      {COUPON_PRESETS.map((p) => (
                        <button
                          key={p.key}
                          type="button"
                          onClick={() => setNewDiscount({ ...newDiscount, image: p.key })}
                          title={p.label}
                          className={`h-10 w-12 rounded-lg border-2 transition ${newDiscount.image === p.key ? 'border-[#1f1b19]' : 'border-[#e5ded4] hover:border-[#c9b8a8]'}`}
                          style={{ backgroundColor: p.color }}
                        />
                      ))}
                      <label className={`flex h-10 cursor-pointer items-center gap-1 rounded-lg border border-dashed border-[#d7c9bd] px-3 text-xs font-semibold text-[#6b6156] hover:bg-[#efe8dd] ${couponImgBusy ? 'opacity-50' : ''}`}>
                        {couponImgBusy ? '上傳中…' : '＋ 上傳照片'}
                        <input type="file" accept="image/*" className="hidden" disabled={couponImgBusy} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadCouponImage(f); e.target.value = ''; }} />
                      </label>
                    </div>
                    {/^https?:\/\//.test(newDiscount.image) ? (
                      <div className="mt-3 flex items-center gap-2">
                        <span className="h-10 w-16 rounded-lg border border-[#e5ded4] bg-cover bg-center" style={{ backgroundImage: `url("${newDiscount.image}")` }} />
                        <span className="text-xs font-semibold text-[#1f7a44]">已選用照片</span>
                        <button type="button" onClick={() => setNewDiscount({ ...newDiscount, image: 'preset-1' })} className="text-xs text-[#c0392b] underline">移除</button>
                      </div>
                    ) : null}
                  </div>
                </div>
                </div>
                <div className="flex shrink-0 justify-end gap-2 border-t border-[#e5ded4] px-5 py-4">
                  <button onClick={() => { setCouponModalOpen(false); setEditingCouponId(null); }} className="rounded-full border border-[#d7c9bd] px-5 py-2.5 text-sm font-semibold text-[#6b6156] hover:bg-[#efe8dd]">取消</button>
                  <button onClick={() => { addDiscount(); }} className="rounded-full bg-[#414a33] px-5 py-2.5 text-sm font-semibold text-white">{editingCouponId ? '儲存變更' : '新增優惠券'}</button>
                </div>
              </div>
              </div>
              )}
              </>)}
            </div>
          )}

          {/* ===== 報表及分析 ===== */}
          {section === 'line-bot' && <LineBotManager products={products} coupons={discounts} logoUrl={logoUrl} platform={platform} campaigns={initialCampaigns} />}
          {section === 'loyalty' && <LoyaltyManager />}
          {section === 'card-members' && <CardMembersManager />}
          {section === 'shops' && platform && <ShopsManager />}
          {section === 'profile-card' && (platform
            ? <ProfileCardManager products={products} lineUrl={lineAddFriendUrl(getCheckoutLine(initialSettings))} />
            // 店家:編輯登入者自己的名片;名片網址在主站,商品區塊只限主站商店
            : <ProfileCardManager products={[]} baseUrl={PRIMARY_SITE_URL} upgradeHref={`${PRIMARY_SITE_URL}/mycard/upgrade`} />)}

          {section === 'campaign-pages' && (
            <CampaignManager
              initialCampaigns={initialCampaigns}
              products={products.filter((product) => product.campaign_id)}
              onNewProduct={(campaignId) => {
                setEditing(blankDraft(campaignId, products));
                setIsNew(true);
              }}
              onEditProduct={(product) => {
                setEditing(toDraft(product));
                setIsNew(false);
              }}
              onDeleteProduct={deleteProduct}
              onCampaignDeleted={(campaignId) => { setProducts((list) => list.filter((product) => product.campaign_id !== campaignId)); setCampaignCategories((list) => list.filter((c) => c.campaign_id !== campaignId)); }}
              categories={campaignCategories}
              onCategoriesChange={setCampaignCategories}
              onProductChange={(updated) => setProducts((list) => list.map((p) => (p.id === updated.id ? updated : p)))}
              onReorder={(ordered) => setProducts((list) => list.map((p) => { const i = ordered.findIndex((o) => o.id === p.id); return i >= 0 ? { ...p, sort_order: i } : p; }))}
            />
          )}

          {/* ===== 報表及分析 ===== */}
          {section === 'reports' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard label="總營收(含運費)" value={formatter.format(report.totalRevenue)} />
                <StatCard label="商品營收" value={formatter.format(report.productIncome)} />
                <StatCard label="代收款(運費)" value={formatter.format(report.shippingIncome)} />
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
              <div className="flex gap-2 overflow-x-auto overflow-y-hidden overscroll-x-contain border-b border-[#e5ded4] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {([
                  { key: 'general', label: '一般設定' },
                  { key: 'templates', label: '模板設定' },
                  { key: 'banners', label: '輪播圖' },
                  { key: 'footer', label: '頁尾資訊' },
                  { key: 'payments', label: '金流設定' },
                  { key: 'shippings', label: '物流設定' },
                  { key: 'integrations', label: '串接設定' },
                  { key: 'notifications', label: '通知' },
                ] as const).filter((t) => platform || t.key !== 'integrations').map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setSettingsTab(t.key)}
                    className={`shrink-0 border-b-2 px-4 py-2 text-sm font-semibold transition ${
                      settingsTab === t.key
                        ? 'border-[#1f1b19] text-[#1f1b19]'
                        : 'border-transparent text-[#8a7f72] hover:text-[#1f1b19]'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {settingsTab === 'banners' && (() => {
                const groups = [...new Set([1, ...banners.map((b) => b.group_no ?? 1), ...extraBannerGroups])].sort((a, b) => a - b);
                const pick = (group: number, id: string | null) => (e: React.ChangeEvent<HTMLInputElement>) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  setBannerGroup(group);
                  setEditBannerId(id);
                  setCropFile(file); // 先進裁切編輯器
                };
                return (
                <Card title="輪播圖">
                  <p className="mb-4 text-sm text-[#8a7f72]">
                    每 4 秒自動切換。輪播圖1 是首頁最上方的輪播(頁尾內文頁背景也用它的第一張);其他組可在「模板設定」新增「輪播圖」板塊後選用。
                  </p>
                  <div className="space-y-4">
                    {groups.map((group) => {
                      const list = banners.filter((b) => (b.group_no ?? 1) === group);
                      const output = bannerImageSize(bannerRatios?.[String(group)]);
                      return (
                        <section key={group} className="rounded-xl border border-[#e5ded4] p-3">
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <div className="min-w-0 space-y-2">
                              <p className="text-sm font-semibold">輪播圖{group} <span className="font-normal text-[#a99e8f]">{list.length} 張</span></p>
                              <label className="block text-xs text-[#6b6156]">顯示比例<select aria-label={`輪播圖${group}顯示比例`} value={bannerRatios?.[String(group)] ?? 'auto'} disabled={savingBannerRatio} onChange={(e) => void saveBannerRatio(group, e.target.value as BannerRatio)} className="ml-2 max-w-full rounded-md border border-[#e5ded4] bg-white px-2 py-1.5 text-xs disabled:opacity-50">{BANNER_RATIOS.map((ratio) => <option key={ratio.key} value={ratio.key}>{ratio.label}</option>)}</select></label>
                            </div>
                            <div className="flex items-center gap-2">
                              {list.length === 0 && group !== 1 ? (
                                <button type="button" onClick={() => setExtraBannerGroups((g) => g.filter((x) => x !== group))} className="text-xs text-[#8a7f72] underline">移除</button>
                              ) : null}
                              <label className="cursor-pointer rounded-full bg-[#1f1b19] px-4 py-1.5 text-xs font-semibold text-white">
                                {uploadingBanner && bannerGroup === group ? '處理中…' : '+ 新增圖片'}
                                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" disabled={uploadingBanner} onChange={pick(group, null)} />
                              </label>
                            </div>
                          </div>
                          {list.length === 0 ? (
                            <p className="rounded-lg bg-[#f6f2ec] p-4 text-center text-xs text-[#8a7f72]">還沒有圖片,按「+ 新增圖片」上傳。</p>
                          ) : (
                            <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
                              {list.map((banner, index) => (
                                <div key={banner.id} className={`w-32 shrink-0 snap-start ${banner.active ? '' : 'opacity-50'}`}>
                                  <label title="點圖換圖 / 裁切" style={{ aspectRatio: `${output[0]} / ${output[1]}` }} className="group relative block cursor-pointer overflow-hidden rounded-lg border border-[#eee5da] bg-[#e9e1d6]">
                                    <img src={banner.image} alt="" className="h-full w-full object-cover" />
                                    <span className="absolute left-1.5 top-1.5 rounded-full bg-black/55 px-1.5 text-[10px] text-white">{index + 1}</span>
                                    <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-xs font-semibold text-white opacity-0 transition group-hover:bg-black/40 group-hover:opacity-100">換圖</span>
                                    <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" disabled={uploadingBanner} onChange={pick(group, banner.id)} />
                                  </label>
                                  <input
                                    className="mt-1.5 w-full rounded-md border border-[#e5ded4] px-2 py-1 text-[11px]"
                                    placeholder="連結(可空)"
                                    defaultValue={banner.link}
                                    onBlur={(e) => {
                                      if (e.target.value !== banner.link) updateBanner(banner.id, { link: e.target.value });
                                    }}
                                  />
                                  <div className="mt-1 flex items-center justify-between text-[#6b6156]">
                                    <label className="flex items-center gap-1 text-[11px]">
                                      <input type="checkbox" checked={banner.active} onChange={(e) => updateBanner(banner.id, { active: e.target.checked })} />
                                      顯示
                                    </label>
                                    <span className="flex">
                                      <button type="button" aria-label="往前" disabled={index === 0} onClick={() => moveBanner(group, index, -1)} className="h-7 w-6 rounded text-sm hover:bg-[#f6f2ec] disabled:opacity-25">‹</button>
                                      <button type="button" aria-label="往後" disabled={index === list.length - 1} onClick={() => moveBanner(group, index, 1)} className="h-7 w-6 rounded text-sm hover:bg-[#f6f2ec] disabled:opacity-25">›</button>
                                      <button type="button" aria-label="刪除" onClick={() => deleteBanner(banner.id)} className="h-7 w-6 rounded text-sm text-[#c0392b] hover:bg-[#fdecea]">✕</button>
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </section>
                      );
                    })}
                  </div>
                  {groups.length < 9 ? (
                    <button type="button" onClick={() => setExtraBannerGroups((g) => [...g, Math.max(...groups) + 1])} className="mt-4 rounded-full border border-[#d7c9bd] px-4 py-2 text-sm font-semibold">+ 新增輪播圖{Math.max(...groups) + 1}</button>
                  ) : null}
                </Card>
                );
              })()}

              <div hidden={settingsTab !== 'templates'}><SiteThemeEditor initial={siteTheme} banners={banners} onSaved={setSiteTheme} categoryImageStyle={categoryImageStyle} onCategoryImageStyle={(style) => void saveCategoryImageStyle(style)} /></div>

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
                        accept="image/png,image/jpeg,image/webp,image/gif"
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
                      PNG / JPG / WEBP / GIF，建議寬版、透明背景，小於 3MB。SVG 請先轉成 PNG。上傳後首頁與後台 Logo 都會更新。
                    </p>
                  </div>
                </div>
              </Card>
              )}

              {settingsTab === 'general' && (
              <Card title="網頁頁籤圖示">
                <div className="flex flex-wrap items-center gap-5">
                  <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-[#e5ded4] bg-white">
                    <img src={faviconUrl || '/favicon.png'} alt="頁籤圖示" className="h-12 w-12 object-contain" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-block cursor-pointer rounded-full bg-[#1f1b19] px-4 py-2 text-sm font-semibold text-white">
                        {faviconBusy ? '處理中…' : faviconUrl ? '更換圖示' : '上傳圖示'}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          disabled={faviconBusy}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void uploadFavicon(f);
                            e.target.value = '';
                          }}
                        />
                      </label>
                      {faviconUrl ? <button type="button" disabled={faviconBusy} onClick={() => void clearFavicon()} className="text-sm text-[#8a7f72] underline-offset-4 hover:underline">改回預設</button> : null}
                    </div>
                    <p className="mt-2 max-w-xs text-xs leading-5 text-[#8a7f72]">
                      顯示在瀏覽器頁籤、書籤,以及加到手機主畫面的圖示。請上傳正方形圖片(建議 512×512 PNG、透明背景),會自動縮放成正方形。沒上傳時使用預設圖示。更換後瀏覽器可能要重新整理或過一段時間才會更新。
                    </p>
                  </div>
                </div>
              </Card>
              )}

              {settingsTab === 'general' && (
              <Card title="優惠券頁形象圖">
                <div className="flex flex-wrap items-center gap-5">
                  <div className="flex h-20 w-40 items-center justify-center overflow-hidden rounded-lg border border-[#e5ded4] bg-[#e4d9c8] bg-cover bg-center"
                       style={couponHero ? { backgroundImage: `url("${couponHero}")` } : undefined}>
                    {couponHero ? null : <span className="text-sm text-[#8a7f72]">尚未設定</span>}
                  </div>
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <label className={`inline-block cursor-pointer rounded-full bg-[#1f1b19] px-4 py-2 text-sm font-semibold text-white ${heroBusy ? 'opacity-50' : ''}`}>
                        {heroBusy ? '處理中…' : '上傳形象圖'}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={heroBusy}
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadCouponHero(f); e.target.value = ''; }}
                        />
                      </label>
                      {couponHero ? (
                        <button onClick={clearCouponHero} disabled={heroBusy} className="rounded-full border border-[#e0b4b4] px-4 py-2 text-sm font-semibold text-[#c0392b] disabled:opacity-50">移除</button>
                      ) : null}
                    </div>
                    <p className="mt-2 max-w-xs text-xs text-[#8a7f72]">
                      顯示在會員「優惠券及購物金」頁最上方的右側背景。建議直式或方形的情境照(布料、吊牌、衣架等)。
                    </p>
                  </div>
                </div>
              </Card>
              )}

              {settingsTab === 'general' && (
              <Card title="會員印章圖片">
                <div className="flex flex-wrap items-center gap-5">
                  <div className="flex h-20 w-40 items-center justify-center overflow-hidden rounded-lg border border-[#e5ded4] bg-[#fbf8f3] bg-contain bg-center bg-no-repeat"
                       style={memberStamp ? { backgroundImage: `url("${memberStamp}")` } : undefined}>
                    {memberStamp ? null : <span className="text-sm text-[#8a7f72]">尚未設定</span>}
                  </div>
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <label className={`inline-block cursor-pointer rounded-full bg-[#1f1b19] px-4 py-2 text-sm font-semibold text-white ${stampBusy ? 'opacity-50' : ''}`}>
                        {stampBusy ? '處理中…' : '上傳印章圖片'}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={stampBusy}
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMemberStamp(f); e.target.value = ''; }}
                        />
                      </label>
                      {memberStamp ? (
                        <button onClick={clearMemberStamp} disabled={stampBusy} className="rounded-full border border-[#e0b4b4] px-4 py-2 text-sm font-semibold text-[#c0392b] disabled:opacity-50">移除</button>
                      ) : null}
                    </div>
                    <p className="mt-2 max-w-xs text-xs text-[#8a7f72]">
                      顯示在會員中心右上角的印章。建議透明背景 PNG,方形構圖;左側會自動淡出融入背景。
                    </p>
                  </div>
                </div>
              </Card>
              )}

              {settingsTab === 'footer' && (
              <Card title="頁尾設定">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <FooterPagesEditor
                    value={footerDraft.sections}
                    onChange={(sections) => setFooterDraft({ ...footerDraft, sections })}
                  />
                  <FooterSocialLinksEditor
                    value={footerDraft.socialLinks}
                    onChange={(socialLinks) => setFooterDraft({ ...footerDraft, socialLinks })}
                    onCommit={(socialLinks) => void saveFooterSettings({ ...footerDraft, socialLinks })}
                  />
                  {/* 頁尾最下方的兩個連結 */}
                  <FooterFold className="lg:col-span-2" title="隱私權政策 / 使用者條款" desc="顯示在頁尾最下方,點了會打開完整內容。空白就不顯示該連結;空一行代表換段落。">
                    <div className="grid gap-4 md:grid-cols-2">
                      {(['privacy', 'terms'] as const).map((kind) => (
                        <label key={kind} className="block text-sm text-[#8a7f72]">
                          {POLICY_LABEL[kind]}
                          <textarea
                            value={footerDraft[kind]}
                            onChange={(e) => setFooterDraft({ ...footerDraft, [kind]: e.target.value })}
                            rows={12}
                            placeholder={`輸入${POLICY_LABEL[kind]}的完整內容`}
                            className="mt-2 w-full rounded-lg border border-[#e5ded4] px-3 py-2 text-sm leading-6 text-[#1f1b19]"
                          />
                        </label>
                      ))}
                    </div>
                  </FooterFold>
                </div>
                {/* 頁尾「尋找我們」「訂閱最新消息」與結帳頁 LINE:一樣開合式 */}
                <div className="mt-4 grid grid-cols-1 gap-4">
                  <FooterFold title="尋找我們 FOLLOW US" desc="空白的欄位不會顯示。若在上方頁尾分頁自己建了「尋找我們」分頁,會改用那個分頁的內容。">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block text-sm">
                        <span className="mb-1 block font-semibold text-[#6b6156]">服務時間</span>
                        <input value={footerDraft.serviceHours} onChange={(e) => setFooterDraft({ ...footerDraft, serviceHours: e.target.value })} placeholder="例如 上班日 11:00 - 18:00" className="w-full rounded-lg border border-[#e5ded4] bg-white px-3 py-2" />
                      </label>
                      <label className="block text-sm">
                        <span className="mb-1 block font-semibold text-[#6b6156]">E-mail</span>
                        <input value={footerDraft.email} onChange={(e) => setFooterDraft({ ...footerDraft, email: e.target.value })} placeholder="例如 service@example.com" className="w-full rounded-lg border border-[#e5ded4] bg-white px-3 py-2" />
                      </label>
                      <label className="block text-sm">
                        <span className="mb-1 block font-semibold text-[#6b6156]">Instagram 網址</span>
                        <input value={footerDraft.instagramUrl} onChange={(e) => setFooterDraft({ ...footerDraft, instagramUrl: e.target.value })} placeholder="https://instagram.com/..." className="w-full rounded-lg border border-[#e5ded4] bg-white px-3 py-2" />
                      </label>
                      <label className="block text-sm">
                        <span className="mb-1 block font-semibold text-[#6b6156]">LINE 官方帳號網址</span>
                        <input value={footerDraft.lineUrl} onChange={(e) => setFooterDraft({ ...footerDraft, lineUrl: e.target.value })} placeholder="https://lin.ee/..." className="w-full rounded-lg border border-[#e5ded4] bg-white px-3 py-2" />
                      </label>
                      <label className="block text-sm">
                        <span className="mb-1 block font-semibold text-[#6b6156]">公司名稱</span>
                        <input value={footerDraft.companyName} onChange={(e) => setFooterDraft({ ...footerDraft, companyName: e.target.value })} placeholder="" className="w-full rounded-lg border border-[#e5ded4] bg-white px-3 py-2" />
                      </label>
                      <label className="block text-sm">
                        <span className="mb-1 block font-semibold text-[#6b6156]">統一編號</span>
                        <input value={footerDraft.taxId} onChange={(e) => setFooterDraft({ ...footerDraft, taxId: e.target.value })} placeholder="" className="w-full rounded-lg border border-[#e5ded4] bg-white px-3 py-2" />
                      </label>
                    </div>
                  </FooterFold>
                  <FooterFold title="訂閱最新消息" badge={footerDraft.newsletterShow ? '顯示中' : '已隱藏'} desc="頁尾的 Email 訂閱區塊。不需要可以取消「顯示」。">
                    <div className="space-y-3">
                      <label className="flex items-center gap-2 text-sm font-semibold text-[#6b6156]">
                        <input type="checkbox" checked={footerDraft.newsletterShow} onChange={(e) => setFooterDraft({ ...footerDraft, newsletterShow: e.target.checked })} />
                        在頁尾顯示訂閱區塊
                      </label>
                      <label className="block text-sm">
                        <span className="mb-1 block font-semibold text-[#6b6156]">標題</span>
                        <input value={footerDraft.newsletterTitle} onChange={(e) => setFooterDraft({ ...footerDraft, newsletterTitle: e.target.value })} placeholder="訂閱最新消息" className="w-full rounded-lg border border-[#e5ded4] bg-white px-3 py-2" />
                      </label>
                      <label className="block text-sm">
                        <span className="mb-1 block font-semibold text-[#6b6156]">說明文字</span>
                        <textarea value={footerDraft.newsletterText} onChange={(e) => setFooterDraft({ ...footerDraft, newsletterText: e.target.value })} rows={3} className="w-full rounded-lg border border-[#e5ded4] bg-white px-3 py-2" />
                      </label>
                    </div>
                  </FooterFold>
                  {/* 結帳完成頁的「訂閱 LINE 通知」區塊 */}
                  <FooterFold title="結帳頁 LINE 設定" desc="顯示在訂單完成頁「訂閱 LINE 通知」區塊。兩欄都空白時不顯示該區塊。">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="mb-1 block font-semibold text-[#6b6156]">LINE ID(顯示給客人看)</span>
                      <input
                        value={footerDraft.checkoutLineId}
                        onChange={(e) => setFooterDraft({ ...footerDraft, checkoutLineId: e.target.value })}
                        placeholder="例如 @urbanite"
                        className="w-full rounded-lg border border-[#e5ded4] bg-white px-3 py-2"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block font-semibold text-[#6b6156]">加好友連結(選填)</span>
                      <input
                        value={footerDraft.checkoutLineUrl}
                        onChange={(e) => setFooterDraft({ ...footerDraft, checkoutLineUrl: e.target.value })}
                        placeholder="例如 https://lin.ee/xxxxxx,空白則依 LINE ID 產生"
                        className="w-full rounded-lg border border-[#e5ded4] bg-white px-3 py-2"
                      />
                    </label>
                  </div>
                  </FooterFold>
                </div>
                {/* 儲存按鈕置底懸浮:捲到哪裡都能直接儲存 */}
                <div className="sticky bottom-0 z-20 -mx-5 -mb-5 mt-6 flex items-center justify-end gap-3 rounded-b-xl border-t border-[#e5ded4] bg-white/95 px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur">
                  <span className="min-w-0 flex-1 truncate text-xs text-[#8a7f72]">修改後記得按儲存</span>
                  <button
                    onClick={() => void saveFooterSettings()}
                    disabled={savingSettings}
                    className="shrink-0 rounded-full bg-[#1f1b19] px-6 py-2.5 text-sm font-semibold text-white shadow-lg disabled:opacity-60"
                  >
                    {savingSettings ? '儲存中...' : '儲存頁尾'}
                  </button>
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

              {settingsTab === 'integrations' && <IntegrationSettings />}
              {settingsTab === 'notifications' && <OrderNotificationSettingsPanel />}
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
                {platform ? null : (
                  <p className="mb-3 rounded-lg bg-[#faf7f2] px-3 py-2 text-xs leading-5 text-[#6b6156]">
                    超商取貨不付款:買家結帳時自己填門市,由你自己寄出(例如 7-11 賣貨便、全家好賣+),出貨時在訂單填物流單號。取貨付款需要串接金流物流,目前不提供。
                  </p>
                )}
                <ShippingMethodsEditor
                  defaults={platform ? DEFAULT_SHIPPING_METHODS : DEFAULT_SHIPPING_METHODS.filter((m) => !/取貨付款/.test(m))}
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
          categories={editing.campaign_id ? campaignCategories.filter((c) => c.campaign_id === editing.campaign_id) : categories}
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
          title={`輪播圖${bannerGroup} — 圖片裁切`}
          outputW={bannerOutput[0]}
          outputH={bannerOutput[1]}
          hint={`輸出尺寸 ${bannerOutput[0]} × ${bannerOutput[1]} px`}
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
          onReviewCancel={(action, response, markRefunded) => reviewCancel(openOrderId, action, response, markRefunded)}
          onOrderChange={(o) => setOrders((list) => list.map((x) => (x.id === o.id ? { ...x, ...o } : x)))}
          onShipmentCreated={(shipment) => {
            setOrders((list) => list.map((item) => item.id === openOrderId ? {
              ...item,
              status: '待出貨',
              order_status: 'PROCESSING',
              fulfillment_status: 'READY_TO_SHIP',
              shipment_id: shipment.id,
              shipment_provider: shipment.provider ?? '',
              shipment_code: shipment.store_print_no || shipment.tracking_number || '',
              shipment_store_name: shipment.store_name ?? '',
              shipment_store_id: shipment.store_id ?? '',
            } : item));
            setOrderFilter(PROCESSED_TAB);
            setOpenOrderId(null);
          }}
        />
      )}
    </div>
  );
}

type CropRect = { x: number; y: number; w: number; h: number };

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

  useScrollLock(true);

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

// 頁尾設定的開合區塊(隱私權、尋找我們、訂閱、結帳頁 LINE)
function FooterFold({ title, desc, badge, className = '', children }: { title: string; desc?: string; badge?: string; className?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`min-w-0 overflow-hidden rounded-lg border ${open ? 'border-[#7da185]' : 'border-[#e5ded4]'} ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={`flex w-full items-center gap-2 px-4 py-3 text-left ${open ? 'bg-[#7da185] text-white' : 'bg-white text-[#1f1b19]'}`}
      >
        <span className="min-w-0 flex-1 truncate font-semibold">{title}</span>
        {badge && <span className={`shrink-0 text-xs ${open ? 'text-white/80' : 'text-[#8a7f72]'}`}>{badge}</span>}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="bg-[#fcfbf8] p-3 sm:p-4">
          {desc && <p className="mb-3 text-xs leading-5 text-[#8a7f72]">{desc}</p>}
          {children}
        </div>
      )}
    </div>
  );
}

// 頁尾頁面:開合式。大標題一列一列收合,點開後裡面是小標題清單;小標題也可再點開編輯內文
function FooterPagesEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [openSection, setOpenSection] = useState<number | null>(null);
  const [openItem, setOpenItem] = useState<number | null>(null);
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
      })).filter((section) => !HIDDEN_FOOTER_SECTION_TITLES.includes(section.title));
    } catch {
      return [];
    }
  });

  function update(next: FooterSectionDraft[]) {
    setSections(next);
    onChange(JSON.stringify(next, null, 2));
  }

  function toggleSection(index: number) {
    setOpenSection(openSection === index ? null : index);
    setOpenItem(null);
  }

  function addSection() {
    const next = [...sections, { title: '新大標題', items: [{ subtitle: '新小標題', content: '', url: '' }] }];
    setOpenSection(next.length - 1);
    setOpenItem(0);
    update(next);
  }

  function updateSection(index: number, patch: Partial<FooterSectionDraft>) {
    update(sections.map((section, i) => (i === index ? { ...section, ...patch } : section)));
  }

  function deleteSection(index: number) {
    setOpenSection(null);
    setOpenItem(null);
    update(sections.filter((_, i) => i !== index));
  }

  function updateItem(sectionIndex: number, itemIndex: number, patch: Partial<FooterItemDraft>) {
    const section = sections[sectionIndex];
    updateSection(sectionIndex, { items: section.items.map((x, i) => (i === itemIndex ? { ...x, ...patch } : x)) });
  }

  function addItem(sectionIndex: number) {
    const section = sections[sectionIndex];
    updateSection(sectionIndex, { items: [...section.items, { subtitle: '新小標題', content: '', url: '' }] });
    setOpenItem(section.items.length);
  }

  function deleteItem(sectionIndex: number, itemIndex: number) {
    const section = sections[sectionIndex];
    updateSection(sectionIndex, { items: section.items.filter((_, i) => i !== itemIndex) });
    setOpenItem(null);
  }

  const chevron = (open: boolean) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );

  return (
    <FooterFold className="lg:col-span-2" title="頁尾選單設定" badge={`${sections.length} 個大標題`}>
      <div className="flex items-center justify-between gap-2 pb-3">
        <p className="text-xs leading-5 text-[#8a7f72]">點大標題展開,編輯裡面的小標題</p>
        <button type="button" onClick={addSection} className="shrink-0 whitespace-nowrap rounded-lg border border-[#1f1b19] bg-white px-3 py-2 text-sm font-semibold">
          + 大標題
        </button>
      </div>

      {sections.length === 0 && <p className="py-4 text-sm text-[#8a7f72]">尚未新增頁尾大標題,按右上角開始建立。</p>}

      <div className="space-y-2">
        {sections.map((section, sectionIndex) => {
          const sectionOpen = openSection === sectionIndex;
          return (
            <div key={sectionIndex} className={`min-w-0 overflow-hidden rounded-lg border ${sectionOpen ? 'border-[#7da185]' : 'border-[#e5ded4]'}`}>
              <button
                type="button"
                onClick={() => toggleSection(sectionIndex)}
                aria-expanded={sectionOpen}
                className={`flex w-full items-center gap-2 px-4 py-3 text-left ${sectionOpen ? 'bg-[#7da185] text-white' : 'bg-white text-[#1f1b19]'}`}
              >
                <span className="min-w-0 flex-1 truncate font-semibold">{section.title || '未命名大標題'}</span>
                <span className={`shrink-0 text-xs ${sectionOpen ? 'text-white/80' : 'text-[#8a7f72]'}`}>{section.items.length} 個小標題</span>
                {chevron(sectionOpen)}
              </button>

              {sectionOpen && (
                <div className="space-y-3 bg-[#fcfbf8] p-3 sm:p-4">
                  <div className="flex items-end gap-2">
                    <label className="block min-w-0 flex-1 text-sm text-[#8a7f72]">
                      大標題
                      <input
                        value={section.title}
                        onChange={(e) => updateSection(sectionIndex, { title: e.target.value })}
                        placeholder="例如：關於我們 ABOUT US"
                        className="mt-2 w-full rounded-lg border border-[#e5ded4] bg-white px-3 py-2 text-base font-semibold text-[#1f1b19]"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => deleteSection(sectionIndex)}
                      className="shrink-0 whitespace-nowrap rounded-lg border border-[#e0b4b4] px-3 py-2 text-sm font-semibold text-[#a64d45]"
                    >
                      刪除大標題
                    </button>
                  </div>

                  {section.items.map((item, itemIndex) => {
                    const itemOpen = openItem === itemIndex;
                    return (
                      <div key={itemIndex} className="min-w-0 overflow-hidden rounded-lg border border-[#ece5da] bg-[#f8f5f0]">
                        <button
                          type="button"
                          onClick={() => setOpenItem(itemOpen ? null : itemIndex)}
                          aria-expanded={itemOpen}
                          className="flex w-full items-center gap-2 px-4 py-3 text-left text-[#1f1b19]"
                        >
                          <span className="min-w-0 flex-1 truncate">{item.subtitle || '未命名小標題'}</span>
                          {!item.content && !item.url && <span className="shrink-0 text-xs text-[#b9b0a8]">尚無內容</span>}
                          {chevron(itemOpen)}
                        </button>
                        {itemOpen && (
                          <div className="space-y-3 border-t border-[#ece5da] px-4 pb-4 pt-3">
                            <div className="flex items-end gap-2">
                              <label className="block min-w-0 flex-1 text-sm text-[#8a7f72]">
                                小標題
                                <input
                                  value={item.subtitle}
                                  onChange={(e) => updateItem(sectionIndex, itemIndex, { subtitle: e.target.value })}
                                  placeholder="例如：優惠資訊 / Coupon"
                                  className="mt-2 w-full rounded-lg border border-[#e5ded4] bg-white px-3 py-2 text-base text-[#1f1b19]"
                                />
                              </label>
                              <button
                                type="button"
                                onClick={() => deleteItem(sectionIndex, itemIndex)}
                                className="shrink-0 rounded-lg border border-[#e0b4b4] px-3 py-2 text-sm font-semibold text-[#a64d45]"
                              >
                                刪除
                              </button>
                            </div>
                            <label className="block text-sm text-[#8a7f72]">
                              頁面內容
                              <textarea
                                value={item.content}
                                onChange={(e) => updateItem(sectionIndex, itemIndex, { content: e.target.value })}
                                placeholder="輸入這個小標題點開後要顯示的完整內文..."
                                rows={8}
                                className="mt-2 w-full rounded-lg border border-[#e5ded4] bg-white px-3 py-3 text-base leading-7 text-[#1f1b19]"
                              />
                            </label>
                            {/* 有內文就自動有一個內文頁面(前台頁尾點小標題會開這頁) */}
                            {item.content.trim() && item.subtitle.trim() && section.title.trim() ? (
                              <div className="flex min-w-0 items-center gap-2 rounded-lg border border-[#d9e6dc] bg-[#f3f8f4] px-3 py-2">
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs text-[#5f7a66]">內文頁面連結(儲存頁尾後生效)</p>
                                  <p className="truncate text-sm text-[#1f1b19]">/footer/{section.title}/{item.subtitle}</p>
                                </div>
                                <a
                                  href={`/footer/${encodeURIComponent(section.title)}/${encodeURIComponent(item.subtitle)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="shrink-0 whitespace-nowrap rounded-lg bg-[#7da185] px-3 py-2 text-sm font-semibold text-white"
                                >
                                  查看內文頁面
                                </a>
                              </div>
                            ) : (
                              <p className="text-xs text-[#8a7f72]">填入頁面內容後,會自動產生可點擊查看的內文頁面。</p>
                            )}
                            <label className="block text-sm text-[#8a7f72]">
                              外部連結網址(選填,沒有頁面內容時才會使用)
                              <input
                                value={item.url}
                                onChange={(e) => updateItem(sectionIndex, itemIndex, { url: e.target.value })}
                                placeholder="https://..."
                                className="mt-2 w-full rounded-lg border border-[#e5ded4] bg-white px-3 py-2 text-base text-[#1f1b19]"
                              />
                            </label>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => addItem(sectionIndex)}
                    className="rounded-lg border border-[#7da185] px-3 py-2 text-sm font-semibold text-[#5f8066]"
                  >
                    + 新增小標題
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </FooterFold>
  );
}

// 頁尾社群按鈕:清單只顯示圖示與名稱,點一下跳出視窗編輯(名稱、連結、上傳圖片),儲存後直接更新頁尾
function FooterSocialLinksEditor({ value, onChange, onCommit }: { value: string; onChange: (value: string) => void; onCommit?: (value: string) => void }) {
  const [items, setItems] = useState<FooterSocialDraft[]>(() => parseFooterSocialLinks(value));
  const [editing, setEditing] = useState<{ index: number; item: FooterSocialDraft } | null>(null); // index -1 = 新增
  const [uploading, setUploading] = useState(false);

  function commit(next: FooterSocialDraft[]) {
    const normalized = normalizeFooterSocialLinks(next);
    const json = JSON.stringify(normalized, null, 2);
    setItems(normalized);
    onChange(json);
    onCommit?.(json);
  }

  async function uploadImage(file: File) {
    if (!editing) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('productId', `footer-social-${Date.now()}`);
      const res = await fetch('/api/products/image', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok || !data.image_url) throw new Error(data.error ?? '上傳失敗');
      setEditing((cur) => (cur ? { ...cur, item: { ...cur.item, image: data.image_url } } : cur));
    } catch (error) {
      void uiAlert(error instanceof Error ? error.message : '上傳發生問題');
    } finally {
      setUploading(false);
    }
  }

  function save() {
    if (!editing) return;
    const item = { ...editing.item, label: editing.item.label.trim(), url: editing.item.url.trim() };
    if (!item.label) return void uiAlert('請填寫按鈕名稱');
    commit(editing.index < 0 ? [...items, item] : items.map((x, i) => (i === editing.index ? item : x)));
    setEditing(null);
  }

  async function remove(index: number) {
    if (!(await uiConfirm(`刪除「${items[index]?.label || '這個按鈕'}」?`, { danger: true }))) return;
    commit(items.filter((_, i) => i !== index));
    setEditing(null);
  }

  // 有上傳圖片用圖片;沒有就依名稱/連結顯示彩色品牌 logo;都認不出才顯示文字
  const icon = (item: FooterSocialDraft, size: string) => {
    const brand = item.image ? null : detectSocialBrand(item.label, item.url);
    return (
      <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full text-[11px] font-bold text-white ${brand ? '' : 'bg-[#1f1b19]'} ${size}`}>
        {item.image ? <img src={item.image} alt="" className="h-full w-full object-cover" /> : brand ? <SocialBrandIcon brand={brand} /> : item.label.slice(0, 4) || '@'}
      </span>
    );
  };

  return (
    <FooterFold className="lg:col-span-2" title="頁尾社群按鈕" badge={`${items.length} 個按鈕`} desc={`頁尾的圓形社群按鈕,最多 ${MAX_FOOTER_SOCIAL_LINKS} 個;點一下編輯,有填連結的才會顯示。沒上傳圖片時,Instagram、Facebook、LINE、YouTube、TikTok、Threads、X、Email 會自動用彩色 logo。`}>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setEditing({ index: -1, item: { label: '', image: '', url: '' } })}
          disabled={items.length >= MAX_FOOTER_SOCIAL_LINKS}
          className="rounded-full border border-[#1f1b19] bg-white px-4 py-1.5 text-sm font-semibold disabled:opacity-40"
        >
          + 新增按鈕
        </button>
      </div>
      {items.length === 0 ? <p className="mt-3 rounded-lg bg-[#faf7f2] py-6 text-center text-sm text-[#a99e8f]">目前沒有社群按鈕,頁尾不會顯示這一排。</p> : (
        <div className="mt-3 divide-y divide-[#f0ebe2] overflow-hidden rounded-lg border border-[#e5ded4] bg-white">
          {items.map((item, index) => (
            <button key={index} type="button" onClick={() => setEditing({ index, item: { ...item } })} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-[#faf7f2]">
              {icon(item, 'h-10 w-10')}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{item.label || '未命名'}</span>
                <span className={`block truncate break-all text-xs ${item.url ? 'text-[#8a7f72]' : 'text-[#c0392b]'}`}>{item.url || '尚未填連結(不會顯示)'}</span>
              </span>
              <span className="text-[#b3a897]">›</span>
            </button>
          ))}
        </div>
      )}

      {editing ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={() => setEditing(null)}>
          <div className="w-full max-w-md rounded-t-2xl bg-white p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="text-lg font-bold">{editing.index < 0 ? '新增社群按鈕' : '編輯社群按鈕'}</p>
              <button type="button" onClick={() => setEditing(null)} aria-label="關閉" className="rounded p-1 text-xl leading-none hover:bg-[#efe8dd]">×</button>
            </div>
            <div className="mt-4 flex items-center gap-4">
              {icon(editing.item, 'h-16 w-16')}
              <div className="flex flex-wrap gap-2">
                <label className="cursor-pointer rounded-full bg-[#1f1b19] px-4 py-2 text-sm font-semibold text-white">
                  {uploading ? '上傳中...' : editing.item.image ? '更換圖片' : '上傳圖片'}
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" disabled={uploading}
                    onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void uploadImage(file); }} />
                </label>
                {editing.item.image ? <button type="button" onClick={() => setEditing({ ...editing, item: { ...editing.item, image: '' } })} className="text-sm text-[#8a7f72]">移除圖片</button> : null}
              </div>
            </div>
            <label className="mt-4 block text-sm text-[#8a7f72]">
              按鈕名稱
              <input value={editing.item.label} onChange={(e) => setEditing({ ...editing, item: { ...editing.item, label: e.target.value } })} placeholder="例如:Instagram" className="mt-1.5 w-full rounded-lg border border-[#e5ded4] px-3 py-2 text-[#1f1b19]" />
            </label>
            <label className="mt-3 block text-sm text-[#8a7f72]">
              連結網址
              <input value={editing.item.url} onChange={(e) => setEditing({ ...editing, item: { ...editing.item, url: e.target.value } })} placeholder="https:// 或 mailto:" className="mt-1.5 w-full rounded-lg border border-[#e5ded4] px-3 py-2 text-[#1f1b19]" />
            </label>
            <div className="mt-5 flex items-center gap-2">
              {editing.index >= 0 ? <button type="button" onClick={() => void remove(editing.index)} className="px-2 text-sm font-semibold text-[#c0392b]">刪除</button> : null}
              <button type="button" onClick={() => setEditing(null)} className="ml-auto rounded-full border border-[#d7c9bd] px-4 py-2 text-sm">取消</button>
              <button type="button" disabled={uploading} onClick={save} className="rounded-full bg-[#1f1b19] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">儲存</button>
            </div>
          </div>
        </div>
      ) : null}
    </FooterFold>
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

const MAX_FOOTER_SOCIAL_LINKS = 10;
function normalizeFooterSocialLinks(items: Partial<FooterSocialDraft>[]): FooterSocialDraft[] {
  return items.slice(0, MAX_FOOTER_SOCIAL_LINKS).map((item) => ({
    label: typeof item.label === 'string' ? item.label : '',
    image: typeof item.image === 'string' ? item.image : '',
    url: typeof item.url === 'string' ? item.url : '',
  }));
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
                <NumberInput
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

// 檢查圖片是否有透明區域(去背圖)。JPG 一定沒有;PNG / WebP 縮小後逐點檢查 alpha。
function hasTransparency(file: Blob): Promise<boolean> {
  if (file.type !== 'image/png' && file.type !== 'image/webp') return Promise.resolve(false);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const size = 200;
      const scale = Math.min(1, size / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return resolve(false);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 3; i < data.length; i += 4) if (data[i] < 250) return resolve(true);
      resolve(false);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(false); };
    img.src = url;
  });
}

// 商品照統一 4:5(1080 × 1350):照片比例不同或尺寸不夠時,自動放大並以中央裁切成滿版。
// 去背圖(透明 PNG)則完整縮放置中,避免把商品本體裁掉。GIF 保留原檔(避免失去動畫)。
const PRODUCT_PHOTO_W = 1080;
const PRODUCT_PHOTO_H = 1350;

function fitProductPhoto(source: Blob, index: number, mode: 'cover' | 'contain'): Promise<{ blob: Blob; filename: string }> {
  if (source.type === 'image/gif') {
    return Promise.resolve({ blob: source, filename: `product-${Date.now()}-${index}.gif` });
  }
  const png = mode === 'contain';
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(source);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = PRODUCT_PHOTO_W;
      canvas.height = PRODUCT_PHOTO_H;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('無法處理圖片'));
        return;
      }
      const fit = mode === 'cover' ? Math.max : Math.min;
      const scale = fit(PRODUCT_PHOTO_W / img.naturalWidth, PRODUCT_PHOTO_H / img.naturalHeight);
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, (PRODUCT_PHOTO_W - w) / 2, (PRODUCT_PHOTO_H - h) / 2, w, h);
      canvas.toBlob(
        (blob) => (blob
          ? resolve({ blob, filename: `product-${Date.now()}-${index}.${png ? 'png' : 'jpg'}` })
          : reject(new Error('圖片處理失敗'))),
        png ? 'image/png' : 'image/jpeg',
        0.88,
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
  shippingFee = 0,
}: {
  r: ReturnRequest;
  busy: boolean;
  onAction: (action: 'received' | 'processing' | 'refund' | 'complete', refundShipping?: boolean) => void;
  shippingFee?: number; // 可退的運費
}) {
  const [sel, setSel] = useState<'received' | 'processing' | 'refund' | 'complete'>('received');
  const [refundShipping, setRefundShipping] = useState(false);
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
      {sel === 'refund' && shippingFee > 0 ? (
        <label className="flex items-center gap-1.5 text-xs text-[#6b6156]">
          <input type="checkbox" checked={refundShipping} onChange={(e) => setRefundShipping(e.target.checked)} className="h-4 w-4 accent-[#1f1b19]" />
          一併退運費 {formatter.format(shippingFee)}
        </label>
      ) : null}
      <button
        onClick={async () => {
          if (sel === 'received' && !(await uiConfirm('標記已收到退貨?將回補庫存。'))) return;
          const total = r.refund_amount + (refundShipping ? shippingFee : 0);
          if (sel === 'refund' && !(await uiConfirm(`退款 ${formatter.format(total)}${refundShipping ? `(含運費 ${formatter.format(shippingFee)})` : ''}?\n(實際退刷仍需至金流後台操作)`))) return;
          onAction(sel, sel === 'refund' && refundShipping);
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
    if (key === 'arrived') return (<svg {...p}><path d="M3 7l9-4 9 4v10l-9 4-9-4z" /><path d="M8.5 12.5l2.5 2.5 4.5-5" /></svg>);
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

// 退貨進度:退貨已申請 → 退貨已收貨 → 退貨處理中 → 退款處理中 → 已退款(規則見 lib/return-progress)
function AdminReturnProgress({ order, returns, refunds }: { order: Order; returns: ReturnRequest[]; refunds: Refund[] }) {
  const steps = buildReturnSteps(order, returns, refunds);
  const fmt = (v?: string | null) => (v ? new Date(v).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
  const icon = (key: string) => {
    const p = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
    if (key === 'applied') return (<svg {...p}><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4M9 13l2 2 4-4" /></svg>);
    if (key === 'received') return (<svg {...p}><path d="M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7" /><path d="M9 14l-3-3 3-3" /></svg>);
    if (key === 'processing') return (<svg {...p}><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></svg>);
    if (key === 'refunding') return (<svg {...p}><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18M7 15h4" /></svg>);
    return (<svg {...p}><path d="M5 13l4 4L19 7" strokeWidth={2.2} /></svg>);
  };
  return (
    <div className="flex items-start">
      {steps.map((step, i) => {
        const isCurrent = step.current;
        const active = step.done || isCurrent;
        const danger = step.danger;
        const bg = danger ? '#c0392b' : step.done ? '#1f1b19' : isCurrent ? '#8a7f72' : '#efe8dd';
        const fg = active ? '#fff' : '#b3a897';
        return (
          <div key={step.key} className="flex flex-1 flex-col items-center">
            <div className="flex w-full items-center">
              <div className={`h-0.5 flex-1 ${i === 0 ? 'opacity-0' : ''}`} style={{ background: active ? '#1f1b19' : '#e5ded4' }} />
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: bg, color: fg }}>
                {icon(step.key)}
              </div>
              <div className={`h-0.5 flex-1 ${i === steps.length - 1 ? 'opacity-0' : ''}`} style={{ background: steps[i + 1]?.done ? '#1f1b19' : '#e5ded4' }} />
            </div>
            <span className={`mt-1.5 text-center text-[11px] leading-tight ${danger ? 'font-semibold text-[#c0392b]' : active ? 'font-semibold text-[#2c2826]' : 'text-[#a99e8f]'}`}>{step.label}</span>
            {step.done && fmt(step.time) ? <span className="mt-0.5 text-center text-[10px] text-[#a99e8f]">{fmt(step.time)}</span> : null}
          </div>
        );
      })}
    </div>
  );
}

// 後台專用的訂單完整資訊，與客人端的訂單明細分開。
function AdminOrderModal({
  order,
  imageByName,
  onClose,
  onUpdate,
  onReviewCancel,
  onOrderChange,
  onShipmentCreated,
}: {
  order: Order;
  imageByName: Map<string, string>;
  onClose: () => void;
  onUpdate: (patch: Partial<Order>) => void;
  onReviewCancel: (action: 'approve' | 'reject', response: string, markRefunded?: boolean) => void;
  onOrderChange?: (o: Order) => void;
  onShipmentCreated: (shipment: Shipment) => void;
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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [homeShipOpen, setHomeShipOpen] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paidAt = detail?.history?.find((h) => h.type === 'payment' && h.to_status === 'PAID')?.created_at
    ?? detail?.payments?.find((p) => p.status === 'PAID')?.paid_at
    ?? undefined;
  // 已出貨的狀態直接視為有出貨單,避免明細還沒載入時先閃出「準備出貨」
  const hasShipment = ['SHIPPED', 'IN_TRANSIT', 'AT_STORE', 'DELIVERED', 'PICKED_UP'].includes(order.fulfillment_status ?? '') || (detail?.shipments?.length ?? 0) > 0;
  // 宅配到府(非超商取貨):收款後才能出貨(貨到付款除外)
  // 手動超商取貨(店家自己寄,例如賣貨便):和宅配一樣手動填物流單號出貨,不建藍新物流單
  const isManualStore = order.store_lgs_type === 'MANUAL';
  const isHomeDelivery = isManualStore || (!order.store_id && /宅配|到府|home/i.test(order.shipping_method ?? ''));
  const canShipHome = order.paid || isCollectOnDelivery(order.shipping_method ?? '', order.payment_method ?? '');
  // 訂單歷程:狀態紀錄 + 物流貨態事件,依時間合併
  const timeline = detail
    ? [
        ...detail.history.map((h) => ({ id: h.id, at: h.created_at, text: stripBrand(historyLabel(h)), kind: historyKind(h) })),
        ...detail.shipments.flatMap((sh) =>
          (sh.events ?? []).map((ev) => ({
            id: `ev-${ev.id}`,
            at: ev.event_at,
            text: stripBrand(`${ev.description || (FULFILLMENT_STATUS_LABEL[ev.status ?? ''] ?? ev.status ?? '')}${ev.location ? `(${ev.location})` : ''}`),
            kind: { label: '物流', tone: '#1f7a44' },
          })),
        ),
      ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
    : [];
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

  async function reviewReturn(returnId: string, action: 'approve' | 'reject' | 'received' | 'processing' | 'refund' | 'complete', response = '', refundShipping = false) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/returns`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ return_id: returnId, action, response, refund_shipping: refundShipping }),
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
        body: JSON.stringify(useNewebpay ? { use_newebpay: true } : {}),
      });
      if (!res.ok) { void uiAlert(stripBrand((await res.json()).error ?? '建立出貨失敗')); return; }
      const shipment = (await res.json()) as Shipment;
      onShipmentCreated(shipment);
    } finally { setBusy(false); }
  }

  async function shipHome(carrier: string, tracking: string) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/shipment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ home_delivery: true, provider: carrier, tracking_number: tracking }),
      });
      const data = await res.json();
      if (!res.ok) { void uiAlert(stripBrand(data.error ?? '出貨失敗')); return; }
      setHomeShipOpen(false);
      onOrderChange?.({ ...order, status: '已出貨', fulfillment_status: 'SHIPPED', order_status: 'PROCESSING' });
      await loadDetail();
      flash(isManualStore ? '已超商寄件' : '已宅配出貨');
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
      const data = await res.json();
      if (!res.ok) { void uiAlert(stripBrand(data.error ?? '查詢貨態失敗')); return; }
      if (data.unchanged || data.skipped) { flash('目前沒有新的貨態'); return; }
      await loadDetail();
      flash('貨態已更新');
    } finally { setBusy(false); }
  }

  // 置中提示,3 秒後淡出
  function flash(text: string) {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 3000);
  }

  // 寄件單:物流商的寄件標籤(需已建立物流單)
  const labelShipment = [...(detail?.shipments ?? [])].reverse().find((sh) => sh.lgs_type && sh.ship_type);
  function printShippingLabel() {
    if (!labelShipment) return;
    window.open(`/api/orders/${order.id}/shipment/label?shipment_id=${labelShipment.id}`, '_blank', 'noopener,noreferrer');
  }

  // 出貨單:撿貨 / 包裝用的出貨資訊(品項、收件人、配送方式)
  function printShippingDocument() {
    const rows = order.items
      .map((it) => `<tr><td>${escapeHtml(it.name)}</td><td>${escapeHtml(it.variant)}</td><td style="text-align:center">${it.quantity}</td><td style="text-align:right">${formatter.format(it.price * it.quantity)}</td></tr>`)
      .join('');
    const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>${escapeHtml(order.order_no)}</title>
<style>body{font-family:system-ui,"PingFang TC","Microsoft JhengHei",sans-serif;color:#1f1b19;padding:32px;max-width:640px;margin:0 auto}
h1{font-size:20px;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin:16px 0}
th,td{border-bottom:1px solid #e5ded4;padding:8px;font-size:14px;text-align:left}
.muted{color:#6b6156;font-size:13px}.tot{text-align:right;font-weight:700;font-size:16px;margin-top:8px}
.sec{margin-top:20px}.sec h2{font-size:14px;margin:0 0 6px}</style></head><body>
<h1>出貨單 ${escapeHtml(order.order_no)}</h1>
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
    const ship = refundableShipping(order) + Number(order.shipping_refund || 0);
    const withShipping = ship > 0 && amount > 0 ? await uiConfirm(`這筆退款是否包含退運費 ${formatter.format(ship)}?`) : false;
    onUpdate({ refund_amount: amount, shipping_refund: withShipping ? Math.min(ship, amount) : 0 });
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
          {/* 主要操作固定在內容最上方 */}
          <div className="flex flex-wrap gap-2">
            <ManualFulfillmentAction order={order} action="arrived" onUpdated={(updated) => { onOrderChange?.(updated); void loadDetail(); }} />
            {detail && isHomeDelivery && !hasShipment && order.status !== '取消' && order.status !== '退貨' ? (
              <button
                onClick={() => {
                  if (!canShipHome) { void uiAlert('此訂單尚未收款,請先確認已收款(標記已付款)後再宅配出貨。'); return; }
                  setHomeShipOpen(true);
                }}
                className={`inline-flex h-10 items-center rounded-full px-6 text-sm font-semibold text-white ${canShipHome ? 'bg-[#1f7a44] hover:bg-[#186437]' : 'bg-[#b8c9bd]'}`}
              >
                準備出貨
              </button>
            ) : null}
            <button onClick={printShippingDocument} className="inline-flex h-10 items-center rounded-full bg-[#1f1b19] px-6 text-sm font-semibold text-white hover:bg-black">列印出貨單</button>
            {labelShipment ? (
              <button onClick={printShippingLabel} className="inline-flex h-10 items-center rounded-full border border-[#1f1b19] px-6 text-sm font-semibold text-[#1f1b19] hover:bg-[#efe8dd]">列印寄件單</button>
            ) : null}
            {order.status !== '取消' && order.status !== '退貨' ? (
              <button onClick={async () => {
                if (!(await uiConfirm('確定要取消這筆訂單嗎?', { danger: true }))) return;
                const refunded = order.paid ? await uiConfirm(`此訂單已付款 ${formatter.format(order.total)},是否一併標記已退款?\n(實際退刷仍需至金流後台操作)`) : false;
                onUpdate(refunded ? { status: '取消', refund_amount: order.total, shipping_refund: Number(order.shipping || 0) - Number(order.shipping_discount || 0) } : { status: '取消' });
              }} className="inline-flex h-10 items-center rounded-full border border-[#e0b4b4] px-6 text-sm font-semibold text-[#c0392b] hover:bg-[#fbf3f0]">取消訂單</button>
            ) : null}
          </div>

          {/* 退貨 / 退款(待處理的申請放在上方,方便核准) */}
          {detail && (detail.returns.length > 0 || detail.refunds.length > 0) ? (
            <div className="rounded-xl border border-[#f0d9b5] bg-[#fffaf2] p-4">
              <h3 className="mb-3 font-semibold">退貨 / 退款</h3>
              <div className="space-y-3">
                {detail.returns.map((r) => (
                  <div key={r.id} className="rounded-xl border border-[#e5ded4] bg-white p-3">
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
                        <ReturnStatusControl r={r} busy={busy} shippingFee={refundableShipping(order)} onAction={(action, refundShipping) => reviewReturn(r.id, action, '', refundShipping)} />
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

          {/* 寄件單號(取代原本重複的物流資訊) */}
          {detail?.shipments.map((sh) => {
            const code = sh.store_print_no || sh.tracking_number;
            if (!code) return null;
            return (
              <div key={sh.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#faf7f2] px-4 py-3">
                <p className="text-sm text-[#2c2826]">
                  <span className="font-semibold">{shipmentLabel(sh, order.shipping_method)}：</span>
                  <span className="select-all tracking-wide">{code}</span>
                </p>
                {sh.lgs_type && sh.ship_type ? (
                  <button
                    onClick={() => traceShipment(sh.id)}
                    disabled={busy}
                    className="rounded-full border border-[#d7c9bd] bg-white px-3 py-1 text-xs font-semibold text-[#6b6156] disabled:opacity-50"
                  >
                    更新貨態
                  </button>
                ) : null}
              </div>
            );
          })}

          {/* 進度(含圖示) */}
          {isReturnOrder(order, detail?.returns) ? (
            <AdminReturnProgress order={order} returns={detail?.returns ?? []} refunds={detail?.refunds ?? []} />
          ) : (
            <AdminOrderProgress order={order} createdAt={order.created_at} paidAt={paidAt} />
          )}

          {/* 訂單歷程(放在進度下方,可展開) */}
          {timeline.length > 0 ? (
            <div className="-mt-2 text-center">
              <button
                type="button"
                onClick={() => setHistoryOpen((v) => !v)}
                aria-expanded={historyOpen}
                className="inline-flex items-center gap-1 text-xs text-[#8a7f72] hover:text-[#1f1b19]"
              >
                訂單歷程({timeline.length})
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`transition-transform ${historyOpen ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6" /></svg>
              </button>
              {historyOpen && (
                <ol className="mt-3 space-y-3 rounded-xl border border-[#efe8dd] bg-[#faf7f2] p-4 text-left">
                  {timeline.map((item) => (
                    <li key={item.id} className="flex gap-3">
                      <span className="mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: `${item.kind.tone}1a`, color: item.kind.tone }}>{item.kind.label}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-[#3f3a34]">{item.text}</p>
                        <p className="text-xs text-[#a99e8f]">
                          {new Date(item.at).toLocaleString('zh-TW')}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ) : null}

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
                  onClick={async () => {
                    if (!(await uiConfirm('核准取消?將取消這筆訂單。'))) return;
                    const refunded = order.paid ? await uiConfirm(`此訂單已付款 ${formatter.format(order.total)},是否一併標記已退款?\n(實際退刷仍需至金流後台操作)`) : false;
                    onReviewCancel('approve', cancelReply.trim(), refunded);
                  }}
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

          {/* 尚未建立物流單:建立出貨單(門市與收件資料見下方「送貨資訊」) */}
          {!detailLoading && !hasShipment && !isHomeDelivery ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#efe8dd] px-4 py-3">
              <p className="text-sm text-[#6b6156]">尚未建立物流單</p>
              <button
                onClick={() => createShipment(Boolean(order.store_id))}
                disabled={busy}
                className="rounded-full bg-[#1f1b19] px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                建立出貨單
              </button>
            </div>
          ) : null}

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
              {row('付款狀態', order.paid ? (order.refund_amount ? `已付款(已退款 ${formatter.format(order.refund_amount)})` : '已付款') : '未付款')}
              <div className="flex flex-wrap justify-end gap-2 pt-1">
                {!order.paid && order.status !== '取消' ? (
                  <button onClick={async () => { if (await uiConfirm('確認已收到這筆訂單的款項?')) onUpdate({ paid: true }); }} className="rounded-full bg-[#1f7a44] px-4 py-1.5 text-xs font-semibold text-white">標記已付款</button>
                ) : null}
                {order.paid ? (
                  <button onClick={markRefund} className="rounded-full border border-[#d7c9bd] px-4 py-1.5 text-xs font-semibold text-[#6b6156] hover:bg-[#efe8dd]">標記退款</button>
                ) : null}
              </div>
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
                  <a href={`/api/orders/${encodeURIComponent(order.id)}/payment-proof`} target="_blank" rel="noreferrer" className="inline-block text-sm font-semibold text-[#c84767] underline">
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
              {/* 超商取貨:地址欄就是門市資料,改由下方取貨門市/門市地址顯示,避免重複 */}
              {order.store_name || order.store_id ? null : row('地址', order.address)}
              {row('送貨方式', order.shipping_method)}
              {row('取貨門市', order.store_name ? (order.store_id && order.store_id !== 'MANUAL' ? `${order.store_name}（${order.store_id}）` : order.store_name) : order.store_id)}
              {row('門市地址', order.store_address)}
              {row('門市電話', order.store_phone)}
              {row('付款方式', order.payment_method)}
            </div>
          </div>

        </div>
      </div>
      {homeShipOpen ? <HomeShipModal busy={busy} store={isManualStore} shippingMethod={order.shipping_method ?? ''} onClose={() => setHomeShipOpen(false)} onSubmit={shipHome} /> : null}
      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-none fixed left-1/2 top-1/2 z-[80] w-max max-w-[85vw] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-[#333333]/80 px-6 py-4 text-center text-sm font-semibold leading-6 text-white shadow-lg transition-opacity duration-300 ${toast ? 'opacity-100' : 'opacity-0'}`}
      >
        {toast}
      </div>
    </div>
  );
}

const HOME_CARRIERS = ['黑貓宅急便', '新竹物流', '中華郵政', '宅配通', '嘉里大榮', '7-11 賣貨便', '全家好賣+', '萊爾富', 'OK 超商'];

// 宅配 / 超商自行寄件:選寄送方式,需要時填物流單號(7-11 交貨便、全家店到店不必填)
function HomeShipModal({ busy, store = false, shippingMethod = '', onClose, onSubmit }: { busy: boolean; store?: boolean; shippingMethod?: string; onClose: () => void; onSubmit: (carrier: string, tracking: string) => void }) {
  const carriers = store ? [...NO_TRACKING_CARRIERS, ...HOME_CARRIERS] : [...HOME_CARRIERS, ...NO_TRACKING_CARRIERS];
  const [carrier, setCarrier] = useState((store && defaultSelfShipCarrier(shippingMethod)) || carriers[0]);
  const [other, setOther] = useState('');
  const [tracking, setTracking] = useState('');
  const name = carrier === '其他' ? other.trim() : carrier;
  return (
    <div className="fixed inset-0 z-[75] flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <form
        className="w-full max-w-sm rounded-t-2xl bg-white p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (!name) { void uiAlert('請選擇寄送方式'); return; }
          if (!tracking.trim() && needsTracking(name)) { void uiAlert('請填寫物流單號'); return; }
          onSubmit(name, tracking.trim());
        }}
      >
        <h3 className="text-lg font-semibold">{store ? '超商寄件' : '宅配出貨'}</h3>
        <p className="mt-1 text-xs text-[#8a7f72]">填寫後訂單會標記為已出貨,並記錄在訂單歷程。</p>
        <label className="mt-4 block text-sm">
          <span className="mb-1 block font-semibold text-[#6b6156]">寄送方式</span>
          <select value={carrier} onChange={(e) => setCarrier(e.target.value)} className="w-full rounded-lg border border-[#e5ded4] bg-white px-3 py-2">
            {[...carriers, '其他'].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        {carrier === '其他' ? (
          <input value={other} onChange={(e) => setOther(e.target.value)} placeholder="物流公司名稱" className="mt-2 w-full rounded-lg border border-[#e5ded4] px-3 py-2 text-sm" />
        ) : null}
        <label className="mt-3 block text-sm">
          <span className="mb-1 block font-semibold text-[#6b6156]">物流單號{needsTracking(name) ? '' : '(選填)'}</span>
          <input value={tracking} onChange={(e) => setTracking(e.target.value)} inputMode="numeric" placeholder="例如 123456789012" className="w-full rounded-lg border border-[#e5ded4] px-3 py-2" />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full border border-[#d7c9bd] px-4 py-2 text-sm font-semibold">取消</button>
          <button type="submit" disabled={busy} className="rounded-full bg-[#1f7a44] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? '處理中…' : '確認出貨'}</button>
        </div>
      </form>
    </div>
  );
}

// 後台畫面不顯示金流 / 物流服務商品牌字樣(「藍新」)
function stripBrand(text: string) {
  return text.replace(/藍新物流[-－]/g, '').replace(/藍新/g, '').trim();
}

// 寄件單號標題,例如「全家店到店」「7-11 店到店」「宅配」
function shipmentLabel(sh: Shipment, shippingMethod = '') {
  const text = `${sh.provider ?? ''} ${sh.store_name ?? ''} ${sh.shipping_method ?? ''} ${shippingMethod}`;
  if (/全家/.test(text)) return '全家店到店';
  if (/7-?11|統一|7-ELEVEN/i.test(text)) return '7-11 店到店';
  if (/萊爾富/.test(text)) return '萊爾富店到店';
  if (/OK/i.test(text)) return 'OK 店到店';
  if (/宅配|黑貓|新竹|郵局/.test(text)) return `${sh.provider || '宅配'}單號`;
  return `${sh.provider || '物流'}單號`;
}

function historyLabel(h: OrderStatusHistory): string {
  const map =
    h.type === 'payment' ? PAYMENT_STATUS_LABEL
    : h.type === 'fulfillment' ? FULFILLMENT_STATUS_LABEL
    : ORDER_STATUS_LABEL;
  const to = map[h.to_status ?? ''] ?? h.to_status ?? '';
  const kind = h.type === 'payment' ? '付款' : h.type === 'fulfillment' ? '物流' : '訂單';
  return h.note ? h.note : `${kind}狀態 → ${to}`;
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
  onStocktakeApplied,
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
  onStocktakeApplied: (r: StocktakeApplied) => void;
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
  const [inventoryTab, setInventoryTab] = useState<'products' | 'stock' | 'movement' | 'history' | 'stocktake'>('products');
  const [movementPicker, setMovementPicker] = useState<{
    lineId: string;
    field: 'product' | 'variant';
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
    { key: 'stocktake', label: '盤點' },
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
    setMovementLines([{ id: `line-${Date.now()}`, product_id: '', variant_key: '', quantity: 1, unit_price: 0 }]);
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
  const filteredPickerProducts = products.filter((product) => {
    const q = pickerQuery.trim().toLowerCase();
    if (!q) return true;
    return [product.id, product.name, catName(product.category)].some((value) =>
      String(value).toLowerCase().includes(q),
    );
  });
  const pickerVariants = (pickerProduct?.variants ?? []).filter((variant) => variant.options.join(' / ').toLowerCase().includes(pickerQuery.trim().toLowerCase()));
  const chooseMovementOption = (value: string) => {
    if (!movementPicker) return;
    if (movementPicker.field === 'product') {
      const product = products.find((p) => p.id === value);
      const target = resolveStockMovementTarget(product);
      updateMovementLine(movementPicker.lineId, { product_id: value, variant_key: target.ok ? target.variantKey : '' });
    } else {
      updateMovementLine(movementPicker.lineId, { variant_key: value });
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
  // 進出庫紀錄匯出(目前載入的紀錄)
  const exportMovementsCsv = () => {
    downloadCsv(`urbanite-stock-movements-${new Date().toISOString().slice(0, 10)}.csv`, [
      ['登錄日期', '單號', '品項編號', '品名', '規格', '類型', '數量', '單價', '地點 / 對象', '經手人', '備註'],
      ...movements.map((m) => {
        const doc = parseMovementNote(m.note);
        return [m.created_at ? new Date(m.created_at).toLocaleString('zh-TW', { hour12: false }) : '', doc.document_no || '', m.product_id, nameById(m.product_id), m.variant_key || '', m.type === 'in' ? '入庫' : '出庫', m.quantity, m.unit_price, m.location || '', m.handler || '', doc.note || m.note || ''];
      }),
    ]);
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
      <div className="overflow-x-auto overflow-y-hidden rounded-2xl border border-[#e5ded4] bg-white p-2">
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
                        <NumberInput
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
                        <NumberInput
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
                  <th className="px-3 py-3">規格 / 尺寸</th>
                  <th className="px-3 py-3 text-right">數量</th>
                  <th className="px-3 py-3 text-right">單價</th>
                  <th className="px-3 py-3 text-right">小計</th>
                  <th className="px-3 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {movementLines.map((line) => {
                  const lineProduct = products.find((p) => p.id === line.product_id);
                  const target = resolveStockMovementTarget(lineProduct, line.variant_key);
                  const selectedVariant = target.ok && target.variantIndex !== null ? lineProduct?.variants[target.variantIndex] : null;
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
                          onClick={() => setMovementPicker({ lineId: line.id, field: 'variant' })}
                          aria-label="選擇規格 / 尺寸"
                          className="w-64 whitespace-normal rounded-lg border border-[#e5ded4] bg-white px-3 py-2 text-left disabled:bg-[#f3eee7] disabled:text-[#aaa]"
                        >
                          {target.ok ? target.variantKey || '無規格 / 尺寸' : lineProduct?.variants.length ? '選擇規格 / 尺寸' : '無規格 / 尺寸'}
                        </button>
                        {lineProduct && <p className="mt-1 text-xs text-[#8a7f72]">庫存 {selectedVariant?.inventory ?? (lineProduct.variants.length ? '—' : lineProduct.inventory)}</p>}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <NumberInput
                          min={1}
                          value={line.quantity}
                          onChange={(e) => updateMovementLine(line.id, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                          className="w-24 rounded-lg border border-[#e5ded4] px-3 py-2 text-right"
                        />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <NumberInput
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
      {inventoryTab === 'stocktake' && (
        <StocktakeManager products={products} categories={categories} onApplied={onStocktakeApplied} />
      )}

      {inventoryTab === 'history' && (
      <Card
        title="進出庫紀錄"
        action={movements.length ? (
          <button type="button" onClick={exportMovementsCsv} className="rounded-full border border-[#d7c9bd] px-4 py-2 text-sm font-semibold">
            匯出紀錄
          </button>
        ) : undefined}
      >
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
                    setMovementLines([{ id: `line-${Date.now()}`, product_id: '', variant_key: '', quantity: 1, unit_price: 0 }]);
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
                  {movementPicker.field === 'product' ? '選擇型號' : '選擇規格 / 尺寸'}
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
              <input
                  value={pickerQuery}
                  onChange={(e) => setPickerQuery(e.target.value)}
                  placeholder={movementPicker.field === 'product' ? '搜尋型號、品名、分類' : '搜尋規格、尺寸'}
                  className="mb-4 w-full rounded-xl border border-[#e5ded4] px-4 py-3"
              />
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
              {movementPicker.field === 'variant' && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {pickerVariants.map((variant, index) => (
                    <button
                      key={`${variant.options.join(' / ')}-${index}`}
                      type="button"
                      onClick={() => chooseMovementOption(variant.options.join(' / '))}
                      className="rounded-xl border border-[#e5ded4] p-4 text-left font-semibold hover:border-[#1f1b19]"
                    >
                      <span className="block">{variant.options.join(' / ') || '無規格 / 尺寸'}</span>
                      <span className="mt-1 block text-xs font-normal text-[#8a7f72]">庫存 {variant.inventory}</span>
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

function OverviewActionCard({
  icon,
  title,
  value,
  caption,
  action,
  tone,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  caption: string;
  action: string;
  tone: 'plain' | 'soft';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        tone === 'soft'
          ? 'border-[#ead7d8] bg-[#f5e8e8]'
          : 'border-[#e5ded4] bg-white'
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-[#7d1f34]">{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold tracking-[0.04em] text-[#1f1b19]">{title}</p>
          <div className="mt-1 flex items-end justify-between gap-2">
            <div>
              <p className="font-serif-tc text-[48px] font-semibold leading-none tracking-normal text-[#1f1b19]">{value}</p>
              {caption ? <p className="mt-1 text-xs font-medium text-[#8a7f72]">{caption}</p> : null}
            </div>
            <span className="mb-1 inline-flex shrink-0 items-center gap-1 text-sm font-bold text-[#7d1f34]">
              {action} <span aria-hidden>→</span>
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

function OverviewMiniStat({ label, value, bordered = false }: { label: string; value: number; bordered?: boolean }) {
  return (
    <div className={`text-center ${bordered ? 'border-l border-[#ded5c8]' : ''}`}>
      <p className="text-sm font-semibold text-[#8a7f72]">{label}</p>
      <p className="font-serif-tc mt-1 text-3xl font-semibold leading-none tracking-normal text-[#1f1b19]">{value}</p>
    </div>
  );
}

function AdminOverviewStatus({ status }: { status: string }) {
  const tone =
    status === '待出貨'
      ? 'bg-[#ece8f2] text-[#6a5b75]'
      : status === '尚未付款'
        ? 'bg-[#fbf0dc] text-[#8a641f]'
        : status === '已完成'
          ? 'bg-[#e6f2ea] text-[#386b4b]'
          : status === '已出貨'
            ? 'bg-[#e7eff5] text-[#3c6175]'
            : 'bg-[#f1ece7] text-[#6f665d]';
  return <span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ${tone}`}>{status}</span>;
}

function IconSearchCompact() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="#8a7f72" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m16.5 16.5 4 4" />
    </svg>
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
    .map((s) => ({ name: s.name.trim(), options: parseOptions(s.optionsText), display: s.display }))
    .filter((s) => s.name && s.options.length > 0);
  const modalCombos = specCombos(modalSpecs);
  const hasSpecs = modalCombos.length > 0;
  const specTotal = modalCombos.reduce(
    (n, opts) => n + (Number(draft.variantStock[opts.join(' / ')]) || 0),
    0,
  );

  function updateSpec(i: number, patch: Partial<{ name: string; optionsText: string; display: 'text' | 'image' }>) {
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
  // 空白 = 全部(和系統設定一樣):畫面上顯示成全部勾選,取消勾選時從全部扣掉
  const payList = draft.available_payment_methods.length ? draft.available_payment_methods : paymentMethods;
  const shipChosen = draft.available_shipping_methods.filter((item) => item !== '免運');
  const shipList = shipChosen.length ? shipChosen : shippingMethods;
  function toggleMethod(
    key: 'available_payment_methods' | 'available_shipping_methods',
    method: string,
    checked: boolean,
  ) {
    const current = key === 'available_payment_methods' ? payList : shipList;
    const next = checked ? [...current.filter((item) => item !== method), method] : current.filter((item) => item !== method);
    if (!next.length) return void uiAlert(key === 'available_payment_methods' ? '至少要保留一種金流' : '至少要保留一種物流');
    const free = key === 'available_shipping_methods' && draft.available_shipping_methods.includes('免運') ? ['免運'] : [];
    set(key, [...free, ...next]);
  }
  function toggleFreeShipping(checked: boolean) {
    const current = draft.available_shipping_methods.filter((item) => item !== '免運');
    const baseMethods = current.length ? current : shippingMethods;
    set('available_shipping_methods', checked ? ['免運', ...baseMethods] : current);
  }
  function syncDescription() {
    set('tagline', descriptionRef.current?.innerHTML ?? '');
  }
  // 貼上時清掉外部字體、字級等樣式,前台字體才會一致
  function pasteDescription(e: React.ClipboardEvent<HTMLDivElement>) {
    const html = e.clipboardData.getData('text/html');
    if (!html) return;
    e.preventDefault();
    const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html;
    document.execCommand('insertHTML', false, cleanRichText(body.replace(/<!--[\s\S]*?-->/g, '')));
    syncDescription();
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
  // 商品描述插入圖片:選檔上傳後插入(不再貼網址)
  const descriptionImageInput = useRef<HTMLInputElement>(null);
  function addDescriptionImage() {
    descriptionImageInput.current?.click();
  }
  async function uploadDescriptionImage(file: File) {
    try {
      const prepared = await prepareProductImage(file, 0);
      const fd = new FormData();
      fd.append('file', prepared.blob, prepared.filename);
      fd.append('productId', draft.id || 'description');
      const res = await fetch('/api/products/image', { method: 'POST', body: fd });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.image_url) throw new Error(data?.error ?? '圖片上傳失敗');
      runDescriptionCommand('insertImage', data.image_url);
    } catch (error) {
      void uiAlert(error instanceof Error ? error.message : '圖片上傳失敗');
    }
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
          const cutout = await fitProductPhoto(await removeBackground(picked[i]), i, 'contain');
          blob = cutout.blob;
          filename = cutout.filename;
        } else {
          // 已去背(有透明區域)的 PNG / WebP:保留透明、完整縮放置中;一般照片才裁成滿版 JPG
          const prepared = await fitProductPhoto(picked[i], i, (await hasTransparency(picked[i])) ? 'contain' : 'cover');
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
	                    {s === UNLISTED_STATUS ? '未上架' : s}
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
	                <input ref={descriptionImageInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void uploadDescriptionImage(file); }} />
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
              onPaste={pasteDescription}
	              onBlur={syncDescription}
	            />
	            </div>
	          </Field>
	          </div>
	          <div className="grid grid-cols-2 gap-3">
            <Field label="基本售價">
              <NumberInput
                inputMode="numeric"
                placeholder="0"
                className="w-full rounded-lg border border-[#e5ded4] px-3 py-2"
                // 0 顯示成空白,打字時才不會變成「0300」
                value={draft.price ? draft.price : ''}
                onChange={(e) => set('price', Number(e.target.value.replace(/^0+(?=\d)/, '')) || 0)}
              />
            </Field>
            <Field label="原價(可空)">
              <NumberInput
                className="w-full rounded-lg border border-[#e5ded4] px-3 py-2"
                value={draft.original_price ?? ''}
                onChange={(e) => set('original_price', e.target.value === '' ? null : Number(e.target.value))}
	              />
	            </Field>
	          </div>
	          <div className="mt-4 rounded-xl border border-[#e5ded4] p-4">
	            <FieldGroup label="商品規格">
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
	                      {/* 選項可拖曳排序(電腦按住拖、手機長按後拖) */}
	                      <DraggableChips
	                        items={parseOptions(s.optionsText)}
	                        onReorder={(next) => updateSpec(i, { optionsText: next.join(', ') })}
	                        onRemove={(option) => removeSpecOption(i, option)}
	                      />
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
	                    <div className="flex items-center gap-1 text-xs md:col-span-3">
	                      <span className="text-[#8a7f72]">前台按鈕顯示</span>
	                      {(['text', 'image'] as const).map((mode) => (
	                        <button key={mode} type="button" onClick={() => updateSpec(i, { display: mode })} className={`rounded-full px-3 py-1 font-semibold ${(s.display ?? 'text') === mode ? 'bg-[#1f1b19] text-white' : 'border border-[#d7c9bd] text-[#6b6156]'}`}>{mode === 'text' ? '文字' : '規格圖'}</button>
	                      ))}
	                      {s.display === 'image' && <span className="text-[#8a7f72]">(在下方上傳每個選項的圖片)</span>}
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
                {modalSpecs.filter((dim) => dim === colorDim || dim.display === 'image').map((dim) => (
                  <div key={dim.name} className="mt-3 rounded-xl border border-[#e5ded4] p-3">
                    <p className="mb-2 text-sm font-semibold text-[#8a7f72]">
                      {dim.name}圖片({dim.display === 'image' ? '前台規格按鈕顯示這張圖,' : ''}點選會在上方顯示大圖)
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {dim.options.map((color) => (
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
                ))}
	              </div>
	            </FieldGroup>
                {hasSpecs && (
                  <div className="mt-4 border-t border-[#e5ded4] pt-3">
                    <h3 className="text-sm font-semibold">規格售價</h3>
                    <div className="mt-2 divide-y divide-[#e5ded4]">
                      {modalCombos.map((opts) => {
                        const key = opts.join(' / ');
                        return (
                          <label key={key} className="grid grid-cols-[minmax(0,1fr)_minmax(120px,160px)] items-center gap-3 py-2 text-sm">
                            <span className="break-words">{key}</span>
                            <NumberInput
                              aria-label={`${key} 售價`}
                              min={0}
                              value={draft.variantPrice[key] ?? ''}
                              placeholder={`沿用 ${draft.price}`}
                              className="min-w-0 w-full rounded-lg border border-[#e5ded4] px-3 py-2"
                              onChange={(e) => {
                                const next = { ...draft.variantPrice };
                                if (e.target.value === '') delete next[key];
                                else next[key] = Number(e.target.value);
                                set('variantPrice', next);
                              }}
                            />
                          </label>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-xs text-[#8a7f72]">售價留空沿用基本售價。新增商品的庫存請至庫存管理登錄入庫單。</p>
                  </div>
                )}
	          </div>
	          <div className="grid gap-3 sm:grid-cols-2">
	            <Field label={draft.campaign_id ? "活動分類(活動頁篩選用)" : "分類(首頁篩選用)"}>
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
            <FieldGroup label="可用金流(預設同系統設定)">
              <div className="space-y-2 rounded-lg border border-[#e5ded4] p-3">
                {paymentMethods.length === 0 ? (
                  <p className="text-sm text-[#8a7f72]">請先到系統設定新增金流方式。</p>
                ) : (
                  paymentMethods.map((method) => (
                    <label key={method} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={payList.includes(method)}
                        onChange={(e) => toggleMethod('available_payment_methods', method, e.target.checked)}
                      />
                      <span>{method}</span>
                    </label>
                  ))
                )}
              </div>
            </FieldGroup>
            <FieldGroup label="可用物流與運費(預設同系統設定;運費留空=用後台預設)">
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
                            checked={shipList.includes(method)}
                            onChange={(e) => toggleMethod('available_shipping_methods', method, e.target.checked)}
                          />
                          <span>{method}</span>
                        </label>
                        <div className="flex items-center gap-1 text-[#8a7f72]">
                          <span>運費 NT$</span>
                          <NumberInput
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
	            </FieldGroup>
	          </div>
	          </section>
	          <section className="rounded-2xl bg-white p-5">
	          {/* 不能用 <label>(Field):點區塊任何地方都會觸發第一個按鈕,誤刪第一張圖 */}
	          <div className="block">
	            <span className="mb-1 block text-sm font-semibold text-[#8a7f72]">{`商品圖片(最多 ${MAX_PRODUCT_IMAGES} 張,第一張為封面)`}</span>
            <div className="grid gap-3">
              {draft.images.length > 0 && (
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                  {draft.images.map((url, index) => (
                    <div
                      key={`${url}-${index}`}
                      className="group relative aspect-[4/5] overflow-hidden rounded-lg border border-[#e5ded4] bg-[#f6f2ec]"
                    >
                      {/* iPhone Safari:大照片加 drop-shadow 濾鏡、或在固定比例框裡用百分比高度,常常整張畫不出來 → 絕對定位,陰影只給去背 PNG */}
                      <img src={url} alt="" loading="eager" decoding="async" className={`absolute inset-0 h-full w-full object-contain ${/\.png($|\?)/i.test(url) ? 'drop-shadow-[0_10px_12px_rgba(31,27,25,0.2)]' : ''}`} />
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
	            </div>
	          </div>
	          </section>
		          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="排序(小的在前)">
              <NumberInput
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

// 含多個按鈕/勾選框的區塊用 FieldGroup(div):<label> 會把區塊內任何點擊轉給第一個控制項
function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="block">
      <span className="mb-1 block text-sm font-semibold text-[#8a7f72]">{label}</span>
      {children}
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

function IconChat() {
  return (
    <svg {...svgProps}>
      <path d="M12 4C7 4 3 7.1 3 11c0 3.4 3 6.2 7.1 6.9l-.6 2.6 3.6-2.5C17.6 17.6 21 14.6 21 11c0-3.9-4-7-9-7z" />
      <path d="M8 10.5h8M8 13.5h5" />
    </svg>
  );
}

function IconIdCard() {
  return (
    <svg {...svgProps}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="11" r="2" />
      <path d="M6 16c.5-1.5 1.7-2.3 3-2.3s2.5.8 3 2.3M14 10h4M14 13h3" />
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
