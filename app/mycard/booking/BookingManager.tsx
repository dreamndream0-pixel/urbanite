'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { uiAlert, uiConfirm } from '@/lib/ui-dialog';
import { uiToast } from '@/lib/ui-toast';
import {
  fromLocal, formatDateTime, formatRange, hhmmToMinutes, localParts, minutesToHHMM, money, STATUS_COLOR, STATUS_LABEL, WEEKDAYS,
  type BkBooking, type BkBusiness, type BkException, type BkHour, type BkService,
} from '@/lib/booking/shared';

type Data = {
  business: BkBusiness; services: BkService[]; hours: BkHour[]; exceptions: BkException[]; bookings: BkBooking[];
  card: { slug: string; display_name: string } | null; line_bound: boolean; today: string;
};
type Tab = 'bookings' | 'services' | 'hours' | 'settings';

const card = 'rounded-2xl border border-[#e5ded4] bg-white p-4 sm:p-5';
const input = 'w-full rounded-xl border border-[#e5ded4] bg-white px-3 py-2.5 text-base text-[#1f1b19] outline-none focus:border-[#1f1b19]/40';
const btn = 'rounded-full border border-[#d7c9bd] bg-white px-4 py-2 text-sm font-semibold whitespace-nowrap disabled:opacity-40';
const btnDark = 'rounded-full bg-[#1f1b19] px-4 py-2 text-sm font-semibold text-white whitespace-nowrap disabled:opacity-40';

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) }, cache: 'no-store' });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error?.message ?? '操作失敗,請稍後再試');
  return data as T;
}

