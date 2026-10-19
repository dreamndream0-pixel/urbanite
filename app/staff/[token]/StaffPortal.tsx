'use client';

import { useState } from 'react';
import { DateField, MonthGrid, dateLabel } from '@/app/components/BookingDatePicker';
import { uiAlert, uiConfirm } from '@/lib/ui-dialog';
import { uiToast } from '@/lib/ui-toast';
import { formatRange, fromLocal, hhmmToMinutes, localParts, minutesToHHMM, WEEKDAYS } from '@/lib/booking/shared';
import type { PortalData } from '@/lib/booking/staff-portal';
import { WeekEditor, fromWeek, toWeek, type Week } from '@/app/mycard/booking/BookingSetup';

const STATUS: Record<string, string> = { pending: '待確認', confirmed: '已確認', checked_in: '已報到', completed: '已完成' };
const card = 'rounded-3xl border border-[#ece4d9] bg-white p-4 shadow-[0_1px_3px_#2b1d1408]';

// 服務人員專屬頁:行程(自己的預約)/ 班表 / 休假;另外有自己的預約連結
export default function StaffPortal({ token, initial }: { token: string; initial: PortalData }) {
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState<'schedule' | 'hours' | 'leave'>('schedule');
  const [date, setDate] = useState(initial.today);
  const [now] = useState(() => Date.now());
  const reload = async () => {
    const res = await fetch(`/api/staff/${token}`, { cache: 'no-store' });
    if (res.ok) setData(await res.json());
  };

  const marks: Record<string, number> = {};
  for (const b of data.bookings) { const d = localParts(b.start_at).date; marks[d] = (marks[d] ?? 0) + 1; }
  const dayList = data.bookings.filter((b) => localParts(b.start_at).date === date);
  const upcoming = data.bookings.filter((b) => new Date(b.end_at).getTime() >= now && b.status !== 'completed').slice(0, 5);

  return (
    <main className="min-h-screen bg-[#f6f2ec] pb-16 text-[#1f1b19]">
      <div className="mx-auto max-w-xl space-y-4 px-4 pt-5">
        <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#efe6da] via-[#f6f0e8] to-[#f6f2ec] p-4">
          <p className="text-xs text-[#8a7f72]">{data.businessName}</p>
          <h1 className="mt-0.5 text-[26px] font-bold leading-tight">{data.staff.name} 的預約行程</h1>
          {data.staff.title ? <p className="text-sm text-[#6b6156]">{data.staff.title}</p> : null}
          {!data.staff.active ? <p className="mt-2 rounded-xl bg-white/70 px-3 py-2 text-xs text-[#a03b3b]">店家已暫停你的預約,目前顧客無法預約你。</p> : null}
        </header>

        {data.bookUrl ? (
          <div className={card}>
            <p className="text-sm font-semibold">我的預約連結</p>
            <p className="text-xs text-[#8a7f72]">分享給顧客,打開就是直接預約你的服務。</p>
            <div className="mt-2 flex min-w-0 items-center gap-2 rounded-xl bg-[#faf7f2] p-2 pl-3">
              <span className="min-w-0 flex-1 truncate text-xs text-[#6b6156]">{data.bookUrl}</span>
              <button type="button" onClick={() => { void navigator.clipboard?.writeText(data.bookUrl); uiToast('已複製預約連結'); }} className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs! font-semibold!">複製</button>
              <a href={data.bookUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-semibold">開啟</a>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-3 gap-1 rounded-full bg-[#ebe3d8] p-1" role="group" aria-label="功能">
          {([['schedule', '行程'], ['hours', '班表'], ['leave', '休假']] as const).map(([k, label]) => (
            <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)} className={`rounded-full py-2 text-sm! ${tab === k ? 'bg-white font-semibold! shadow-sm' : 'text-[#6b6156]'}`}>{label}</button>
          ))}
        </div>

        {tab === 'schedule' ? (
          <>
            <div className={card}>
              <p className="mb-1 text-center text-base font-bold">{date.slice(0, 4)} 年 {Number(date.slice(5, 7))} 月</p>
              <MonthGrid month={date} value={date} today={data.today} marks={marks} onPick={setDate} />
              <div className="mt-2 flex items-center justify-between">
                <button type="button" onClick={() => setDate(shiftMonthStart(date, -1))} className="rounded-full px-3 py-1 text-sm! text-[#6b6156]">‹ 上個月</button>
                <button type="button" onClick={() => setDate(data.today)} className="rounded-full border border-[#e5ded4] px-3 py-1 text-xs! font-semibold!">今天</button>
                <button type="button" onClick={() => setDate(shiftMonthStart(date, 1))} className="rounded-full px-3 py-1 text-sm! text-[#6b6156]">下個月 ›</button>
              </div>
            </div>
            <section className="space-y-2">
              <p className="text-sm font-semibold">{date === data.today ? '今天 · ' : ''}{dateLabel(date)}</p>
              {!dayList.length ? <p className="rounded-2xl bg-white p-6 text-center text-sm text-[#a99e8f]">這天沒有預約</p> : dayList.map((b) => <BookingRow key={b.id} b={b} />)}
            </section>
            {upcoming.length ? (
              <section className="space-y-2">
                <p className="text-sm font-semibold">接下來的預約</p>
                {upcoming.map((b) => <BookingRow key={b.id} b={b} showDate />)}
              </section>
            ) : null}
          </>
        ) : null}

        {tab === 'hours' ? <HoursForm token={token} data={data} onSaved={reload} /> : null}
        {tab === 'leave' ? <LeaveForm token={token} data={data} onSaved={reload} /> : null}
      </div>
    </main>
  );
}

function shiftMonthStart(date: string, dir: number) {
  const [y, m] = date.split('-').map(Number);
  const t = y * 12 + (m - 1) + dir;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}-01`;
}

function BookingRow({ b, showDate }: { b: PortalData['bookings'][number]; showDate?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[#ece4d9] bg-white p-3">
      <span aria-hidden="true" className={`h-10 w-1.5 shrink-0 rounded-full ${b.status === 'pending' ? 'bg-[#e1bf8a]' : b.status === 'completed' ? 'bg-[#cfc7bc]' : 'bg-[#a9c9a4]'}`} />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-bold tabular-nums">{showDate ? formatRange(b.start_at, b.end_at) : formatRange(b.start_at, b.end_at).split(' ')[1]}</p>
        <p className="truncate text-sm">{b.role === 'assistant' ? '助理 · ' : ''}{b.service}{b.resource ? <span className="text-[#8a7f72]"> · {b.resource}</span> : null}</p>
        <p className="truncate text-xs text-[#6b6156]">{b.customer || '—'}{b.phone ? <> · <a href={`tel:${b.phone}`} className="text-[#1f6f8b]">{b.phone}</a></> : null}</p>
      </div>
      <span className="shrink-0 rounded-full bg-[#f3ede4] px-2.5 py-0.5 text-xs text-[#6b6156]">{STATUS[b.status] ?? b.status}</span>
    </div>
  );
}

function HoursForm({ token, data, onSaved }: { token: string; data: PortalData; onSaved: () => Promise<void> }) {
  const [same, setSame] = useState(data.staff.use_business_hours);
  const [week, setWeek] = useState<Week>(() => toWeek(data.myHours.length ? data.myHours : data.hours.filter((h) => !h.branch_id)));
  const [busy, setBusy] = useState(false);
  async function save() {
    const rows = same ? [] : fromWeek(week);
    if (typeof rows === 'string') return void uiAlert(rows);
    setBusy(true);
    try {
      const res = await fetch(`/api/staff/${token}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ use_business_hours: same, hours: rows }) });
      if (!res.ok) return void uiAlert((await res.json().catch(() => null))?.error?.message ?? '儲存失敗');
      uiToast('已儲存班表');
      await onSaved();
    } finally { setBusy(false); }
  }
  const biz = WEEKDAYS.map((w, d) => {
    const r = data.hours.filter((h) => h.weekday === d && !h.branch_id);
    return `週${w} ${r.length ? r.map((h) => `${minutesToHHMM(h.start_min)}–${h.end_min === 1440 ? '24:00' : minutesToHHMM(h.end_min)}`).join('、') : '休息'}`;
  });
  return (
    <div className={`${card} space-y-3`}>
      <p className="font-semibold">每週班表</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={same} onChange={(e) => setSame(e.target.checked)} />跟店家營業時段相同</label>
      {same
        ? <ul className="space-y-0.5 rounded-xl bg-[#faf7f2] p-3 text-xs text-[#6b6156]">{biz.map((t) => <li key={t}>{t}</li>)}</ul>
        : <WeekEditor week={week} setWeek={setWeek} />}
      <p className="text-[11px] text-[#a99e8f]">班表改了之後,只影響之後顧客能預約的時段;已經成立的預約不會變動。</p>
      <button type="button" disabled={busy} onClick={() => void save()} className="w-full rounded-full bg-[#1f1b19] py-3 text-sm! font-semibold! text-white disabled:opacity-40">{busy ? '儲存中…' : '儲存班表'}</button>
    </div>
  );
}

