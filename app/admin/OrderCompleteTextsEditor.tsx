'use client';

import { useEffect, useState } from 'react';
import { uiAlert } from '@/lib/ui-dialog';
import { DEFAULT_ORDER_COMPLETE_TEXTS, ORDER_COMPLETE_FIELDS, resolveOrderCompleteTexts, type OrderCompleteTexts } from '@/lib/order-complete-texts';

// 系統設定 → 結帳設定 → 訂單完成頁文字(顧客送出訂單後看到的那一頁)
export default function OrderCompleteTextsEditor() {
  const [texts, setTexts] = useState<OrderCompleteTexts | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch('/api/settings', { cache: 'no-store' }).then((r) => r.json()).then((d) => setTexts(resolveOrderCompleteTexts(d?.order_complete_texts))).catch(() => setTexts({ ...DEFAULT_ORDER_COMPLETE_TEXTS }));
  }, []);
  async function save() {
    if (!texts) return;
    setBusy(true);
    try {
      const res = await fetch('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_complete_texts: texts }) });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? '儲存失敗');
      void uiAlert('已儲存訂單完成頁文字');
    } catch (e) { void uiAlert(e instanceof Error ? e.message : '儲存失敗'); }
    finally { setBusy(false); }
  }
  if (!texts) return null;
  return (
    <div className="rounded-2xl border border-[#e5ded4] bg-white p-5">
      <h3 className="font-semibold">訂單完成頁文字</h3>
      <p className="mt-1 text-sm text-[#8a7f72]">顧客送出訂單後看到的頁面。清空的欄位會用預設文字。</p>
      <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-[#8a7f72]">
        <li>轉帳的銀行與帳號:到「金流設定」的收款資訊修改</li>
        <li>LINE ID 與加好友連結:到「頁尾資訊 → 結帳頁 LINE 設定」修改(兩欄都空白時不顯示 LINE 區塊)</li>
      </ul>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {ORDER_COMPLETE_FIELDS.map((f) => (
          <label key={f.key} className={`block text-xs text-[#8a7f72] ${f.long ? 'sm:col-span-2' : ''}`}>{f.label}
            {f.long
              ? <textarea rows={2} maxLength={f.max} value={texts[f.key]} placeholder={DEFAULT_ORDER_COMPLETE_TEXTS[f.key]} onChange={(e) => setTexts({ ...texts, [f.key]: e.target.value })} className="mt-1 w-full rounded-lg border border-[#e5ded4] bg-white px-3 py-2 text-sm text-[#1f1b19]" />
              : <input maxLength={f.max} value={texts[f.key]} placeholder={DEFAULT_ORDER_COMPLETE_TEXTS[f.key]} onChange={(e) => setTexts({ ...texts, [f.key]: e.target.value })} className="mt-1 w-full rounded-lg border border-[#e5ded4] bg-white px-3 py-2 text-sm text-[#1f1b19]" />}
          </label>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => setTexts({ ...DEFAULT_ORDER_COMPLETE_TEXTS })} className="rounded-full border border-[#d7c9bd] bg-white px-4 py-2 text-sm">全部改回預設</button>
        <button type="button" disabled={busy} onClick={() => void save()} className="rounded-full bg-[#1f1b19] px-5 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy ? '儲存中…' : '儲存文字'}</button>
      </div>
    </div>
  );
}
