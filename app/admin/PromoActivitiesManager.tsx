'use client';

import { useEffect, useState } from 'react';
import { uiAlert, uiConfirm } from '@/lib/ui-dialog';
import { uiToast } from '@/lib/ui-toast';
import { MAX_PROMO_NOTICES, resolvePromoNotices, type PromoNotice } from '@/lib/promo-notices';

// 促銷管理 → 活動管理:商品頁價格上方的促銷文字,可新增、編輯、開關、排序
export default function PromoActivitiesManager() {
  const [notices, setNotices] = useState<PromoNotice[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetch('/api/settings', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setNotices(resolvePromoNotices(data?.promo_notices)))
      .catch(() => setNotices(resolvePromoNotices(null)));
  }, []);

  const update = (next: PromoNotice[]) => { setNotices(next); setDirty(true); };
  const patch = (id: string, p: Partial<PromoNotice>) => update((notices ?? []).map((n) => (n.id === id ? { ...n, ...p } : n)));
  const move = (i: number, dir: -1 | 1) => {
    const list = [...(notices ?? [])];
    if (!list[i + dir]) return;
    [list[i], list[i + dir]] = [list[i + dir], list[i]];
    update(list);
  };

  async function save() {
    const list = (notices ?? []).map((n) => ({ ...n, text: n.text.trim() })).filter((n) => n.text);
    setSaving(true);
    try {
      const res = await fetch('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ promo_notices: list }) });
      const data = await res.json().catch(() => null);
      if (!res.ok) return void uiAlert(data?.error ?? '儲存失敗');
      setNotices(resolvePromoNotices(data?.promo_notices ?? list));
      setDirty(false);
      uiToast('已儲存活動文字');
    } finally {
      setSaving(false);
    }
  }

  if (!notices) return <p className="py-10 text-center text-sm text-[#8a7f72]">載入中…</p>;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#e5ded4] bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="font-serif-tc text-xl font-bold">活動管理</h3>
            <p className="mt-1 text-xs leading-5 text-[#8a7f72]">設定商品頁價格上方的促銷文字(例如免運門檻、滿額贈)。開啟的活動會依順序顯示在每個商品頁。</p>
          </div>
          <button
            type="button"
            disabled={notices.length >= MAX_PROMO_NOTICES}
            onClick={() => update([...notices, { id: `notice-${Date.now().toString(36)}`, text: '', active: true }])}
            className="inline-flex h-10 items-center rounded-full bg-[#414a33] px-5 text-sm font-semibold text-white disabled:opacity-40"
          >
            + 新增活動
          </button>
        </div>
        <p className="mt-3 rounded-lg bg-[#faf7f2] px-3 py-2 text-xs leading-5 text-[#8a7f72]">實際的免運門檻目前固定為 NT$2,000(結帳時計算),修改這裡的文字不會改變運費計算。</p>
      </div>

      {notices.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[#e5ded4] bg-white py-10 text-center text-sm text-[#a99e8f]">目前沒有活動文字,商品頁不會顯示促銷提示。</p>
      ) : (
        <div className="space-y-2">
          {notices.map((n, i) => (
            <div key={n.id} className={`rounded-2xl border bg-white p-3 sm:p-4 ${n.active ? 'border-[#e5ded4]' : 'border-dashed border-[#e5ded4] opacity-70'}`}>
              <textarea
                value={n.text}
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
                <span className="text-[#b3a897]">{n.text.length}/120</span>
                <span className="ml-auto flex gap-1">
                  <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="rounded border border-[#d7c9bd] px-2.5 py-1 disabled:opacity-30">上</button>
                  <button type="button" disabled={i === notices.length - 1} onClick={() => move(i, 1)} className="rounded border border-[#d7c9bd] px-2.5 py-1 disabled:opacity-30">下</button>
                  <button
                    type="button"
                    onClick={async () => { if (await uiConfirm('刪除這則活動文字?', { danger: true })) update(notices.filter((x) => x.id !== n.id)); }}
                    className="px-2 py-1 font-semibold text-[#c0392b]"
                  >
                    刪除
                  </button>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="sticky bottom-0 z-10 flex items-center justify-end gap-3 rounded-xl border border-[#e5ded4] bg-white/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur">
        <span className="min-w-0 flex-1 truncate text-xs text-[#8a7f72]">{dirty ? '有尚未儲存的變更' : '已是最新'}</span>
        <button type="button" disabled={saving || !dirty} onClick={() => void save()} className="rounded-full bg-[#1f1b19] px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
          {saving ? '儲存中…' : '儲存活動'}
        </button>
      </div>
    </div>
  );
}
