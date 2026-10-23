'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import ShopHeader from '@/app/components/ShopHeader';
import OrderSummaryView from '@/app/components/OrderSummaryView';
import LineContactCard from '@/app/components/LineContactCard';
import TransferReport from '@/app/checkout/TransferReport';
import type { PublicOrder } from '@/lib/order-public';

export default function OrderLookupClient() {
  const params = useSearchParams();
  const [no, setNo] = useState(() => (params.get('no') ?? '').toUpperCase());
  const [contact, setContact] = useState('');
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // 從 Email 連結進來、又是下單的那台裝置:直接顯示,不用再輸入
  useEffect(() => {
    const preset = params.get('no');
    if (!preset) return;
    let alive = true;
    fetch(`/api/orders/lookup?no=${encodeURIComponent(preset)}`, { cache: 'no-store' })
      .then(async (r) => (r.ok ? (await r.json()) as PublicOrder : null))
      .then((d) => { if (alive && d) setOrder(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, [params]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!no.trim() || !contact.trim()) { setError('請輸入訂單編號與下單時的手機或 Email'); return; }
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/orders/lookup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_no: no, contact }) });
      const data = await res.json().catch(() => null);
      if (!res.ok) { setError(data?.error ?? '查詢失敗，請稍後再試'); return; }
      setOrder(data as PublicOrder);
    } catch { setError('連線發生問題，請稍後再試'); }
    finally { setBusy(false); }
  }

  const canReport = order && !order.paid && /轉帳|匯款/.test(order.payment_method) && order.status !== '取消';
  return (
    <main className="min-h-screen bg-[var(--c-bg)] text-[var(--c-text)]">
      <ShopHeader logoUrl="" leftLabel="← 回商店" />
      <div className="mx-auto max-w-xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-wide">訪客查詢訂單</h1>
        {!order ? (
          <form onSubmit={submit} className="mt-6 space-y-3 rounded-2xl bg-[var(--c-surface)] p-6 shadow-sm">
            <p className="text-sm text-[var(--c-muted)]">輸入訂單編號,以及下單時填寫的手機號碼或 Email。訂單編號在訂單成立頁和訂單確認信裡。</p>
            <label className="block text-sm">訂單編號
              <input value={no} onChange={(e) => setNo(e.target.value.toUpperCase().replace(/\s/g, ''))} placeholder="例:UR202610230001" autoComplete="off" className="mt-1 w-full rounded-lg border border-[var(--c-border)] bg-white px-4 py-3 text-base tracking-wider" />
            </label>
            <label className="block text-sm">手機號碼或 Email
              <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="0912345678 或 you@example.com" autoComplete="tel" className="mt-1 w-full rounded-lg border border-[var(--c-border)] bg-white px-4 py-3 text-base" />
            </label>
            {error ? <p role="alert" className="text-sm text-[var(--c-sale)]">{error}</p> : null}
            <button type="submit" disabled={busy} className="w-full rounded-full bg-[var(--c-button)] py-3 font-semibold text-[var(--c-button-text)] disabled:opacity-50">{busy ? '查詢中…' : '查詢訂單'}</button>
            <p className="text-center text-xs text-[var(--c-muted)]">會員請 <Link href="/account?tab=orders" className="underline">登入</Link> 後到「我的訂單」查看</p>
          </form>
        ) : (
          <div className="mt-6 space-y-4 rounded-2xl bg-[var(--c-surface)] p-5 shadow-sm sm:p-6">
            <OrderSummaryView order={order} />
            {canReport ? <TransferReport orderId={order.id} /> : null}
            <button type="button" onClick={() => { setOrder(null); setContact(''); }} className="w-full rounded-full border border-[var(--c-border)] py-2.5 text-sm">查詢其他訂單</button>
          </div>
        )}
        <LineContactCard />
      </div>
    </main>
  );
}
