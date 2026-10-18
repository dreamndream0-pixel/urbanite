'use client';

import { useState } from 'react';
import { DateField } from '@/app/components/BookingDatePicker';
import { uiAlert, uiConfirm } from '@/lib/ui-dialog';
import { uiToast } from '@/lib/ui-toast';
import { formatDateTime, formatRange, money, QUOTE_STATUS_LABEL, type BkQuote, type BkQuoteVersion } from '@/lib/booking/shared';
import { api, btn, btnDark, btnSm, btnSmDark, card, errMsg, input, stylists, type Data } from './ui';

const STATUS_TONE: Record<BkQuote['status'], string> = {
  requested: 'bg-[#fff3df] text-[#9a6412]', sent: 'bg-[#e3eef6] text-[#1f5f7f]', accepted: 'bg-[#e7f3ea] text-[#2f6b3f]',
  declined: 'bg-[#f3ece9] text-[#8a5a50]', cancelled: 'bg-[#f1efec] text-[#8a7f72]',
};
const MINUTES = [60, 90, 120, 150, 180, 240, 300, 360, 480, 600, 720];
const minutesLabel = (m: number) => (m % 60 ? `${Math.floor(m / 60)} 小時 ${m % 60} 分` : `${m / 60} 小時`);

// ---------- 詢價(新秘、外出、客製服務) ----------
export default function QuotesTab({ data, reload }: { data: Data; reload: () => Promise<void> }) {
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const list = data.quotes.filter((q) => filter === 'all' || ['requested', 'sent'].includes(q.status));
  const quoteServices = data.services.filter((s) => s.price_mode === 'quote');
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        {([['open', '處理中'], ['all', '全部']] as const).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setFilter(k)} className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm ${filter === k ? 'bg-[#1f1b19] text-white' : 'border border-[#e5ded4] bg-white text-[#6b6156]'}`}>{label}</button>
        ))}
      </div>
      {!quoteServices.length ? (
        <p className="rounded-2xl bg-white p-4 text-xs leading-5 text-[#8a7f72]">到「服務」把新秘、外出造型等服務的價格方式設為「需報價」,顧客就會改成先填活動資訊詢價,不直接選時段。</p>
      ) : null}
      {!list.length ? <p className="rounded-2xl bg-white p-8 text-center text-sm text-[#a99e8f]">沒有詢價</p> : list.map((q) => (
        <QuoteCard key={`${q.id}-${q.version}`} quote={q} versions={data.quoteVersions.filter((v) => v.quote_id === q.id)} data={data} reload={reload} />
      ))}
    </div>
  );
}

function QuoteCard({ quote: q, versions, data, reload }: { quote: BkQuote; versions: BkQuoteVersion[]; data: Data; reload: () => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const current = versions.find((v) => v.version === q.current_version);
  const service = data.services.find((s) => s.id === q.service_id);
  const r = q.request;
  const open = ['requested', 'sent'].includes(q.status);
  const hold = q.booking_id ? data.bookings.find((b) => b.id === q.booking_id) : undefined;

  async function cancel() {
    if (!(await uiConfirm('取消這筆詢價?暫保留的檔期會一起釋放,顧客會收到通知。', { danger: true }))) return;
    setBusy(true);
    try { await api(`/api/mycard/booking/quotes/${q.id}`, { method: 'POST', body: JSON.stringify({ action: 'cancel' }) }); uiToast('已取消詢價'); }
    catch (e) { void uiAlert(errMsg(e)); }
    finally { setBusy(false); void reload(); }
  }

  return (
    <div className={card}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold">{q.service_name}{service?.service_mode === 'outcall' ? <span className="ml-1.5 text-xs font-normal text-[#8a7f72]">外出</span> : null}</p>
          <p className="text-sm text-[#3d3631]">活動日 {r.event_date}{r.time ? ` ${r.time}` : ''}{r.event_type ? ` · ${r.event_type}` : ''}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_TONE[q.status]}`}>{QUOTE_STATUS_LABEL[q.status]}</span>
      </div>
      <div className="mt-2 space-y-0.5 text-sm text-[#6b6156]">
        <p>{q.contact?.name || '—'}{q.contact?.phone ? <> · <a href={`tel:${q.contact.phone}`} className="text-[#1f6f8b] underline-offset-2 hover:underline">{q.contact.phone}</a></> : null}</p>
        {r.address ? <p className="text-xs">地點:{r.address}</p> : null}
        {r.people ? <p className="text-xs">人數 / 造型:{r.people}</p> : null}
        {q.staff_id ? <p className="text-xs">希望人員:{data.staff.find((s) => s.id === q.staff_id)?.name ?? '—'}</p> : null}
        {r.note ? <p className="whitespace-pre-line rounded-lg bg-[#faf7f2] px-2.5 py-1.5 text-xs">{r.note}</p> : null}
        {r.images?.length ? (
          <div className="flex gap-1.5 pt-1">
            {r.images.map((_, i) => (
              <a key={i} href={`/api/booking/quote-image?q=${q.id}&i=${i}`} target="_blank" rel="noopener noreferrer" className="block h-16 w-16 overflow-hidden rounded-lg bg-[#efe8dd]">
                <img src={`/api/booking/quote-image?q=${q.id}&i=${i}`} alt={`參考圖 ${i + 1}`} width={64} height={64} loading="lazy" className="h-full w-full object-cover" />
              </a>
            ))}
          </div>
        ) : null}
        <p className="text-[11px] text-[#a99e8f]">{q.quote_no} · {formatDateTime(q.created_at)} 送出</p>
      </div>

      {current ? (
        <div className="mt-3 space-y-1 rounded-xl bg-[#faf7f2] p-3 text-xs text-[#3d3631]">
          <p className="text-sm font-semibold text-[#1f1b19]">報價第 {current.version} 版 · {money(current.total)}{current.deposit ? ` · 訂金 ${money(current.deposit)}` : ''}</p>
          {current.items.map((it, i) => <p key={i} className="flex justify-between gap-2"><span className="min-w-0 truncate">{it.name}</span><span className="shrink-0 tabular-nums">{money(it.amount)}</span></p>)}
          <p>{formatRange(current.start_at, new Date(new Date(current.start_at).getTime() + current.minutes * 60000).toISOString())}{current.travel_minutes ? `(前後交通各 ${current.travel_minutes} 分)` : ''} · {data.staff.find((s) => s.id === current.staff_id)?.name ?? ''}</p>
          <p className="text-[#8a7f72]">有效至 {formatDateTime(current.valid_until)}{current.hold_until ? ` · 檔期保留到 ${formatDateTime(current.hold_until)}${hold && hold.status !== 'pending' ? '(已釋放)' : ''}` : ' · 未保留檔期'}</p>
          {current.note ? <p className="whitespace-pre-line text-[#6b6156]">{current.note}</p> : null}
        </div>
      ) : null}
      {q.status === 'accepted' && q.booking_id ? <p className="mt-2 text-xs text-[#2f6b3f]">顧客已接受,預約已建立(到「預約」查看訂金與收款)。</p> : null}

      {open ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => setEditing(!editing)} className={btnDark}>{current ? '修改報價' : '回覆報價'}</button>
          <button type="button" disabled={busy} onClick={() => void cancel()} className={`${btn} text-[#a03b3b]`}>取消詢價</button>
        </div>
      ) : null}
      {editing ? <QuoteForm quote={q} current={current} data={data} onDone={() => { setEditing(false); void reload(); }} onCancel={() => setEditing(false)} /> : null}
    </div>
  );
}

