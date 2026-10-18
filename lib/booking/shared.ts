// 預約系統:前後台共用的型別、顯示文字與時段計算(不含伺服器程式)
// 時區:v1 只支援 Asia/Taipei(UTC+8,無日光節約),資料庫一律存 UTC timestamptz

export type BookingStatus = 'pending' | 'confirmed' | 'checked_in' | 'completed' | 'cancelled' | 'no_show' | 'expired';
export type PaymentStatus = 'none' | 'awaiting' | 'reported' | 'deposit_paid' | 'paid' | 'refunded';
export const ACTIVE_STATUSES: BookingStatus[] = ['pending', 'confirmed', 'checked_in'];
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
  allow_any_staff: boolean;
  deposit_hours: number;
  payment_info: string;
  reschedule_limit: number;
  travel_minutes: number;
  service_area: string;
  reward_enabled: boolean;
  reward_rate: number;
  point_value: number;
  waitlist_enabled: boolean;
  waitlist_invite_minutes: number;
  thanks_enabled: boolean;
  thanks_message: string;
  branch_travel_minutes: number;
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
  needs_resource: boolean;
  deposit: number;
  price_mode: 'fixed' | 'quote';      // quote = 需報價(先詢價)
  service_mode: 'in_store' | 'outcall'; // outcall = 外出服務(加交通時間)
  revisit_days: number;                 // 完成後幾天提醒回訪(0 = 不提醒)
  branch_ids?: string[];                // 限定分店(空 = 所有分店)
};

export type BkBranch = { id: string; name: string; address: string; active: boolean; sort_order: number };

export type BkStaff = { id: string; business_id: string; name: string; title: string; avatar: string; active: boolean; use_business_hours: boolean; sort_order: number; role: 'stylist' | 'assistant'; commission_rate?: number; branch_ids?: string[] };
// 服務步驟:who = 主要人員 / 助理 / 不需人員(等待);seat = 這段是否占用座位
export type BkServiceStep = { id?: string; service_id: string; seq: number; name: string; minutes: number; who: 'main' | 'assistant' | 'none'; seat: 'keep' | 'release' };
export type BkAllocation = { id: string; booking_id: string; staff_id: string | null; resource_id: string | null; role: 'main' | 'assistant' | 'seat'; start_at: string; end_at: string; item_seq?: number };
// 一次預約多項服務的每一項
export type BkBookingItem = { id: string; booking_id: string; seq: number; service_id: string | null; service_snapshot: { name: string; duration_minutes: number; price: number }; staff_id: string | null; start_at: string; end_at: string; amount: number; status: 'active' | 'cancelled' };

export const STEP_WHO_LABEL = { main: '主要人員', assistant: '助理', none: '不需人員' } as const;
export type BkStaffHour = { staff_id: string; weekday: number; start_min: number; end_min: number; branch_id?: string | null };
export type BkStaffService = { staff_id: string; service_id: string; duration_minutes: number | null; price: number | null };
export type BkResource = { id: string; name: string; active: boolean; sort_order: number; branch_id?: string | null };
export type BkAddon = { id: string; service_id: string; name: string; price: number; extra_minutes: number; active: boolean; sort_order: number };
export type BkPayment = { id: string; booking_id: string; kind: 'deposit' | 'balance' | 'refund'; amount: number; method: keyof typeof PAY_METHOD_LABEL; note: string; created_at: string };

export type BkHour = { weekday: number; start_min: number; end_min: number; branch_id?: string | null };
export type BkException = { id: string; start_at: string; end_at: string; reason: string; staff_id: string | null; branch_id?: string | null };

