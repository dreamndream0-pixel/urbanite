'use client';

import { useEffect, useState } from 'react';
import { CheckCheck, PackageCheck } from 'lucide-react';
import { uiConfirm } from '@/lib/ui-dialog';
import type { Order } from '@/lib/types';

export default function ManualFulfillmentAction({ order, action, onUpdated }: { order: Order; action: 'arrived' | 'complete'; onUpdated: (order: Order) => void }) {
  const [allowedKey, setAllowedKey] = useState<string | null>(null);
  const key = [order.id, order.fulfillment_status, order.order_status, order.cancel_status, order.payment_status, action].join(':');
  const allowed = allowedKey === key;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const abort = new AbortController();
    fetch(`/api/orders/${order.id}/manual-fulfillment`, { signal: abort.signal, cache: 'no-store' })
      .then(async r => { const data = r.ok ? await r.json() : null; if (!abort.signal.aborted) setAllowedKey(data?.[action] === true ? key : null); })
      .catch(() => {});
    return () => abort.abort();
  }, [order.id, key, action]);
  async function submit() {
    if (busy) return;
    const message = action === 'complete' ? '確認已收到商品，並完成這筆訂單？此操作不會變更付款紀錄。' : '確認商品已到貨／到達取貨門市？此操作不會標記已收款。';
    if (!(await uiConfirm(message))) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/orders/${order.id}/manual-fulfillment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? '更新失敗');
      setAllowedKey(null); onUpdated({ ...order, ...data.order });
    } catch (e) { setError(e instanceof Error ? e.message : '連線失敗，請重試'); }
    finally { setBusy(false); }
  }
  if (!allowed && !error) return null;
  return <div className="flex max-w-full flex-col gap-1">
    {allowed && <button type="button" disabled={busy} onClick={submit} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-emerald-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
      {action === 'complete' ? <CheckCheck size={16} /> : <PackageCheck size={16} />}{busy ? '更新中…' : action === 'complete' ? '確認收貨／完成訂單' : '已到貨'}
    </button>}
    {error && <p role="alert" className="max-w-xs text-sm text-red-700">{error}</p>}
  </div>;
}