// 名片主人:線上預約管理
export default function BookingManager() {
  const [data, setData] = useState<Data | null>(null);
  const [tab, setTab] = useState<Tab>('bookings');
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    try { setData(await api<Data>('/api/mycard/booking')); setLoadError(''); }
    catch (e) { setLoadError(e instanceof Error ? e.message : '讀取失敗'); }
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  if (!data) return <p className="py-16 text-center text-sm text-[#8a7f72]">{loadError || '讀取中…'}</p>;
  const pending = data.bookings.filter((b) => b.status === 'pending').length;
  const activeServices = data.services.filter((s) => s.active).length;
  const ready = activeServices > 0 && data.hours.length > 0;
  const publicUrl = data.card ? `${typeof window === 'undefined' ? '' : window.location.origin}/@${data.card.slug}/book` : '';

  async function toggleEnabled() {
    if (!data) return;
    if (!data.business.enabled && !ready) return void uiAlert('開放預約前,請先新增至少一項服務,並設定營業時段。');
    try {
      await api('/api/mycard/booking', { method: 'PUT', body: JSON.stringify({ business: { ...data.business, enabled: !data.business.enabled } }) });
      uiToast(data.business.enabled ? '已暫停線上預約' : '已開放線上預約');
      void load();
    } catch (e) { void uiAlert(e instanceof Error ? e.message : '儲存失敗'); }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 pb-24 pt-5 sm:px-6">
      {/* 狀態 */}
      <section className={card}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold tracking-[0.2em] text-[#a99e8f]">URBANLINKS × LINE</p>
            <h1 className="mt-0.5 text-xl font-bold">線上預約</h1>
            <p className="mt-1 text-xs leading-5 text-[#8a7f72]">顧客從你的名片按「線上預約」,選服務與時段送出;確認、提醒透過 LINE 通知。</p>
          </div>
          <button type="button" role="switch" aria-checked={data.business.enabled} onClick={() => void toggleEnabled()} className={`relative mt-1 inline-flex h-8 w-14 shrink-0 items-center rounded-full transition ${data.business.enabled ? 'bg-[#2f6b3f]' : 'bg-[#d8d0c8]'}`}>
            <span className={`inline-block h-6 w-6 rounded-full bg-white shadow transition ${data.business.enabled ? 'translate-x-7' : 'translate-x-1'}`} />
          </button>
        </div>
        <p className={`mt-3 text-sm font-semibold ${data.business.enabled ? 'text-[#2f6b3f]' : 'text-[#8a7f72]'}`}>{data.business.enabled ? '● 開放預約中' : '○ 尚未開放'}</p>
        {!ready ? (
          <ul className="mt-3 space-y-1 rounded-xl bg-[#faf7f2] p-3 text-xs text-[#6b6156]">
            <li>{activeServices ? '✓' : '1.'} 新增服務項目 {activeServices ? `(${activeServices} 項)` : ''}</li>
            <li>{data.hours.length ? '✓' : '2.'} 設定每週營業時段</li>
            <li>3. 開啟上方開關,名片就會出現「線上預約」按鈕</li>
          </ul>
        ) : null}
        {publicUrl ? (
          <div className="mt-3 flex min-w-0 items-center gap-2 rounded-xl bg-[#faf7f2] p-2 pl-3">
            <span className="min-w-0 flex-1 truncate text-xs text-[#6b6156]">{publicUrl}</span>
            <button type="button" onClick={() => { void navigator.clipboard?.writeText(publicUrl); uiToast('已複製預約連結'); }} className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-semibold">複製</button>
            <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-semibold">開啟</a>
          </div>
        ) : <p className="mt-3 text-xs text-[#a03b3b]">請先到「我的名片」建立名片,才有預約入口。</p>}
        <div className="mt-3 flex items-center gap-2 text-xs">
          {data.line_bound ? <span className="text-[#2f6b3f]">✓ 新預約會用 LINE 通知你</span> : (
            <>
              <span className="text-[#8a7f72]">綁定 LINE,才能收到新預約通知</span>
              <a href={`/auth/line/start?mode=link&next=${encodeURIComponent('/mycard/booking')}`} className="rounded-full bg-[#06C755] px-3 py-1.5 font-semibold text-white">綁定 LINE</a>
            </>
          )}
        </div>
      </section>

      <div className="flex gap-1 rounded-2xl border border-[#e5ded4] bg-white p-1">
        {([['bookings', `預約${pending ? `(${pending})` : ''}`], ['services', '服務'], ['hours', '營業時段'], ['settings', '設定']] as const).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`flex-1 rounded-xl px-2 py-2 text-sm ${tab === k ? 'bg-[#1f1b19] font-semibold text-white' : 'text-[#6b6156]'}`}>{label}</button>
        ))}
      </div>

      {tab === 'bookings' && <BookingsTab data={data} reload={load} />}
      {tab === 'services' && <ServicesTab services={data.services} reload={load} />}
      {tab === 'hours' && <HoursTab hours={data.hours} exceptions={data.exceptions} business={data.business} reload={load} />}
      {tab === 'settings' && <SettingsTab business={data.business} reload={load} />}
    </div>
  );
}

