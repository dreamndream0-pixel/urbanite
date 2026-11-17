// POS 門市結帳:前後端共用的型別與金額計算。
// POS 銷售寫進 orders(channel = 'pos'),資料表見 supabase/migration-pos.sql。
import type { Product } from './types';

export const POS_SHIPPING_METHOD = '門市現場';
export const CASH = '現金';

export type PosSettings = {
  paymentMethods: string[]; // 現金一定在第一個
  receiptTitle: string; // 收據抬頭(空白 = 店名)
  receiptHeader: string; // 抬頭下方說明(地址、電話、統編…)
  receiptFooter: string;
  receiptWidth: 58 | 80; // 熱感紙寬(mm)
  allowOversell: boolean; // 庫存不足仍可銷售(庫存扣到 0)
};

export const DEFAULT_POS_SETTINGS: PosSettings = {
  paymentMethods: [CASH, '刷卡', 'LINE Pay', '轉帳'],
  receiptTitle: '',
  receiptHeader: '',
  receiptFooter: '謝謝光臨',
  receiptWidth: 58,
  allowOversell: false,
};

export function resolvePosSettings(raw: unknown): PosSettings {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const methods = Array.isArray(r.paymentMethods)
    ? [...new Set(r.paymentMethods.map((m) => String(m ?? '').trim().slice(0, 20)).filter(Boolean))].slice(0, 8)
    : DEFAULT_POS_SETTINGS.paymentMethods;
  const text = (v: unknown, fallback: string, max: number) => (typeof v === 'string' ? v.slice(0, max) : fallback);
  return {
    paymentMethods: [CASH, ...methods.filter((m) => m !== CASH)],
    receiptTitle: text(r.receiptTitle, '', 40),
    receiptHeader: text(r.receiptHeader, '', 300),
    receiptFooter: text(r.receiptFooter, DEFAULT_POS_SETTINGS.receiptFooter, 300),
    receiptWidth: r.receiptWidth === 80 ? 80 : 58,
    allowOversell: r.allowOversell === true,
  };
}

// POS 員工可以勾選的權限(管理員全部都有);基本結帳、找會員不用勾
export const POS_PERMISSIONS = [
  { key: 'discount', label: '改價與折扣', hint: '改單價、贈品、整筆折金額或折 %' },
  { key: 'refund', label: '退貨 / 作廢', hint: '把已結帳的訂單退款' },
  { key: 'session', label: '開班 / 交班', hint: '開班、現金存入取出、交班點鈔' },
  { key: 'orders', label: '查看 POS 訂單', hint: '看當天與過去的訂單、重印收據' },
  { key: 'settings', label: 'POS 設定', hint: '付款方式、發票號碼、收據文字' },
  { key: 'barcode', label: '綁定條碼', hint: '掃到沒登記的條碼時綁到商品' },
  { key: 'transfer', label: '調撥', hint: '在 POS 把商品調到別的分店 / 倉庫,或從別店調進來' },
] as const;
export type PosPermission = (typeof POS_PERMISSIONS)[number]['key'];

// POS 首頁按鈕:按下去跳出底下的商品(例:品牌 → 型號 → 顏色 / 尺寸)
export type PosButton = { id: string; name: string; color: string; productIds: string[] };
export const POS_BUTTON_COLORS = ['#1f1b19', '#8a6d3b', '#3f6b57', '#3b5b8a', '#8a3b55', '#6b4f9a', '#b0562c', '#5f5852'];

export function resolvePosButtons(raw: unknown): PosButton[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: PosButton[] = [];
  for (const item of raw.slice(0, 60)) {
    const r = item && typeof item === 'object' ? (item as Record<string, unknown>) : null;
    const name = String(r?.name ?? '').trim().slice(0, 20);
    const id = String(r?.id ?? '').slice(0, 40);
    if (!r || !name || !id || seen.has(id)) continue;
    seen.add(id);
    const color = String(r.color ?? '');
    out.push({
      id, name, color: /^#[0-9a-fA-F]{6}$/.test(color) ? color : POS_BUTTON_COLORS[0],
      productIds: Array.isArray(r.productIds) ? [...new Set(r.productIds.map((p) => String(p)).filter(Boolean))].slice(0, 500) : [],
    });
  }
  return out;
}

// 整筆折扣:折金額或打折(percent = 折掉的百分比,例:10 = 九折)
export type PosDiscount = { type: 'amount' | 'percent'; value: number };

export function manualDiscountAmount(subtotal: number, d: PosDiscount | null | undefined) {
  if (!d || !Number.isFinite(d.value) || d.value <= 0) return 0;
  const amount = d.type === 'percent' ? Math.round((subtotal * Math.min(100, d.value)) / 100) : Math.floor(d.value);
  return Math.max(0, Math.min(subtotal, amount));
}

export type PosPayment = { method: string; amount: number };