export type BkBooking = {
  id: string;
  business_id: string;
  booking_no: string;
  customer_user_id: string | null;
  service_id: string | null;
  service_snapshot: { name: string; duration_minutes: number; price: number; price_note?: string; steps?: { name: string; minutes: number; who: string }[] };
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
  staff_id: string | null;
  staff_requested: boolean;
  resource_id: string | null;
  addons: { id: string; name: string; price: number; extra_minutes: number }[];
  total_price: number;
  deposit_amount: number;
  paid_amount: number;
  payment_status: PaymentStatus;
  payment_report: { last5?: string; amount?: number; note?: string; at?: string; kind?: 'deposit' | 'full'; paid_at?: string; payer?: string };
  reschedule_count: number;
  created_by: 'customer' | 'owner';
  quote_id?: string | null;
  customer_id?: string | null;
  package_id?: string | null;
  branch_id?: string | null;
};

// 顧客檔案(每間店各自一份)、服務紀錄、照片
export type BkCustomer = { id: string; business_id: string; user_id: string | null; name: string; phone: string; note: string; tags: string[]; created_at: string; updated_at: string };
export type ConsentStatus = 'none' | 'requested' | 'granted' | 'declined' | 'revoked';
export type BkServiceRecord = {
  id: string; customer_id: string; booking_id: string | null; staff_id: string | null; service_name: string; performed_on: string;
  content: string; consent: ConsentStatus; consent_at: string | null; delete_requested: boolean; created_at: string;
};
export type BkAttachment = { id: string; record_id: string; kind: 'before' | 'after' | 'other'; created_at: string };
export const CONSENT_LABEL: Record<ConsentStatus, string> = { none: '私人', requested: '等顧客同意', granted: '同意公開', declined: '不同意公開', revoked: '已撤回同意' };
export const PHOTO_KIND_LABEL = { before: '前', after: '後', other: '其他' } as const;

export type QuoteStatus = 'requested' | 'sent' | 'accepted' | 'declined' | 'cancelled';
export type QuoteRequest = { event_date: string; time: string; event_type: string; address: string; people: string; note: string; images: string[] };
export type BkQuote = {
  id: string; business_id: string; quote_no: string; customer_user_id: string; service_id: string | null; service_name: string; staff_id: string | null;
  status: QuoteStatus; request: QuoteRequest; contact: { name?: string; phone?: string }; current_version: number; booking_id: string | null; version: number; created_at: string;
};
export type BkQuoteVersion = {
  id: string; quote_id: string; version: number; items: { name: string; amount: number }[]; total: number; deposit: number; staff_id: string | null;
  start_at: string; minutes: number; travel_minutes: number; valid_until: string; hold_until: string | null; note: string; created_at: string;
};
export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = { requested: '待報價', sent: '已報價', accepted: '已接受', declined: '已婉拒', cancelled: '已取消' };

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
  allow_any_staff: true,
  deposit_hours: 24,
  payment_info: '',
  reschedule_limit: 1,
  travel_minutes: 60,
  service_area: '',
  reward_enabled: false,
  reward_rate: 100,
  point_value: 1,
  waitlist_enabled: true,
  waitlist_invite_minutes: 60,
  thanks_enabled: false,
  thanks_message: '',
  branch_travel_minutes: 30,
};

export const STATUS_LABEL: Record<BookingStatus, string> = {
  pending: '待確認',
  confirmed: '已確認',
  checked_in: '已報到',
  completed: '已完成',
  cancelled: '已取消',
  no_show: '未到',
  expired: '已逾期',
};

export const STATUS_COLOR: Record<BookingStatus, string> = {
  pending: 'bg-[#fff3df] text-[#9a6412]',
  confirmed: 'bg-[#e7f3ea] text-[#2f6b3f]',
  checked_in: 'bg-[#e3eef6] text-[#1f5f7f]',
  completed: 'bg-[#eef0f5] text-[#4a5573]',
  cancelled: 'bg-[#f3ece9] text-[#8a5a50]',
  no_show: 'bg-[#f6e6e6] text-[#a03b3b]',
  expired: 'bg-[#f1efec] text-[#8a7f72]',
};

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  none: '',
  awaiting: '待付訂金',
  reported: '顧客已回報轉帳',
  deposit_paid: '已收訂金',
  paid: '已付清',
  refunded: '已退款',
};

