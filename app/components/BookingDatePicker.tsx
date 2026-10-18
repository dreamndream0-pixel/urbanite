'use client';

import { useState } from 'react';

// 自製日期選擇(不用瀏覽器內建日曆):月曆格 + 預約注記點;DateField 收合 / 展開
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const pad = (n: number) => String(n).padStart(2, '0');
export const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
export const weekdayOf = (date: string) => new Date(`${date}T12:00:00+08:00`).getUTCDay();
export function shiftDate(date: string, days: number) {
  const t = new Date(`${date}T12:00:00Z`).getTime() + days * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}
export function shiftMonth(date: string, months: number) {
  const [y, m] = date.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return ymd(ny, nm, Math.min(Number(date.slice(8, 10)), last));
}
export const dateLabel = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}(${WEEK[weekdayOf(date)]})`;

// 某月的格子(週日開頭,前後補空白)
export function monthCells(year: number, month: number) {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => ymd(year, month, i + 1))];
  while (cells.length % 7) cells.push(null);
  return cells;
}

export function MonthGrid({ month, value, onPick, marks, min, max, today, compact }: {
  month: string; value: string; onPick: (date: string) => void; marks?: Record<string, number>; min?: string; max?: string; today?: string; compact?: boolean;
}) {
  const [y, m] = month.split('-').map(Number);
  return (
    <div>
      <div className="grid grid-cols-7 text-center text-[11px]! text-[#a99e8f]">{WEEK.map((w) => <span key={w} className="py-1">{w}</span>)}</div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {monthCells(y, m).map((d, i) => {
          if (!d) return <span key={`e${i}`} />;
          const off = (min && d < min) || (max && d > max);
          const on = d === value;
          const n = marks?.[d] ?? 0;
          return (
            <button key={d} type="button" disabled={Boolean(off)} onClick={() => onPick(d)} aria-pressed={on} aria-label={`${d}${n ? `,${n} 筆預約` : ''}`}
              className={`relative mx-auto flex ${compact ? 'h-8 w-8' : 'h-9 w-9'} flex-col items-center justify-center rounded-full text-sm! disabled:opacity-30 ${on ? 'bg-[#1f1b19] font-semibold! text-white' : d === today ? 'font-semibold! text-[#9a3b2e] ring-1 ring-[#e3cfc7]' : 'text-[#3d3631]'}`}>
              <span className="leading-none">{Number(d.slice(8))}</span>
              {n ? <span className={`absolute bottom-1 h-1 w-1 rounded-full ${on ? 'bg-white' : n >= 4 ? 'bg-[#b5523f]' : 'bg-[#c99a6b]'}`} /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// 表單用:按一下展開月曆,選好自動收合
export function DateField({ value, onChange, min, max, marks, placeholder = '選擇日期', className = '' }: {
  value: string; onChange: (date: string) => void; min?: string; max?: string; marks?: Record<string, number>; placeholder?: string; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => value || min || new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10));
  return (
    <div className={`min-w-0 ${className}`}>
      <button type="button" aria-expanded={open} onClick={() => { setOpen(!open); if (value) setMonth(value); }}
        className="flex w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-[#e5ded4] bg-white px-3 py-2.5 text-left text-base! text-[#1f1b19]">
        <span className={`truncate ${value ? '' : 'text-[#a99e8f]'}`}>{value ? `${value.slice(0, 4)}/${dateLabel(value)}` : placeholder}</span>
        <span aria-hidden="true" className={`shrink-0 text-xs! text-[#8a7f72] transition ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open ? (
        <div className="mt-1.5 rounded-2xl border border-[#e5ded4] bg-white p-2.5 shadow-sm">
          <div className="mb-1 flex items-center justify-between">
            <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="上個月" className="h-8 w-8 rounded-full text-lg! text-[#6b6156]">‹</button>
            <span className="text-sm! font-semibold!">{month.slice(0, 4)} 年 {Number(month.slice(5, 7))} 月</span>
            <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="下個月" className="h-8 w-8 rounded-full text-lg! text-[#6b6156]">›</button>
          </div>
          <MonthGrid month={month} value={value} min={min} max={max} marks={marks} compact onPick={(d) => { onChange(d); setOpen(false); }} />
        </div>
      ) : null}
    </div>
  );
}