// 付款試算:非現金不能超過應收;現金可以多收(找零)
export function settlePayments(total: number, payments: PosPayment[]) {
  const list = payments.map((p) => ({ method: String(p.method ?? '').trim(), amount: Math.max(0, Math.floor(Number(p.amount) || 0)) })).filter((p) => p.method && p.amount > 0);
  const tendered = list.reduce((n, p) => n + p.amount, 0);
  const cash = list.filter((p) => p.method === CASH).reduce((n, p) => n + p.amount, 0);
  const nonCash = tendered - cash;
  const change = Math.max(0, tendered - total);
  const error = nonCash > total ? '非現金付款不能超過應收金額' : tendered < total ? '收款金額不足' : change > cash ? '找零不能超過收到的現金' : '';
  // 實際入帳:現金扣掉找零
  const applied = list.map((p) => ({ ...p })).filter((p) => p.method !== CASH);
  if (cash - change > 0) applied.unshift({ method: CASH, amount: cash - change });
  return { list, applied, tendered, cash, change, remaining: Math.max(0, total - tendered), error };
}

export type PosRefundEntry = { at: string; amount: number; method: string; by: string; reason?: string; restock: boolean; items: { index: number; quantity: number }[]; session_id?: string | null };

export type PosMeta = {
  cashier: string;
  payments: PosPayment[]; // 實際入帳(現金已扣找零)
  tendered: number;
  change: number;
  manual_discount: number;
  discount_label?: string;
  staff_id?: string; // 銷售人員(POS 員工;管理員結帳時沒有)
  staff_code?: string;
  location_id?: string; // 結帳的分店 / 倉庫
  location_name?: string;
  refunds?: PosRefundEntry[];
};

export type PosCashMove = { at: string; type: 'in' | 'out'; amount: number; note: string; by: string };
export type PosSessionRefund = { at: string; order_no: string; amount: number; method: string; by: string };

export type PosSession = {
  id: string;
  location_id?: string | null;
  status: 'open' | 'closed';
  opened_by: string;
  opened_at: string;
  opening_cash: number;
  cash_moves: PosCashMove[];
  refunds: PosSessionRefund[];
  closed_by: string;
  closed_at: string | null;
  counted_cash: number | null;
  expected_cash: number | null;
  difference: number | null;
  summary: PosSessionSummary | null;
  note: string;
};

export type PosSessionSummary = {
  orders: number; // 成交筆數
  items: number; // 售出件數
  gross: number; // 銷售金額(未扣退款)
  refunds: number; // 這一班退出去的金額
  byMethod: { method: string; sales: number; refunds: number }[];
  cashIn: number;
  cashOut: number;
  expectedCash: number; // 零用金 + 現金銷售 − 現金退款 + 存入 − 取出
};

type SummaryOrder = { items: { quantity: number }[]; total: number; pos?: PosMeta | null };

export function summarizeSession(session: Pick<PosSession, 'opening_cash' | 'cash_moves' | 'refunds'>, orders: SummaryOrder[]): PosSessionSummary {
  const methods = new Map<string, { method: string; sales: number; refunds: number }>();
  const slot = (m: string) => methods.get(m) ?? methods.set(m, { method: m, sales: 0, refunds: 0 }).get(m)!;
  let gross = 0, items = 0;
  for (const o of orders) {
    gross += Number(o.total) || 0;
    items += (o.items ?? []).reduce((n, i) => n + (Number(i.quantity) || 0), 0);
    for (const p of o.pos?.payments ?? []) slot(p.method).sales += Number(p.amount) || 0;
  }
  let refunds = 0;
  for (const r of session.refunds ?? []) { refunds += Number(r.amount) || 0; slot(r.method).refunds += Number(r.amount) || 0; }
  const moves = session.cash_moves ?? [];
  const cashIn = moves.filter((m) => m.type === 'in').reduce((n, m) => n + m.amount, 0);
  const cashOut = moves.filter((m) => m.type === 'out').reduce((n, m) => n + m.amount, 0);
  const cash = methods.get(CASH);
  return {
    orders: orders.length, items, gross, refunds,
    byMethod: [...methods.values()],
    cashIn, cashOut,
    expectedCash: (Number(session.opening_cash) || 0) + (cash?.sales ?? 0) - (cash?.refunds ?? 0) + cashIn - cashOut,
  };
}

// POS 前台用的精簡商品資料
export type PosProduct = Pick<Product, 'id' | 'name' | 'price' | 'inventory' | 'status' | 'category' | 'image' | 'specs' | 'variants' | 'unit' | 'campaign_id' | 'store_only'> & { barcode: string; total_inventory?: number };

export const variantKey = (options: string[]) => options.join(' / ');

// 掃描 / 輸入的代碼比對:條碼、貨號(商品編號)、貨號::規格
export function findByCode(products: PosProduct[], raw: string): { product: PosProduct; variant: string | null } | null {
  const code = raw.trim().toLowerCase();
  if (!code) return null;
  for (const p of products) {
    for (const v of p.variants ?? []) {
      const key = variantKey(v.options);
      if ((v.barcode ?? '').trim().toLowerCase() === code || `${p.id}::${key}`.toLowerCase() === code) return { product: p, variant: key };
    }
  }
  for (const p of products) {
    if ((p.barcode ?? '').trim().toLowerCase() === code || p.id.toLowerCase() === code) {
      const variants = p.variants ?? [];
      return { product: p, variant: variants.length === 1 ? variantKey(variants[0].options) : variants.length ? null : '' };
    }
  }
  return null;
}

export const posMoney = (n: number) => `NT$${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