function LeaveForm({ token, data, onSaved }: { token: string; data: PortalData; onSaved: () => Promise<void> }) {
  const [f, setF] = useState({ from: '', to: '', allDay: true, start: '10:00', end: '18:00', reason: '' });
  const [busy, setBusy] = useState(false);
  const mine = data.exceptions.filter((x) => x.staff_id === data.staff.id);
  const shop = data.exceptions.filter((x) => !x.staff_id);
  async function add() {
    if (!f.from) return void uiAlert('請選擇日期');
    const to = f.to && f.to >= f.from ? f.to : f.from;
    const start = f.allDay ? fromLocal(f.from, 0) : fromLocal(f.from, hhmmToMinutes(f.start));
    const end = f.allDay ? fromLocal(to, 1440) : fromLocal(f.from, hhmmToMinutes(f.end));
    setBusy(true);
    try {
      const res = await fetch(`/api/staff/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ start_at: start.toISOString(), end_at: end.toISOString(), reason: f.reason }) });
      const d = await res.json().catch(() => null);
      if (!res.ok) return void uiAlert(d?.error?.message ?? '儲存失敗');
      if (d.affected) void uiAlert(`已設定休假。這段時間你有 ${d.affected} 筆預約,系統不會自動取消,請通知店家改期或換人。`);
      else uiToast('已設定休假');
      setF({ ...f, from: '', to: '', reason: '' });
      await onSaved();
    } finally { setBusy(false); }
  }
  async function remove(id: string) {
    if (!(await uiConfirm('刪除這筆休假?刪除後這段時間又可以被預約。', { danger: true }))) return;
    await fetch(`/api/staff/${token}?id=${id}`, { method: 'DELETE' });
    uiToast('已刪除');
    await onSaved();
  }
  const range = (x: { start_at: string; end_at: string }) => {
    const s = localParts(x.start_at);
    const e = localParts(new Date(new Date(x.end_at).getTime() - 1).toISOString());
    const allDay = s.minutes === 0 && localParts(x.end_at).minutes === 0;
    return allDay ? (s.date === e.date ? `${dateLabel(s.date)} 全天` : `${dateLabel(s.date)} ~ ${dateLabel(e.date)}`) : formatRange(x.start_at, x.end_at);
  };
  return (
    <div className="space-y-3">
      <div className={`${card} space-y-2.5`}>
        <p className="font-semibold">新增休假</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="text-xs text-[#8a7f72]">開始日期<DateField value={f.from} min={data.today} onChange={(d) => setF({ ...f, from: d })} className="mt-1" /></div>
          {f.allDay ? <div className="text-xs text-[#8a7f72]">結束日期(選填,多天休假)<DateField value={f.to} min={f.from || data.today} onChange={(d) => setF({ ...f, to: d })} placeholder="同一天" className="mt-1" /></div> : null}
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.allDay} onChange={(e) => setF({ ...f, allDay: e.target.checked })} />整天</label>
        {!f.allDay ? (
          <div className="flex items-center gap-2">
            <input type="time" step={900} value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} className="min-w-0 flex-1 rounded-xl border border-[#e5ded4] px-2 py-2 text-base" aria-label="開始時間" />
            <span className="text-[#a99e8f]">–</span>
            <input type="time" step={900} value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} className="min-w-0 flex-1 rounded-xl border border-[#e5ded4] px-2 py-2 text-base" aria-label="結束時間" />
          </div>
        ) : null}
        <input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} maxLength={60} placeholder="原因(選填,只有店家看得到)" className="w-full rounded-xl border border-[#e5ded4] px-3 py-2.5 text-base" />
        <button type="button" disabled={busy} onClick={() => void add()} className="w-full rounded-full bg-[#1f1b19] py-3 text-sm! font-semibold! text-white disabled:opacity-40">{busy ? '儲存中…' : '新增休假'}</button>
      </div>
      <div className={`${card} space-y-2`}>
        <p className="font-semibold">我的休假</p>
        {!mine.length ? <p className="text-sm text-[#a99e8f]">目前沒有休假</p> : mine.map((x) => (
          <div key={x.id} className="flex items-center gap-2 border-t border-[#f0ebe2] pt-2 first:border-t-0 first:pt-0">
            <div className="min-w-0 flex-1"><p className="text-sm">{range(x)}</p>{x.reason ? <p className="truncate text-xs text-[#8a7f72]">{x.reason}</p> : null}</div>
            <button type="button" onClick={() => void remove(x.id)} className="shrink-0 rounded-full border border-[#e5ded4] px-3 py-1 text-xs! text-[#a03b3b]">刪除</button>
          </div>
        ))}
        {shop.length ? <p className="pt-1 text-xs text-[#8a7f72]">店休:{shop.map(range).join('、')}</p> : null}
      </div>
    </div>
  );
}
