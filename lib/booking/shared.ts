// 預約系統:前後台共用的型別、顯示文字與時段計算(不含伺服器程式)
// 時區:v1 只支援 Asia/Taipei(UTC+8,無日光節約),資料庫一律存 UTC timestamptz

export type BookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show' | 'expired';
export type ApprovalStatus = 'not_required' | 'pending' | 'approved' | 'rejected';

export type BkBusiness = {
  id: string;
  owner_user_id: string;
  card_id: string | null;
  name: string;
  enabled: boolean;
  timezone: string;
  approval_mode: 'auto' | 'manual';
  slot_interval: 15 | 30 | 60;
  lead_minutes: number;
  advance_days: number;
  buffer_minutes: number;
  approve_hours: number;
  cancel_hours: number;
  address: string;
  notice: string;
  reminder_24h: boolean;
  reminder_2h: boolean;
};

export type BkService = {
  id: string;
  business_id: string;
  name: string;
  description: string;
  duration_minutes: number;
  price: number;
  price_note: string;
  image: string;
  active: boolean;
  sort_order: number;
};

export type BkHour = { weekday: number; start_min: number; end_min: number };
export type BkException = { id: string; start_at: string; end_at: string; reason: string };

export type BkBooking = {
  id: string;
  business_id: string;
  booking_no: string;
  customer_user_id: string;
  service_id: string | null;
  service_snapshot: { name: string; duration_minutes: number; price: number; price_note?: string };
  start_at: string;
  end_at: string;
  occupy_end_at: string;
  status: BookingStatus;
  approval_status: ApprovalStatus;
  contact: { name?: string; phone?: string; note?: string };
  expires_at: string | null;
  cancel_reason: string;
  version: number;
  created_at: string;
};

export const DEFAULT_BUSINESS: Omit<BkBusiness, 'id' | 'owner_user_id' | 'card_id'> = {
  name: '',
  enabled: false,
  timezone: 'Asia/Taipei',
  approval_mode: 'manual',
  slot_interval: 30,
  lead_minutes: 120,
  advance_days: 30,
  buffer_minutes: 0,
  approve_hours: 12,
  cancel_hours: 24,
  address: '',
  notice: '',
  reminder_24h: true,
  reminder_2h: true,
};

export const STATUS_LABEL: Record<BookingStatus, string> = {
  pending: '待確認',
  confirmed: '已確認',
  completed: '已完成',
  cancelled: '已取消',
  no_show: '未到',
  expired: '已逾期',
};

export const STATUS_COLOR: Record<BookingStatus, string> = {
  pending: 'bg-[#fff3df] text-[#9a6412]',
  confirmed: 'bg-[#e7f3ea] text-[#2f6b3f]',
  completed: 'bg-[#eef0f5] text-[#4a5573]',
  cancelled: 'bg-[#f3ece9] text-[#8a5a50]',
  no_show: 'bg-[#f6e6e6] text-[#a03b3b]',
  expired: 'bg-[#f1efec] text-[#8a7f72]',
};

export const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

// ---------- 時間(台灣時間)----------
const TZ_OFFSET_MIN = 8 * 60;
const pad = (n: number) => String(n).padStart(2, '0');

// UTC 時間 → 台灣當地的日期字串 YYYY-MM-DD 與當天分鐘數
export function localParts(date: Date | string) {
  const d = new Date(new Date(date).getTime() + TZ_OFFSET_MIN * 60000);
  return {
    date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
    weekday: d.getUTCDay(),
  };
}

// 台灣當地日期 + 分鐘數 → UTC Date
export function fromLocal(dateStr: string, minutes: number) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, minutes) - TZ_OFFSET_MIN * 60000);
}

export const minutesToHHMM = (min: number) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;
export function hhmmToMinutes(v: string) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return NaN;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h > 24 || mm > 59 || (h === 24 && mm > 0)) return NaN;
  return h * 60 + mm;
}

export function addDays(dateStr: string, n: number) {
  const t = fromLocal(dateStr, 0).getTime() + n * 86400000;
  return localParts(new Date(t)).date;
}

// 顯示:10/20(一) 14:00–15:30
export function formatRange(startIso: string, endIso: string) {
  const s = localParts(startIso);
  const e = localParts(endIso);
  const [, mo, da] = s.date.split('-');
  return `${Number(mo)}/${Number(da)}(${WEEKDAYS[s.weekday]}) ${minutesToHHMM(s.minutes)}–${minutesToHHMM(e.minutes)}`;
}

// 顯示:10/20(一) 14:00
export function formatDateTime(iso: string) {
  const s = localParts(iso);
  const [, mo, da] = s.date.split('-');
  return `${Number(mo)}/${Number(da)}(${WEEKDAYS[s.weekday]}) ${minutesToHHMM(s.minutes)}`;
}

export function formatDateLabel(dateStr: string) {
  const { weekday } = localParts(fromLocal(dateStr, 0));
  const [, mo, da] = dateStr.split('-');
  return { md: `${Number(mo)}/${Number(da)}`, weekday: WEEKDAYS[weekday] };
}

export const money = (n: number) => `NT $${Math.round(n).toLocaleString('en-US')}`;

// ---------- 可約時段 ----------
// 可約 = 營業時段 ∩ 不在休假 ∩ 不與既有有效預約(含整理時間)重疊 ∩ 最短提前 ∩ 可約天數
type Range = { start: number; end: number }; // epoch ms

export function computeSlots(opts: {
  business: Pick<BkBusiness, 'slot_interval' | 'lead_minutes' | 'advance_days' | 'buffer_minutes'>;
  hours: BkHour[];
  exceptions: { start_at: string; end_at: string }[];
  busy: { start_at: string; occupy_end_at: string }[];
  duration: number;
  fromDate: string;
  days: number;
  now?: Date;
}): { date: string; slots: string[]; closed: boolean }[] {
  const now = (opts.now ?? new Date()).getTime();
  const { slot_interval, lead_minutes, advance_days, buffer_minutes } = opts.business;
  const today = localParts(new Date(now)).date;
  const lastDate = addDays(today, advance_days);
  const blocked: Range[] = [
    ...opts.exceptions.map((x) => ({ start: new Date(x.start_at).getTime(), end: new Date(x.end_at).getTime() })),
    ...opts.busy.map((x) => ({ start: new Date(x.start_at).getTime(), end: new Date(x.occupy_end_at).getTime() })),
  ];
  const earliest = now + lead_minutes * 60000;
  const out: { date: string; slots: string[]; closed: boolean }[] = [];
  for (let i = 0; i < opts.days; i++) {
    const date = addDays(opts.fromDate, i);
    if (date < today || date > lastDate) { out.push({ date, slots: [], closed: true }); continue; }
    const { weekday } = localParts(fromLocal(date, 12 * 60));
    const ranges = opts.hours.filter((h) => h.weekday === weekday).sort((a, b) => a.start_min - b.start_min);
    const slots: string[] = [];
    for (const r of ranges) {
      for (let t = r.start_min; t + opts.duration <= r.end_min; t += slot_interval) {
        const start = fromLocal(date, t).getTime();
        if (start < earliest) continue;
        const occupyEnd = start + (opts.duration + buffer_minutes) * 60000;
        if (blocked.some((b) => b.start < occupyEnd && start < b.end)) continue;
        const label = minutesToHHMM(t);
        if (!slots.includes(label)) slots.push(label);
      }
    }
    // closed:這天沒有營業時段(休息日);有營業但沒空位 = 額滿
    out.push({ date, slots, closed: ranges.length === 0 });
  }
  return out;
}
