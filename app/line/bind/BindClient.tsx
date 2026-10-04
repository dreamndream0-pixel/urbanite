'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function BindClient({
  token,
  lineName,
  linePicture,
  account,
  alreadyMine,
  boundElsewhere,
}: {
  token: string;
  lineName: string;
  linePicture: string;
  account: string;
  alreadyMine: boolean;
  boundElsewhere: boolean;
}) {
  const [state, setState] = useState<'idle' | 'saving' | 'done'>(alreadyMine ? 'done' : 'idle');
  const [error, setError] = useState('');

  async function bind() {
    setState('saving');
    setError('');
    try {
      const res = await fetch('/api/me/line', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '綁定失敗');
      setState('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : '綁定失敗');
      setState('idle');
    }
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center gap-3 rounded-xl bg-[var(--c-bg)] p-3 text-left">
        {linePicture ? <img src={linePicture} alt="" className="h-11 w-11 rounded-full object-cover" /> : <span className="h-11 w-11 rounded-full bg-[var(--c-soft)]" />}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">LINE:{lineName || '你的 LINE 帳號'}</p>
          <p className="truncate text-xs text-[var(--c-muted)]">會員:{account}</p>
        </div>
      </div>

      {state === 'done' ? (
        <>
          <p className="text-sm leading-6 text-[#1f7a44]">✓ 綁定完成!回到 LINE 輸入「訂單查詢」「優惠券」「購物金」「會員資料」即可查詢。</p>
          <Link href="/account" className="block rounded-full bg-[var(--c-button)] py-3 text-sm font-semibold text-[var(--c-button-text)]">前往會員中心</Link>
        </>
      ) : boundElsewhere ? (
        <p className="text-sm leading-6 text-[#c0392b]">這個 LINE 已綁定其他會員帳號。請先登入該帳號,到會員中心解除綁定後再試一次。</p>
      ) : (
        <>
          <p className="text-sm leading-6 text-[var(--c-text2)]">確認要把這個 LINE 綁定到目前登入的會員帳號嗎?綁定後可在官方 LINE 查詢訂單、優惠券與購物金。</p>
          {error ? <p className="text-sm text-[#c0392b]">{error}</p> : null}
          <button type="button" onClick={bind} disabled={state === 'saving'} className="w-full rounded-full bg-[#06C755] py-3 text-sm font-semibold text-white disabled:opacity-60">
            {state === 'saving' ? '綁定中…' : '確認綁定'}
          </button>
          <p className="text-[11px] leading-5 text-[var(--c-muted)]">不是這個會員帳號?請先登出再重新點 LINE 裡的綁定連結。</p>
        </>
      )}
    </div>
  );
}
