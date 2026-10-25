'use client';

import { useState } from 'react';

type Pack = { key: string; amount: number; points: number; label: string; note?: string };
type Entry = { delta: number; reason: string; created_at: string };

const REASONS: Record<string, string> = { purchase: '購買點數', trial: '新會員試用', generate: '生成影片', refund: '生成失敗退點' };
const date = (iso: string) => new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function PointsClient({ balance, ledger, packages, result, studioUrl, studioHome }: { balance: number; ledger: Entry[]; packages: Pack[]; result: string; studioUrl: string; studioHome: string }) {
  const [selected, setSelected] = useState(packages[1]?.key ?? packages[0]?.key);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function pay() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/video-points/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ package: selected }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '無法建立付款');
      // 送往藍新付款頁
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = data.action;
      for (const [k, v] of Object.entries(data.params as Record<string, string>)) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = k;
        input.value = v;
        form.appendChild(input);
      }
      document.body.appendChild(form);
      form.submit();
    } catch (e) {
      setError(e instanceof Error ? e.message : '無法建立付款');
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      {result === 'success' ? (
        <p className="mb-6 rounded-xl border border-[#cfe9d6] bg-[#f3fbf5] px-4 py-3 text-sm text-[#1f5a33]">付款完成,點數已經入帳。</p>
      ) : result === 'pending' ? (
        <p className="mb-6 rounded-xl border border-[#e5ded4] bg-white px-4 py-3 text-sm text-[#6b6156]">付款結果仍在確認中,請勿重複付款。通常幾分鐘內會入帳,重新整理這頁就能看到。</p>
      ) : result === 'fail' ? (
        <p className="mb-6 rounded-xl border border-[#e8c4c4] bg-[#fbf3f0] px-4 py-3 text-sm text-[#a33a2b]">付款沒有完成。如果已經扣款,通常幾分鐘內會自動入帳,重新整理這頁就能看到。</p>
      ) : result === 'unavailable' ? (
        <p className="mb-6 rounded-xl border border-[#e5ded4] bg-white px-4 py-3 text-sm text-[#6b6156]">影片網站暫時無法連線,請稍後再試。</p>
      ) : null}

      <h1 className="font-serif-tc text-2xl font-bold tracking-[0.06em]">影片點數</h1>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#e5ded4] bg-white p-5">
        <div>
          <p className="text-xs text-[#8a7f72]">目前點數</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{balance.toLocaleString()} <span className="text-base font-normal text-[#8a7f72]">點</span></p>
        </div>
        <a href={studioUrl} className="rounded-full bg-[#1f1b19] px-5 py-2.5 text-sm text-white">前往 Seedance Studio 生成影片 ↗</a>
      </div>

      <section className="mt-6 rounded-2xl border border-[#e5ded4] bg-white p-5">
        <p className="text-base font-semibold">購買點數</p>
        <p className="mt-1 text-xs text-[#a99e8f]">1 點約 NT$1。生成時依秒數與解析度扣點:480p 每秒 7 點、720p 每秒 15 點;含參考影片或完整延長時,480p 每秒 28 點、720p 每秒 62 點。生成失敗會自動退點。點數不會過期。</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {packages.map((p) => (
            <button key={p.key} type="button" onClick={() => setSelected(p.key)} aria-pressed={selected === p.key}
              className={`rounded-xl border p-4 text-left transition ${selected === p.key ? 'border-[#1f1b19] bg-[#f6f2ec]' : 'border-[#e5ded4] bg-white hover:border-[#c9bdb0]'}`}>
              <p className="text-lg font-semibold">{p.label}</p>
              <p className="mt-1 text-sm text-[#6b6156]">NT$ {p.amount.toLocaleString()}</p>
              {p.note ? <p className="mt-2 text-xs text-[#9c4c31]">{p.note}</p> : null}
            </button>
          ))}
        </div>
        {error ? <p className="mt-4 rounded-lg bg-[#fbf3f0] px-3 py-2 text-sm text-[#a33a2b]">{error}</p> : null}
        <button type="button" onClick={pay} disabled={busy || !selected} className="mt-5 w-full rounded-full bg-[#1f1b19] py-3 text-sm text-white disabled:opacity-50">
          {busy ? '正在前往付款…' : '前往付款'}
        </button>
        <p className="mt-2 text-center text-xs text-[#a99e8f]">由藍新金流處理付款,本站不會取得你的卡號。</p>
      </section>

      <section className="mt-6 rounded-2xl border border-[#e5ded4] bg-white p-5">
        <p className="text-base font-semibold">點數紀錄</p>
        {ledger.length ? (
          <ul className="mt-3 divide-y divide-[#efe8df]">
            {ledger.map((e, i) => (
              <li key={i} className="flex justify-between py-2.5 text-sm">
                <span>{REASONS[e.reason] ?? e.reason}<span className="ml-2 text-xs text-[#a99e8f]">{date(e.created_at)}</span></span>
                <span className={`tabular-nums ${e.delta > 0 ? 'text-[#1f5a33]' : 'text-[#6b6156]'}`}>{e.delta > 0 ? '+' : ''}{e.delta}</span>
              </li>
            ))}
          </ul>
        ) : <p className="mt-3 text-sm text-[#8a7f72]">還沒有點數紀錄。</p>}
      </section>
      <p className="mt-6 text-center text-xs text-[#a99e8f]"><a href={studioHome} className="underline underline-offset-2">{studioHome.replace('https://', '')}</a></p>
    </div>
  );
}
