'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { uiAlert, uiConfirm } from '@/lib/ui-dialog';
import { uiToast } from '@/lib/ui-toast';
import {
  formatDateLabel, formatDateTime, formatRange, localParts, money, statusText, STATUS_COLOR,
  type ApprovalStatus, type BookingStatus, type PaymentStatus,
} from '@/lib/booking/shared';

type Addon = { id: string; name: string; price: number; extra_minutes: number };
type ServiceStaff = { id: string; duration_minutes: number; price: number };
type Service = {
  id: string; name: string; description: string; duration_minutes: number; price: number; price_note: string; image: string;
  deposit: number; addons: Addon[]; staff: ServiceStaff[]; steps: { name: string; minutes: number; who: 'main' | 'assistant' | 'none' }[];
};
type Staff = { id: string; name: string; title: string; avatar: string };
type Business = { name: string; address: string; notice: string; approval_mode: 'auto' | 'manual'; cancel_hours: number; allow_any_staff: boolean; payment_info: string; open: boolean };
type MyBooking = {
  id: string; booking_no: string; status: BookingStatus; approval_status: ApprovalStatus; payment_status: PaymentStatus;
  start_at: string; end_at: string; expires_at: string | null; version: number; staff_name: string;
  service_snapshot: { name: string; price: number; price_note?: string }; contact: { name?: string; phone?: string };
  addons: { name: string }[]; total_price: number; deposit_amount: number; paid_amount: number; reschedule_count: number;
  payment_report: { last5?: string };
  business: { name: string; slug: string; cancel_hours: number; payment_info: string; reschedule_limit: number };
};
type Result = {
  booking_id: string; booking_no: string; status: BookingStatus; start_at: string; end_at: string; expires_at: string | null; version: number;
  next_action: 'none' | 'wait_approval' | 'pay_deposit'; deposit_amount: number;
};
type Day = { date: string; slots: string[]; closed?: boolean };

const DAYS = 14;
const priceText = (price: number, note?: string) => (price ? `${money(price)}${note ? ` ${note}` : ''}` : note || '現場報價');
const ACTIVE = ['pending', 'confirmed'];

