'use client';

import { useEffect, useState } from 'react';
import { Card, Empty, Pills } from './ui';

type Row = { key: string; label: string; count: number };
type Stats = {
  days: number;
  totals: { follow: number; unfollow: number; message: number; click: number; notify: number; broadcast: number; bound: number; members: number; followers: number | null; blocks: number | null };
  daily: { day: string; follow: number; unfollow: number; message: number }[];
  rules: Row[];
  builtins: Row[];
  clicks: Row[];
};

// LINE 機器人數據
export default function StatsPanel() {
  const [days, setDays] = useState<'7' | '30' | '90'>('30');
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/line-bot/stats?days=${days}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => alive && setStats(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [days]);

  if (!stats) return <p className="rounded-xl border border-[#e5ded4] bg-white p-6 text-sm text-[#8a7f72]">讀取中…</p>;
  const t = stats.totals;
  const bindRate = t.members ? Math.round((t.bound / t.members) * 100) : 0;
  const max = Math.max(1, ...stats.daily.map((d) => Math.max(d.message, d.follow)));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Pills value={days} options={[{ key: '7', label: '7 天' }, { key: '30', label: '30 天' }, { key: '90', label: '90 天' }]} onChange={setDays} />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Box label="好友人數" value={t.followers === null ? '—' : String(t.followers - (t.blocks ?? 0))} sub={t.blocks ? `封鎖 ${t.blocks}` : 'LINE 每日更新'} />
        <Box label="已綁定會員" value={String(t.bound)} sub={`會員綁定率 ${bindRate}%`} />
        <Box label="新加好友" value={String(t.follow)} sub={`封鎖 ${t.unfollow}`} />
        <Box label="收到訊息" value={String(t.message)} sub={`按鈕點擊 ${t.click}`} />
      </div>

      <Card title="每日趨勢" desc="收到訊息(深色)與新加好友(綠色)">
        <div className="flex h-36 items-end gap-[2px]">
          {stats.daily.map((d) => (
            <div key={d.day} className="group relative flex h-full flex-1 flex-col justify-end gap-[1px]" title={`${d.day}:訊息 ${d.message}・加好友 ${d.follow}・封鎖 ${d.unfollow}`}>
              <div className="w-full rounded-t-sm bg-[#1f1b19]/80" style={{ height: `${(d.message / max) * 100}%` }} />
              <div className="w-full rounded-t-sm bg-[#3fb371]" style={{ height: `${(d.follow / max) * 100}%` }} />
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-[10px] text-[#a99e8f]">
          <span>{stats.daily[0]?.day.slice(5)}</span>
          <span>{stats.daily[stats.daily.length - 1]?.day.slice(5)}</span>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Ranking title="自動回覆觸發" rows={stats.rules} empty="還沒有觸發紀錄" />
        <Ranking title="內建查詢使用" rows={stats.builtins} empty="還沒有人查詢" />
        <Ranking title="按鈕點擊" rows={stats.clicks} empty="還沒有點擊紀錄" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Box label="訂單通知已送出" value={String(t.notify)} sub={`近 ${stats.days} 天`} />
        <Box label="推播次數" value={String(t.broadcast)} sub={`近 ${stats.days} 天`} />
      </div>
    </div>
  );
}

function Box({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-[#e5ded4] bg-white px-4 py-3">
      <p className="text-[11px] text-[#8a7f72]">{label}</p>
      <p className="mt-0.5 text-xl font-semibold text-[#1f1b19]">{value}</p>
      {sub ? <p className="text-[11px] text-[#a99e8f]">{sub}</p> : null}
    </div>
  );
}

function Ranking({ title, rows, empty }: { title: string; rows: Row[]; empty: string }) {
  const top = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Card title={title}>
      {rows.length === 0 ? (
        <Empty>{empty}</Empty>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.key}>
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="min-w-0 truncate text-[#1f1b19]">{r.label}</span>
                <span className="shrink-0 text-[#8a7f72]">{r.count}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-[#f3eee7]">
                <div className="h-full rounded-full bg-[#1f1b19]/70" style={{ width: `${(r.count / top) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
