'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { formatDateLabel, formatDateTime, formatRange, localParts, money, STATUS_COLOR, STATUS_LABEL, type BookingStatus } from '@/lib/booking/shared';

type Service = { id: string; name: string; description: string; duration_minutes: number; price: number; price_note: string; image: string };
type Business = { name: string; address: string; notice: string; approval_mode: 'auto' | 'manual'; cancel_hours: number; open: boolean };
type MyBooking = {
  id: string; booking_no: string; status: BookingStatus; start_at: string; end_at: string; expires_at: string | null; version: number;
  service_snapshot: { name: string; price: number; price_note?: string }; contact: { name?: string; phone?: string };
  business: { name: string; slug: string; cancel_hours: number };
};
type Result = { booking_no: string; status: BookingStatus; start_at: string; end_at: string; expires_at: string | null };

const DAYS = 14;
const priceText = (s: { price: number; price_note?: string }) => (s.price ? `${money(s.price)}${s.price_note ? ` ${s.price_note}` : ''}` : s.price_note || '現場報價');

// 名片線上預約:選服務 → 日期時段 → 登入 → 聯絡資料 → 送出;另有「我的預約」
export default function BookingClient({ slug, card, business, services }: { slug: string; card: { display_name: string; avatar_url: string }; business: Business; services: Service[] }) {
  const [tab, setTab] = useState<'book' | 'my'>('book');
  const [serviceId, setServiceId] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [days, setDays] = useState<{ date: string; slots: string[]; closed?: boolean }[] | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [auth, setAuth] = useState<{ loggedIn: boolean; lineBound: boolean; bookings: MyBooking[] } | null>(null);
  const [contact, setContact] = useState({ name: '', phone: '', note: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const idemKey = useRef('');
  const service = services.find((s) => s.id === serviceId) ?? null;
  const here = `/@${slug}/book`;

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

  // 從登入頁回來:網址帶回剛剛選的服務、日期、時段
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    Promise.resolve().then(() => {
      if (q.get('tab') === 'my') setTab('my');
      const s = q.get('s');
      if (s && services.some((x) => x.id === s)) { setServiceId(s); setDate(q.get('d') ?? ''); setTime(q.get('t') ?? ''); }
      void loadMine();
    });
  }, [services, loadMine]);

  // 選了服務 → 讀 14 天的可約時段
  useEffect(() => {
    if (!serviceId) return;
    let alive = true;
    Promise.resolve().then(async () => {
      setLoadingSlots(true);
      try {
        const today = localParts(new Date()).date;
        const res = await fetch(`/api/booking/${encodeURIComponent(slug)}/availability?service=${serviceId}&from=${today}&days=${DAYS}`, { cache: 'no-store' });
        const data = await res.json().catch(() => null);
        if (!alive) return;
        const list = (data?.days ?? []) as { date: string; slots: string[]; closed?: boolean }[];
        setDays(list);
        setDate((d) => (d && list.some((x) => x.date === d) ? d : list.find((x) => x.slots.length)?.date ?? list[0]?.date ?? ''));
      } finally {
        if (alive) setLoadingSlots(false);
      }
    });
    return () => { alive = false; };
  }, [serviceId, slug]);

  const slots = useMemo(() => days?.find((d) => d.date === date)?.slots ?? [], [days, date]);
  const ready = Boolean(service && date && time && slots.includes(time));
  const nextParams = `s=${serviceId}&d=${date}&t=${encodeURIComponent(time)}`;
  const loginNext = encodeURIComponent(`${here}?${nextParams}`);

  async function submit() {
    if (!service || !ready) return;
    setError('');
    if (!contact.name.trim()) return setError('請填寫預約人姓名');
    if (!/^[0-9+\-\s()]{8,20}$/.test(contact.phone.trim())) return setError('請填寫正確的聯絡電話');
    idemKey.current ||= crypto.randomUUID();
    setSubmitting(true);
    try {
      const [h, m] = time.split(':').map(Number);
      const startAt = new Date(`${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+08:00`).toISOString();
      const res = await fetch(`/api/booking/${encodeURIComponent(slug)}/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idemKey.current },
        body: JSON.stringify({ service_id: service.id, start_at: startAt, contact, channel: /Line\//.test(navigator.userAgent) ? 'line' : 'card' }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const code = data?.error?.code;
        setError(data?.error?.message ?? '預約失敗,請稍後再試');
        if (code === 'SLOT_UNAVAILABLE') {
          // 時段被搶走:重新讀時段,保留其他已填內容
          idemKey.current = '';
          setTime('');
          const today = localParts(new Date()).date;
          const r = await fetch(`/api/booking/${encodeURIComponent(slug)}/availability?service=${service.id}&from=${today}&days=${DAYS}`, { cache: 'no-store' });
          const d = await r.json().catch(() => null);
          setDays(d?.days ?? null);
        }
        if (code === 'AUTH_REQUIRED') setAuth((a) => (a ? { ...a, loggedIn: false } : a));
        return;
      }
      idemKey.current = '';
      setResult({ booking_no: data.booking_no, status: data.status, start_at: data.start_at, end_at: data.end_at, expires_at: data.expires_at });
      window.history.replaceState(null, '', here);
      void loadMine();
    } finally {
      setSubmitting(false);
    }
  }

  async function cancel(b: MyBooking) {
    if (!window.confirm(`確定取消 ${formatRange(b.start_at, b.end_at)} 的預約?`)) return;
    const res = await fetch(`/api/booking/my/${b.id}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expected_version: b.version }) });
    const data = await res.json().catch(() => null);
    if (!res.ok) window.alert(data?.error?.message ?? '取消失敗');
    void loadMine();
  }

  const reset = () => { setResult(null); setTime(''); setServiceId(''); setDays(null); setTab('book'); };

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
          {([['book', '我要預約'], ['my', `我的預約${auth?.bookings.filter((b) => ['pending', 'confirmed'].includes(b.status)).length ? `(${auth.bookings.filter((b) => ['pending', 'confirmed'].includes(b.status)).length})` : ''}`]] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => { setTab(k); setResult(null); }} className={`flex-1 rounded-full py-2 text-sm ${tab === k ? 'bg-[#1f1b19] font-semibold text-white' : 'text-[#6b6156]'}`}>{label}</button>
          ))}
        </div>
      </header>

      <div className="mx-auto max-w-xl px-4 pb-32 pt-4">
        {tab === 'my' ? (
          <MyBookings auth={auth} loginNext={encodeURIComponent(`${here}?tab=my`)} onCancel={cancel} onBook={() => setTab('book')} />
        ) : result ? (
          <ResultView result={result} business={business} lineBound={auth?.lineBound ?? false} here={here} onMore={reset} onMine={() => { setResult(null); setTab('my'); }} />
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
                  return (
                    <button key={s.id} type="button" onClick={() => { setServiceId(s.id); setTime(''); idemKey.current = ''; }} className={`flex w-full items-center gap-3 rounded-2xl border bg-white p-3 text-left transition ${on ? 'border-[#1f1b19] ring-2 ring-[#1f1b19]/10' : 'border-[#e5ded4]'}`}>
                      {s.image ? <img src={s.image} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" /> : null}
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">{s.name}</span>
                        <span className="mt-0.5 block text-xs text-[#8a7f72]">約 {s.duration_minutes} 分鐘 · {priceText(s)}</span>
                        {s.description ? <span className="mt-1 line-clamp-2 block text-xs leading-5 text-[#6b6156]">{s.description}</span> : null}
                      </span>
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${on ? 'border-[#1f1b19] bg-[#1f1b19] text-white' : 'border-[#d7c9bd]'}`}>{on ? '✓' : ''}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* 2. 日期時段 */}
            {service && (
              <section>
                <StepTitle n={2} title="選擇日期與時段" />
                {loadingSlots && !days ? <p className="py-6 text-center text-sm text-[#8a7f72]">讀取可預約時段…</p> : (
                  <>
                    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {(days ?? []).map((d) => {
                        const { md, weekday } = formatDateLabel(d.date);
                        const on = d.date === date;
                        const none = !d.slots.length;
                        return (
                          <button key={d.date} type="button" disabled={none} onClick={() => { setDate(d.date); setTime(''); idemKey.current = ''; }} className={`flex w-14 shrink-0 flex-col items-center rounded-2xl border py-2 text-xs transition ${on ? 'border-[#1f1b19] bg-[#1f1b19] text-white' : none ? 'border-transparent bg-white/50 text-[#c4bab0]' : 'border-[#e5ded4] bg-white'}`}>
                            <span>{d.date === localParts(new Date()).date ? '今天' : `週${weekday}`}</span>
                            <span className="mt-0.5 text-sm font-semibold">{md}</span>
                            <span className={`mt-0.5 text-[10px] ${on ? 'text-white/70' : 'text-[#a99e8f]'}`}>{none ? (d.closed ? '休息' : '額滿') : `${d.slots.length} 個`}</span>
                          </button>
                        );
                      })}
                    </div>
                    {slots.length ? (
                      <div className="mt-2 grid grid-cols-4 gap-2">
                        {slots.map((t) => (
                          <button key={t} type="button" onClick={() => { setTime(t); idemKey.current = ''; }} className={`rounded-xl border py-2.5 text-sm transition ${t === time ? 'border-[#1f1b19] bg-[#1f1b19] font-semibold text-white' : 'border-[#e5ded4] bg-white'}`}>{t}</button>
                        ))}
                      </div>
                    ) : <p className="mt-2 rounded-xl bg-white p-4 text-center text-sm text-[#8a7f72]">{days?.find((d) => d.date === date)?.closed ? '這天休息,請選其他日期' : days?.some((d) => d.slots.length) ? '這天已額滿,請選其他日期' : `近 ${DAYS} 天都已額滿`}</p>}
                  </>
                )}
              </section>
            )}

            {/* 3. 聯絡資料與送出 */}
            {ready && service && (
              <section>
                <StepTitle n={3} title="確認預約" />
                <div className="rounded-2xl bg-white p-4">
                  <p className="text-sm font-semibold">{service.name}</p>
                  <p className="mt-1 text-sm text-[#6b6156]">{formatDateLabel(date).md}(週{formatDateLabel(date).weekday}) {time} · 約 {service.duration_minutes} 分鐘</p>
                  <p className="mt-1 text-sm text-[#6b6156]">{priceText(service)}</p>
                  {business.address ? <p className="mt-1 text-xs text-[#8a7f72]">地點:{business.address}</p> : null}
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
                      {business.approval_mode === 'manual' ? '送出後由店家確認,確認後會通知你。' : '送出後立即成立。'}
                      {business.cancel_hours ? ` 服務前 ${business.cancel_hours} 小時內無法線上取消。` : ''}
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
            <button type="button" disabled={submitting} onClick={() => void submit()} className="shrink-0 rounded-full bg-[#1f1b19] px-6 py-3 text-sm font-semibold text-white disabled:opacity-50">{submitting ? '送出中…' : business.approval_mode === 'manual' ? '送出預約申請' : '確認預約'}</button>
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

function ResultView({ result, business, lineBound, here, onMore, onMine }: { result: Result; business: Business; lineBound: boolean; here: string; onMore: () => void; onMine: () => void }) {
  const pending = result.status === 'pending';
  return (
    <div className="rounded-2xl bg-white p-6 text-center">
      <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full text-2xl ${pending ? 'bg-[#fff3df] text-[#9a6412]' : 'bg-[#e7f3ea] text-[#2f6b3f]'}`}>{pending ? '⏳' : '✓'}</div>
      <p className="mt-3 text-lg font-semibold">{pending ? '已送出預約申請' : '預約成功'}</p>
      <p className="mt-1 text-sm text-[#6b6156]">{formatRange(result.start_at, result.end_at)}</p>
      <p className="mt-1 text-xs text-[#8a7f72]">預約編號 {result.booking_no}</p>
      {pending && result.expires_at ? <p className="mt-3 rounded-xl bg-[#faf7f2] p-3 text-xs leading-5 text-[#6b6156]">{business.name} 會在 {formatDateTime(result.expires_at)} 前確認,逾時未確認會自動取消。</p> : null}
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

function MyBookings({ auth, loginNext, onCancel, onBook }: { auth: { loggedIn: boolean; bookings: MyBooking[] } | null; loginNext: string; onCancel: (b: MyBooking) => void; onBook: () => void }) {
  // 頁面打開時的時間(判斷可否取消);只在第一次取得,避免每次重畫都變
  const [now] = useState(() => Date.now());
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
        const active = ['pending', 'confirmed'].includes(b.status) && new Date(b.start_at).getTime() > now;
        const canCancel = active && (b.status === 'pending' || new Date(b.start_at).getTime() - now >= b.business.cancel_hours * 3600000);
        return (
          <div key={b.id} className="rounded-2xl bg-white p-4">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{b.service_snapshot.name}</p>
                <p className="mt-0.5 text-sm text-[#6b6156]">{formatRange(b.start_at, b.end_at)}</p>
                <p className="mt-0.5 text-[11px] text-[#a99e8f]">{b.booking_no}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLOR[b.status]}`}>{STATUS_LABEL[b.status]}</span>
            </div>
            {active ? (
              canCancel
                ? <button type="button" onClick={() => onCancel(b)} className="mt-3 text-xs text-[#a03b3b] underline-offset-4 hover:underline">取消預約</button>
                : <p className="mt-3 text-[11px] text-[#8a7f72]">服務前 {b.business.cancel_hours} 小時內無法線上取消,如需異動請聯絡店家</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

