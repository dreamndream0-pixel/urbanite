'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PLAN_FEATURES, PLAN_PRICES, type CardPeriod, type CardPlanInfo } from '@/lib/card-plan';

type Payment = { order_no: string; period: string; amount: number; paid_at: string | null };

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' }) : '');

export default function UpgradeClient({ plan, payments, result }: { plan: CardPlanInfo; payments: Payment[]; result: string }) {
  const [period, setPeriod] = useState<CardPeriod>('year');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const renew = plan.pro && !plan.isAdmin;

  async function pay() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/card-plan/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ period }) });
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
        <p className="mb-6 rounded-xl border border-[#cfe9d6] bg-[#f3fbf5] px-4 py-3 text-sm text-[#1f5a33]">付款完成,Pro 已經開通。回到「我的名片」就能使用全部功能。</p>
      ) : result === 'fail' ? (
        <p className="mb-6 rounded-xl border border-[#e8c4c4] bg-[#fbf3f0] px-4 py-3 text-sm text-[#a33a2b]">付款沒有完成。如果已經扣款,通常幾分鐘內會自動開通,重新整理這頁就能看到。</p>
      ) : null}

      <h1 className="font-serif-tc text-2xl font-bold tracking-[0.06em]">名片方案</h1>
      <div className="mt-4 rounded-2xl border border-[#e5ded4] bg-white p-5">
        <p className="text-xs text-[#8a7f72]">目前方案</p>
        <p className="mt-1 text-xl font-semibold">{plan.pro ? 'Pro' : '免費'}</p>
        <p className="mt-1 text-sm text-[#6b6156]">
          {plan.isAdmin ? '管理員帳號,所有功能都已開啟。' : plan.pro ? `${date(plan.expiresAt)} 到期,到期後自動回到免費版。` : '升級 Pro 解鎖全部樣板、自訂樣式與完整數據。'}
        </p>
      </div>

      {!plan.isAdmin ? (
        <section className="mt-6 rounded-2xl border border-[#e5ded4] bg-white p-5">
          <p className="text-base font-semibold">{renew ? '續約 Pro' : '升級 Pro'}</p>
          <p className="mt-1 text-xs text-[#a99e8f]">預付制,不會自動扣款。{renew ? '續約天數會接在目前到期日之後。' : ''}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {(Object.keys(PLAN_PRICES) as CardPeriod[]).map((k) => {
              const p = PLAN_PRICES[k];
              const on = period === k;
              return (
                <button key={k} type="button" onClick={() => setPeriod(k)} className={`rounded-xl border p-4 text-left transition ${on ? 'border-[#1f1b19] bg-[#faf7f2]' : 'border-[#e5ded4] hover:border-[#1f1b19]/30'}`}>
                  <span className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{p.label}</span>
                    {k === 'year' ? <span className="rounded-full bg-[#702838] px-2 py-0.5 text-[10px] text-white">較划算</span> : null}
                  </span>
                  <span className="mt-1 block text-2xl font-bold">NT${p.amount}</span>
                  <span className="block text-xs text-[#8a7f72]">{p.note}</span>
                </button>
              );
            })}
          </div>
          {error ? <p className="mt-3 text-sm text-[#c0392b]">{error}</p> : null}
          <button type="button" onClick={pay} disabled={busy} className="mt-5 w-full rounded-full bg-[#1f1b19] py-3 text-sm font-semibold text-white transition hover:bg-[#3a322e] disabled:opacity-50">
            {busy ? '前往付款頁…' : `付款 NT$${PLAN_PRICES[period].amount}`}
          </button>
          <p className="mt-2 text-center text-[11px] text-[#a99e8f]">付款由藍新金流處理,可用信用卡、ATM、超商代碼等方式</p>
        </section>
      ) : null}

      <section className="mt-6 overflow-hidden rounded-2xl border border-[#e5ded4] bg-white">
        <div className="grid grid-cols-[1.4fr_1fr_1fr] bg-[#faf7f2] px-4 py-2.5 text-xs font-semibold text-[#6b6156]">
          <span>功能</span>
          <span>免費</span>
          <span>Pro</span>
        </div>
        {PLAN_FEATURES.map((f) => (
          <div key={f.label} className="grid grid-cols-[1.4fr_1fr_1fr] border-t border-[#efe8dd] px-4 py-3 text-sm">
            <span>{f.label}</span>
            <span className="text-[#6b6156]">{f.free}</span>
            <span className="font-medium">{f.pro}</span>
          </div>
        ))}
      </section>

      {payments.length ? (
        <section className="mt-6 rounded-2xl border border-[#e5ded4] bg-white p-5">
          <p className="text-sm font-semibold">付款紀錄</p>
          <div className="mt-3 divide-y divide-[#f3eee7] text-sm">
            {payments.map((p) => (
              <div key={p.order_no} className="flex items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1 truncate text-[#6b6156]">{p.order_no}</span>
                <span>{PLAN_PRICES[p.period as CardPeriod]?.label ?? p.period}</span>
                <span className="w-20 text-right">NT${p.amount}</span>
                <span className="w-24 text-right text-xs text-[#a99e8f]">{date(p.paid_at)}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <p className="mt-8 text-center">
        <Link href="/mycard" className="text-sm text-[#6b6156] underline underline-offset-2">回到我的名片</Link>
      </p>
    </div>
  );
}
