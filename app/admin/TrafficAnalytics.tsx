'use client';

import { useEffect, useState } from 'react';

type Totals = { visits: number; visitors: number; clicks: number; views: number; viewers: number; carts: number };
type Stats = {
  totals: Totals; orders: { orders: number; revenue: number };
  daily: { day: string; visits: number; visitors: number; views: number }[];
  sources: { source: string; visits: number }[];
  products: { product_id: string; name: string; image: string; clicks: number; views: number; viewers: number; carts: number }[];
  days: number; from: string;
};

const RANGES = [[1, '今天'], [7, '近 7 天'], [30, '近 30 天'], [90, '近 90 天']] as const;
const SOURCE_LABEL: Record<string, string> = {
  direct: '直接進站 / 書籤', line: 'LINE', instagram: 'Instagram', facebook: 'Facebook', google: 'Google', threads: 'Threads', youtube: 'YouTube', urbanlinks: 'URBANLINKS 名片',
};
const BAR = '#8b6f5a';
const nf = new Intl.NumberFormat('zh-TW');
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 1000) / 10}%` : '—');

// 報表及分析 → 流量分析:進站人數 / 次數、商品點擊、商品頁瀏覽與觀看率、加入購物車、來源、商品排行
export default function TrafficAnalytics() {
  const [days, setDays] = useState(7);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/traffic?days=${days}`, { cache: 'no-store' })
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d?.error ?? '讀取失敗'); return d as Stats; })
      .then((d) => { if (alive) { setStats(d); setError(''); } })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : '讀取失敗'); });
    return () => { alive = false; };
  }, [days]);

  // 補齊沒有資料的日子(顯示 0)
  const series = (() => {
    if (!stats) return [];
    const start = new Date(stats.from);
    return Array.from({ length: stats.days }, (_, i) => {
      const day = new Date(start.getTime() + i * 86400000 + 8 * 3600000).toISOString().slice(0, 10);
      const row = stats.daily.find((d) => d.day === day);
      return { day, visits: row?.visits ?? 0, visitors: row?.visitors ?? 0, views: row?.views ?? 0 };
    });
  })();
  const max = Math.max(1, ...series.map((d) => d.visits));
  const t = stats?.totals;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">流量分析</h2>
          <p className="text-xs text-[#8a7f72]">進到賣場的人數、商品點擊與觀看率。不含後台預覽;同一位訪客同一次造訪只算一次進站。</p>
        </div>
        <div className="flex gap-1 rounded-full bg-[#f3ede4] p-1" role="group" aria-label="時間範圍">
          {RANGES.map(([d, label]) => (
            <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)} className={`rounded-full px-3 py-1.5 text-xs ${days === d ? 'bg-white font-semibold text-[#1f1b19] shadow-sm' : 'text-[#6b6156]'}`}>{label}</button>
          ))}
        </div>
      </div>

      {error ? <p className="rounded-xl bg-[#fdecea] p-3 text-sm text-[#a03b3b]">{error}</p> : !stats || !t ? <p className="py-8 text-center text-sm text-[#8a7f72]">讀取中…</p> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="進站人數" value={nf.format(t.visitors)} note={`進站 ${nf.format(t.visits)} 次`} />
            <Tile label="商品點擊" value={nf.format(t.clicks)} note={`點擊率 ${pct(t.clicks, t.visits)}(點擊 ÷ 進站次數)`} />
            <Tile label="商品頁瀏覽" value={nf.format(t.views)} note={`觀看率 ${pct(t.viewers, t.visitors)}(有看商品的人 ÷ 進站人數)`} />
            <Tile label="加入購物車" value={nf.format(t.carts)} note={`下單 ${nf.format(stats.orders.orders)} 筆 · 轉換率 ${pct(stats.orders.orders, t.visitors)}`} />
          </div>

          <div className="rounded-2xl border border-[#e5ded4] bg-white p-4">
            <p className="text-sm font-semibold">每日進站次數</p>
            <div className="relative mt-3">
              <div className="flex h-40 items-end gap-[2px]" role="img" aria-label="每日進站次數長條圖">
                {series.map((d, i) => (
                  <div key={d.day} className="relative flex h-full flex-1 items-end" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => setHover(hover === i ? null : i)}>
                    <div className="w-full rounded-t-[4px]" style={{ height: `${Math.max(d.visits ? 3 : 0, (d.visits / max) * 100)}%`, background: BAR, opacity: hover === null || hover === i ? 1 : 0.55 }} />
                  </div>
                ))}
              </div>
              <div className="h-px bg-[#e5ded4]" />
              <div className="mt-1 flex justify-between text-[10px] text-[#a99e8f]">
                <span>{series[0]?.day.slice(5).replace('-', '/')}</span>
                {series.length > 2 ? <span>{series[Math.floor(series.length / 2)]?.day.slice(5).replace('-', '/')}</span> : null}
                <span>{series[series.length - 1]?.day.slice(5).replace('-', '/')}</span>
              </div>
              {hover !== null && series[hover] ? (
                <div className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-[#1f1b19] px-2.5 py-1.5 text-xs text-white shadow"
                  style={{ left: `${((hover + 0.5) / series.length) * 100}%` }}>
                  <p className="font-semibold">{series[hover].day.slice(5).replace('-', '/')}</p>
                  <p>進站 {series[hover].visits} 次 · {series[hover].visitors} 人</p>
                  <p>商品頁瀏覽 {series[hover].views}</p>
                </div>
              ) : null}
            </div>
            <details className="mt-2 text-xs text-[#6b6156]">
              <summary className="cursor-pointer text-[#8a7f72]">看表格</summary>
              <table className="mt-2 w-full text-left">
                <thead><tr className="text-[#a99e8f]"><th className="py-1 font-normal">日期</th><th className="font-normal">進站次數</th><th className="font-normal">人數</th><th className="font-normal">商品頁瀏覽</th></tr></thead>
                <tbody>{series.map((d) => <tr key={d.day} className="border-t border-[#f0ebe2]"><td className="py-1">{d.day.slice(5).replace('-', '/')}</td><td>{d.visits}</td><td>{d.visitors}</td><td>{d.views}</td></tr>)}</tbody>
              </table>
            </details>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
            <div className="rounded-2xl border border-[#e5ded4] bg-white p-4">
              <p className="text-sm font-semibold">流量來源</p>
              {!stats.sources.length ? <p className="py-4 text-center text-sm text-[#a99e8f]">還沒有資料</p> : (
                <ul className="mt-3 space-y-2.5">
                  {stats.sources.map((s) => (
                    <li key={s.source}>
                      <div className="flex justify-between text-sm"><span className="truncate">{SOURCE_LABEL[s.source] ?? s.source}</span><span className="shrink-0 tabular-nums">{s.visits} · {pct(s.visits, t.visits)}</span></div>
                      <div className="mt-1 h-1.5 rounded-full bg-[#f3ede4]"><div className="h-full rounded-full" style={{ width: `${(s.visits / Math.max(1, t.visits)) * 100}%`, background: BAR }} /></div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-2xl border border-[#e5ded4] bg-white p-4">
              <p className="text-sm font-semibold">商品點擊與觀看</p>
              <p className="text-xs text-[#a99e8f]">觀看率 = 看過這個商品的人 ÷ 進站人數</p>
              {!stats.products.length ? <p className="py-4 text-center text-sm text-[#a99e8f]">還沒有資料</p> : (
                <div className="mt-3 divide-y divide-[#f0ebe2]">
                  <div className="hidden grid-cols-[1fr_repeat(4,4.5rem)] gap-2 pb-2 text-xs text-[#a99e8f] sm:grid"><span>商品</span><span className="text-right">點擊</span><span className="text-right">瀏覽</span><span className="text-right">加購物車</span><span className="text-right">觀看率</span></div>
                  {stats.products.map((p) => (
                    <div key={p.product_id} className="grid grid-cols-[2.5rem_1fr] items-center gap-x-3 gap-y-1 py-2.5 sm:grid-cols-[2.5rem_1fr_repeat(4,4.5rem)]">
                      {p.image ? <img src={p.image} alt="" className="h-10 w-10 rounded-lg object-cover" /> : <span className="h-10 w-10 rounded-lg bg-[#f3ede4]" />}
                      <p className="min-w-0 truncate text-sm">{p.name}</p>
                      <p className="col-span-2 text-xs text-[#8a7f72] sm:hidden">點擊 {p.clicks} · 瀏覽 {p.views} · 加購物車 {p.carts} · 觀看率 {pct(p.viewers, t.visitors)}</p>
                      <span className="hidden text-right text-sm tabular-nums sm:block">{p.clicks}</span>
                      <span className="hidden text-right text-sm tabular-nums sm:block">{p.views}</span>
                      <span className="hidden text-right text-sm tabular-nums sm:block">{p.carts}</span>
                      <span className="hidden text-right text-sm font-semibold tabular-nums sm:block">{pct(p.viewers, t.visitors)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl border border-[#e5ded4] bg-white p-4">
      <p className="text-xs text-[#8a7f72]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-[11px] leading-4 text-[#a99e8f]">{note}</p>
    </div>
  );
}
