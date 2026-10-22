'use client';

import { useEffect, useState } from 'react';
import { uiConfirm } from '@/lib/ui-dialog';
import { uiToast } from '@/lib/ui-toast';
import { MAX_PROMO_NOTICES, resolvePromoNotices, type PromoNotice } from '@/lib/promo-notices';
import { ArrowDown, ArrowUp, Plus, Save, Trash2, Truck } from 'lucide-react';
import { FREE_SHIPPING_THRESHOLD, MAX_FREE_SHIPPING_THRESHOLD, freeShippingNotice, isFreeShippingThreshold, resolveFreeShippingThreshold } from '@/lib/shipping';

// 促銷管理 → 活動管理:商品頁價格上方的促銷文字,可新增、編輯、開關、排序
export default function PromoActivitiesManager() {
  const [notices, setNotices] = useState<PromoNotice[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [threshold, setThreshold] = useState(String(FREE_SHIPPING_THRESHOLD));
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    fetch('/api/settings', { cache: 'no-store' })
      .then((res) => { if (!res.ok) throw new Error('無法載入活動設定，請重新載入'); return res.json(); })
      .then((data) => {
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('無法載入活動設定');
        if (!active) return;
        const amount = resolveFreeShippingThreshold(data);
        setNotices(resolvePromoNotices(data?.promo_notices));
        setEnabled(amount !== null);
        setThreshold(String(amount ?? FREE_SHIPPING_THRESHOLD));
      })
      .catch(() => { if (active) setLoadError('無法載入活動設定，請重新載入'); });
    return () => { active = false; };
  }, [loadAttempt]);

  const amount = enabled ? Number(threshold) : null;
  const validThreshold = !enabled || (threshold.trim() !== '' && isFreeShippingThreshold(amount));
  const shippingText = validThreshold ? freeShippingNotice({ free_shipping_threshold: amount }) : '';

  const update = (next: PromoNotice[]) => { setNotices(next); setDirty(true); };
  const patch = (id: string, p: Partial<PromoNotice>) => update((notices ?? []).map((n) => (n.id === id ? { ...n, ...p } : n)));
  const move = (i: number, dir: -1 | 1) => {
    const list = [...(notices ?? [])];
    if (!list[i + dir]) return;
    [list[i], list[i + dir]] = [list[i + dir], list[i]];
    update(list);
  };

  async function save() {
    if (saving || !notices) return;
    if (!validThreshold) { setError('請輸入 0 至 1,000,000,000 的整數免運門檻'); return; }
    const list = notices.map((n) => ({ ...n, text: n.id === 'free-shipping' && shippingText ? shippingText : n.text.trim() })).filter((n) => n.text);
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ promo_notices: list, free_shipping_threshold: amount }) });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? '儲存失敗');
      if (data?.free_shipping_threshold !== amount) throw new Error('免運門檻未儲存，請重新載入後再試');
      setNotices(resolvePromoNotices(data?.promo_notices ?? list));
      setDirty(false);
      uiToast('已儲存活動與免運設定');
    } catch (error) {
      setError(error instanceof Error ? error.message : '儲存失敗，請稍後再試');
    } finally {
      setSaving(false);
    }
  }

  if (loadError) return <div className="space-y-3 py-10 text-center text-sm"><p role="alert">{loadError}</p><button type="button" onClick={() => { setLoadError(''); setLoadAttempt((n) => n + 1); }} className="rounded-lg border px-4 py-2">重新載入</button></div>;
  if (!notices) return <p className="py-10 text-center text-sm text-[#8a7f72]">載入中…</p>;
  return (
    <div className="space-y-4">
      <fieldset disabled={saving} className="min-w-0 space-y-4 disabled:opacity-60">
      <div className="rounded-2xl border border-[#e5ded4] bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="font-serif-tc text-xl font-bold">活動管理</h3>
          </div>
          <button
            type="button"
            disabled={notices.length >= MAX_PROMO_NOTICES}
            onClick={() => update([...notices, { id: `notice-${Date.now().toString(36)}`, text: '', active: true }])}
            className="inline-flex h-10 items-center rounded-full bg-[#414a33] px-5 text-sm font-semibold text-white disabled:opacity-40"
          >
            <Plus size={16} className="mr-1" />新增活動
          </button>
        </div>
        <section aria-labelledby="free-shipping-title" className="mt-4 border-t border-[#e5ded4] pt-4">
          <div className="flex items-center justify-between gap-3">
            <h4 id="free-shipping-title" className="flex items-center gap-2 font-semibold"><Truck size={18} />全店免運門檻</h4>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" role="switch" checked={enabled} onChange={(e) => { setEnabled(e.target.checked); setDirty(true); }} aria-label="啟用全店滿額免運" className="h-4 w-4" />啟用</label>
          </div>
          <label className="mt-3 block text-sm">商品小計滿
            <span className="mt-1 flex max-w-sm items-center gap-2"><span>NT$</span><input aria-label="全店免運金額" type="number" inputMode="numeric" min={0} max={MAX_FREE_SHIPPING_THRESHOLD} step={1} disabled={!enabled} value={threshold} onChange={(e) => { setThreshold(e.target.value); setDirty(true); }} aria-invalid={!validThreshold} className="min-w-0 flex-1 rounded-lg border border-[#e5ded4] bg-white px-3 py-2 text-base disabled:bg-[#f5f3ef]" /><span>免運</span></span>
          </label>
          <p className="mt-2 text-xs leading-5 text-[#8a7f72]">不含運費，優惠券與回饋金折抵前計算。填 0 為全店免運；停用後仍保留商品免運及免運券規則。</p>
          <p role="status" className="mt-2 text-sm font-medium">{!enabled ? '全店滿額免運已停用' : validThreshold ? shippingText : '請輸入有效金額'}</p>
        </section>
      </div>

      {notices.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[#e5ded4] bg-white py-10 text-center text-sm text-[#a99e8f]">目前沒有活動文字,商品頁不會顯示促銷提示。</p>
      ) : (
        <div className="space-y-2">
          {notices.map((n, i) => (
            <div key={n.id} className={`rounded-2xl border bg-white p-3 sm:p-4 ${n.active ? 'border-[#e5ded4]' : 'border-dashed border-[#e5ded4] opacity-70'}`}>
              <textarea
                aria-label={n.id === 'free-shipping' ? '免運活動提示' : `活動文字 ${i + 1}`}
                readOnly={n.id === 'free-shipping'}
                value={n.id === 'free-shipping' ? shippingText || (enabled ? '請輸入有效免運門檻' : '全店滿額免運已停用') : n.text}
                onChange={(e) => patch(n.id, { text: e.target.value.slice(0, 120) })}
                rows={2}
                placeholder="例如:全店消費滿 $2,000 免運費"
                className="w-full resize-none rounded-lg border border-[#e5ded4] px-3 py-2 text-sm leading-6"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => patch(n.id, { active: !n.active })}
                  className={`rounded-full px-3 py-1.5 font-semibold ${n.active ? 'bg-[#e9f7ee] text-[#1f7a44]' : 'bg-[#efe9e0] text-[#8a7f72]'}`}
                >
                  {n.active ? '顯示中' : '已關閉'}
                </button>
                <span className="text-[#b3a897]">{n.id === 'free-shipping' ? '依免運門檻更新' : `${n.text.length}/120`}</span>
                <span className="ml-auto flex gap-1">
                  <button type="button" aria-label="活動上移" title="活動上移" disabled={i === 0} onClick={() => move(i, -1)} className="rounded border border-[#d7c9bd] p-2 disabled:opacity-30"><ArrowUp size={15} /></button>
                  <button type="button" aria-label="活動下移" title="活動下移" disabled={i === notices.length - 1} onClick={() => move(i, 1)} className="rounded border border-[#d7c9bd] p-2 disabled:opacity-30"><ArrowDown size={15} /></button>
                  <button
                    type="button"
                    aria-label="刪除活動" title="刪除活動"
                    onClick={async () => { if (await uiConfirm('刪除這則活動文字?', { danger: true })) update(notices.filter((x) => x.id !== n.id)); }}
                    className="px-2 py-1 font-semibold text-[#c0392b]"
                  >
                    <Trash2 size={15} />
                  </button>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      </fieldset>
      {error ? <p role="alert" className="text-sm text-[#b33a32]">{error}</p> : null}
      <div className="sticky bottom-0 z-10 flex items-center justify-end gap-3 rounded-xl border border-[#e5ded4] bg-white/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur">
        <span className="min-w-0 flex-1 truncate text-xs text-[#8a7f72]">{dirty ? '有尚未儲存的變更' : '已是最新'}</span>
        <button type="button" disabled={saving || !dirty} onClick={() => void save()} className="rounded-full bg-[#1f1b19] px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
          <Save size={15} className="mr-1 inline" />{saving ? '儲存中…' : '儲存活動'}
        </button>
      </div>
    </div>
  );
}