// 名片線上預約:選服務 → 加購 → 人員 → 日期時段 → 登入 → 聯絡資料 → 送出;另有「我的預約」(付訂金回報、改期、取消、加入行事曆)
export default function BookingClient({ slug, card, business, services, staff }: { slug: string; card: { display_name: string; avatar_url: string }; business: Business; services: Service[]; staff: Staff[] }) {
  const [tab, setTab] = useState<'book' | 'my'>('book');
  const [serviceId, setServiceId] = useState('');
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [staffId, setStaffId] = useState<string | null>(null); // null = 還沒選;'' = 不指定
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [days, setDays] = useState<Day[] | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [auth, setAuth] = useState<{ loggedIn: boolean; lineBound: boolean; bookings: MyBooking[] } | null>(null);
  const [contact, setContact] = useState({ name: '', phone: '', note: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const idemKey = useRef('');
  const service = services.find((s) => s.id === serviceId) ?? null;
  const here = `/@${slug}/book`;

  // 這個服務可選的人員;只有一位時不顯示人員步驟
  const serviceStaff = useMemo(() => (service?.staff ?? []).map((x) => ({ ...x, info: staff.find((s) => s.id === x.id) })).filter((x) => x.info), [service, staff]);
  const pickStaff = serviceStaff.length > 1;
  const staffChosen = !pickStaff || staffId !== null;
  const staffParam = pickStaff ? staffId || '' : '';

  // 試算(最終以伺服器計算為準)
  const quote = useMemo(() => {
    if (!service) return null;
    const chosen = serviceStaff.find((x) => x.id === staffParam) ?? (serviceStaff.length === 1 ? serviceStaff[0] : null);
    const addons = service.addons.filter((a) => addonIds.includes(a.id));
    const prices = serviceStaff.map((x) => x.price);
    const varies = !chosen && new Set(prices).size > 1;
    const base = chosen?.price ?? (prices.length ? Math.min(...prices) : service.price);
    const duration = (chosen?.duration_minutes ?? service.duration_minutes) + addons.reduce((n, a) => n + a.extra_minutes, 0);
    const total = base + addons.reduce((n, a) => n + a.price, 0);
    return { duration, total, varies, addons, deposit: service.deposit ? (total > 0 ? Math.min(service.deposit, total) : service.deposit) : 0 };
  }, [service, serviceStaff, staffParam, addonIds]);

  // 登入狀態與我的預約(也用來帶入上次填的聯絡資料)
  const loadMine = useCallback(async () => {
    const res = await fetch('/api/booking/my', { cache: 'no-store' });
    if (res.status === 401) { setAuth({ loggedIn: false, lineBound: false, bookings: [] }); return; }
    const data = await res.json().catch(() => null);
    const bookings = ((data?.bookings ?? []) as MyBooking[]).filter((b) => b.business.slug === slug);
    setAuth({ loggedIn: true, lineBound: Boolean(data?.line_bound), bookings });
    const last = (data?.bookings ?? [])[0] as MyBooking | undefined;
    if (last?.contact) setContact((c) => (c.name || c.phone ? c : { name: last.contact.name ?? '', phone: last.contact.phone ?? '', note: '' }));
  }, [slug]);

  // 從登入頁回來:網址帶回剛剛選的服務、加購、人員、日期、時段
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    Promise.resolve().then(() => {
      if (q.get('tab') === 'my') setTab('my');
      const s = q.get('s');
      if (s && services.some((x) => x.id === s)) {
        setServiceId(s);
        setAddonIds((q.get('a') ?? '').split(',').filter(Boolean));
        if (q.has('p')) setStaffId(q.get('p') ?? '');
        setDate(q.get('d') ?? '');
        setTime(q.get('t') ?? '');
      }
      void loadMine();
    });
  }, [services, loadMine]);

  const slotsUrl = useCallback(() => {
    const today = localParts(new Date()).date;
    return `/api/booking/${encodeURIComponent(slug)}/availability?service=${serviceId}&addons=${addonIds.join(',')}&staff=${staffParam}&from=${today}&days=${DAYS}`;
  }, [slug, serviceId, addonIds, staffParam]);

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
  const nextParams = `s=${serviceId}&a=${addonIds.join(',')}${pickStaff && staffId !== null ? `&p=${staffId}` : ''}&d=${date}&t=${encodeURIComponent(time)}`;
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
        body: JSON.stringify({ service_id: service.id, addon_ids: addonIds, staff_id: staffParam || null, start_at: startAt, contact, channel: /Line\//.test(navigator.userAgent) ? 'line' : 'card' }),
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
        expires_at: data.expires_at, version: data.version, next_action: data.next_action, deposit_amount: data.deposit_amount ?? 0,
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

  const reset = () => { setResult(null); setTime(''); setServiceId(''); setAddonIds([]); setStaffId(null); setDays(null); setTab('book'); };
  const activeCount = auth?.bookings.filter((b) => ACTIVE.includes(b.status)).length ?? 0;

  return (
    <main className="min-h-screen bg-[#f6f2ec] text-[#1f1b19]">
      <header className="page-header sticky top-0 z-30 border-b border-[#e5ded4] bg-[#faf7f2]/95 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-3">
          <Link href={`/@${slug}`} aria-label="回名片" className="shrink-0 rounded-full p-1.5 text-[#6b6156] hover:bg-[#efe8dd]">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
          </Link>
          {card.avatar_url ? <img src={card.avatar_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" /> : null}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{business.name}</p>
            <p className="text-[11px] text-[#8a7f72]">線上預約</p>
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
          <MyBookings auth={auth} loginNext={encodeURIComponent(`${here}?tab=my`)} onCancel={cancel} onBook={() => setTab('book')} reload={loadMine} />
        ) : result ? (
          <ResultView result={result} business={business} lineBound={auth?.lineBound ?? false} here={here} onMore={reset} onMine={() => { setResult(null); setTab('my'); }} onReported={loadMine} />
        ) : !business.open || !services.length ? (
          <p className="rounded-2xl bg-white p-8 text-center text-sm text-[#8a7f72]">目前還沒有開放可預約的時段,請稍後再來或直接聯絡。</p>
        ) : (
          <div className="space-y-5">
            {/* 1. 服務 */}
            <section>
              <StepTitle n={1} title="選擇服務" />
              <div className="space-y-2">
                {services.map((s) => {
                  const on = s.id === serviceId;
                  const prices = s.staff.map((x) => x.price);
                  const min = prices.length ? Math.min(...prices) : s.price;
                  const varies = new Set(prices).size > 1;
                  return (
                    <button key={s.id} type="button" onClick={() => { setServiceId(s.id); setAddonIds([]); setStaffId(null); setDays(null); resetSlot(); }} className={`flex w-full items-center gap-3 rounded-2xl border bg-white p-3 text-left transition ${on ? 'border-[#1f1b19] ring-2 ring-[#1f1b19]/10' : 'border-[#e5ded4]'}`}>
                      {s.image ? <img src={s.image} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" /> : null}
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">{s.name}</span>
                        <span className="mt-0.5 block text-xs text-[#8a7f72]">約 {s.duration_minutes} 分鐘 · {priceText(min, varies ? '起' : s.price_note)}{s.deposit ? ` · 訂金 ${money(s.deposit)}` : ''}</span>
                        {s.description ? <span className="mt-1 line-clamp-2 block text-xs leading-5 text-[#6b6156]">{s.description}</span> : null}
                        {s.steps.length > 1 ? <StepBar steps={s.steps} /> : null}
                      </span>
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${on ? 'border-[#1f1b19] bg-[#1f1b19] text-white' : 'border-[#d7c9bd]'}`}>{on ? '✓' : ''}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* 加購 */}
            {service && service.addons.length > 0 && (
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

            {/* 2. 人員 */}
            {service && pickStaff && (
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
            {service && staffChosen && (
              <section>
                <StepTitle n={pickStaff ? 3 : 2} title="選擇日期與時段" />
                {loadingSlots && !days ? <p className="py-6 text-center text-sm text-[#8a7f72]">讀取可預約時段…</p> : (
                  <SlotPicker days={days ?? []} date={date} time={time} onDate={(d) => { setDate(d); resetSlot(); }} onTime={(t) => { setTime(t); idemKey.current = ''; }} />
                )}
              </section>
            )}

            {/* 4. 聯絡資料與送出 */}
            {ready && service && quote && (
              <section>
                <StepTitle n={pickStaff ? 4 : 3} title="確認預約" />
                <div className="space-y-1 rounded-2xl bg-white p-4 text-sm text-[#6b6156]">
                  <p className="font-semibold text-[#1f1b19]">{service.name}{quote.addons.length ? ` + ${quote.addons.map((a) => a.name).join('、')}` : ''}</p>
                  <p>{formatDateLabel(date).md}(週{formatDateLabel(date).weekday}) {time} · 約 {quote.duration} 分鐘</p>
                  {pickStaff ? <p>人員:{staffParam ? serviceStaff.find((x) => x.id === staffParam)?.info?.name : '不指定(由店家安排)'}</p> : null}
                  <p>{priceText(quote.total, quote.varies ? '起(依人員)' : service.price_note)}</p>
                  {quote.deposit ? <p className="text-[#9a6412]">需付訂金 {money(quote.deposit)}(轉帳){business.approval_mode === 'manual' ? ',店家確認後再付' : ''},{quote.total ? `到店再付尾款 ${money(Math.max(0, quote.total - quote.deposit))}` : '其餘到店付'}</p> : null}
                  {business.address ? <p className="text-xs text-[#8a7f72]">地點:{business.address}</p> : null}
                </div>
                {auth && !auth.loggedIn ? (
                  <div className="mt-3 space-y-2 rounded-2xl bg-white p-4 text-center">
                    <p className="text-sm text-[#6b6156]">登入後送出預約,剛剛選的時段會保留</p>
                    <a href={`/auth/line/start?next=${loginNext}`} className="flex w-full items-center justify-center gap-2 rounded-full bg-[#06C755] py-3 text-sm font-semibold text-white">用 LINE 登入並繼續</a>
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
      {tab === 'book' && !result && ready && auth?.loggedIn ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#e5ded4] bg-[#faf7f2]/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur">
          <div className="mx-auto flex max-w-xl items-center gap-3">
            <p className="min-w-0 flex-1 truncate text-xs text-[#6b6156]">{service?.name} · {formatDateLabel(date).md} {time}</p>
            <button type="button" disabled={submitting} onClick={() => void submit()} className="shrink-0 rounded-full bg-[#1f1b19] px-6 py-3 text-sm font-semibold text-white disabled:opacity-50">{submitting ? '送出中…' : business.approval_mode === 'manual' ? '送出預約申請' : quote?.deposit ? '保留時段' : '確認預約'}</button>
          </div>
        </div>
      ) : null}
    </main>
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

function SlotPicker({ days, date, time, onDate, onTime }: { days: Day[]; date: string; time: string; onDate: (d: string) => void; onTime: (t: string) => void }) {
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
            <button key={d.date} type="button" disabled={none} onClick={() => onDate(d.date)} className={`flex w-14 shrink-0 flex-col items-center rounded-2xl border py-2 text-xs transition ${on ? 'border-[#1f1b19] bg-[#1f1b19] text-white' : none ? 'border-transparent bg-white/50 text-[#c4bab0]' : 'border-[#e5ded4] bg-white'}`}>
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

// 訂金轉帳資訊 + 回報末 5 碼
function DepositBox({ bookingId, version, amount, expiresAt, paymentInfo, reported, onDone }: { bookingId: string; version: number; amount: number; expiresAt: string | null; paymentInfo: string; reported?: string; onDone: () => void }) {
  const [last5, setLast5] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(reported ?? '');
  async function report() {
    if (!/^\d{5}$/.test(last5)) return void uiAlert('請填寫匯款帳號末 5 碼');
    setBusy(true);
    try {
      const res = await fetch(`/api/booking/my/${bookingId}/payment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expected_version: version, last5, amount }) });
      const data = await res.json().catch(() => null);
      if (!res.ok) return void uiAlert(data?.error?.message ?? '回報失敗');
      setDone(last5);
      uiToast('已通知店家核對');
      onDone();
    } finally { setBusy(false); }
  }
  return (
    <div className="space-y-2 rounded-xl bg-[#fff8ec] p-3 text-left text-xs leading-5 text-[#6b5520]">
      <p className="text-sm font-semibold text-[#9a6412]">訂金 {money(amount)}{expiresAt ? `,請在 ${formatDateTime(expiresAt)} 前完成` : ''}</p>
      {paymentInfo ? <p className="whitespace-pre-line rounded-lg bg-white/70 p-2 text-[#1f1b19]">{paymentInfo}</p> : <p>匯款帳號請向店家索取。</p>}
      {done ? <p className="text-[#2f6b3f]">✓ 已回報末 5 碼 {done},等待店家核對;核對後預約才成立。</p> : (
        <div className="flex gap-2">
          <input value={last5} onChange={(e) => setLast5(e.target.value.replace(/\D/g, '').slice(0, 5))} inputMode="numeric" placeholder="匯款帳號末 5 碼" aria-label="匯款帳號末 5 碼" className="min-w-0 flex-1 rounded-lg border border-[#e5d6b8] bg-white px-3 py-2 text-base text-[#1f1b19]" />
          <button type="button" disabled={busy} onClick={() => void report()} className="shrink-0 rounded-full bg-[#1f1b19] px-4 text-sm font-semibold text-white disabled:opacity-50">我已轉帳</button>
        </div>
      )}
      <p className="text-[11px] text-[#a08550]">逾時未完成,時段會自動釋放。</p>
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
      {pay ? <div className="mt-3"><DepositBox bookingId={result.booking_id} version={result.version} amount={result.deposit_amount} expiresAt={result.expires_at} paymentInfo={business.payment_info} onDone={onReported} /></div> : null}
      {result.next_action === 'wait_approval' && result.expires_at ? (
        <p className="mt-3 rounded-xl bg-[#faf7f2] p-3 text-xs leading-5 text-[#6b6156]">{business.name} 會在 {formatDateTime(result.expires_at)} 前確認,逾時未確認會自動取消。{result.deposit_amount ? `確認後會通知你轉帳訂金 ${money(result.deposit_amount)}。` : ''}</p>
      ) : null}
      {!lineBound ? (
        <a href={`/auth/line/start?mode=link&next=${encodeURIComponent(`${here}?tab=my`)}`} className="mt-4 flex w-full items-center justify-center rounded-full bg-[#06C755] py-3 text-sm font-semibold text-white">綁定 LINE 接收預約通知</a>
      ) : <p className="mt-4 text-xs text-[#2f6b3f]">確認、提醒會透過 LINE 通知你</p>}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={onMine} className="rounded-full border border-[#d7c9bd] py-2.5 text-sm">我的預約</button>
        <button type="button" onClick={onMore} className="rounded-full border border-[#d7c9bd] py-2.5 text-sm">再預約一筆</button>
      </div>
    </div>
  );
}

function MyBookings({ auth, loginNext, onCancel, onBook, reload }: { auth: { loggedIn: boolean; bookings: MyBooking[] } | null; loginNext: string; onCancel: (b: MyBooking) => void; onBook: () => void; reload: () => Promise<void> }) {
  // 頁面打開時的時間(判斷可否取消);只在第一次取得,避免每次重畫都變
  const [now] = useState(() => Date.now());
  const [moving, setMoving] = useState('');
  if (!auth) return <p className="py-10 text-center text-sm text-[#8a7f72]">讀取中…</p>;
  if (!auth.loggedIn) {
    return (
      <div className="space-y-2 rounded-2xl bg-white p-6 text-center">
        <p className="text-sm text-[#6b6156]">登入後查看你的預約</p>
        <a href={`/auth/line/start?next=${loginNext}`} className="block w-full rounded-full bg-[#06C755] py-3 text-sm font-semibold text-white">用 LINE 登入</a>
        <a href={`/card/login?next=${loginNext}`} className="block w-full rounded-full border border-[#d7c9bd] py-3 text-sm">其他方式登入</a>
      </div>
    );
  }
  if (!auth.bookings.length) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center">
        <p className="text-sm text-[#8a7f72]">還沒有預約紀錄</p>
        <button type="button" onClick={onBook} className="mt-3 rounded-full bg-[#1f1b19] px-6 py-2.5 text-sm font-semibold text-white">我要預約</button>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {auth.bookings.map((b) => {
        const active = ACTIVE.includes(b.status) && new Date(b.start_at).getTime() > now;
        const inWindow = b.status === 'pending' || new Date(b.start_at).getTime() - now >= b.business.cancel_hours * 3600000;
        const canMove = active && inWindow && b.reschedule_count < b.business.reschedule_limit;
        const needPay = b.status === 'pending' && b.approval_status !== 'pending' && ['awaiting', 'reported'].includes(b.payment_status);
        const total = b.total_price || b.service_snapshot.price;
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
            {needPay ? <div className="mt-3"><DepositBox bookingId={b.id} version={b.version} amount={b.deposit_amount - b.paid_amount} expiresAt={b.expires_at} paymentInfo={b.business.payment_info} reported={b.payment_status === 'reported' ? b.payment_report?.last5 ?? '已回報' : ''} onDone={() => void reload()} /></div> : null}
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