// ---------- 預約 ----------
function BookingsTab({ data, reload }: { data: Data; reload: () => Promise<void> }) {
  const [filter, setFilter] = useState<'pending' | 'upcoming' | 'past' | 'all'>(() => (data.bookings.some((b) => b.status === 'pending') ? 'pending' : 'upcoming'));
  const [busy, setBusy] = useState('');
  const [now] = useState(() => Date.now());
  const list = useMemo(() => data.bookings.filter((b) => {
    const future = new Date(b.end_at).getTime() >= now;
    if (filter === 'pending') return b.status === 'pending';
    if (filter === 'upcoming') return future && ['pending', 'confirmed'].includes(b.status);
    if (filter === 'past') return !future || !['pending', 'confirmed'].includes(b.status);
    return true;
  }).sort((a, b) => (filter === 'past' ? b.start_at.localeCompare(a.start_at) : a.start_at.localeCompare(b.start_at))), [data.bookings, filter, now]);

  async function run(b: BkBooking, command: string, label: string) {
    if (['reject', 'cancel', 'no_show'].includes(command) && !(await uiConfirm(`確定要「${label}」這筆預約?${command !== 'no_show' ? '\n顧客會收到 LINE 通知。' : ''}`, { danger: command !== 'no_show' }))) return;
    setBusy(b.id);
    try {
      await api(`/api/mycard/booking/bookings/${b.id}`, { method: 'POST', body: JSON.stringify({ command, expected_version: b.version }) });
      uiToast(`已${label}`);
    } catch (e) { void uiAlert(e instanceof Error ? e.message : '操作失敗'); }
    finally { setBusy(''); void reload(); }
  }

  let lastDate = '';
  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
        {([['pending', '待確認'], ['upcoming', '即將到來'], ['past', '已結束'], ['all', '全部']] as const).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setFilter(k)} className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm ${filter === k ? 'bg-[#1f1b19] text-white' : 'border border-[#e5ded4] bg-white text-[#6b6156]'}`}>{label}</button>
        ))}
      </div>
      {!list.length ? <p className="rounded-2xl bg-white p-8 text-center text-sm text-[#a99e8f]">沒有預約</p> : list.map((b) => {
        const d = localParts(b.start_at).date;
        const header = d !== lastDate ? (lastDate = d) : '';
        const started = new Date(b.start_at).getTime() <= now;
        return (
          <div key={b.id}>
            {header ? <p className="mb-1.5 mt-2 text-xs font-semibold text-[#8a7f72]">{formatDateTime(b.start_at).split(' ')[0]}</p> : null}
            <div className={card}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold">{formatRange(b.start_at, b.end_at).split(' ')[1]}</p>
                  <p className="truncate text-sm">{b.service_snapshot.name}{b.service_snapshot.price ? ` · ${money(b.service_snapshot.price)}` : ''}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLOR[b.status]}`}>{STATUS_LABEL[b.status]}</span>
              </div>
              <div className="mt-2 space-y-0.5 text-sm text-[#6b6156]">
                <p>{b.contact?.name || '—'}{b.contact?.phone ? <> · <a href={`tel:${b.contact.phone}`} className="text-[#1f6f8b] underline-offset-2 hover:underline">{b.contact.phone}</a></> : null}</p>
                {b.contact?.note ? <p className="whitespace-pre-line rounded-lg bg-[#faf7f2] px-2.5 py-1.5 text-xs">{b.contact.note}</p> : null}
                {b.status === 'pending' && b.expires_at ? <p className="text-xs text-[#9a6412]">請在 {formatDateTime(b.expires_at)} 前確認,逾時自動取消</p> : null}
                {b.cancel_reason && ['cancelled', 'expired'].includes(b.status) ? <p className="text-xs text-[#8a7f72]">原因:{b.cancel_reason}</p> : null}
                <p className="text-[11px] text-[#a99e8f]">{b.booking_no}</p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {b.status === 'pending' && <>
                  <button type="button" disabled={busy === b.id} onClick={() => void run(b, 'approve', '確認')} className={btnDark}>確認預約</button>
                  <button type="button" disabled={busy === b.id} onClick={() => void run(b, 'reject', '婉拒')} className={btn}>婉拒</button>
                </>}
                {b.status === 'confirmed' && !started && <button type="button" disabled={busy === b.id} onClick={() => void run(b, 'cancel', '取消')} className={`${btn} text-[#a03b3b]`}>取消預約</button>}
                {b.status === 'confirmed' && started && <>
                  <button type="button" disabled={busy === b.id} onClick={() => void run(b, 'complete', '完成')} className={btnDark}>完成服務</button>
                  <button type="button" disabled={busy === b.id} onClick={() => void run(b, 'no_show', '標記未到')} className={btn}>未到</button>
                </>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- 服務 ----------
const DURATIONS = [15, 30, 45, 60, 75, 90, 105, 120, 150, 180, 240, 300, 360, 480];
type ServiceDraft = { id?: string; name: string; description: string; duration_minutes: number; price: number; price_note: string; active: boolean };
const blankService: ServiceDraft = { name: '', description: '', duration_minutes: 60, price: 0, price_note: '', active: true };

function ServicesTab({ services, reload }: { services: BkService[]; reload: () => Promise<void> }) {
  const [editing, setEditing] = useState<ServiceDraft | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!editing) return;
    if (!editing.name.trim()) return void uiAlert('請填寫服務名稱');
    setSaving(true);
    try {
      await api('/api/mycard/booking/services', { method: editing.id ? 'PATCH' : 'POST', body: JSON.stringify(editing) });
      uiToast('已儲存服務');
      setEditing(null);
      void reload();
    } catch (e) { void uiAlert(e instanceof Error ? e.message : '儲存失敗'); }
    finally { setSaving(false); }
  }
  async function remove(s: BkService) {
    if (!(await uiConfirm(`刪除「${s.name}」?已成立的預約不受影響。`, { danger: true }))) return;
    try { await api(`/api/mycard/booking/services?id=${s.id}`, { method: 'DELETE' }); void reload(); }
    catch (e) { void uiAlert(e instanceof Error ? e.message : '刪除失敗'); }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[#8a7f72]">顧客預約時看到的服務項目。修改後只影響之後的新預約。</p>
        <button type="button" onClick={() => setEditing({ ...blankService })} className={btnDark}>+ 新增服務</button>
      </div>
      {editing && (
        <div className={`${card} space-y-3`}>
          <p className="font-semibold">{editing.id ? '編輯服務' : '新增服務'}</p>
          <label className="block text-xs text-[#8a7f72]">服務名稱
            <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} maxLength={60} placeholder="例:單色凝膠美甲" className={`${input} mt-1`} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs text-[#8a7f72]">服務時間
              <select value={editing.duration_minutes} onChange={(e) => setEditing({ ...editing, duration_minutes: Number(e.target.value) })} className={`${input} mt-1`}>
                {DURATIONS.map((m) => <option key={m} value={m}>{m >= 60 ? `${Math.floor(m / 60)} 小時${m % 60 ? ` ${m % 60} 分` : ''}` : `${m} 分鐘`}</option>)}
              </select>
            </label>
            <label className="block text-xs text-[#8a7f72]">價格(元)
              <input inputMode="numeric" value={editing.price || ''} onChange={(e) => setEditing({ ...editing, price: Number(e.target.value.replace(/\D/g, '')) || 0 })} placeholder="0 = 現場報價" className={`${input} mt-1`} />
            </label>
          </div>
          <label className="block text-xs text-[#8a7f72]">價格補充(選填)
            <input value={editing.price_note} onChange={(e) => setEditing({ ...editing, price_note: e.target.value })} maxLength={20} placeholder="例:起、依現場報價" className={`${input} mt-1`} />
          </label>
          <label className="block text-xs text-[#8a7f72]">說明(選填)
            <textarea value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} rows={3} maxLength={500} className={`${input} mt-1 resize-none`} />
          </label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />開放預約</label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(null)} className={btn}>取消</button>
            <button type="button" disabled={saving} onClick={() => void save()} className={btnDark}>{saving ? '儲存中…' : '儲存'}</button>
          </div>
        </div>
      )}
      {!services.length && !editing ? <p className="rounded-2xl bg-white p-8 text-center text-sm text-[#a99e8f]">還沒有服務,按「新增服務」開始</p> : services.map((s) => (
        <div key={s.id} className={`${card} flex items-center gap-3 ${s.active ? '' : 'opacity-60'}`}>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{s.name}{s.active ? '' : '(未開放)'}</p>
            <p className="text-xs text-[#8a7f72]">{s.duration_minutes} 分鐘 · {s.price ? money(s.price) : '現場報價'}{s.price_note ? ` ${s.price_note}` : ''}</p>
          </div>
          <button type="button" onClick={() => setEditing({ id: s.id, name: s.name, description: s.description, duration_minutes: s.duration_minutes, price: s.price, price_note: s.price_note, active: s.active })} className={btn}>編輯</button>
          <button type="button" onClick={() => void remove(s)} className="shrink-0 px-1 text-sm text-[#a03b3b]">刪除</button>
        </div>
      ))}
    </div>
  );
}

