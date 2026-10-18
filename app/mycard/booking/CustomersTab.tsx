'use client';

import { useCallback, useEffect, useState } from 'react';
import { DateField } from '@/app/components/BookingDatePicker';
import { uiAlert, uiConfirm } from '@/lib/ui-dialog';
import { uiToast } from '@/lib/ui-toast';
import { shrinkImage } from '@/lib/booking/shrink-image';
import {
  CONSENT_LABEL, formatDateTime, localParts, money, PHOTO_KIND_LABEL, STATUS_LABEL,
  type BkAttachment, type BkCustomer, type BkServiceRecord, type BookingStatus,
} from '@/lib/booking/shared';
import { api, btnDark, btnSm, card, errMsg, input, type Data } from './ui';
import { LoyaltyPanel } from './LoyaltyParts';

type Row = BkCustomer & { visits: number; last_visit: string | null; upcoming: number; paid_total: number };
type Detail = {
  customer: BkCustomer;
  bookings: { id: string; booking_no: string; service_snapshot: { name: string }; start_at: string; status: BookingStatus; staff_id: string | null; total_price: number; paid_amount: number }[];
  records: BkServiceRecord[];
  photos: BkAttachment[];
};

const CONSENT_TONE: Record<BkServiceRecord['consent'], string> = {
  none: 'bg-[#f1efec] text-[#6b6156]', requested: 'bg-[#fff3df] text-[#9a6412]', granted: 'bg-[#e7f3ea] text-[#2f6b3f]',
  declined: 'bg-[#f3ece9] text-[#8a5a50]', revoked: 'bg-[#f3ece9] text-[#8a5a50]',
};

