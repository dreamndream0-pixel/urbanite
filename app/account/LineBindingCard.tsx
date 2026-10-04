'use client';

import { useEffect, useState } from 'react';
import { uiAlert, uiConfirm } from '@/lib/ui-dialog';

type Status = { bound: boolean; displayName: string };

const LineMark = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 3.5C6.8 3.5 2.6 6.9 2.6 11.1c0 3.8 3.4 6.9 7.9 7.5.3.1.7.2.8.5.1.3.1.6 0 .9l-.1.8c0 .3-.2 1 .9.5s5.9-3.5 8-5.9c1.5-1.6 2.2-3.2 2.2-4.9 0-4.2-4.2-7.5-9.3-7.5z" />
  </svg>
);

// 會員中心「關於你」的「LINE 綁定」欄位:
// 已綁定 → LINE 已綁定+解除綁定;未綁定 → 說明+加入 LINE(LINE 授權同時加好友並自動綁定)
export default function LineBindingRow() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    // 從 LINE 授權回來時帶的結果
    const url = new URL(window.location.href);
    const linked = url.searchParams.get('line') === 'linked';
    const error = url.searchParams.get('line_error');
    if (linked || error) {
      url.searchParams.delete('line');
      url.searchParams.delete('line_error');
      window.history.replaceState(null, '', url);
    }
    fetch('/api/me/line', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setStatus(d);
        if (linked || error) setNotice(linked ? { ok: true, text: 'LINE 綁定完成,可在官方 LINE 查詢訂單與優惠券' } : { ok: false, text: error ?? '' });
      })
      .catch(() => setStatus(null));
  }, []);

  async function unbind() {
    if (!(await uiConfirm('解除 LINE 綁定後,就無法在官方 LINE 查詢訂單、優惠券與購物金。確定解除?', { danger: true }))) return;
    setBusy(true);
    try {
      const res = await fetch('/api/me/line', { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error ?? '解除失敗');
      setStatus({ bound: false, displayName: '' });
      setNotice({ ok: true, text: '已解除 LINE 綁定' });
    } catch (e) {
      void uiAlert(e instanceof Error ? e.message : '解除失敗');
    } finally {
      setBusy(false);
    }
  }

  const box = 'flex min-h-10 w-full items-center gap-3 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 sm:min-h-11';

  return (
    <div className="col-span-2 min-w-0">
      <span className="mb-1.5 block text-xs font-medium text-[var(--c-text2)]">LINE 綁定</span>
      {!status ? (
        <div className={`${box} text-sm text-[var(--c-muted)]`}>讀取中…</div>
      ) : status.bound ? (
        <div className={box}>
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#06C755] text-white">
            <LineMark size={14} />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm">
            <span className="font-semibold text-[#1f7a44]">LINE 已綁定</span>
            {status.displayName ? <span className="text-[var(--c-muted)]">・{status.displayName}</span> : null}
          </span>
          <button
            type="button"
            onClick={unbind}
            disabled={busy}
            className="shrink-0 rounded-full border border-[var(--c-border-strong)] px-3 py-1 text-xs text-[var(--c-text2)] transition hover:bg-[var(--c-soft)] disabled:opacity-50"
          >
            {busy ? '處理中…' : '解除綁定'}
          </button>
        </div>
      ) : (
        <div className={box}>
          <span className="min-w-0 flex-1 text-xs leading-5 text-[var(--c-text2)]">加入 LINE 好友查詢訂單更方便,領取優惠券</span>
          <a
            href="/auth/line/start?mode=link&next=/account"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#06C755] px-3.5 py-1.5 text-xs font-semibold text-white"
          >
            <LineMark />
            加入 LINE
          </a>
        </div>
      )}
      {notice && notice.text ? <p className={`mt-1.5 text-xs ${notice.ok ? 'text-[#1f7a44]' : 'text-[#c0392b]'}`}>{notice.text}</p> : null}
    </div>
  );
}
