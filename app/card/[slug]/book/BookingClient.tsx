'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { DateField } from '@/app/components/BookingDatePicker';
import Link from 'next/link';
import { uiAlert, uiConfirm } from '@/lib/ui-dialog';
import { uiToast } from '@/lib/ui-toast';
import { shrinkImage } from '@/lib/booking/shrink-image';
import {
  formatDateLabel, formatDateTime, formatRange, localParts, money, paymentReportText, statusText, STATUS_COLOR,
  type ApprovalStatus, type BkBooking, type BookingStatus, type PaymentStatus,
} from '@/lib/booking/shared';

type Addon = { id: string; name: string; price: number; extra_minutes: number };
type ServiceStaff = { id: string; duration_minutes: number; price: number };
type Service = {
  id: string; name: string; description: string; duration_minutes: number; price: number; price_note: string; image: string;
  deposit: number; addons: Addon[]; staff: ServiceStaff[]; steps: { name: string; minutes: number; who: 'main' | 'assistant' | 'none' }[];
  price_mode: 'fixed' | 'quote'; service_mode: 'in_store' | 'outcall'; branch_ids?: string[];
};
type Branch = { id: string; name: string; address: string };
type Staff = { id: string; name: string; title: string; avatar: string; branch_ids?: string[] };
type Business = { line_own?: boolean; line_name?: string; name: string; address: string; notice: string; approval_mode: 'auto' | 'manual'; cancel_hours: number; allow_any_staff: boolean; payment_info: string; service_area: string; waitlist: boolean; open: boolean };
type MyWait = { id: string; service_name: string; date: string; from_min: number; to_min: number; status: 'waiting' | 'invited'; invited_slot: string | null; invite_expires_at: string | null; service_id: string; staff_id: string | null; business: { slug: string } };
type MyPackage = { id: string; name: string; scope?: 'service' | 'addon'; service_ids: string[]; addon_ids?: string[]; available: number; used: number; reserved: number; sessions_total: number; expires_at: string; business: { slug: string } };
type MyRecord = {
  id: string; service_name: string; performed_on: string; consent: 'none' | 'requested' | 'granted' | 'declined' | 'revoked'; delete_requested: boolean;
  business: { name: string; slug: string }; photos: { id: string; kind: 'before' | 'after' | 'other' }[];
};
type MyQuote = {
  id: string; quote_no: string; service_name: string; status: 'requested' | 'sent' | 'accepted' | 'declined' | 'cancelled'; current_version: number; created_at: string;
  request: { event_date: string; time: string; event_type: string; address: string };
  business: { name: string; slug: string };
  offer: { version: number; items: { name: string; amount: number }[]; total: number; deposit: number; start_at: string; minutes: number; valid_until: string; hold_until: string | null; note: string } | null;
};
type MyBooking = {
  id: string; booking_no: string; status: BookingStatus; approval_status: ApprovalStatus; payment_status: PaymentStatus;
  start_at: string; end_at: string; expires_at: string | null; version: number; staff_name: string;
  service_snapshot: { name: string; price: number; price_note?: string }; contact: { name?: string; phone?: string };
  addons: { name: string }[]; total_price: number; deposit_amount: number; paid_amount: number; reschedule_count: number;
  payment_report: BkBooking['payment_report'];
  business: { name: string; slug: string; cancel_hours: number; payment_info: string; reschedule_limit: number };
};
type Result = {
  booking_id: string; booking_no: string; status: BookingStatus; start_at: string; end_at: string; expires_at: string | null; version: number;
  next_action: 'none' | 'wait_approval' | 'pay_deposit'; deposit_amount: number; total: number;
};
type Day = { date: string; slots: string[]; closed?: boolean };

const DAYS = 14;
const priceText = (price: number, note?: string) => (price ? `${money(price)}${note ? ` ${note}` : ''}` : note || '現場報價');
const ACTIVE = ['pending', 'confirmed'];
// 服務的基本時長(分段服務以步驟加總)與最低價格(不同人員價格不同時)
const baseMinutes = (x: Service) => (x.steps.length > 1 ? x.steps.reduce((n, st) => n + st.minutes, 0) : x.duration_minutes);
const minPrice = (x: Service) => (x.staff.length ? Math.min(...x.staff.map((st) => st.price)) : x.price);

