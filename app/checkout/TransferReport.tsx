'use client';

import { useState } from 'react';

// 轉帳匯款:訂單完成頁直接填匯款帳號後五碼,記錄到訂單(店家在後台訂單看得到,核對後標記已付款)
export default function TransferReport({ orderId }: { orderId: string }) {
  const [last5, setLast5] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');
  const [error, setError] = useState('');
  async function submit() {
    if (!/^\d{5}$/.test(last5)) { setError('請輸入 5 位數字'); return; }
    setState('sending'); setError('');
    try {
      const form = new FormData();
      form.set('last5', last5);
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/payment-proof`, { method: 'POST', body: form });
      const data = await res.json().catch(() => null);
      if (!res.ok) { setError(data?.error ?? '送出失敗，請稍後再試'); setState('idle'); return; }
      setState('done');
    } catch { setError('連線發生問題，請稍後再試'); setState('idle'); }
  }
  if (state === 'done') {
    return <p className="mx-auto mt-4 max-w-sm rounded-xl bg-[#eef8f1] px-4 py-3 text-sm text-[#1f5a35]">已收到匯款後五碼 {last5},店家核對後會更新付款狀態。</p>;
  }
  return (
    <div className="mx-auto mt-4 max-w-sm rounded-xl border border-[var(--c-border)] bg-white p-4 text-left">
      <p className="text-sm font-semibold">已完成轉帳?填寫匯款帳號後五碼</p>
      <p className="mt-0.5 text-xs text-[var(--c-muted)]">方便店家核對款項,也可以之後再到「我的訂單」回報。</p>
      <div className="mt-3 flex gap-2">
        <input value={last5} onChange={(e) => setLast5(e.target.value.replace(/\D/g, '').slice(0, 5))} inputMode="numeric" autoComplete="off" placeholder="後五碼,例:12345" aria-label="匯款帳號後五碼"
          className="min-w-0 flex-1 rounded-lg border border-[var(--c-border)] px-3 py-2.5 text-base tracking-widest" />
        <button type="button" disabled={state === 'sending'} onClick={() => void submit()} className="shrink-0 rounded-lg bg-[var(--c-button)] px-4 py-2.5 text-sm font-semibold text-[var(--c-button-text)] disabled:opacity-50">{state === 'sending' ? '送出中…' : '送出'}</button>
      </div>
      {error ? <p role="alert" className="mt-2 text-xs text-[var(--c-sale)]">{error}</p> : null}
    </div>
  );
}