// 預約畫面上的狀態文字:主流程 + 審核 + 收款組合而成(規格 9 章)
// 顧客回報的付款內容,例:全額 NT $1,000 · 末 5 碼 12345 · 10/19 14:30 轉帳 · 戶名 王小明
export function paymentReportText(r: BkBooking['payment_report'] | null | undefined) {
  if (!r) return '';
  const when = r.paid_at ? r.paid_at.replace('T', ' ').slice(5) : '';
  return [
    `${r.kind === 'full' ? '全額' : '訂金'}${r.amount ? ` ${money(r.amount)}` : ''}`,
    `末 5 碼 ${r.last5 ?? '—'}`,
    when ? `${when.replace('-', '/')} 轉帳` : '',
    r.payer ? `戶名 ${r.payer}` : '',
    r.note ?? '',
  ].filter(Boolean).join(' · ');
}

export function statusText(b: Pick<BkBooking, 'status' | 'approval_status' | 'payment_status'> & { quote_id?: string | null }) {
  if (b.status !== 'pending') return STATUS_LABEL[b.status];
  if (b.approval_status === 'pending') return b.quote_id ? '報價保留中' : '待店家確認';
  if (b.payment_status === 'reported') return '待店家核對訂金';
  if (b.payment_status === 'awaiting') return '待付訂金';
  return STATUS_LABEL.pending;
}

export const PAY_METHOD_LABEL = { transfer: '轉帳', cash: '現金', card: '刷卡', other: '其他', points: '點數', package: '套票' } as const;

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
// 通用版:營業時段內每個間隔的開始時間,符合 ok(開始時間) 才算可約(分段占用、助理、座位由呼叫端判斷)
export function computeSlotsWith(opts: {
  business: Pick<BkBusiness, 'slot_interval' | 'lead_minutes' | 'advance_days'>;
  hours: BkHour[];
  duration: number;
  fromDate: string;
  days: number;
  ok: (startMs: number) => boolean;
  now?: Date;
}): { date: string; slots: string[]; closed: boolean }[] {
  const now = (opts.now ?? new Date()).getTime();
  const { slot_interval, lead_minutes, advance_days } = opts.business;
  const today = localParts(new Date(now)).date;
  const lastDate = addDays(today, advance_days);
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
        if (start < earliest || !opts.ok(start)) continue;
        const label = minutesToHHMM(t);
        if (!slots.includes(label)) slots.push(label);
      }
    }
    out.push({ date, slots, closed: ranges.length === 0 });
  }
  return out;
}

// 可約 = 營業時段 ∩ 不在休假 ∩ 不與既有有效預約(含整理時間)重疊 ∩ 最短提前 ∩ 可約天數
type Range = { start: number; end: number }; // epoch ms

export function computeSlots(opts: {
  business: Pick<BkBusiness, 'slot_interval' | 'lead_minutes' | 'advance_days' | 'buffer_minutes'>;
  hours: BkHour[];
  exceptions: { start_at: string; end_at: string }[];
  busy: { start_at: string; occupy_end_at: string }[];
  // 需要床位時:每張床位各自的占用;任一張有空就可約(空陣列 = 不檢查床位)
  pools?: { start_at: string; occupy_end_at: string }[][];
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
  const pools: Range[][] = (opts.pools ?? []).map((p) => p.map((x) => ({ start: new Date(x.start_at).getTime(), end: new Date(x.occupy_end_at).getTime() })));
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
        if (pools.length && !pools.some((p) => !p.some((b) => b.start < occupyEnd && start < b.end))) continue;
        const label = minutesToHHMM(t);
        if (!slots.includes(label)) slots.push(label);
      }
    }
    // closed:這天沒有營業時段(休息日);有營業但沒空位 = 額滿
    out.push({ date, slots, closed: ranges.length === 0 });
  }
  return out;
}
