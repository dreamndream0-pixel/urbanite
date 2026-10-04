'use client';

import { useEffect, useState } from 'react';

type Status = { bound: boolean };

// 會員中心「關於你」登入方式下方:已綁定顯示「LINE 已綁定」;
// 未綁定顯示「加入 LINE」→ LINE 授權畫面同時加入官方帳號好友,回來即完成綁定
export default function LineBindingRow() {
  const [status, setStatus] = useState<Status | null>(null);
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

  if (!status) return null;

  return (
    <div className="mt-2">
      {status.bound ? (
        <p className="flex items-center gap-1.5 text-xs font-semibold text-[#1f7a44]">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#06C755] text-[9px] text-white">✓</span>
          LINE 已綁定
        </p>
      ) : (
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <a href="/auth/line/start?mode=link&next=/account" className="inline-flex items-center gap-1.5 rounded-full bg-[#06C755] px-4 py-2 text-xs font-semibold text-white">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 3.5C6.8 3.5 2.6 6.9 2.6 11.1c0 3.8 3.4 6.9 7.9 7.5.3.1.7.2.8.5.1.3.1.6 0 .9l-.1.8c0 .3-.2 1 .9.5s5.9-3.5 8-5.9c1.5-1.6 2.2-3.2 2.2-4.9 0-4.2-4.2-7.5-9.3-7.5z" />
            </svg>
            加入 LINE
          </a>
          <span className="text-[11px] text-[var(--c-muted)]">加入官方 LINE 並自動綁定會員</span>
        </div>
      )}
      {notice && notice.text ? (
        <p className={`mt-2 text-xs ${notice.ok ? 'text-[#1f7a44]' : 'text-[#c0392b]'}`}>{notice.text}</p>
      ) : null}
    </div>
  );
}
