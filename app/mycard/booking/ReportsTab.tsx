'use client';

import { useCallback, useEffect, useState } from 'react';
import { DateField } from '@/app/components/BookingDatePicker';
import { uiAlert, uiConfirm } from '@/lib/ui-dialog';
import { uiToast } from '@/lib/ui-toast';
import { addDays, formatDateTime, money, PAY_METHOD_LABEL } from '@/lib/booking/shared';
import { api, btnSm, card, errMsg, type Data } from './ui';

type Report = {
  from: string; to: string;
  totals: {
    bookings: number; completed: number; upcoming: number; cancelled: number; no_show: number; expired: number; cancel_rate: number; no_show_rate: number;
    service_revenue: number; collected: number; forfeited: number; packages_sold: number; packages_amount: number; points_earned: number; points_redeemed: number;
    customers: number; new_customers: number; returning_customers: number; avg_ticket: number;
  };
  staff: { staff_id: string; name: string; rate: number; completed: number; minutes: number; revenue: number; refunds: number; net: number; commission: number; utilization: number }[];
  services: { name: string; count: number; revenue: number }[];
  channels: { channel: string; count: number }[];
  methods: { method: string; amount: number }[];
  runs: { id: string; period_start: string; period_end: string; total: number; note: string; created_at: string }[];
};

const CHANNEL: Record<string, string> = { card: '名片', line: 'LINE', owner: '店家加單', quote: '報價', test: '測試' };

function monthRange(today: string, offset: number) {
  const [y, m] = today.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + offset, 1));
  const start = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
  const end = addDays(`${new Date(Date.UTC(y, m + offset, 1)).toISOString().slice(0, 7)}-01`, -1);
  return { from: start, to: end };
}