function QuoteForm({ quote: q, current, data, onDone, onCancel }: { quote: BkQuote; current?: BkQuoteVersion; data: Data; onDone: () => void; onCancel: () => void }) {
  const service = data.services.find((s) => s.id === q.service_id);
  const outcall = service?.service_mode === 'outcall';
  const staffList = stylists(data);
  const [items, setItems] = useState(() => current?.items.map((it) => ({ name: it.name, amount: String(it.amount) })) ?? [{ name: q.service_name, amount: service?.price ? String(service.price) : '' }]);
  const [deposit, setDeposit] = useState(String(current?.deposit ?? service?.deposit ?? ''));
  const [staffId, setStaffId] = useState(current?.staff_id ?? q.staff_id ?? staffList[0]?.id ?? '');
  const [date, setDate] = useState(current ? new Date(new Date(current.start_at).getTime() + 8 * 3600000).toISOString().slice(0, 10) : q.request.event_date);
  const [time, setTime] = useState(current ? new Date(new Date(current.start_at).getTime() + 8 * 3600000).toISOString().slice(11, 16) : q.request.time || '08:00');
  const [minutes, setMinutes] = useState(current?.minutes ?? service?.duration_minutes ?? 180);
  const [travel, setTravel] = useState(current?.travel_minutes ?? (outcall ? data.business.travel_minutes : 0));
  const [validDays, setValidDays] = useState(7);
  const [holdHours, setHoldHours] = useState(48);
  const [note, setNote] = useState(current?.note ?? '');
  const [busy, setBusy] = useState(false);
  const total = items.reduce((n, it) => n + (Number(it.amount) || 0), 0);

  async function send() {
    if (!items.some((it) => it.name.trim())) return void uiAlert('請至少填一個報價項目');
    if (!staffId) return void uiAlert('請選擇負責人員');
    if (!date || !time) return void uiAlert('請選擇服務日期與開始時間');
    setBusy(true);
    try {
      await api(`/api/mycard/booking/quotes/${q.id}`, {
        method: 'POST',
        body: JSON.stringify({
          action: 'send', expected_version: q.version, items: items.map((it) => ({ name: it.name, amount: Number(it.amount) || 0 })),
          deposit: Number(deposit) || 0, staff_id: staffId, start_at: new Date(`${date}T${time}:00+08:00`).toISOString(),
          minutes, travel_minutes: travel, valid_days: validDays, hold_hours: holdHours, note,
        }),
      });
      uiToast('已送出報價,顧客會收到 LINE 通知');
      onDone();
    } catch (e) { void uiAlert(errMsg(e)); }
    finally { setBusy(false); }
  }

  return (
    <div className="mt-3 space-y-3 rounded-xl bg-[#faf7f2] p-3">
      <p className="text-sm font-semibold">{current ? `修改報價(會成為第 ${current.version + 1} 版)` : '回覆報價'}</p>
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-2">
            <input value={it.name} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} maxLength={40} placeholder="項目,例:新娘全日 3 造型" aria-label="報價項目" className="min-w-0 flex-1 rounded-lg border border-[#e5ded4] bg-white px-2 py-1.5 text-base" />
            <input inputMode="numeric" value={it.amount} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, amount: e.target.value.replace(/\D/g, '') } : x)))} placeholder="金額" aria-label="金額" className="w-24 rounded-lg border border-[#e5ded4] bg-white px-2 py-1.5 text-base" />
            <button type="button" onClick={() => setItems(items.filter((_, j) => j !== i))} disabled={items.length === 1} aria-label="移除項目" className="shrink-0 px-1 text-lg leading-none text-[#a03b3b] disabled:opacity-30">×</button>
          </div>
        ))}
        <div className="flex items-center justify-between">
          {items.length < 12 ? <button type="button" onClick={() => setItems([...items, { name: '', amount: '' }])} className="text-xs text-[#1f6f8b]">+ 新增項目(車馬費、伴娘、跟妝…)</button> : <span />}
          <span className="text-sm font-semibold tabular-nums">合計 {money(total)}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs text-[#8a7f72]">訂金(元)
          <input inputMode="numeric" value={deposit} onChange={(e) => setDeposit(e.target.value.replace(/\D/g, ''))} placeholder="0 = 不收" className={`${input} mt-1`} />
        </label>
        <label className="block text-xs text-[#8a7f72]">負責人員
          <select value={staffId} onChange={(e) => setStaffId(e.target.value)} className={`${input} mt-1`}>
            {staffList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <div className="col-span-2 block text-xs text-[#8a7f72]">服務日期
          <DateField value={date} onChange={(d) => setDate(d)} className="mt-1" />
        </div>
        <label className="block text-xs text-[#8a7f72]">開始時間
          <input type="time" step={900} value={time} onChange={(e) => setTime(e.target.value)} className={`${input} mt-1`} />
        </label>
        <label className="block text-xs text-[#8a7f72]">服務時間
          <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className={`${input} mt-1`}>
            {(MINUTES.includes(minutes) ? MINUTES : [...MINUTES, minutes].sort((a, b) => a - b)).map((m) => <option key={m} value={m}>{minutesLabel(m)}{m >= 480 ? '(整天)' : m >= 240 ? '(半天)' : ''}</option>)}
          </select>
        </label>
        <label className="block text-xs text-[#8a7f72]">前後交通時間
          <select value={travel} onChange={(e) => setTravel(Number(e.target.value))} className={`${input} mt-1`}>
            {[0, 15, 30, 45, 60, 90, 120, 180, 240].map((m) => <option key={m} value={m}>{m ? `各 ${m} 分鐘` : '不需要'}</option>)}
          </select>
        </label>
        <label className="block text-xs text-[#8a7f72]">報價有效
          <select value={validDays} onChange={(e) => setValidDays(Number(e.target.value))} className={`${input} mt-1`}>
            {[1, 3, 7, 14, 30].map((d) => <option key={d} value={d}>{d} 天</option>)}
          </select>
        </label>
        <label className="block text-xs text-[#8a7f72]">暫保留檔期
          <select value={holdHours} onChange={(e) => setHoldHours(Number(e.target.value))} className={`${input} mt-1`}>
            {[0, 24, 48, 72, 168].map((h) => <option key={h} value={h}>{h ? `${h >= 168 ? '7 天' : `${h} 小時`}` : '不保留'}</option>)}
          </select>
        </label>
      </div>
      <label className="block text-xs text-[#8a7f72]">給顧客的說明(選填)
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500} placeholder="例:含試妝一次;超過 22:00 另計加班費…" className={`${input} mt-1 resize-none`} />
      </label>
      <p className="text-[11px] leading-5 text-[#8a7f72]">暫保留期間這段時間(含交通)不會被別人約走;到期未接受就釋放。顧客接受後{Number(deposit) ? '要在期限內轉帳訂金,你核對後成立' : '直接成立'}。</p>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={btnSm}>取消</button>
        <button type="button" disabled={busy} onClick={() => void send()} className={btnSmDark}>{busy ? '送出中…' : '送出報價'}</button>
      </div>
    </div>
  );
}
