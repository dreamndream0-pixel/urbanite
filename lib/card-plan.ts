// 名片服務四個等級(前後台共用,不含伺服器程式)
// U Free 免費名片 / U Plus 付費名片 / U Pro 基本官網 / U Max 全功能

export type CardTier = 'free' | 'plus' | 'pro' | 'max';
export type PaidTier = Exclude<CardTier, 'free'>;
export type CardPeriod = 'month' | 'year';

export const PERIODS: Record<CardPeriod, { label: string; days: number }> = {
  month: { label: '月付', days: 31 },
  year: { label: '年付', days: 366 },
};

export const TIERS: {
  key: CardTier;
  name: string;
  tagline: string;
  prices: Record<CardPeriod, number> | null;
  available: boolean; // 目前可購買(U Pro / U Max 開發中)
}[] = [
  { key: 'free', name: 'U Free', tagline: '免費個人名片', prices: null, available: true },
  { key: 'plus', name: 'U Plus', tagline: '完整個人名片', prices: { month: 99, year: 990 }, available: true },
  { key: 'pro', name: 'U Pro', tagline: '名片+基本官網', prices: { month: 399, year: 3990 }, available: false },
  { key: 'max', name: 'U Max', tagline: '全功能品牌官網', prices: { month: 999, year: 9990 }, available: false },
];

export const tierInfo = (tier: CardTier) => TIERS.find((t) => t.key === tier) ?? TIERS[0];
export const tierRank = (tier: CardTier) => TIERS.findIndex((t) => t.key === tier);

export type PlanLimits = {
  maxBlocks: number;
  allTemplates: boolean;
  customStyle: boolean; // 背景、簡介樣式、連結樣式自訂
  timed: boolean; // 限時顯示
  seo: boolean; // 自訂分享預覽
  hideFooter: boolean; // 隱藏頁尾 Urbanite 標誌
  statsDays: number;
  sources: boolean; // 流量來源
};

export const FREE_LIMITS: PlanLimits = { maxBlocks: 8, allTemplates: false, customStyle: false, timed: false, seo: false, hideFooter: false, statsDays: 7, sources: false };
// U Plus 以上:名片功能全開
export const PRO_LIMITS: PlanLimits = { maxBlocks: 100, allTemplates: true, customStyle: true, timed: true, seo: true, hideFooter: true, statsDays: 30, sources: true };

// 免費版可用的樣板
export const FREE_TEMPLATE_KEYS = ['ivory', 'gray-note', 'hero-sun', 'polaroid-green', 'label-sand', 'float-latte', 'framed-wood', 'mag-mono'];

// pro:名片付費功能是否開啟(U Plus 以上)
export type CardPlanInfo = { tier: CardTier; pro: boolean; isAdmin: boolean; expiresAt: string | null; limits: PlanLimits };

// 方案比較表:[U Free, U Plus, U Pro, U Max]
export const TIER_FEATURES: { group: string; rows: { label: string; values: [string, string, string, string] }[] }[] = [
  {
    group: '個人名片',
    rows: [
      { label: '專屬網址 /@代稱', values: ['✓', '✓', '✓', '✓'] },
      { label: '連結與區塊', values: ['8 個', '不限', '不限', '不限'] },
      { label: '樣板', values: ['8 款', '24 款', '24 款', '24 款'] },
      { label: '自訂背景、文字、按鈕樣式', values: ['—', '✓', '✓', '✓'] },
      { label: '限時顯示、自訂分享預覽', values: ['—', '✓', '✓', '✓'] },
      { label: '隱藏頁尾 Urbanite 標誌', values: ['—', '✓', '✓', '✓'] },
      { label: '數據分析', values: ['7 天', '30 天+來源', '30 天+來源', '30 天+來源'] },
    ],
  },
  {
    group: '官網與商店',
    rows: [
      { label: '子網域官網(你的名字.urbanite.com.tw)', values: ['—', '—', '✓', '✓'] },
      { label: '商品上架', values: ['—', '—', '50 件', '不限'] },
      { label: '購物車結帳(串接自己的藍新金流)', values: ['—', '—', '✓', '✓'] },
      { label: '訂單管理', values: ['—', '—', '✓', '✓'] },
      { label: '優惠碼', values: ['—', '—', '基本', '完整(含優惠券、購物金)'] },
      { label: '網站配色與版面', values: ['—', '—', '✓', '✓'] },
    ],
  },
  {
    group: '進階經營',
    rows: [
      { label: '會員系統、會員中心', values: ['—', '—', '—', '✓'] },
      { label: '超商取貨、宅配物流串接', values: ['—', '—', '—', '✓'] },
      { label: 'LINE 機器人與推播', values: ['—', '—', '—', '✓'] },
      { label: '一頁式促銷頁', values: ['—', '—', '—', '✓'] },
      { label: '自訂網域', values: ['—', '—', '—', '✓'] },
      { label: '移除所有 Urbanite 標示', values: ['—', '—', '—', '✓'] },
    ],
  },
];

// 代稱不能用的字(與網站頁面衝突)
export const RESERVED_SLUGS = ['admin', 'api', 'card', 'mycard', 'login', 'register', 'account', 'checkout', 'products', 'promo', 'line', 'auth', 'www', 'help', 'about', 'pricing', 'settings', 'shop', 'store', 'mail'];
