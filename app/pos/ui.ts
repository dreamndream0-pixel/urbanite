// POS 畫面共用樣式與小工具
import type { PosButton, PosDiscount, PosProduct, PosSession, PosSessionSummary, PosSettings } from '@/lib/pos';
import type { StockLocation } from '@/lib/stock-locations';

export const input = 'w-full rounded-xl border border-[#e5ded4] bg-white px-3 py-2.5 text-base! text-[#1f1b19] outline-none focus:border-[#1f1b19]/50';
export const btn = 'rounded-xl border border-[#d7c9bd] bg-white px-4 py-2.5 text-sm! font-semibold! text-[#1f1b19] whitespace-nowrap active:bg-[#f3ede4] disabled:opacity-40';
export const btnDark = 'rounded-xl border border-[#1f1b19] bg-[#1f1b19] px-4 py-2.5 text-sm! font-semibold! text-white whitespace-nowrap active:opacity-80 disabled:opacity-40';
export const btnDanger = 'rounded-xl border border-[#e3b8c2] bg-white px-4 py-2.5 text-sm! font-semibold! text-[#c84767] whitespace-nowrap active:bg-[#fbeef1] disabled:opacity-40';
export const chip = 'rounded-full border px-3.5 py-2 text-sm! font-medium! whitespace-nowrap';
export const label = 'mb-1 block text-xs! font-semibold! text-[#8a7f72]';

export type CartLine = { id: string; productId: string; variant: string; name: string; image: string; listPrice: number; price: number; quantity: number };
export type Member = { user_id: string; name: string; nickname?: string; phone?: string; email?: string };
export type Quote = { enabled: boolean; balance: number; max: number; tier: string; rate: number };
export type Hold = { id: string; at: string; lines: CartLine[]; discount: PosDiscount | null; code: string; member: Member | null; note: string };
export type SessionView = PosSession & { summary: PosSessionSummary };

export type Boot = {
  shop: { name: string; logo: string };
  cashier: string;
  products: PosProduct[];
  categories: { slug: string; name: string; parent_id?: string | null; campaign_id?: string | null }[];
  locations: StockLocation[];
  location: StockLocation;
  buttons: PosButton[];
  settings: PosSettings;
  session: SessionView | null;
  loyalty: boolean;
};

// 這台 POS 目前所在的分店 / 倉庫(班別、退貨等 API 都要帶)
let currentLocation = '';
export const setPosLocation = (id: string) => { currentLocation = id; };
export const posLocation = () => currentLocation;

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', ...init, headers: init?.body ? { 'Content-Type': 'application/json', ...(init.headers ?? {}) } : init?.headers });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `發生錯誤(${res.status})`);
  return data as T;
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : '發生錯誤,請再試一次');
export const toInt = (v: string) => Math.max(0, Math.floor(Number(v.replace(/[^\d]/g, '')) || 0));
export const timeLabel = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
export const fullTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false }) : '');
export const todayTaipei = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
export const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