// ---------- 報表與抽成 ----------
export default function ReportsTab({ data }: { data: Data }) {
  const [range, setRange] = useState(() => monthRange(data.today, 0));
  const [preset, setPreset] = useState<'this' | 'last' | '30' | 'custom'>('this');
  const [r, setR] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try { setR(await api<Report>(`/api/mycard/booking/reports?from=${range.from}&to=${range.to}`)); setError(''); }
    catch (e) { setError(errMsg(e, '讀取失敗')); }
  }, [range]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  function pick(p: typeof preset) {
    setPreset(p);
    if (p === 'this') setRange(monthRange(data.today, 0));
    if (p === 'last') setRange(monthRange(data.today, -1));
    if (p === '30') setRange({ from: addDays(data.today, -29), to: data.today });
  }
  async function settle() {
    if (!r) return;
    const total = r.staff.reduce((n, s) => n + s.commission, 0);
    if (!(await uiConfirm(`結算 ${r.from} ~ ${r.to} 的抽成,共 ${money(total)}?\n結算後這段期間的數字會鎖定,之後的退款列入下一期。`))) return;
    try { await api('/api/mycard/booking/reports', { method: 'POST', body: JSON.stringify({ from: r.from, to: r.to }) }); uiToast('已結算'); void load(); }
    catch (e) { void uiAlert(errMsg(e)); }
  }

  const t = r?.totals;
  const tile = (label: string, value: string, sub?: string) => (
    <div className="rounded-xl bg-[#faf7f2] p-3">
      <p className="text-[11px] text-[#8a7f72]">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums">{value}</p>
      {sub ? <p className="text-[11px] text-[#8a7f72]">{sub}</p> : null}
    </div>
  );
  const team = data.staff.length > 1;
  return (
    <div className="space-y-3">
      <section className={`${card} space-y-2`}>
        <div className="flex flex-wrap gap-1.5">
          {([['this', '本月'], ['last', '上個月'], ['30', '近 30 天'], ['custom', '自訂']] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => pick(k)} className={`rounded-full px-3 py-1.5 text-sm ${preset === k ? 'bg-[#1f1b19] text-white' : 'border border-[#e5ded4] bg-white text-[#6b6156]'}`}>{label}</button>
          ))}
        </div>
        {preset === 'custom' ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <DateField value={range.from} onChange={(d) => d && setRange({ ...range, from: d })} />
            <DateField value={range.to} onChange={(d) => d && setRange({ ...range, to: d })} />
          </div>
        ) : <p className="text-xs text-[#8a7f72]">{range.from} ~ {range.to}</p>}
      </section>
      {error ? <p className="rounded-xl bg-[#fdecea] px-4 py-3 text-sm text-[#a03b3b]">{error}</p> : !r || !t ? <p className="py-8 text-center text-sm text-[#8a7f72]">讀取中…</p> : (
        <>
          <section className={card}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {tile('服務營收', money(t.service_revenue), `完成 ${t.completed} 筆 · 客單 ${money(t.avg_ticket)}`)}
              {tile('實收', money(t.collected), '依收款日,扣退款')}
              {tile('預約', `${t.bookings} 筆`, `即將 ${t.upcoming} · 取消 ${t.cancel_rate}% · 未到 ${t.no_show_rate}%`)}
              {tile('顧客', `${t.customers} 位`, `新客 ${t.new_customers} · 回頭 ${t.returning_customers}`)}
              {t.forfeited ? tile('取消 / 未到已收', money(t.forfeited), '訂金未退的部分') : null}
              {t.packages_sold ? tile('套票售出', `${t.packages_sold} 張`, money(t.packages_amount)) : null}
              {t.points_earned || t.points_redeemed ? tile('回饋點數', `+${t.points_earned}`, `折抵 ${t.points_redeemed} 點`) : null}
            </div>
            {r.methods.length ? <p className="mt-2 text-xs text-[#8a7f72]">收款方式:{r.methods.map((m) => `${PAY_METHOD_LABEL[m.method as keyof typeof PAY_METHOD_LABEL] ?? m.method} ${money(m.amount)}`).join(' · ')}</p> : null}
          </section>

          <section className={card}>
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold">{team ? '人員業績與抽成' : '業績'}</p>
              {r.staff.some((s) => s.commission) ? <button type="button" onClick={() => void settle()} className={btnSm}>結算抽成</button> : null}
            </div>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead><tr className="text-left text-xs text-[#8a7f72]"><th className="py-1.5 font-normal">人員</th><th className="font-normal">完成</th><th className="font-normal">營收</th><th className="font-normal">退款</th><th className="font-normal">抽成</th><th className="font-normal">稼動</th></tr></thead>
                <tbody className="tabular-nums">
                  {r.staff.map((s) => (
                    <tr key={s.staff_id} className="border-t border-[#f0ebe2]">
                      <td className="py-2">{s.name}</td><td>{s.completed}</td><td>{money(s.revenue)}</td><td>{s.refunds ? `-${money(s.refunds)}` : '—'}</td>
                      <td>{s.rate ? `${money(s.commission)}(${s.rate}%)` : '—'}</td><td>{s.utilization}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] leading-5 text-[#a99e8f]">營收依實際服務人員計算(多項服務分別算);抽成比例在「人員床位」設定。稼動 = 服務時間 ÷ 排班時間(未扣休假,僅供參考)。</p>
          </section>

          <section className={card}>
            <p className="font-semibold">服務</p>
            {r.services.length ? (
              <ul className="mt-2 space-y-1.5">
                {r.services.map((s) => {
                  const max = r.services[0].revenue || 1;
                  return (
                    <li key={s.name} className="text-sm">
                      <div className="flex justify-between gap-2"><span className="min-w-0 truncate">{s.name}</span><span className="shrink-0 tabular-nums text-[#6b6156]">{s.count} 筆 · {money(s.revenue)}</span></div>
                      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-[#f3ede4]"><div className="h-full rounded-full bg-[#1f1b19]" style={{ width: `${Math.max(2, (s.revenue / max) * 100)}%` }} /></div>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="mt-2 text-sm text-[#a99e8f]">這段期間沒有完成的服務</p>}
          </section>

          <section className={card}>
            <p className="font-semibold">預約來源</p>
            <p className="mt-1 text-sm text-[#6b6156]">{r.channels.length ? r.channels.map((c) => `${CHANNEL[c.channel] ?? c.channel} ${c.count}`).join(' · ') : '—'}</p>
          </section>

          {r.runs.length ? (
            <section className={card}>
              <p className="font-semibold">已結算</p>
              <ul className="mt-2 divide-y divide-[#f0ebe2] text-sm">
                {r.runs.map((run) => <li key={run.id} className="flex justify-between gap-2 py-2"><span>{run.period_start} ~ {run.period_end}</span><span className="tabular-nums text-[#6b6156]">{money(run.total)} · {formatDateTime(run.created_at).split(' ')[0]}</span></li>)}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