// ---------- 營業時段與休假 ----------
type DayRange = { start: string; end: string };

function HoursTab({ hours, exceptions, business, reload }: { hours: BkHour[]; exceptions: BkException[]; business: BkBusiness; reload: () => Promise<void> }) {
  const [week, setWeek] = useState<DayRange[][]>(() => WEEKDAYS.map((_, d) => hours.filter((h) => h.weekday === d).map((h) => ({ start: minutesToHHMM(h.start_min), end: h.end_min === 1440 ? '24:00' : minutesToHHMM(h.end_min) }))));
  const [saving, setSaving] = useState(false);
  const [off, setOff] = useState({ date: '', allDay: true, start: '10:00', end: '18:00', reason: '' });

  const setDay = (d: number, ranges: DayRange[]) => setWeek(week.map((r, i) => (i === d ? ranges : r)));
  async function save() {
    const rows: { weekday: number; start_min: number; end_min: number }[] = [];
    for (let d = 0; d < 7; d++) {
      for (const r of week[d]) {
        const s = hhmmToMinutes(r.start);
        const e = hhmmToMinutes(r.end);
        if (!(e > s)) return void uiAlert(`週${WEEKDAYS[d]}的時段結束時間要晚於開始時間`);
        rows.push({ weekday: d, start_min: s, end_min: e });
      }
    }
    setSaving(true);
    try { await api('/api/mycard/booking', { method: 'PUT', body: JSON.stringify({ hours: rows }) }); uiToast('已儲存營業時段'); void reload(); }
    catch (e) { void uiAlert(e instanceof Error ? e.message : '儲存失敗'); }
    finally { setSaving(false); }
  }
  async function addOff() {
    if (!off.date) return void uiAlert('請選擇日期');
    const start = off.allDay ? fromLocal(off.date, 0) : fromLocal(off.date, hhmmToMinutes(off.start));
    const end = off.allDay ? fromLocal(off.date, 1440) : fromLocal(off.date, hhmmToMinutes(off.end));
    try {
      const res = await api<{ affected: BkBooking[] }>('/api/mycard/booking/exceptions', { method: 'POST', body: JSON.stringify({ start_at: start.toISOString(), end_at: end.toISOString(), reason: off.reason }) });
      if (res.affected.length) void uiAlert(`已設定休假。\n這段時間已有 ${res.affected.length} 筆預約,系統不會自動取消,請到「預約」分頁處理:\n${res.affected.map((b) => `${formatRange(b.start_at, b.end_at)} ${b.contact?.name ?? ''}`).join('\n')}`);
      else uiToast('已設定休假');
      setOff({ ...off, date: '', reason: '' });
      void reload();
    } catch (e) { void uiAlert(e instanceof Error ? e.message : '設定失敗'); }
  }
  async function removeOff(x: BkException) {
    try { await api(`/api/mycard/booking/exceptions?id=${x.id}`, { method: 'DELETE' }); void reload(); }
    catch (e) { void uiAlert(e instanceof Error ? e.message : '刪除失敗'); }
  }

  return (
    <div className="space-y-4">
      <section className={card}>
        <p className="font-semibold">每週營業時段</p>
        <p className="mt-1 text-xs text-[#8a7f72]">顧客只能預約這些時段;同一天可以分成多段(例如中午休息)。</p>
        <div className="mt-3 divide-y divide-[#f0ebe2]">
          {WEEKDAYS.map((label, d) => (
            <div key={d} className="flex flex-col gap-1.5 py-2.5 sm:flex-row sm:items-start sm:gap-3">
              <label className="flex shrink-0 items-center gap-2 text-sm font-semibold sm:w-16 sm:pt-2">
                <input type="checkbox" checked={week[d].length > 0} onChange={(e) => setDay(d, e.target.checked ? [{ start: '10:00', end: '19:00' }] : [])} />週{label}
              </label>
              <div className="min-w-0 flex-1 space-y-2">
                {!week[d].length ? <p className="pl-6 text-sm text-[#a99e8f] sm:pl-0 sm:pt-2">休息</p> : week[d].map((r, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <input type="time" step={900} value={r.start} onChange={(e) => setDay(d, week[d].map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} className="min-w-0 flex-1 rounded-lg border border-[#e5ded4] px-1.5 py-1.5 text-[13px]" />
                    <span className="text-[#a99e8f]">–</span>
                    <input type="time" step={900} value={r.end === '24:00' ? '23:59' : r.end} onChange={(e) => setDay(d, week[d].map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} className="min-w-0 flex-1 rounded-lg border border-[#e5ded4] px-1.5 py-1.5 text-[13px]" />
                    <button type="button" onClick={() => setDay(d, week[d].filter((_, j) => j !== i))} aria-label="移除時段" className="shrink-0 px-1.5 text-lg leading-none text-[#a03b3b]">×</button>
                  </div>
                ))}
                {week[d].length > 0 && week[d].length < 4 ? <button type="button" onClick={() => setDay(d, [...week[d], { start: '19:00', end: '21:00' }])} className="text-xs text-[#1f6f8b]">+ 加一段</button> : null}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={() => setWeek(week.map((r, d) => (d === 0 ? r : week[1].map((x) => ({ ...x })))))} className="text-xs text-[#8a7f72] underline-offset-4 hover:underline">把週一的時段套用到週一~週六</button>
          <button type="button" disabled={saving} onClick={() => void save()} className={btnDark}>{saving ? '儲存中…' : '儲存營業時段'}</button>
        </div>
        <p className="mt-2 text-[11px] text-[#a99e8f]">每 {business.slot_interval} 分鐘一個可選開始時間,可在「設定」調整。</p>
      </section>

      <section className={card}>
        <p className="font-semibold">休假 / 不開放時段</p>
        <p className="mt-1 text-xs text-[#8a7f72]">設定後這段時間不能預約;已成立的預約不會被自動取消。</p>
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input type="date" value={off.date} min={localParts(new Date()).date} onChange={(e) => setOff({ ...off, date: e.target.value })} className={input} aria-label="日期" />
            <input value={off.reason} onChange={(e) => setOff({ ...off, reason: e.target.value })} maxLength={60} placeholder="原因(選填,顧客看不到)" className={input} />
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={off.allDay} onChange={(e) => setOff({ ...off, allDay: e.target.checked })} />整天</label>
            {!off.allDay && <>
              <input type="time" step={900} value={off.start} onChange={(e) => setOff({ ...off, start: e.target.value })} className="w-[104px] rounded-lg border border-[#e5ded4] px-2 py-1.5" />
              <span className="text-[#a99e8f]">–</span>
              <input type="time" step={900} value={off.end} onChange={(e) => setOff({ ...off, end: e.target.value })} className="w-[104px] rounded-lg border border-[#e5ded4] px-2 py-1.5" />
            </>}
            <button type="button" onClick={() => void addOff()} className={`${btnDark} ml-auto`}>新增休假</button>
          </div>
        </div>
        {exceptions.length ? (
          <div className="mt-3 divide-y divide-[#f0ebe2]">
            {exceptions.map((x) => (
              <div key={x.id} className="flex items-center gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{formatRange(x.start_at, x.end_at)}{x.reason ? ` · ${x.reason}` : ''}</span>
                <button type="button" onClick={() => void removeOff(x)} className="shrink-0 text-xs text-[#a03b3b]">移除</button>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}

// ---------- 設定 ----------
function SettingsTab({ business, reload }: { business: BkBusiness; reload: () => Promise<void> }) {
  const [b, setB] = useState(business);
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try { await api('/api/mycard/booking', { method: 'PUT', body: JSON.stringify({ business: b }) }); uiToast('已儲存設定'); void reload(); }
    catch (e) { void uiAlert(e instanceof Error ? e.message : '儲存失敗'); }
    finally { setSaving(false); }
  }
  const num = (k: keyof BkBusiness, label: string, unit: string, opts: number[]) => (
    <label className="block text-xs text-[#8a7f72]">{label}
      <select value={Number(b[k])} onChange={(e) => setB({ ...b, [k]: Number(e.target.value) })} className={`${input} mt-1`}>
        {opts.map((n) => <option key={n} value={n}>{n}{unit}</option>)}
      </select>
    </label>
  );
  return (
    <div className="space-y-4">
      <section className={`${card} space-y-3`}>
        <p className="font-semibold">基本資料</p>
        <label className="block text-xs text-[#8a7f72]">店名 / 工作室名稱
          <input value={b.name} onChange={(e) => setB({ ...b, name: e.target.value })} maxLength={60} className={`${input} mt-1`} />
        </label>
        <label className="block text-xs text-[#8a7f72]">服務地點(確認與提醒時告訴顧客)
          <input value={b.address} onChange={(e) => setB({ ...b, address: e.target.value })} maxLength={120} placeholder="例:台北市大安區…(可只寫捷運站)" className={`${input} mt-1`} />
        </label>
        <label className="block text-xs text-[#8a7f72]">預約須知(顯示在送出前)
          <textarea value={b.notice} onChange={(e) => setB({ ...b, notice: e.target.value })} rows={4} maxLength={1000} placeholder="例:請準時到場,遲到 15 分鐘以上需改期…" className={`${input} mt-1 resize-none`} />
        </label>
      </section>
      <section className={`${card} space-y-3`}>
        <p className="font-semibold">接單規則</p>
        <div className="grid grid-cols-2 gap-2">
          {(['manual', 'auto'] as const).map((m) => (
            <button key={m} type="button" onClick={() => setB({ ...b, approval_mode: m })} className={`rounded-xl border p-3 text-left ${b.approval_mode === m ? 'border-[#1f1b19] ring-2 ring-[#1f1b19]/10' : 'border-[#e5ded4]'}`}>
              <span className="block text-sm font-semibold">{m === 'manual' ? '我確認後才成立' : '自動成立'}</span>
              <span className="mt-0.5 block text-[11px] text-[#8a7f72]">{m === 'manual' ? '收到申請後由你確認' : '顧客送出即成立'}</span>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {b.approval_mode === 'manual' ? num('approve_hours', '確認期限', ' 小時內', [1, 2, 4, 6, 12, 24, 48]) : null}
          {num('slot_interval', '開始時間間隔', ' 分鐘', [15, 30, 60])}
          <label className="block text-xs text-[#8a7f72]">最短提前預約
            <select value={b.lead_minutes} onChange={(e) => setB({ ...b, lead_minutes: Number(e.target.value) })} className={`${input} mt-1`}>
              {[0, 60, 120, 180, 360, 720, 1440, 2880].map((n) => <option key={n} value={n}>{n === 0 ? '不限制' : n < 1440 ? `${n / 60} 小時前` : `${n / 1440} 天前`}</option>)}
            </select>
          </label>
          {num('advance_days', '最多可約幾天內', ' 天', [7, 14, 30, 60, 90])}
          {num('buffer_minutes', '服務後整理時間', ' 分鐘', [0, 5, 10, 15, 20, 30, 45, 60])}
          {num('cancel_hours', '顧客可自行取消到服務前', ' 小時', [0, 2, 6, 12, 24, 48, 72])}
        </div>
      </section>
      <section className={`${card} space-y-2`}>
        <p className="font-semibold">LINE 提醒顧客</p>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={b.reminder_24h} onChange={(e) => setB({ ...b, reminder_24h: e.target.checked })} />服務前 24 小時</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={b.reminder_2h} onChange={(e) => setB({ ...b, reminder_2h: e.target.checked })} />服務前 2 小時</label>
        <p className="text-[11px] leading-5 text-[#a99e8f]">顧客需用 LINE 登入或綁定 LINE 才會收到;預約改期或取消後不會再發舊的提醒。</p>
      </section>
      <div className="sticky bottom-0 z-10 flex items-center justify-end gap-3 rounded-2xl border border-[#e5ded4] bg-white/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur">
        <button type="button" disabled={saving} onClick={() => void save()} className={`${btnDark} px-6 py-2.5`}>{saving ? '儲存中…' : '儲存設定'}</button>
      </div>
    </div>
  );
}
