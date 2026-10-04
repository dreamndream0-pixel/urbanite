'use client';

import { useEffect, useState } from 'react';
import { uiAlert, uiConfirm } from '@/lib/ui-dialog';

type Status = { bound: boolean; displayName: string; pictureUrl: string; boundAt: string | null; addFriendUrl: string; lineId: string };

// 會員中心:綁定官方 LINE(任何登入方式都可以),綁定後可在 LINE 查詢訂單、優惠券、購物金
export default function LineBindingCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/me/line', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setStatus(d))
      .catch(() => setStatus(null));
  }, []);

  async function unbind() {
    if (!(await uiConfirm('解除 LINE 綁定後,就無法在官方 LINE 查詢會員資料。確定解除?', { danger: true }))) return;
    setBusy(true);
    try {
      const res = await fetch('/api/me/line', { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error ?? '解除失敗');
      setStatus((s) => (s ? { ...s, bound: false, displayName: '', pictureUrl: '', boundAt: null } : s));
    } catch (e) {
      void uiAlert(e instanceof Error ? e.message : '解除失敗');
    } finally {
      setBusy(false);
    }
  }

  if (!status) return null;

  return (
    <section className="relative mt-10 border-l border-[var(--c-border)] pl-5 sm:pl-7">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="font-serif-tc text-sm font-bold text-[var(--c-brand)]">LINE</span>
          <h2 className="font-serif-tc text-2xl font-bold tracking-[0.08em]">LINE 綁定</h2>
        </div>
        <span className="hidden text-[10px] font-semibold tracking-[0.34em] text-[var(--c-text2)] sm:inline">CONNECT</span>
      </div>

      {status.bound ? (
        <div className="flex items-center gap-3 rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-4">
          {status.pictureUrl ? (
            <img src={status.pictureUrl} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
          ) : (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#06C755] text-xs font-bold text-white">LINE</span>
          )}
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <span className="truncate">{status.displayName || 'LINE 帳號'}</span>
              <span className="shrink-0 rounded-full bg-[#e9f7ee] px-2 py-0.5 text-[10px] font-semibold text-[#1f7a44]">已驗證</span>
            </p>
            <p className="mt-0.5 text-xs text-[var(--c-muted)]">
              {status.boundAt ? `${new Date(status.boundAt).toLocaleDateString('zh-TW')} 綁定・` : ''}可在官方 LINE 查詢訂單、優惠券、購物金
            </p>
          </div>
          <button type="button" onClick={unbind} disabled={busy} className="shrink-0 text-xs text-[var(--c-muted)] underline-offset-2 hover:underline disabled:opacity-50">
            解除綁定
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)] p-4">
          <p className="text-sm leading-6 text-[var(--c-text2)]">綁定官方 LINE 後,不管用哪種方式登入,都能直接在 LINE 查詢訂單進度、優惠券與購物金。</p>
          <ol className="mt-3 space-y-1.5 text-sm text-[var(--c-text)]">
            <li>1. 加入 Urbanite 官方 LINE{status.lineId ? `(${status.lineId})` : ''}</li>
            <li>2. 在 LINE 聊天室傳送「綁定」</li>
            <li>3. 點選回傳的連結,登入此帳號並確認綁定</li>
          </ol>
          {status.addFriendUrl ? (
            <a href={status.addFriendUrl} target="_blank" rel="noreferrer" className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-[#06C755] py-3 text-sm font-semibold text-white">
              加入官方 LINE
            </a>
          ) : null}
        </div>
      )}
    </section>
  );
}