// ---------- 顧客檔案 ----------
export default function CustomersTab({ data }: { data: Data }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [openId, setOpenId] = useState('');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: '', phone: '', note: '' });

  const load = useCallback(async (term: string) => {
    try { setRows((await api<{ customers: Row[] }>(`/api/mycard/booking/customers?q=${encodeURIComponent(term)}`)).customers); }
    catch (e) { void uiAlert(errMsg(e, '讀取失敗')); setRows([]); }
  }, []);
  useEffect(() => {
    const t = setTimeout(() => { void load(q); }, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [q, load]);

  async function add() {
    if (!draft.name.trim()) return void uiAlert('請填寫姓名');
    try {
      const c = await api<BkCustomer>('/api/mycard/booking/customers', { method: 'POST', body: JSON.stringify(draft) });
      setAdding(false); setDraft({ name: '', phone: '', note: '' }); setOpenId(c.id); uiToast('已新增顧客');
    } catch (e) { void uiAlert(errMsg(e)); }
  }

  if (openId) return <CustomerDetail id={openId} data={data} onBack={() => { setOpenId(''); void load(q); }} />;
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} type="search" placeholder="搜尋姓名或電話…" aria-label="搜尋顧客" autoComplete="off" className={`${input} min-w-0 flex-1`} />
        <button type="button" onClick={() => setAdding(!adding)} className={`${btnDark} shrink-0`}>+ 新增</button>
      </div>
      {adding ? (
        <div className={`${card} space-y-2`}>
          <div className="grid grid-cols-2 gap-2">
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={40} placeholder="姓名" aria-label="姓名" className={`${input} min-w-0`} />
            <input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} inputMode="tel" maxLength={30} placeholder="電話(選填)" aria-label="電話" className={`${input} min-w-0`} />
          </div>
          <textarea value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} rows={2} maxLength={1000} placeholder="偏好與注意事項(選填,只有你看得到)" aria-label="注意事項" className={`${input} resize-none`} />
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setAdding(false)} className={btnSm}>取消</button><button type="button" onClick={() => void add()} className={`${btnSm} border-[#1f1b19] bg-[#1f1b19] text-white`}>新增顧客</button></div>
        </div>
      ) : null}
      <p className="text-xs text-[#8a7f72]">線上預約的顧客會自動建檔;電話客在「加單」時可選既有顧客。顧客資料只有你看得到,不會跨店共用。</p>
      {rows === null ? <p className="py-8 text-center text-sm text-[#8a7f72]">讀取中…</p> : !rows.length ? (
        <p className="rounded-2xl bg-white p-8 text-center text-sm text-[#a99e8f]">{q ? '找不到符合的顧客' : '還沒有顧客'}</p>
      ) : (
        <div className="divide-y divide-[#f0ebe2] overflow-hidden rounded-2xl border border-[#e5ded4] bg-white">
          {rows.map((c) => (
            <button key={c.id} type="button" onClick={() => setOpenId(c.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#efe8dd] text-sm font-semibold text-[#6b6156]">{c.name.slice(0, 1) || '?'}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{c.name || '(未填姓名)'}{c.user_id ? '' : <span className="ml-1 text-[11px] font-normal text-[#a99e8f]">電話客</span>}</span>
                <span className="block truncate text-xs text-[#8a7f72]">{[c.phone, `來店 ${c.visits} 次`, c.last_visit ? `上次 ${formatDateTime(c.last_visit).split(' ')[0]}` : '', c.upcoming ? `即將 ${c.upcoming} 筆` : ''].filter(Boolean).join(' · ')}</span>
                {c.note ? <span className="block truncate text-xs text-[#9a6412]">{c.note}</span> : null}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-[#6b6156]">{c.paid_total ? money(c.paid_total) : ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CustomerDetail({ id, data, onBack }: { id: string; data: Data; onBack: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', note: '', tags: '' });
  const [adding, setAdding] = useState(false);
  const load = useCallback(async () => {
    try {
      const res = await api<Detail>(`/api/mycard/booking/customers/${id}`);
      setD(res);
      setForm({ name: res.customer.name, phone: res.customer.phone, note: res.customer.note, tags: res.customer.tags.join('、') });
    } catch (e) { void uiAlert(errMsg(e, '讀取失敗')); }
  }, [id]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function save() {
    try {
      await api(`/api/mycard/booking/customers/${id}`, { method: 'PATCH', body: JSON.stringify({ ...form, tags: form.tags.split(/[、,,\s]+/).filter(Boolean) }) });
      uiToast('已儲存顧客資料');
      void load();
    } catch (e) { void uiAlert(errMsg(e)); }
  }

  if (!d) return <p className="py-10 text-center text-sm text-[#8a7f72]">讀取中…</p>;
  const done = d.bookings.filter((b) => b.status === 'completed');
  return (
    <div className="space-y-3">
      <button type="button" onClick={onBack} className="text-sm text-[#6b6156]">‹ 顧客列表</button>
      <section className={`${card} space-y-3`}>
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#efe8dd] text-base font-semibold text-[#6b6156]">{d.customer.name.slice(0, 1) || '?'}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold">{d.customer.name || '(未填姓名)'}</p>
            <p className="text-xs text-[#8a7f72]">來店 {done.length} 次 · 累計已收 {money(d.bookings.reduce((n, b) => n + b.paid_amount, 0))}{d.customer.user_id ? ' · 有帳號' : ' · 電話客'}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-xs text-[#8a7f72]">姓名<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={40} className={`${input} mt-1`} /></label>
          <label className="block text-xs text-[#8a7f72]">電話<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" maxLength={30} className={`${input} mt-1`} /></label>
        </div>
        <label className="block text-xs text-[#8a7f72]">偏好與注意事項(預約卡片上會提醒你)<textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={3} maxLength={1000} placeholder="例:頭皮敏感、沖水偏涼、不要太短的瀏海" className={`${input} mt-1 resize-none`} /></label>
        <label className="block text-xs text-[#8a7f72]">標籤(用頓號分隔)<input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} maxLength={100} placeholder="例:VIP、過敏體質" className={`${input} mt-1`} /></label>
        <div className="flex justify-end"><button type="button" onClick={() => void save()} className={btnDark}>儲存</button></div>
      </section>

      <LoyaltyPanel customerId={id} data={data} />

      <section className={`${card} space-y-3`}>
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold">服務紀錄與照片</p>
          <button type="button" onClick={() => setAdding(!adding)} className={btnSm}>+ 新增紀錄</button>
        </div>
        {adding ? <NewRecord customerId={id} bookings={d.bookings} data={data} onDone={() => { setAdding(false); void load(); }} onCancel={() => setAdding(false)} /> : null}
        {!d.records.length && !adding ? <p className="text-sm text-[#a99e8f]">還沒有服務紀錄。可以記下配方、施作細節,附上前後照片。</p> : null}
        {d.records.map((r) => <RecordCard key={`${r.id}-${r.consent}-${r.content.length}`} record={r} photos={d.photos.filter((p) => p.record_id === r.id)} data={data} canAsk={Boolean(d.customer.user_id)} reload={load} />)}
        <p className="text-[11px] leading-5 text-[#a99e8f]">照片只有你和顧客本人看得到。要公開成作品,請按「請顧客同意公開」,顧客在預約頁同意後才可以公開,也可以隨時撤回。</p>
      </section>

      <section className={card}>
        <p className="font-semibold">預約紀錄</p>
        {!d.bookings.length ? <p className="mt-2 text-sm text-[#a99e8f]">沒有預約</p> : (
          <ul className="mt-2 divide-y divide-[#f0ebe2]">
            {d.bookings.map((b) => (
              <li key={b.id} className="flex items-center gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{formatDateTime(b.start_at)} {b.service_snapshot.name}{data.staff.length > 1 && b.staff_id ? ` · ${data.staff.find((s) => s.id === b.staff_id)?.name ?? ''}` : ''}</span>
                <span className="shrink-0 text-xs text-[#8a7f72]">{STATUS_LABEL[b.status]}{b.total_price ? ` · ${money(b.total_price)}` : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function NewRecord({ customerId, bookings, data, onDone, onCancel }: { customerId: string; bookings: Detail['bookings']; data: Data; onDone: () => void; onCancel: () => void }) {
  const [now] = useState(() => Date.now());
  const past = bookings.filter((b) => ['completed', 'checked_in', 'confirmed'].includes(b.status) && new Date(b.start_at).getTime() <= now + 86400000);
  const [bookingId, setBookingId] = useState(past[0]?.id ?? '');
  const linked = past.find((b) => b.id === bookingId);
  const [f, setF] = useState({ service_name: past[0]?.service_snapshot.name ?? '', performed_on: past[0] ? localParts(past[0].start_at).date : data.today, content: '' });
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!f.service_name.trim() && !f.content.trim()) return void uiAlert('請填寫服務名稱或紀錄內容');
    setBusy(true);
    try {
      await api(`/api/mycard/booking/customers/${customerId}`, { method: 'POST', body: JSON.stringify({ ...f, booking_id: bookingId || null, staff_id: linked?.staff_id ?? null }) });
      uiToast('已新增紀錄,可以接著加照片');
      onDone();
    } catch (e) { void uiAlert(errMsg(e)); }
    finally { setBusy(false); }
  }
  return (
    <div className="space-y-2 rounded-xl bg-[#faf7f2] p-3">
      {past.length ? (
        <label className="block text-xs text-[#8a7f72]">對應的預約
          <select value={bookingId} onChange={(e) => { const b = past.find((x) => x.id === e.target.value); setBookingId(e.target.value); if (b) setF({ ...f, service_name: b.service_snapshot.name, performed_on: localParts(b.start_at).date }); }} className={`${input} mt-1`}>
            <option value="">不對應預約</option>
            {past.map((b) => <option key={b.id} value={b.id}>{formatDateTime(b.start_at)} {b.service_snapshot.name}</option>)}
          </select>
        </label>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs text-[#8a7f72]">服務<input value={f.service_name} onChange={(e) => setF({ ...f, service_name: e.target.value })} maxLength={60} className={`${input} mt-1`} /></label>
        <div className="block text-xs text-[#8a7f72]">日期<DateField value={f.performed_on} onChange={(d) => setF({ ...f, performed_on: d })} className="mt-1" /></div>
      </div>
      <label className="block text-xs text-[#8a7f72]">紀錄(配方、施作細節)<textarea value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} rows={3} maxLength={2000} placeholder="例:7N + 8/43(1:1),雙氧 6%,停留 35 分" className={`${input} mt-1 resize-none`} /></label>
      <div className="flex justify-end gap-2"><button type="button" onClick={onCancel} className={btnSm}>取消</button><button type="button" disabled={busy} onClick={() => void save()} className={`${btnSm} border-[#1f1b19] bg-[#1f1b19] text-white`}>儲存紀錄</button></div>
    </div>
  );
}

function RecordCard({ record: r, photos, data, canAsk, reload }: { record: BkServiceRecord; photos: BkAttachment[]; data: Data; canAsk: boolean; reload: () => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(r.content);
  const [kind, setKind] = useState<'before' | 'after' | 'other'>('after');
  const [busy, setBusy] = useState(false);
  const staff = data.staff.find((s) => s.id === r.staff_id);

  async function call(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try { await fn(); uiToast(ok); }
    catch (e) { void uiAlert(errMsg(e)); }
    finally { setBusy(false); void reload(); }
  }
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(files).slice(0, 6)) {
        const blob = await shrinkImage(file).catch(() => null);
        if (!blob) { void uiAlert('有照片無法讀取,請換一張(建議 JPG 或 PNG)'); continue; }
        const form = new FormData();
        form.set('photo', blob, 'photo.jpg');
        form.set('kind', kind);
        const res = await fetch(`/api/mycard/booking/records/${r.id}`, { method: 'POST', body: form });
        if (!res.ok) { const j = await res.json().catch(() => null); void uiAlert(j?.error?.message ?? '上傳失敗'); break; }
      }
      uiToast('已上傳照片');
    } finally { setBusy(false); void reload(); }
  }

  return (
    <div className="space-y-2 rounded-xl bg-[#faf7f2] p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{r.performed_on} {r.service_name}</p>
          {staff && data.staff.length > 1 ? <p className="text-xs text-[#8a7f72]">{staff.name}</p> : null}
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${CONSENT_TONE[r.consent]}`}>{CONSENT_LABEL[r.consent]}</span>
      </div>
      {r.delete_requested ? <p className="rounded-lg bg-[#fdecea] px-2.5 py-1.5 text-xs text-[#a03b3b]">顧客要求刪除這筆紀錄的照片,請刪除照片後告知顧客。</p> : null}
      {editing ? (
        <div className="space-y-2">
          <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={4} maxLength={2000} aria-label="紀錄內容" className={`${input} resize-none`} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(false)} className={btnSm}>取消</button>
            <button type="button" disabled={busy} onClick={() => void call(() => api(`/api/mycard/booking/records/${r.id}`, { method: 'PATCH', body: JSON.stringify({ service_name: r.service_name, content, performed_on: r.performed_on }) }), '已儲存')} className={`${btnSm} border-[#1f1b19] bg-[#1f1b19] text-white`}>儲存</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setEditing(true)} className="block w-full whitespace-pre-line text-left text-sm text-[#3d3631]">{r.content || <span className="text-[#a99e8f]">點這裡加上紀錄內容…</span>}</button>
      )}
      {photos.length ? (
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
          {photos.map((p) => (
            <span key={p.id} className="relative block aspect-square overflow-hidden rounded-lg bg-[#efe8dd]">
              <a href={`/api/booking/photo?id=${p.id}`} target="_blank" rel="noopener noreferrer"><img src={`/api/booking/photo?id=${p.id}`} alt={`${PHOTO_KIND_LABEL[p.kind]}的照片`} loading="lazy" width={160} height={160} className="h-full w-full object-cover" /></a>
              <span className="absolute left-1 top-1 rounded bg-[#1f1b19]/70 px-1.5 text-[10px] text-white">{PHOTO_KIND_LABEL[p.kind]}</span>
              <button type="button" disabled={busy} onClick={() => void (async () => { if (await uiConfirm('刪除這張照片?無法復原。', { danger: true })) await call(() => api(`/api/mycard/booking/records/${r.id}?photo=${p.id}`, { method: 'DELETE' }), '已刪除照片'); })()} aria-label="刪除照片" className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-[#1f1b19]/70 text-sm text-white">×</button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label="照片類型" className="rounded-lg border border-[#e5ded4] bg-white px-1.5 py-1 text-xs">
          <option value="before">施作前</option><option value="after">施作後</option><option value="other">其他</option>
        </select>
        <label className={`${btnSm} cursor-pointer`}>
          {busy ? '處理中…' : '+ 加照片'}
          <input type="file" accept="image/*" multiple disabled={busy} className="sr-only" aria-label="上傳照片" onChange={(e) => { void upload(e.target.files); e.target.value = ''; }} />
        </label>
        {photos.length && canAsk && ['none', 'declined', 'revoked'].includes(r.consent) ? (
          <button type="button" disabled={busy} onClick={() => void call(() => api(`/api/mycard/booking/records/${r.id}`, { method: 'POST', body: JSON.stringify({ action: 'request_consent' }) }), '已請顧客確認(LINE 通知)')} className={btnSm}>請顧客同意公開</button>
        ) : null}
        <button type="button" disabled={busy} onClick={() => void (async () => { if (await uiConfirm('刪除這筆紀錄與所有照片?無法復原。', { danger: true })) await call(() => api(`/api/mycard/booking/records/${r.id}`, { method: 'DELETE' }), '已刪除紀錄'); })()} className="ml-auto text-xs text-[#a03b3b]">刪除紀錄</button>
      </div>
      {photos.length && !canAsk ? <p className="text-[11px] text-[#a99e8f]">電話客沒有帳號,無法線上同意;要公開請當面取得書面同意。</p> : null}
    </div>
  );
}

