// 預約管理頁共用:資料型別、樣式、API 呼叫
import type {
  BkAddon, BkAllocation, BkBooking, BkBookingItem, BkQuote, BkQuoteVersion, BkBusiness, BkException, BkHour, BkPayment, BkBranch, BkResource, BkService, BkServiceStep, BkStaff, BkStaffHour, BkStaffService,
} from '@/lib/booking/shared';

export type Data = {
  business: BkBusiness; services: BkService[]; addons: BkAddon[]; hours: BkHour[]; staff: BkStaff[];
  staffHours: BkStaffHour[]; staffServices: BkStaffService[]; resources: BkResource[]; steps: BkServiceStep[]; allocations: BkAllocation[]; items: BkBookingItem[]; quotes: BkQuote[]; quoteVersions: BkQuoteVersion[];
  customers: { id: string; name: string; note: string; tags: string[]; user_id: string | null; points: number }[];
  products: import('@/lib/booking/loyalty').PackageProduct[];
  waitlist: import('@/lib/booking/engage').WaitlistEntry[];
  branches: BkBranch[];
  exceptions: BkException[]; bookings: BkBooking[]; payments: BkPayment[];
  card: { slug: string; display_name: string } | null; line_bound: boolean; today: string;
};

export const card = 'rounded-2xl border border-[#e5ded4] bg-white p-4 sm:p-5';
export const input = 'w-full rounded-xl border border-[#e5ded4] bg-white px-3 py-2.5 text-base text-[#1f1b19] outline-none focus:border-[#1f1b19]/40';
export const btn = 'rounded-full border border-[#d7c9bd] bg-white px-4 py-2 text-sm font-semibold whitespace-nowrap disabled:opacity-40';
export const btnDark = 'rounded-full bg-[#1f1b19] px-4 py-2 text-sm font-semibold text-white whitespace-nowrap disabled:opacity-40';
export const btnSm = 'rounded-full border border-[#d7c9bd] bg-white px-3 py-1.5 text-xs font-semibold whitespace-nowrap disabled:opacity-40';

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) }, cache: 'no-store' });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error?.message ?? '操作失敗,請稍後再試');
  return data as T;
}

export const errMsg = (e: unknown, fallback = '操作失敗') => (e instanceof Error ? e.message : fallback);

// 人員是否多於一位(一人工作室介面簡化,不顯示人員欄位)
export const isTeam = (data: Pick<Data, 'staff'>) => data.staff.filter((s) => s.active).length > 1;

// 可接主要服務的人員(助理只做助理步驟)
export const stylists = (data: Pick<Data, 'staff'>) => data.staff.filter((s) => s.active && s.role !== 'assistant');

// 每位人員一個顏色(預約卡左側色條、日曆區塊、人員頭像)
const TONES = [
  { bar: '#e9a48f', soft: '#fbe9e3', text: '#9a4a36' },
  { bar: '#e1bf8a', soft: '#f8eedb', text: '#8a6224' },
  { bar: '#9db8d9', soft: '#e7eff8', text: '#3f5f86' },
  { bar: '#a9c9a4', soft: '#e9f3e7', text: '#3d6a38' },
  { bar: '#c3a8d6', soft: '#f1e9f7', text: '#674a80' },
  { bar: '#e4a8bf', soft: '#fae9f0', text: '#8e4560' },
];
export type Tone = (typeof TONES)[number];
export function staffTone(data: Pick<Data, 'staff'>, staffId: string | null | undefined): Tone {
  const i = data.staff.findIndex((s) => s.id === staffId);
  return TONES[(i < 0 ? 0 : i) % TONES.length];
}

// 小顆的主要按鈕(不要用 btnSm 再疊深色底:bg-white 會蓋過,變成白底白字)
export const btnSmDark = 'rounded-full border border-[#1f1b19] bg-[#1f1b19] px-3 py-1.5 text-xs font-semibold text-white whitespace-nowrap disabled:opacity-40';