// 名片線上預約:選服務 → 加購 → 人員 → 日期時段 → 登入 → 聯絡資料 → 送出;另有「我的預約」(付訂金回報、改期、取消、加入行事曆)
// lockedStaff:人員專屬預約連結(?staff=),只顯示這位人員能做的服務,不再選人員
export default function BookingClient({ slug, card, business, services: rawServices, staff, branches = [], lockedStaff = null }: { slug: string; card: { display_name: string; avatar_url: string }; business: Business; services: Service[]; staff: Staff[]; branches?: Branch[]; lockedStaff?: { id: string; name: string } | null }) {
  const allServices = useMemo(() => (lockedStaff ? rawServices.filter((s) => s.staff.some((x) => x.id === lockedStaff.id)) : rawServices), [rawServices, lockedStaff]);
  const [branchId, setBranchId] = useState(branches.length === 1 ? branches[0].id : '');
  const branch = branches.find((b) => b.id === branchId) ?? null;
  // 有分店時只顯示這間分店提供的服務
  const services = useMemo(() => (branchId ? allServices.filter((s) => !s.branch_ids?.length || s.branch_ids.includes(branchId)) : allServices), [allServices, branchId]);
  const [tab, setTab] = useState<'book' | 'my'>('book');
  const [serviceId, setServiceId] = useState('');
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [extraIds, setExtraIds] = useState<string[]>([]); // 同一次再加的服務(最多 2 項,依序進行)
  const [staffId, setStaffId] = useState<string | null>(null); // null = 還沒選;'' = 不指定
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [days, setDays] = useState<Day[] | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [auth, setAuth] = useState<{ loggedIn: boolean; lineBound: boolean; bookings: MyBooking[]; quotes: MyQuote[]; records: MyRecord[]; packages: MyPackage[]; points: number; waitlist: MyWait[]; optOut: boolean | null } | null>(null);
  const [usePackage, setUsePackage] = useState(true);
  const [contact, setContact] = useState({ name: '', phone: '', note: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const idemKey = useRef('');
  const service = services.find((s) => s.id === serviceId) ?? null;
  const isQuote = service?.price_mode === 'quote';
  const pkg = service ? auth?.packages.find((p) => (p.scope ?? 'service') === 'service' && p.available > 0 && (!p.service_ids.length || p.service_ids.includes(service.id))) ?? null : null;
  const pkgOn = Boolean(pkg && usePackage);
  // 加購票券:每個勾選的加購找一張可用的加購票券(同一張票券依剩餘次數分配);顧客可取消勾選
  const [skipAddonPkg, setSkipAddonPkg] = useState<string[]>([]);
  const addonPkgs = useMemo(() => {
    const left = new Map((auth?.packages ?? []).filter((p) => p.scope === 'addon' && p.available > 0).map((p) => [p.id, p.available]));
    const out: { addon_id: string; package_id: string; name: string; available: number; on: boolean }[] = [];
    for (const id of service ? addonIds.filter((x) => service.addons.some((a) => a.id === x)) : []) {
      const p = (auth?.packages ?? []).find((x) => x.scope === 'addon' && (left.get(x.id) ?? 0) > 0 && (!x.addon_ids?.length || x.addon_ids.includes(id)));
      if (!p) continue;
      const on = !skipAddonPkg.includes(id);
      if (on) left.set(p.id, (left.get(p.id) ?? 0) - 1);
      out.push({ addon_id: id, package_id: p.id, name: p.name, available: p.available, on });
    }
    return out;
  }, [auth?.packages, service, addonIds, skipAddonPkg]);
  const here = `/@${slug}/book`;

  // 這個服務可選的人員;只有一位時不顯示人員步驟
  const serviceStaff = useMemo(() => (service?.staff ?? []).map((x) => ({ ...x, info: staff.find((s) => s.id === x.id) })).filter((x) => x.info && (!lockedStaff || x.id === lockedStaff.id) && (!branchId || !x.info.branch_ids?.length || x.info.branch_ids.includes(branchId))), [service, staff, branchId, lockedStaff]);
  const pickStaff = serviceStaff.length > 1;
  const staffChosen = !pickStaff || staffId !== null;
  const staffParam = lockedStaff ? lockedStaff.id : pickStaff ? staffId || '' : '';

  // 試算(最終以伺服器計算為準)
  const quote = useMemo(() => {
    if (!service) return null;
    const chosen = serviceStaff.find((x) => x.id === staffParam) ?? (serviceStaff.length === 1 ? serviceStaff[0] : null);
    const addons = service.addons.filter((a) => addonIds.includes(a.id));
    const prices = serviceStaff.map((x) => x.price);
    const varies = !chosen && new Set(prices).size > 1;
    const base = chosen?.price ?? (prices.length ? Math.min(...prices) : service.price);
    const stepSum = service.steps.length > 1 ? service.steps.reduce((n, x) => n + x.minutes, 0) : 0;
    const extras = extraIds.map((id) => services.find((x) => x.id === id)).filter((x): x is Service => Boolean(x));
    const duration = (stepSum || (chosen?.duration_minutes ?? service.duration_minutes)) + addons.reduce((n, a) => n + a.extra_minutes, 0)
      + extras.reduce((n, e) => n + baseMinutes(e), 0);
    const total = base + addons.reduce((n, a) => n + a.price, 0) + extras.reduce((n, e) => n + minPrice(e), 0);
    const wanted = service.deposit + extras.reduce((n, e) => n + e.deposit, 0);
    return { base, duration, total, varies: varies || extras.some((e) => new Set(e.staff.map((x) => x.price)).size > 1), addons, extras, deposit: wanted ? (total > 0 ? Math.min(wanted, total) : wanted) : 0 };
  }, [service, serviceStaff, staffParam, addonIds, extraIds, services]);

  // 登入狀態與我的預約(也用來帶入上次填的聯絡資料)
  const loadMine = useCallback(async () => {
    const res = await fetch('/api/booking/my', { cache: 'no-store' });
    if (res.status === 401) { setAuth({ loggedIn: false, lineBound: false, bookings: [], quotes: [], records: [], packages: [], points: 0, waitlist: [], optOut: null }); return; }
    const data = await res.json().catch(() => null);
    const bookings = ((data?.bookings ?? []) as MyBooking[]).filter((b) => b.business.slug === slug);
    const quotes = ((data?.quotes ?? []) as MyQuote[]).filter((q) => q.business.slug === slug);
    const records = ((data?.records ?? []) as MyRecord[]).filter((r) => r.business.slug === slug);
    const packages = ((data?.packages ?? []) as MyPackage[]).filter((p) => p.business.slug === slug);
    const points = ((data?.points ?? []) as { business: { slug: string }; points: number }[]).find((p) => p.business.slug === slug)?.points ?? 0;
    const waitlist = ((data?.waitlist ?? []) as MyWait[]).filter((w) => w.business.slug === slug);
    const pref = ((data?.prefs ?? []) as { business: { slug: string }; marketing_opt_out: boolean }[]).find((p) => p.business.slug === slug);
    setAuth({ loggedIn: true, lineBound: Boolean(data?.line_bound), bookings, quotes, records, packages, points, waitlist, optOut: pref ? pref.marketing_opt_out : null });
    const last = (data?.bookings ?? [])[0] as MyBooking | undefined;
    if (last?.contact) setContact((c) => (c.name || c.phone ? c : { name: last.contact.name ?? '', phone: last.contact.phone ?? '', note: '' }));
  }, [slug]);

  // 從登入頁回來:網址帶回剛剛選的服務、加購、人員、日期、時段
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    Promise.resolve().then(() => {
      if (q.get('tab') === 'my') setTab('my');
      const s = q.get('s');
      if (q.get('b') && branches.some((x) => x.id === q.get('b'))) setBranchId(q.get('b')!);
      if (s && allServices.some((x) => x.id === s)) {
        setServiceId(s);
        setAddonIds((q.get('a') ?? '').split(',').filter(Boolean));
        setExtraIds((q.get('x') ?? '').split(',').filter((id) => id && id !== s && allServices.some((x) => x.id === id)).slice(0, 2));
        if (q.has('p')) setStaffId(q.get('p') ?? '');
        setDate(q.get('d') ?? '');
        setTime(q.get('t') ?? '');
      }
      void loadMine();
    });
  }, [allServices, branches, loadMine]);

  const slotsUrl = useCallback(() => {
    const today = localParts(new Date()).date;
    return `/api/booking/${encodeURIComponent(slug)}/availability?service=${serviceId}&addons=${addonIds.join(',')}&extra=${extraIds.join(',')}&staff=${staffParam}&branch=${branchId}&from=${today}&days=${DAYS}`;
  }, [slug, serviceId, addonIds, extraIds, staffParam, branchId]);

  // 選好服務 / 加購 / 人員 → 讀 14 天的可約時段
  useEffect(() => {
    if (!serviceId || !staffChosen) return;
    let alive = true;
    Promise.resolve().then(async () => {
      setLoadingSlots(true);
      try {
        const res = await fetch(slotsUrl(), { cache: 'no-store' });
        const data = await res.json().catch(() => null);
        if (!alive) return;
        const list = (data?.days ?? []) as Day[];
        setDays(list);
        setDate((d) => (d && list.some((x) => x.date === d) ? d : list.find((x) => x.slots.length)?.date ?? list[0]?.date ?? ''));
      } finally {
        if (alive) setLoadingSlots(false);
      }
    });
    return () => { alive = false; };
  }, [serviceId, staffChosen, slotsUrl]);

  const slots = useMemo(() => days?.find((d) => d.date === date)?.slots ?? [], [days, date]);
  const ready = Boolean(service && staffChosen && date && time && slots.includes(time));
  const nextParams = `${lockedStaff ? `staff=${lockedStaff.id}&` : ''}${branchId ? `b=${branchId}&` : ''}s=${serviceId}&a=${addonIds.join(',')}&x=${extraIds.join(',')}${pickStaff && staffId !== null ? `&p=${staffId}` : ''}&d=${date}&t=${encodeURIComponent(time)}`;
  const loginNext = encodeURIComponent(`${here}?${nextParams}`);
  const resetSlot = () => { setTime(''); idemKey.current = ''; };

  async function submit() {
    if (!service || !ready) return;
    setError('');
    if (!contact.name.trim()) return setError('請填寫預約人姓名');
    if (!/^[0-9+\-\s()]{8,20}$/.test(contact.phone.trim())) return setError('請填寫正確的聯絡電話');
    idemKey.current ||= crypto.randomUUID();
    setSubmitting(true);
    try {
      const startAt = new Date(`${date}T${time}:00+08:00`).toISOString();
      const res = await fetch(`/api/booking/${encodeURIComponent(slug)}/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idemKey.current },
        body: JSON.stringify({ service_id: service.id, addon_ids: addonIds, extra_ids: extraIds, package_id: pkgOn ? pkg!.id : null, addon_packages: addonPkgs.filter((x) => x.on).map((x) => ({ addon_id: x.addon_id, package_id: x.package_id })), branch_id: branchId || null, staff_id: staffParam || null, start_at: startAt, contact, channel: /Line\//.test(navigator.userAgent) ? 'line' : 'card' }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const code = data?.error?.code;
        setError(data?.error?.message ?? '預約失敗,請稍後再試');
        if (code === 'SLOT_UNAVAILABLE') {
          // 時段被搶走:重新讀時段,保留其他已填內容
          resetSlot();
          const r = await fetch(slotsUrl(), { cache: 'no-store' });
          const d = await r.json().catch(() => null);
          setDays(d?.days ?? null);
        }
        if (code === 'AUTH_REQUIRED') setAuth((a) => (a ? { ...a, loggedIn: false } : a));
        return;
      }
      idemKey.current = '';
      setResult({
        booking_id: data.booking_id, booking_no: data.booking_no, status: data.status, start_at: data.start_at, end_at: data.end_at,
        expires_at: data.expires_at, version: data.version, next_action: data.next_action, deposit_amount: data.deposit_amount ?? 0, total: data.total_price ?? 0,
      });
      window.history.replaceState(null, '', here);
      void loadMine();
    } finally {
      setSubmitting(false);
    }
  }

  async function cancel(b: MyBooking) {
    const paid = b.paid_amount > 0 ? `\n已付的 ${money(b.paid_amount)} 退款方式請與店家聯絡。` : '';
    if (!(await uiConfirm(`確定取消 ${formatRange(b.start_at, b.end_at)} 的預約?${paid}`, { danger: true }))) return;
    const res = await fetch(`/api/booking/my/${b.id}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expected_version: b.version }) });
    const data = await res.json().catch(() => null);
    if (!res.ok) void uiAlert(data?.error?.message ?? '取消失敗');
    else uiToast('已取消預約');
    void loadMine();
  }

  const reset = () => { setResult(null); setTime(''); setServiceId(''); setAddonIds([]); setExtraIds([]); setStaffId(null); setDays(null); setTab('book'); };
  const activeCount = auth?.bookings.filter((b) => ACTIVE.includes(b.status)).length ?? 0;

  return (
    <LineOwnCtx.Provider value={Boolean(business.line_own)}>
    <main className="min-h-screen bg-[#f6f2ec] text-[#1f1b19]">
      <header className="page-header sticky top-0 z-30 border-b border-[#e5ded4] bg-[#faf7f2]/95 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-3">
          <Link href={`/@${slug}`} aria-label="回名片" className="shrink-0 rounded-full p-1.5 text-[#6b6156] hover:bg-[#efe8dd]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
          </Link>
          {card.avatar_url ? <img src={card.avatar_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" /> : null}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{business.name}</p>
            <p className="text-[11px] text-[#8a7f72]">線上預約{lockedStaff ? ` · 指定 ${lockedStaff.name}` : ''}</p>
          </div>
        </div>
        <div className="mx-auto flex max-w-xl gap-1 px-4 pb-2">
          {([['book', '我要預約'], ['my', `我的預約${activeCount ? `(${activeCount})` : ''}`]] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => { setTab(k); setResult(null); }} className={`flex-1 rounded-full py-2 text-sm ${tab === k ? 'bg-[#1f1b19] font-semibold text-white' : 'text-[#6b6156]'}`}>{label}</button>
          ))}
        </div>
      </header>

      <div className="mx-auto max-w-xl px-4 pb-32 pt-4">
        {tab === 'my' ? (
          <MyBookings auth={auth} slug={slug} loginNext={encodeURIComponent(`${here}?tab=my`)} onCancel={cancel} onBook={() => setTab('book')} reload={loadMine} lineOwn={business.line_own} />
        ) : result ? (
          <ResultView result={result} business={business} lineBound={auth?.lineBound ?? false} here={here} onMore={reset} onMine={() => { setResult(null); setTab('my'); }} onReported={loadMine} />
        ) : !business.open || !services.length ? (
          <p className="rounded-2xl bg-white p-8 text-center text-sm text-[#8a7f72]">目前還沒有開放可預約的時段,請稍後再來或直接聯絡。</p>
        ) : (
          <div className="space-y-5">
            {/* 分店 */}
            {branches.length > 1 ? (
              <section>
                <p className="mb-2 text-sm font-semibold">選擇分店</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {branches.map((b) => (
                    <button key={b.id} type="button" onClick={() => { setBranchId(b.id); setServiceId(''); setDays(null); resetSlot(); }} className={`rounded-2xl border bg-white p-3 text-left ${b.id === branchId ? 'border-[#1f1b19] ring-2 ring-[#1f1b19]/10' : 'border-[#e5ded4]'}`}>
                      <span className="block text-sm font-semibold">{b.name}</span>
                      {b.address ? <span className="mt-0.5 block text-xs text-[#8a7f72]">{b.address}</span> : null}
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {/* 1. 服務 */}
            {!branches.length || branchId ? <section>
              <StepTitle n={1} title="選擇服務" />
              <div className="space-y-2">
                {services.map((s) => {
                  const on = s.id === serviceId;
                  const prices = s.staff.map((x) => x.price);
                  const min = prices.length ? Math.min(...prices) : s.price;
                  const varies = new Set(prices).size > 1;
                  return (
                    <button key={s.id} type="button" onClick={() => { setServiceId(s.id); setAddonIds([]); setExtraIds((x) => x.filter((id) => id !== s.id)); setStaffId(null); setDays(null); resetSlot(); }} className={`flex w-full items-center gap-3 rounded-2xl border bg-white p-3 text-left transition ${on ? 'border-[#1f1b19] ring-2 ring-[#1f1b19]/10' : 'border-[#e5ded4]'}`}>
                      {s.image ? <img src={s.image} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" /> : null}
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">{s.name}</span>
                        <span className="mt-0.5 block text-xs text-[#8a7f72]">約 {s.duration_minutes} 分鐘 · {s.price_mode === 'quote' ? `需報價${s.price ? `(${priceText(min, '起')})` : ''}` : priceText(min, varies ? '起' : s.price_note)}{s.service_mode === 'outcall' ? ' · 外出服務' : ''}{s.deposit && s.price_mode !== 'quote' ? ` · 訂金 ${money(s.deposit)}` : ''}</span>
                        {s.description ? <span className="mt-1 line-clamp-2 block text-xs leading-5 text-[#6b6156]">{s.description}</span> : null}
                        {s.steps.length > 1 ? <StepBar steps={s.steps} /> : null}
                      </span>
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${on ? 'border-[#1f1b19] bg-[#1f1b19] text-white' : 'border-[#d7c9bd]'}`}>{on ? '✓' : ''}</span>
                    </button>
                  );
                })}
              </div>
            </section> : null}

            {/* 需報價:填活動資訊詢價 */}
            {service && isQuote && (
              <InquiryForm key={service.id} slug={slug} service={service} staff={serviceStaff.map((x) => x.info!)} business={business} auth={auth} loginNext={encodeURIComponent(`${here}?s=${service.id}`)} onDone={() => { setServiceId(''); setTab('my'); void loadMine(); }} />
            )}

            {/* 加購 */}
            {service && !isQuote && service.addons.length > 0 && (
              <section>
                <p className="mb-2 text-sm font-semibold">加購(可複選)</p>
                <div className="space-y-1.5 rounded-2xl bg-white p-2">
                  {service.addons.map((a) => {
                    const on = addonIds.includes(a.id);
                    return (
                      <label key={a.id} className={`flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 ${on ? 'bg-[#faf7f2]' : ''}`}>
                        <input type="checkbox" checked={on} onChange={(e) => { setAddonIds(e.target.checked ? [...addonIds, a.id] : addonIds.filter((x) => x !== a.id)); resetSlot(); }} className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 flex-1 text-sm">{a.name}</span>
                        <span className="shrink-0 text-xs text-[#8a7f72]">{a.price ? `+${money(a.price)}` : '免費'}{a.extra_minutes ? ` · +${a.extra_minutes} 分` : ''}</span>
                      </label>
                    );
                  })}
                </div>
              </section>
            )}

            {/* 同一次再加一項 */}
            {service && !isQuote && services.filter((x) => x.price_mode !== 'quote').length > 1 && (
              <section>
                <p className="mb-1 text-sm font-semibold">同一次再加一項(選填,最多 2 項)</p>
                <p className="mb-2 text-xs text-[#8a7f72]">會接在後面依序進行,可能由其他人員接手。</p>
                <div className="flex flex-wrap gap-2">
                  {services.filter((x) => x.id !== service.id && x.price_mode !== 'quote').map((x) => {
                    const on = extraIds.includes(x.id);
                    const full = !on && extraIds.length >= 2;
                    return (
                      <button key={x.id} type="button" disabled={full} aria-pressed={on} onClick={() => { setExtraIds(on ? extraIds.filter((id) => id !== x.id) : [...extraIds, x.id]); resetSlot(); }}
                        className={`rounded-full border px-3 py-1.5 text-left text-sm transition disabled:opacity-40 ${on ? 'border-[#1f1b19] bg-[#1f1b19] text-white' : 'border-[#e5ded4] bg-white'}`}>
                        {on ? '✓ ' : '+ '}{x.name}<span className={`ml-1 text-xs ${on ? 'text-white/70' : 'text-[#8a7f72]'}`}>{baseMinutes(x)} 分 · {priceText(minPrice(x))}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* 2. 人員 */}
            {service && !isQuote && pickStaff && (
              <section>
                <StepTitle n={2} title="選擇服務人員" />
                <div className="grid grid-cols-2 gap-2">
                  {business.allow_any_staff && (
                    <StaffCard on={staffId === ''} onClick={() => { setStaffId(''); resetSlot(); }} name="不指定" sub="最快有空的人員" />
                  )}
                  {serviceStaff.map((x) => (
                    <StaffCard key={x.id} on={staffId === x.id} onClick={() => { setStaffId(x.id); resetSlot(); }} name={x.info!.name} avatar={x.info!.avatar}
                      sub={[x.info!.title, `${x.duration_minutes} 分 · ${x.price ? money(x.price) : '現場報價'}`].filter(Boolean).join(' · ')} />
                  ))}
                </div>
              </section>
            )}

            {/* 3. 日期時段 */}
            {service && !isQuote && staffChosen && (
              <section>
                <StepTitle n={pickStaff ? 3 : 2} title="選擇日期與時段" />
                {loadingSlots && !days ? <p className="py-6 text-center text-sm text-[#8a7f72]">讀取可預約時段…</p> : (
                  <>
                    <SlotPicker allowFull={business.waitlist} days={days ?? []} date={date} time={time} onDate={(d) => { setDate(d); resetSlot(); }} onTime={(t) => { setTime(t); idemKey.current = ''; }} />
                    {business.waitlist && date && !slots.length && !days?.find((d) => d.date === date)?.closed ? (
                      <WaitlistJoin key={`${serviceId}-${date}`} slug={slug} serviceId={serviceId} staffId={staffParam || null} date={date} auth={auth} contact={contact} loginNext={encodeURIComponent(`${here}?${nextParams}`)} onDone={() => { setTab('my'); void loadMine(); }} />
                    ) : null}
                  </>
                )}
              </section>
            )}

            {/* 4. 聯絡資料與送出 */}
            {ready && !isQuote && service && quote && (
              <section>
                <StepTitle n={pickStaff ? 4 : 3} title="確認預約" />
                <div className="space-y-1 rounded-2xl bg-white p-4 text-sm text-[#6b6156]">
                  <p className="font-semibold text-[#1f1b19]">{service.name}{quote.addons.length ? `(+${quote.addons.map((a) => a.name).join('、')})` : ''}{quote.extras.map((e) => ` → ${e.name}`).join('')}</p>
                  <p>{formatDateLabel(date).md}(週{formatDateLabel(date).weekday}) {time} · 約 {quote.duration} 分鐘</p>
                  {pickStaff ? <p>人員:{staffParam ? serviceStaff.find((x) => x.id === staffParam)?.info?.name : '不指定(由店家安排)'}</p> : null}
                  {pkg ? (
                    <label className="flex items-center gap-2 rounded-lg bg-[#eef6ef] px-2.5 py-2 text-[#2f5a3a]"><input type="checkbox" checked={usePackage} onChange={(e) => setUsePackage(e.target.checked)} />使用套票「{pkg.name}」(剩 {pkg.available} 次)</label>
                  ) : null}
                  {addonPkgs.map((x) => {
                    const a = service.addons.find((y) => y.id === x.addon_id);
                    return <label key={x.addon_id} className="flex items-center gap-2 rounded-lg bg-[#eef6ef] px-2.5 py-2 text-[#2f5a3a]"><input type="checkbox" checked={x.on} onChange={(e) => setSkipAddonPkg((list) => (e.target.checked ? list.filter((id) => id !== x.addon_id) : [...list, x.addon_id]))} />加購「{a?.name}」用票券「{x.name}」(剩 {x.available} 次)</label>;
                  })}
                  {(() => {
                    const addonCovered = addonPkgs.filter((x) => x.on).reduce((n, x) => n + (service.addons.find((y) => y.id === x.addon_id)?.price ?? 0), 0);
                    const rest = quote.total - (pkgOn ? quote.base ?? 0 : 0) - addonCovered;
                    if (!pkgOn && !addonCovered) return <p>{priceText(quote.total, quote.varies ? '起(依人員)' : service.price_note)}</p>;
                    return <p>{[pkgOn ? '主服務' : '', addonCovered ? '加購' : ''].filter(Boolean).join('、')}由票券支付{rest > 0 ? `,其他項目 ${money(rest)}` : ''}</p>;
                  })()}
                  {quote.deposit && !pkgOn ? <p className="text-[#9a6412]">需付訂金 {money(quote.deposit)}(轉帳){business.approval_mode === 'manual' ? ',店家確認後再付' : ''},{quote.total ? `到店再付尾款 ${money(Math.max(0, quote.total - quote.deposit))}` : '其餘到店付'}</p> : null}
                  {branch ? <p className="text-xs text-[#8a7f72]">分店:{branch.name}{branch.address ? ` · ${branch.address}` : ''}</p> : business.address ? <p className="text-xs text-[#8a7f72]">地點:{business.address}</p> : null}
                </div>
                {auth && !auth.loggedIn ? (
                  <div className="mt-3 space-y-2 rounded-2xl bg-white p-4 text-center">
                    <p className="text-sm text-[#6b6156]">登入後送出預約,剛剛選的時段會保留</p>
                    <LineLoginLink next={loginNext} className="flex w-full items-center justify-center gap-2 rounded-full bg-[#06C755] py-3 text-sm font-semibold text-white">用 LINE 登入並繼續</LineLoginLink>
                    <a href={`/card/login?next=${loginNext}`} className="block w-full rounded-full border border-[#d7c9bd] py-3 text-sm">其他方式登入</a>
                  </div>
                ) : (
                  <div className="mt-3 space-y-3 rounded-2xl bg-white p-4">
                    <label className="block text-xs text-[#8a7f72]">預約人姓名
                      <input value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} maxLength={40} autoComplete="name" className="mt-1 w-full rounded-xl border border-[#e5ded4] px-3 py-2.5 text-base text-[#1f1b19]" />
                    </label>
                    <label className="block text-xs text-[#8a7f72]">聯絡電話
                      <input value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} inputMode="tel" autoComplete="tel" maxLength={20} className="mt-1 w-full rounded-xl border border-[#e5ded4] px-3 py-2.5 text-base text-[#1f1b19]" />
                    </label>
                    <label className="block text-xs text-[#8a7f72]">備註(選填)
                      <textarea value={contact.note} onChange={(e) => setContact({ ...contact, note: e.target.value })} rows={2} maxLength={500} placeholder="想做的款式、需要注意的地方…" className="mt-1 w-full resize-none rounded-xl border border-[#e5ded4] px-3 py-2.5 text-base text-[#1f1b19]" />
                    </label>
                    {business.notice ? <p className="whitespace-pre-line rounded-xl bg-[#faf7f2] p-3 text-xs leading-5 text-[#6b6156]">{business.notice}</p> : null}
                    <p className="text-xs leading-5 text-[#8a7f72]">
                      {business.approval_mode === 'manual' ? '送出後由店家確認,確認後會通知你。' : quote.deposit ? '送出後保留時段,完成訂金轉帳並經店家核對後成立。' : '送出後立即成立。'}
                      {business.cancel_hours ? ` 服務前 ${business.cancel_hours} 小時內無法線上取消或改期。` : ''}
                    </p>
                  </div>
                )}
              </section>
            )}
            {error ? <p role="alert" className="rounded-xl bg-[#fdecea] px-4 py-3 text-sm text-[#a03b3b]">{error}</p> : null}
          </div>
        )}
      </div>

      {/* 置底送出按鈕 */}
      {tab === 'book' && !result && ready && !isQuote && auth?.loggedIn ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#e5ded4] bg-[#faf7f2]/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur">
          <div className="mx-auto flex max-w-xl items-center gap-3">
            <p className="min-w-0 flex-1 truncate text-xs text-[#6b6156]">{service?.name} · {formatDateLabel(date).md} {time}</p>
            <button type="button" disabled={submitting} onClick={() => void submit()} className="shrink-0 rounded-full bg-[#1f1b19] px-6 py-3 text-sm font-semibold text-white disabled:opacity-50">{submitting ? '送出中…' : business.approval_mode === 'manual' ? '送出預約申請' : quote?.deposit ? '保留時段' : '確認預約'}</button>
          </div>
        </div>
      ) : null}
    </main>
    </LineOwnCtx.Provider>
  );
}

const LineOwnCtx = createContext(false);

// 用 LINE 登入:店家有自己的官方帳號時,不邀請加入平台官方帳號
function LineLoginLink({ next, className, children }: { next: string; className: string; children: React.ReactNode }) {
  const own = useContext(LineOwnCtx);
  return <a href={`/auth/line/start?next=${next}${own ? '&bot=off' : ''}`} className={className}>{children}</a>;
}

// 店家自己的官方 LINE:按下後開啟 LINE 並帶入「綁定 XXXXXX」,傳送就完成綁定(之後預約通知從店家官方帳號發送)
function OwnLineBox({ slug }: { slug: string }) {
  const [st, setSt] = useState<{ own: boolean; name?: string; bound?: boolean } | null>(null);
  const [code, setCode] = useState<{ text: string; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch(`/api/booking/${encodeURIComponent(slug)}/line`, { cache: 'no-store' }).then((r) => r.json()).then((d) => { if (alive) setSt(d); }).catch(() => {});
    return () => { alive = false; };
  }, [slug]);
  if (!st?.own) return null;
  async function unbind() {
    if (!(await uiConfirm(`解除後,「${st?.name}」不會再用 LINE 通知你預約狀態。確定解除?`, { danger: true }))) return;
    const res = await fetch(`/api/booking/${encodeURIComponent(slug)}/line`, { method: 'DELETE' });
    if (!res.ok) return void uiAlert('解除失敗,請稍後再試');
    uiToast('已解除綁定');
    setSt((x) => (x ? { ...x, bound: false } : x));
  }
  if (st.bound) return <div className="flex items-center gap-2 rounded-xl bg-[#eef6f0] p-3"><p className="min-w-0 flex-1 text-xs text-[#2f6b3f]">✓ 已綁定「{st.name}」官方 LINE,確認與提醒會從這裡通知你</p><button type="button" onClick={() => void unbind()} className="shrink-0 rounded-full border border-[#cfe3d5] bg-white px-3 py-1 text-xs text-[#a03b3b]">解除綁定</button></div>;
  async function bind() {
    setBusy(true);
    try {
      const res = await fetch(`/api/booking/${encodeURIComponent(slug)}/line`, { method: 'POST' });
      const d = await res.json().catch(() => null);
      if (!res.ok) return void uiAlert(d?.error?.message ?? '請稍後再試');
      setCode(d);
      window.location.href = d.url;
    } finally { setBusy(false); }
  }
  return (
    <div className="space-y-2 rounded-xl bg-[#eef8f1] p-3 text-left">
      <p className="text-sm font-semibold text-[#1f5a35]">加入「{st.name}」官方 LINE 接收預約通知</p>
      <p className="text-xs leading-5 text-[#4c6b55]">按下後會開啟 LINE,並帶入一段綁定碼,直接按傳送就完成。之後的確認、提醒都會從店家的官方帳號通知你。</p>
      <button type="button" disabled={busy} onClick={() => void bind()} className="flex w-full items-center justify-center rounded-full bg-[#06C755] py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? '開啟中…' : '加入官方 LINE 並綁定'}</button>
      {code ? <p className="text-xs text-[#4c6b55]">沒有自動開啟?請在官方帳號傳送:<span className="font-semibold tracking-wider text-[#1f1b19]">{code.text}</span>(30 分鐘內有效)<br /><a href={code.url} className="text-[#1f6f8b] underline">再開一次 LINE</a></p> : null}
    </div>
  );
}

function StepTitle({ n, title }: { n: number; title: string }) {
  return (
    <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1f1b19] text-[11px] text-white">{n}</span>{title}
    </p>
  );
}

// 分段服務的流程條:主要人員(深)、助理(藍)、等待(綠)
function StepBar({ steps }: { steps: Service['steps'] }) {
  const tone = { main: 'bg-[#1f1b19]', assistant: 'bg-[#9cc0d8]', none: 'bg-[#b9d8c1]' };
  return (
    <span className="mt-2 block">
      <span className="flex h-1.5 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
        {steps.map((s, i) => <span key={i} className={tone[s.who]} style={{ flex: s.minutes }} />)}
      </span>
      <span className="mt-1 block text-[11px] leading-4 text-[#8a7f72]">{steps.map((s) => `${s.name} ${s.minutes} 分`).join(' → ')}</span>
      {steps.some((s) => s.who === 'none') ? <span className="block text-[11px] leading-4 text-[#8a7f72]">等待時人員會照顧其他客人,座位為你保留。</span> : null}
    </span>
  );
}

function StaffCard({ on, onClick, name, sub, avatar }: { on: boolean; onClick: () => void; name: string; sub: string; avatar?: string }) {
  return (
    <button type="button" onClick={onClick} className={`flex min-w-0 items-center gap-2 rounded-2xl border bg-white p-2.5 text-left ${on ? 'border-[#1f1b19] ring-2 ring-[#1f1b19]/10' : 'border-[#e5ded4]'}`}>
      {avatar ? <img src={avatar} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" /> : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#efe8dd] text-sm font-semibold text-[#6b6156]">{name.slice(0, 1)}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{name}</span>
        <span className="block truncate text-[11px] text-[#8a7f72]">{sub}</span>
      </span>
    </button>
  );
}

// allowFull:開放候補時,額滿的日期也能點選(顯示候補登記)
function SlotPicker({ days, date, time, onDate, onTime, allowFull = false }: { days: Day[]; date: string; time: string; onDate: (d: string) => void; onTime: (t: string) => void; allowFull?: boolean }) {
  const today = localParts(new Date()).date;
  const slots = days.find((d) => d.date === date)?.slots ?? [];
  return (
    <>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {days.map((d) => {
          const { md, weekday } = formatDateLabel(d.date);
          const on = d.date === date;
          const none = !d.slots.length;
          return (
            <button key={d.date} type="button" disabled={none && (d.closed || !allowFull)} onClick={() => onDate(d.date)} className={`flex w-14 shrink-0 flex-col items-center rounded-2xl border py-2 text-xs transition ${on ? 'border-[#1f1b19] bg-[#1f1b19] text-white' : none ? 'border-transparent bg-white/50 text-[#c4bab0]' : 'border-[#e5ded4] bg-white'}`}>
              <span>{d.date === today ? '今天' : `週${weekday}`}</span>
              <span className="mt-0.5 text-sm font-semibold">{md}</span>
              <span className={`mt-0.5 text-[10px] ${on ? 'text-white/70' : 'text-[#a99e8f]'}`}>{none ? (d.closed ? '休息' : '額滿') : `${d.slots.length} 個`}</span>
            </button>
          );
        })}
      </div>
      {slots.length ? (
        <div className="mt-2 grid grid-cols-4 gap-2">
          {slots.map((t) => (
            <button key={t} type="button" onClick={() => onTime(t)} className={`rounded-xl border py-2.5 text-sm transition ${t === time ? 'border-[#1f1b19] bg-[#1f1b19] font-semibold text-white' : 'border-[#e5ded4] bg-white'}`}>{t}</button>
          ))}
        </div>
      ) : <p className="mt-2 rounded-xl bg-white p-4 text-center text-sm text-[#8a7f72]">{days.find((d) => d.date === date)?.closed ? '這天休息,請選其他日期' : days.some((d) => d.slots.length) ? '這天已額滿,請選其他日期' : `近 ${DAYS} 天都已額滿`}</p>}
    </>
  );
}

// 轉帳資訊 + 顧客回報付款:可選付訂金或全額,填末 5 碼、轉帳時間、戶名(店家核對後才算收款)
// required = 這筆要付訂金才成立;否則是已成立的預約「預先付清」,預設收合
export function PayBox({ bookingId, version, deposit, full, expiresAt, paymentInfo, report, required, onDone }: {
  bookingId: string; version: number; deposit: number; full: number; expiresAt: string | null; paymentInfo: string;
  report?: BkBooking['payment_report'] | null; required: boolean; onDone: () => void;
}) {
  const nowLocal = () => { const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };
  const [open, setOpen] = useState(required);
  const [kind, setKind] = useState<'deposit' | 'full'>(deposit > 0 ? 'deposit' : 'full');
  const [form, setForm] = useState(() => ({ last5: '', paidAt: nowLocal(), payer: '', note: '' }));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(report?.at ? report : null);
  const amount = kind === 'full' ? full : deposit;
  const options = ([['deposit', '付訂金', deposit], ['full', '付全額', full]] as const).filter(([, , n]) => n > 0);
  async function submit() {
    if (!/^\d{5}$/.test(form.last5)) return void uiAlert('請填寫匯款帳號末 5 碼');
    if (!form.paidAt) return void uiAlert('請填寫轉帳時間');
    setBusy(true);
    try {
      const res = await fetch(`/api/booking/my/${bookingId}/payment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expected_version: version, kind, last5: form.last5, paid_at: form.paidAt, payer: form.payer, note: form.note }) });
      const data = await res.json().catch(() => null);
      if (!res.ok) return void uiAlert(data?.error?.message ?? '回報失敗');
      setDone({ kind, amount, last5: form.last5, paid_at: form.paidAt, payer: form.payer, note: form.note, at: new Date().toISOString() });
      uiToast('已通知店家核對');
      onDone();
    } finally { setBusy(false); }
  }
  if (!options.length) return null;
  if (done) {
    return (
      <div className="rounded-xl bg-[#eef6f0] p-3 text-left text-xs leading-5 text-[#2f6b3f]">
        <p className="font-semibold">✓ 已回報付款,等待店家核對{required ? ',核對後預約才成立' : ''}</p>
        <p className="mt-0.5 text-[#4c6b55]">{paymentReportText(done)}</p>
      </div>
    );
  }
  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className="w-full rounded-xl border border-[#e5d6b8] bg-[#fffaf1] px-3 py-2.5 text-left text-sm font-semibold text-[#9a6412]">預先轉帳付款 →<span className="block text-[11px] font-normal text-[#a08550]">可付{options.map(([, label, n]) => `${label.slice(1)} ${money(n)}`).join(' 或 ')},轉帳後在這裡填寫付款資訊</span></button>;
  }
  const field = 'mt-1 w-full min-w-0 rounded-lg border border-[#e5d6b8] bg-white px-3 py-2 text-base text-[#1f1b19]';
  return (
    <div className="space-y-2.5 rounded-xl bg-[#fff8ec] p-3 text-left text-xs leading-5 text-[#6b5520]">
      <p className="text-sm font-semibold text-[#9a6412]">{required ? '付款後預約才會成立' : '轉帳付款'}{expiresAt && required ? `,請在 ${formatDateTime(expiresAt)} 前完成` : ''}</p>
      {options.length > 1 ? (
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="付款方式">
          {options.map(([k, label, n]) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={`rounded-xl border bg-white p-2 text-left ${kind === k ? 'border-[#1f1b19] ring-2 ring-[#1f1b19]/10' : 'border-[#e5d6b8]'}`}>
              <span className="block text-sm font-semibold text-[#1f1b19]">{label}</span>
              <span className="block text-[11px] text-[#8a7f72]">{money(n)}</span>
            </button>
          ))}
        </div>
      ) : <p className="text-sm text-[#1f1b19]">{options[0][1]} {money(options[0][2])}</p>}
      {paymentInfo ? <p className="whitespace-pre-line rounded-lg bg-white/70 p-2 text-[#1f1b19]">{paymentInfo}</p> : <p>匯款帳號請向店家索取。</p>}
      <p className="font-semibold text-[#6b5520]">轉帳完成後填寫付款資訊(轉帳 {money(amount)})</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="block min-w-0">匯款帳號末 5 碼
          <input value={form.last5} onChange={(e) => setForm({ ...form, last5: e.target.value.replace(/\D/g, '').slice(0, 5) })} inputMode="numeric" placeholder="12345" className={field} />
        </label>
        <label className="block min-w-0">匯款戶名(選填)
          <input value={form.payer} onChange={(e) => setForm({ ...form, payer: e.target.value.slice(0, 30) })} placeholder="例:王小明" className={field} />
        </label>
      </div>
      <label className="block min-w-0">轉帳時間
        <input type="datetime-local" value={form.paidAt} onChange={(e) => setForm({ ...form, paidAt: e.target.value })} className={`${field} appearance-none`} />
      </label>
      <label className="block min-w-0">備註(選填)
        <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value.slice(0, 100) })} placeholder="例:用公司帳戶轉帳" className={field} />
      </label>
      <div className="flex gap-2">
        {!required ? <button type="button" onClick={() => setOpen(false)} className="shrink-0 rounded-full border border-[#e5d6b8] bg-white px-4 py-2 text-sm text-[#6b6156]">收起</button> : null}
        <button type="button" disabled={busy} onClick={() => void submit()} className="flex-1 rounded-full bg-[#1f1b19] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? '送出中…' : '送出付款資訊'}</button>
      </div>
      {required ? <p className="text-[11px] text-[#a08550]">逾時未完成,時段會自動釋放。</p> : null}
    </div>
  );
}

function ResultView({ result, business, lineBound, here, onMore, onMine, onReported }: { result: Result; business: Business; lineBound: boolean; here: string; onMore: () => void; onMine: () => void; onReported: () => void }) {
  const pending = result.status === 'pending';
  const pay = result.next_action === 'pay_deposit';
  return (
    <div className="rounded-2xl bg-white p-6 text-center">
      <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full text-2xl ${pending ? 'bg-[#fff3df] text-[#9a6412]' : 'bg-[#e7f3ea] text-[#2f6b3f]'}`}>{pending ? '⏳' : '✓'}</div>
      <p className="mt-3 text-lg font-semibold">{pay ? '時段已保留' : pending ? '已送出預約申請' : '預約成功'}</p>
      <p className="mt-1 text-sm text-[#6b6156]">{formatRange(result.start_at, result.end_at)}</p>
      <p className="mt-1 text-xs text-[#8a7f72]">預約編號 {result.booking_no}</p>
      {pay ? <div className="mt-3"><PayBox bookingId={result.booking_id} version={result.version} deposit={result.deposit_amount} full={result.total} expiresAt={result.expires_at} paymentInfo={business.payment_info} required onDone={onReported} /></div> : null}
      {result.status === 'confirmed' && result.total > 0 && business.payment_info ? <div className="mt-3"><PayBox bookingId={result.booking_id} version={result.version} deposit={0} full={result.total} expiresAt={null} paymentInfo={business.payment_info} required={false} onDone={onReported} /></div> : null}
      {result.next_action === 'wait_approval' && result.expires_at ? (
        <p className="mt-3 rounded-xl bg-[#faf7f2] p-3 text-xs leading-5 text-[#6b6156]">{business.name} 會在 {formatDateTime(result.expires_at)} 前確認,逾時未確認會自動取消。{result.deposit_amount ? `確認後會通知你轉帳訂金 ${money(result.deposit_amount)}。` : ''}</p>
      ) : null}
      {business.line_own ? <div className="mt-4"><OwnLineBox slug={here.slice(2, -5)} /></div> : !lineBound ? (
        <a href={`/auth/line/start?mode=link&next=${encodeURIComponent(`${here}?tab=my`)}`} className="mt-4 flex w-full items-center justify-center rounded-full bg-[#06C755] py-3 text-sm font-semibold text-white">綁定 LINE 接收預約通知</a>
      ) : <p className="mt-4 text-xs text-[#2f6b3f]">確認、提醒會透過 LINE 通知你</p>}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={onMine} className="rounded-full border border-[#d7c9bd] py-2.5 text-sm">我的預約</button>
        <button type="button" onClick={onMore} className="rounded-full border border-[#d7c9bd] py-2.5 text-sm">再預約一筆</button>
      </div>
    </div>
  );
}

function MyBookings({ auth, slug, loginNext, onCancel, onBook, reload, lineOwn }: { auth: { loggedIn: boolean; bookings: MyBooking[]; quotes: MyQuote[]; records: MyRecord[]; packages: MyPackage[]; points: number; waitlist: MyWait[]; optOut: boolean | null } | null; slug: string; loginNext: string; onCancel: (b: MyBooking) => void; onBook: () => void; reload: () => Promise<void>; lineOwn?: boolean }) {
  // 頁面打開時的時間(判斷可否取消);只在第一次取得,避免每次重畫都變
  const [now] = useState(() => Date.now());
  const [moving, setMoving] = useState('');
  if (!auth) return <p className="py-10 text-center text-sm text-[#8a7f72]">讀取中…</p>;
  if (!auth.loggedIn) {
    return (
      <div className="space-y-2 rounded-2xl bg-white p-6 text-center">
        <p className="text-sm text-[#6b6156]">登入後查看你的預約</p>
        <LineLoginLink next={loginNext} className="block w-full rounded-full bg-[#06C755] py-3 text-sm font-semibold text-white">用 LINE 登入</LineLoginLink>
        <a href={`/card/login?next=${loginNext}`} className="block w-full rounded-full border border-[#d7c9bd] py-3 text-sm">其他方式登入</a>
      </div>
    );
  }
  if (!auth.bookings.length && !auth.quotes.length && !auth.records.length && !auth.packages.length && !auth.points && !auth.waitlist.length) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center">
        {lineOwn ? <div className="mb-4 text-left"><OwnLineBox slug={slug} /></div> : null}
        <p className="text-sm text-[#8a7f72]">還沒有預約紀錄</p>
        <button type="button" onClick={onBook} className="mt-3 rounded-full bg-[#1f1b19] px-6 py-2.5 text-sm font-semibold text-white">我要預約</button>
      </div>
    );
  }
  async function setOptOut(v: boolean) {
    const res = await fetch('/api/booking/my/prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, marketing_opt_out: v }) });
    if (res.ok) { uiToast(v ? '已關閉回訪訊息' : '已開啟回訪訊息'); void reload(); }
  }
  return (
    <div className="space-y-2">
      {auth.packages.length || auth.points ? (
        <div className="space-y-2 rounded-2xl bg-white p-4">
          {auth.points ? <p className="flex justify-between text-sm"><span className="font-semibold">回饋點數</span><span className="tabular-nums">{auth.points} 點</span></p> : null}
          {auth.packages.map((p) => (
            <div key={p.id}>
              <p className="flex justify-between gap-2 text-sm"><span className="min-w-0 truncate font-semibold">{p.name}</span><span className="shrink-0 text-[#2f5a3a]">剩 {p.available} 次</span></p>
              <div className="mt-1 flex h-1.5 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
                <span className="bg-[#d5cbbd]" style={{ flex: p.used }} /><span className="bg-[#e7c98f]" style={{ flex: p.reserved }} /><span className="bg-[#9cc8a6]" style={{ flex: p.available }} />
              </div>
              <p className="mt-0.5 text-[11px] text-[#8a7f72]">已用 {p.used} · 預約保留 {p.reserved} · {formatDateTime(p.expires_at).split(' ')[0]} 到期</p>
            </div>
          ))}
        </div>
      ) : null}
      {auth.waitlist.map((w) => (
        <div key={w.id} className="rounded-2xl bg-white p-4">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">候補 · {w.service_name}</p>
              <p className="mt-0.5 text-sm text-[#6b6156]">{formatDateLabel(w.date).md}(週{formatDateLabel(w.date).weekday}) {w.from_min === 0 && w.to_min === 1440 ? '整天' : `${String(Math.floor(w.from_min / 60)).padStart(2, '0')}:${String(w.from_min % 60).padStart(2, '0')} 之後`}</p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${w.status === 'invited' ? 'bg-[#e7f3ea] text-[#2f6b3f]' : 'bg-[#fff3df] text-[#9a6412]'}`}>{w.status === 'invited' ? '有空位了' : '等待空位'}</span>
          </div>
          {w.status === 'invited' ? (
            <a href={`/@${slug}/book?s=${w.service_id}&d=${w.date}&t=${encodeURIComponent(w.invited_slot ?? '')}${w.staff_id ? `&p=${w.staff_id}` : ''}`} className="mt-3 block rounded-full bg-[#1f1b19] py-2.5 text-center text-sm font-semibold text-white">預約 {w.invited_slot}({formatDateTime(w.invite_expires_at!)} 前)</a>
          ) : null}
          <button type="button" onClick={() => void (async () => { await fetch(`/api/booking/my/waitlist/${w.id}`, { method: 'DELETE' }); uiToast('已取消候補'); void reload(); })()} className="mt-2 text-xs text-[#a03b3b]">取消候補</button>
        </div>
      ))}
      {auth.records.map((r) => <RecordConsent key={`${r.id}-${r.consent}-${r.delete_requested}`} record={r} onDone={() => void reload()} />)}
      {auth.quotes.filter((q) => q.status !== 'accepted').map((q) => <QuoteOffer key={`${q.id}-${q.current_version}-${q.status}`} quote={q} onDone={() => void reload()} />)}
      {auth.bookings.map((b) => {
        const active = ACTIVE.includes(b.status) && new Date(b.start_at).getTime() > now;
        const inWindow = b.status === 'pending' || new Date(b.start_at).getTime() - now >= b.business.cancel_hours * 3600000;
        const canMove = active && inWindow && b.reschedule_count < b.business.reschedule_limit;
        const needPay = b.status === 'pending' && b.approval_status !== 'pending' && ['awaiting', 'reported'].includes(b.payment_status);
        const total = b.total_price || b.service_snapshot.price;
        // 已成立但還沒付清:可以預先轉帳(訂金已付就付剩下的全額)
        const prepay = !needPay && b.status === 'confirmed' && b.total_price > b.paid_amount && Boolean(b.business.payment_info) && new Date(b.start_at).getTime() > now;
        return (
          <div key={b.id} className="rounded-2xl bg-white p-4">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{b.service_snapshot.name}{b.addons?.length ? ` + ${b.addons.map((a) => a.name).join('、')}` : ''}</p>
                <p className="mt-0.5 text-sm text-[#6b6156]">{formatRange(b.start_at, b.end_at)}</p>
                {b.staff_name ? <p className="mt-0.5 text-xs text-[#8a7f72]">人員:{b.staff_name}</p> : null}
                {total || b.deposit_amount ? (
                  <p className="mt-0.5 text-xs text-[#8a7f72]">
                    {total ? `總額 ${money(total)}` : ''}{b.deposit_amount ? ` · 訂金 ${money(b.deposit_amount)}` : ''}{b.paid_amount ? ` · 已付 ${money(b.paid_amount)}` : ''}
                  </p>
                ) : null}
                <p className="mt-0.5 text-[11px] text-[#a99e8f]">{b.booking_no}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLOR[b.status]}`}>{statusText(b)}</span>
            </div>
            {needPay || prepay ? <div className="mt-3"><PayBox key={`${b.id}-${b.version}`} bookingId={b.id} version={b.version} deposit={needPay ? Math.max(0, b.deposit_amount - b.paid_amount) : 0} full={Math.max(0, (b.total_price || 0) - b.paid_amount)} expiresAt={b.expires_at} paymentInfo={b.business.payment_info} report={b.payment_report?.at && (needPay || b.payment_report.amount) ? b.payment_report : null} required={needPay} onDone={() => void reload()} /></div> : null}
            {b.status === 'pending' && b.approval_status === 'pending' && b.expires_at ? <p className="mt-2 text-[11px] text-[#9a6412]">店家會在 {formatDateTime(b.expires_at)} 前確認</p> : null}
            {moving === b.id ? (
              <Reschedule booking={b} onClose={() => setMoving('')} onDone={() => { setMoving(''); void reload(); }} />
            ) : active ? (
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                <a href={`/api/booking/my/${b.id}/ics`} className="text-[#1f6f8b] underline-offset-4 hover:underline">加入行事曆</a>
                {canMove ? <button type="button" onClick={() => setMoving(b.id)} className="text-[#1f6f8b] underline-offset-4 hover:underline">改期</button> : null}
                {inWindow ? <button type="button" onClick={() => onCancel(b)} className="text-[#a03b3b] underline-offset-4 hover:underline">取消預約</button> : null}
                {!inWindow ? <span className="text-[11px] text-[#8a7f72]">服務前 {b.business.cancel_hours} 小時內無法線上取消或改期,請聯絡店家</span> : null}
              </div>
            ) : null}
          </div>
        );
      })}
      {auth.optOut !== null ? (
        <label className="flex items-center gap-2 px-1 pt-2 text-xs text-[#8a7f72]"><input type="checkbox" checked={!auth.optOut} onChange={(e) => void setOptOut(!e.target.checked)} />接收這家店的感謝與回訪提醒(預約通知不受影響)</label>
      ) : null}
    </div>
  );
}

// 改期:選新的日期時段 → 送出;新時段被搶走時原預約不變
function Reschedule({ booking, onClose, onDone }: { booking: MyBooking; onClose: () => void; onDone: () => void }) {
  const [days, setDays] = useState<Day[] | null>(null);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const res = await fetch(`/api/booking/my/${booking.id}/reschedule?days=${DAYS}`, { cache: 'no-store' });
    const data = await res.json().catch(() => null);
    if (!res.ok) { setError(data?.error?.message ?? '讀取時段失敗'); setDays([]); return; }
    const list = (data?.days ?? []) as Day[];
    setDays(list);
    setDate((d) => d || list.find((x) => x.slots.length)?.date || list[0]?.date || '');
  }, [booking.id]);
  useEffect(() => { Promise.resolve().then(load); }, [load]);
  async function save() {
    if (!date || !time) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/booking/my/${booking.id}/reschedule`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expected_version: booking.version, start_at: new Date(`${date}T${time}:00+08:00`).toISOString() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error?.message ?? '改期失敗');
        if (data?.error?.code === 'SLOT_UNAVAILABLE') { setTime(''); void load(); }
        return;
      }
      uiToast('已改期');
      onDone();
    } finally { setBusy(false); }
  }
  const left = booking.business.reschedule_limit - booking.reschedule_count;
  return (
    <div className="mt-3 space-y-2 border-t border-[#f0ebe2] pt-3">
      <p className="text-xs text-[#8a7f72]">選擇新的時間(還可線上改期 {left} 次;改期成功前,原本的時段仍保留)</p>
      {days === null ? <p className="py-4 text-center text-sm text-[#8a7f72]">讀取中…</p> : <SlotPicker days={days} date={date} time={time} onDate={(d) => { setDate(d); setTime(''); }} onTime={setTime} />}
      {error ? <p role="alert" className="rounded-lg bg-[#fdecea] px-3 py-2 text-xs text-[#a03b3b]">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-full border border-[#d7c9bd] px-4 py-2 text-sm">取消</button>
        <button type="button" disabled={!time || busy} onClick={() => void save()} className="rounded-full bg-[#1f1b19] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy ? '處理中…' : time ? `改到 ${formatDateLabel(date).md} ${time}` : '確認改期'}</button>
      </div>
    </div>
  );
}

// 需報價服務的詢價表單:不占檔期,店家回覆報價後再決定
function InquiryForm({ slug, service, staff, business, auth, loginNext, onDone }: {
  slug: string; service: Service; staff: Staff[]; business: Business; auth: { loggedIn: boolean } | null; loginNext: string; onDone: () => void;
}) {
  const today = localParts(new Date()).date;
  const outcall = service.service_mode === 'outcall';
  const [f, setF] = useState({ event_date: '', time: '', event_type: '', address: '', people: '', note: '', name: '', phone: '', staff_id: '' });
  const [images, setImages] = useState<{ blob: Blob; url: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v });

  async function addImages(files: FileList | null) {
    if (!files) return;
    setError('');
    const next = [...images];
    for (const file of Array.from(files).slice(0, 3 - images.length)) {
      try { const blob = await shrinkImage(file); next.push({ blob, url: URL.createObjectURL(blob) }); }
      catch { setError('有圖片無法讀取,請換一張(建議 JPG 或 PNG)'); }
    }
    setImages(next);
  }
  async function submit() {
    setError('');
    if (!f.event_date) return setError('請選擇活動日期');
    if (outcall && !f.address.trim()) return setError('請填寫服務地點');
    if (!f.name.trim()) return setError('請填寫姓名');
    if (!/^[0-9+\-\s()]{8,20}$/.test(f.phone.trim())) return setError('請填寫正確的聯絡電話');
    setBusy(true);
    try {
      const form = new FormData();
      form.set('data', JSON.stringify({
        service_id: service.id, staff_id: f.staff_id || null,
        request: { event_date: f.event_date, time: f.time, event_type: f.event_type, address: f.address, people: f.people, note: f.note },
        contact: { name: f.name, phone: f.phone },
      }));
      images.forEach((im, i) => form.append('images', im.blob, `ref-${i + 1}.jpg`));
      const res = await fetch(`/api/booking/${encodeURIComponent(slug)}/quotes`, { method: 'POST', body: form });
      const data = await res.json().catch(() => null);
      if (!res.ok) return setError(data?.error?.message ?? '詢價送出失敗,請稍後再試');
      uiToast('已送出詢價,店家回覆後會用 LINE 通知你');
      onDone();
    } finally { setBusy(false); }
  }

  if (auth && !auth.loggedIn) {
    return (
      <section className="space-y-2 rounded-2xl bg-white p-4 text-center">
        <p className="text-sm text-[#6b6156]">這項服務需要先詢價,登入後填寫活動資訊</p>
        <LineLoginLink next={loginNext} className="flex w-full items-center justify-center rounded-full bg-[#06C755] py-3 text-sm font-semibold text-white">用 LINE 登入並繼續</LineLoginLink>
        <a href={`/card/login?next=${loginNext}`} className="block w-full rounded-full border border-[#d7c9bd] py-3 text-sm">其他方式登入</a>
      </section>
    );
  }
  const field = 'mt-1 w-full rounded-xl border border-[#e5ded4] bg-white px-3 py-2.5 text-base text-[#1f1b19]';
  return (
    <section>
      <StepTitle n={2} title="填寫活動資訊" />
      <div className="space-y-3 rounded-2xl bg-white p-4">
        <p className="text-xs leading-5 text-[#8a7f72]">送出後由店家依需求報價,報價前不會保留檔期。{outcall && business.service_area ? ` 服務範圍:${business.service_area}` : ''}</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="block text-xs text-[#8a7f72]">活動日期<DateField value={f.event_date} min={today} onChange={(d) => set('event_date', d)} className="mt-1" /></div>
          <label className="block text-xs text-[#8a7f72]">需完成 / 開始時間<input type="time" step={900} value={f.time} onChange={(e) => set('time', e.target.value)} className={field} /></label>
        </div>
        <label className="block text-xs text-[#8a7f72]">活動類型<input value={f.event_type} onChange={(e) => set('event_type', e.target.value)} maxLength={40} placeholder="例:結婚宴客、訂婚、拍攝…" className={field} /></label>
        {outcall ? <label className="block text-xs text-[#8a7f72]">服務地點<input value={f.address} onChange={(e) => set('address', e.target.value)} maxLength={120} autoComplete="street-address" placeholder="例:台中市西屯區 ○○飯店" className={field} /></label> : null}
        <label className="block text-xs text-[#8a7f72]">人數與造型需求<input value={f.people} onChange={(e) => set('people', e.target.value)} maxLength={40} placeholder="例:新娘 1、伴娘 2,新娘 3 個造型" className={field} /></label>
        {staff.length > 1 ? (
          <label className="block text-xs text-[#8a7f72]">希望的人員
            <select value={f.staff_id} onChange={(e) => set('staff_id', e.target.value)} className={field}>
              <option value="">不指定</option>
              {staff.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
            </select>
          </label>
        ) : null}
        <label className="block text-xs text-[#8a7f72]">其他需求(選填)<textarea value={f.note} onChange={(e) => set('note', e.target.value)} rows={3} maxLength={1000} placeholder="例:想要韓系清透妝感,需要試妝…" className={`${field} resize-none`} /></label>
        <div>
          <p className="text-xs text-[#8a7f72]">參考圖(選填,最多 3 張)</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {images.map((im, i) => (
              <span key={im.url} className="relative h-16 w-16 overflow-hidden rounded-lg bg-[#efe8dd]">
                <img src={im.url} alt={`參考圖 ${i + 1}`} className="h-full w-full object-cover" />
                <button type="button" onClick={() => setImages(images.filter((_, j) => j !== i))} aria-label="移除參考圖" className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#1f1b19]/70 text-xs text-white">×</button>
              </span>
            ))}
            {images.length < 3 ? (
              <label className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-lg border border-dashed border-[#d7c9bd] text-xl text-[#8a7f72]">
                +<input type="file" accept="image/*" multiple className="sr-only" aria-label="上傳參考圖" onChange={(e) => { void addImages(e.target.files); e.target.value = ''; }} />
              </label>
            ) : null}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs text-[#8a7f72]">姓名<input value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={40} autoComplete="name" className={field} /></label>
          <label className="block text-xs text-[#8a7f72]">聯絡電話<input value={f.phone} onChange={(e) => set('phone', e.target.value)} inputMode="tel" autoComplete="tel" maxLength={20} className={field} /></label>
        </div>
        {error ? <p role="alert" className="rounded-xl bg-[#fdecea] px-3 py-2 text-sm text-[#a03b3b]">{error}</p> : null}
        <button type="button" disabled={busy} onClick={() => void submit()} className="w-full rounded-full bg-[#1f1b19] py-3 text-sm font-semibold text-white disabled:opacity-50">{busy ? '送出中…' : '送出詢價'}</button>
      </div>
    </section>
  );
}

// 我的詢價:等待報價 / 報價內容(接受、婉拒)
function QuoteOffer({ quote: q, onDone }: { quote: MyQuote; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [now] = useState(() => Date.now());
  const o = q.offer;
  const expired = Boolean(o && new Date(o.valid_until).getTime() < now);
  async function act(action: 'accept' | 'decline') {
    if (action === 'decline' && !(await uiConfirm('婉拒這份報價?', { danger: true }))) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/booking/my/quotes/${q.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, version: q.current_version }) });
      const data = await res.json().catch(() => null);
      if (!res.ok) return void uiAlert(data?.error?.message ?? '操作失敗');
      uiToast(action === 'accept' ? (data?.payment_status === 'awaiting' ? '已接受,請在期限內轉帳訂金' : '已接受,預約成立') : '已婉拒');
      onDone();
    } finally { setBusy(false); }
  }
  const label = q.status === 'requested' ? '等待店家報價' : q.status === 'sent' ? (expired ? '報價已過期' : '店家已報價') : q.status === 'declined' ? '已婉拒' : '已取消';
  return (
    <div className="rounded-2xl bg-white p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{q.service_name} 詢價</p>
          <p className="mt-0.5 text-sm text-[#6b6156]">活動日 {q.request.event_date}{q.request.time ? ` ${q.request.time}` : ''}{q.request.event_type ? ` · ${q.request.event_type}` : ''}</p>
          <p className="mt-0.5 text-[11px] text-[#a99e8f]">{q.quote_no}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${q.status === 'sent' && !expired ? 'bg-[#e3eef6] text-[#1f5f7f]' : q.status === 'requested' ? 'bg-[#fff3df] text-[#9a6412]' : 'bg-[#f1efec] text-[#8a7f72]'}`}>{label}</span>
      </div>
      {o && q.status === 'sent' ? (
        <div className="mt-3 space-y-1 rounded-xl bg-[#faf7f2] p-3 text-xs text-[#3d3631]">
          {o.items.map((it, i) => <p key={i} className="flex justify-between gap-2"><span className="min-w-0">{it.name}</span><span className="shrink-0 tabular-nums">{money(it.amount)}</span></p>)}
          <p className="flex justify-between gap-2 text-sm font-semibold text-[#1f1b19]"><span>合計</span><span className="tabular-nums">{money(o.total)}</span></p>
          <p>服務時間 {formatRange(o.start_at, new Date(new Date(o.start_at).getTime() + o.minutes * 60000).toISOString())}</p>
          {o.deposit ? <p>訂金 {money(o.deposit)}(接受後轉帳,店家核對後成立)</p> : null}
          <p className="text-[#8a7f72]">報價有效至 {formatDateTime(o.valid_until)}{o.hold_until && new Date(o.hold_until).getTime() > now ? ` · 檔期為你保留到 ${formatDateTime(o.hold_until)}` : ''}</p>
          {o.note ? <p className="whitespace-pre-line text-[#6b6156]">{o.note}</p> : null}
          {!expired ? (
            <div className="flex gap-2 pt-2">
              <button type="button" disabled={busy} onClick={() => void act('accept')} className="flex-1 rounded-full bg-[#1f1b19] py-2.5 text-sm font-semibold text-white disabled:opacity-50">接受報價</button>
              <button type="button" disabled={busy} onClick={() => void act('decline')} className="rounded-full border border-[#d7c9bd] px-4 py-2.5 text-sm">婉拒</button>
            </div>
          ) : <p className="pt-1 text-[#a03b3b]">報價已過期,請聯絡店家重新報價。</p>}
        </div>
      ) : null}
    </div>
  );
}

// 店家想把服務照片公開為作品:顧客同意 / 不同意 / 撤回 / 要求刪除
function RecordConsent({ record: r, onDone }: { record: MyRecord; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  async function act(action: 'grant' | 'decline' | 'revoke' | 'request_delete') {
    if (action === 'request_delete' && !(await uiConfirm('請店家刪除這些照片?店家會收到通知。'))) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/booking/my/records/${r.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      const data = await res.json().catch(() => null);
      if (!res.ok) return void uiAlert(data?.error?.message ?? '操作失敗');
      uiToast(action === 'grant' ? '已同意公開' : action === 'decline' ? '已選擇不公開' : action === 'revoke' ? '已撤回同意' : '已通知店家刪除');
      onDone();
    } finally { setBusy(false); }
  }
  const label = { none: '', requested: '店家想分享這些照片', granted: '你已同意公開', declined: '你選擇不公開', revoked: '你已撤回同意' }[r.consent];
  return (
    <div className="rounded-2xl bg-white p-4">
      <p className="text-sm font-semibold">{r.performed_on} {r.service_name} 的服務照片</p>
      <p className="mt-0.5 text-xs text-[#8a7f72]">{label}{r.delete_requested ? ' · 已要求店家刪除' : ''}</p>
      {r.photos.length ? (
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {r.photos.map((p) => (
            <a key={p.id} href={`/api/booking/photo?id=${p.id}`} target="_blank" rel="noopener noreferrer" className="block aspect-square overflow-hidden rounded-lg bg-[#efe8dd]">
              <img src={`/api/booking/photo?id=${p.id}`} alt="服務照片" loading="lazy" width={120} height={120} className="h-full w-full object-cover" />
            </a>
          ))}
        </div>
      ) : null}
      {r.consent === 'requested' ? <p className="mt-2 text-xs leading-5 text-[#6b6156]">同意後店家可以把這些照片作為作品分享(例如社群、名片作品集);不同意也不影響你的預約。同意後可以隨時撤回。</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {['requested', 'declined', 'revoked'].includes(r.consent) ? <button type="button" disabled={busy} onClick={() => void act('grant')} className="rounded-full bg-[#1f1b19] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">同意公開</button> : null}
        {r.consent === 'requested' ? <button type="button" disabled={busy} onClick={() => void act('decline')} className="rounded-full border border-[#d7c9bd] px-4 py-2 text-sm">不同意</button> : null}
        {r.consent === 'granted' ? <button type="button" disabled={busy} onClick={() => void act('revoke')} className="rounded-full border border-[#d7c9bd] px-4 py-2 text-sm">撤回同意</button> : null}
        {!r.delete_requested ? <button type="button" disabled={busy} onClick={() => void act('request_delete')} className="ml-auto text-xs text-[#a03b3b]">要求刪除照片</button> : null}
      </div>
    </div>
  );
}

// 額滿時登記候補:選時段範圍,有空位時 LINE 通知(不保留名額)
function WaitlistJoin({ slug, serviceId, staffId, date, auth, contact, loginNext, onDone }: {
  slug: string; serviceId: string; staffId: string | null; date: string; auth: { loggedIn: boolean } | null;
  contact: { name: string; phone: string }; loginNext: string; onDone: () => void;
}) {
  const [range, setRange] = useState('0-1440');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(contact.name);
  const [phone, setPhone] = useState(contact.phone);
  async function join() {
    if (!name.trim()) return void uiAlert('請填寫姓名');
    setBusy(true);
    try {
      const [from_min, to_min] = range.split('-').map(Number);
      const res = await fetch(`/api/booking/${encodeURIComponent(slug)}/waitlist`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_id: serviceId, staff_id: staffId, date, from_min, to_min, contact: { name, phone } }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) return void uiAlert(data?.error?.message ?? '候補登記失敗');
      uiToast('已加入候補,有空位會用 LINE 通知你');
      onDone();
    } finally { setBusy(false); }
  }
  if (auth && !auth.loggedIn) {
    return <LineLoginLink next={loginNext} className="mt-2 block rounded-full border border-[#d7c9bd] bg-white py-2.5 text-center text-sm">登入後加入候補</LineLoginLink>;
  }
  return (
    <div className="mt-2 space-y-2 rounded-2xl bg-white p-4">
      <p className="text-sm font-semibold">這天額滿了,要加入候補嗎?</p>
      <p className="text-xs leading-5 text-[#8a7f72]">有人取消時,依登記順序用 LINE 通知你;名額不保留,收到通知後要在期限內完成預約。</p>
      <select value={range} onChange={(e) => setRange(e.target.value)} aria-label="可以的時段" className="w-full rounded-xl border border-[#e5ded4] bg-white px-3 py-2.5 text-base">
        <option value="0-1440">整天都可以</option><option value="0-720">中午以前</option><option value="720-1080">12:00–18:00</option><option value="1080-1440">18:00 以後</option>
      </select>
      <div className="grid grid-cols-2 gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="姓名" aria-label="姓名" autoComplete="name" className="min-w-0 rounded-xl border border-[#e5ded4] px-3 py-2.5 text-base" />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" maxLength={20} placeholder="電話" aria-label="電話" autoComplete="tel" className="min-w-0 rounded-xl border border-[#e5ded4] px-3 py-2.5 text-base" />
      </div>
      <button type="button" disabled={busy} onClick={() => void join()} className="w-full rounded-full bg-[#1f1b19] py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? '登記中…' : '加入候補'}</button>
    </div>
  );
}
