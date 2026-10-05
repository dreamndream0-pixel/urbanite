// 個人名片服務:免費 / Pro 方案(前後台共用,不含伺服器程式)

export type CardPeriod = 'month' | 'year';

export const PLAN_PRICES: Record<CardPeriod, { amount: number; label: string; days: number; note: string }> = {
  month: { amount: 99, label: '月付', days: 31, note: '每月 NT$99' },
  year: { amount: 990, label: '年付', days: 366, note: '每年 NT$990,約 83 折' },
};

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
export const PRO_LIMITS: PlanLimits = { maxBlocks: 100, allTemplates: true, customStyle: true, timed: true, seo: true, hideFooter: true, statsDays: 30, sources: true };

// 免費版可用的樣板
export const FREE_TEMPLATE_KEYS = ['ivory', 'gray-note', 'hero-sun', 'polaroid-green', 'label-sand', 'float-latte', 'framed-wood', 'mag-mono'];

export type CardPlanInfo = { pro: boolean; isAdmin: boolean; expiresAt: string | null; limits: PlanLimits };

export const PLAN_FEATURES: { label: string; free: string; pro: string }[] = [
  { label: '專屬網址', free: 'urbanite.com.tw/@你的代稱', pro: '同左' },
  { label: '連結與區塊', free: '最多 8 個', pro: '不限' },
  { label: '樣板', free: '8 款', pro: '全部 24 款' },
  { label: '自訂背景、文字、按鈕樣式', free: '—', pro: '✓' },
  { label: '限時顯示', free: '—', pro: '✓' },
  { label: '自訂分享預覽(標題、圖片)', free: '—', pro: '✓' },
  { label: '隱藏頁尾 Urbanite 標誌', free: '—', pro: '✓' },
  { label: '數據分析', free: '近 7 天', pro: '近 30 天+流量來源' },
];

// 代稱不能用的字(與網站頁面衝突)
export const RESERVED_SLUGS = ['admin', 'api', 'card', 'mycard', 'login', 'register', 'account', 'checkout', 'products', 'promo', 'line', 'auth', 'www', 'help', 'about', 'pricing', 'settings'];
