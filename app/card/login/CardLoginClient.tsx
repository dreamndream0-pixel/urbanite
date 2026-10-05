'use client';

import { useState } from 'react';
import { createBrowserSupabase } from '@/lib/supabase/client';
import { getBrowserAuthOrigin } from '@/lib/site-url';

export default function CardLoginClient({ nextPath, initialError = '' }: { nextPath: string; initialError?: string }) {
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState('');
  const [showEmail, setShowEmail] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function oauth(provider: 'google' | 'line') {
    setError('');
    setBusy(provider);
    if (provider === 'line') {
      window.location.href = `/auth/line/start?next=${encodeURIComponent(nextPath)}`;
      return;
    }
    try {
      const { error } = await createBrowserSupabase().auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${getBrowserAuthOrigin()}/auth/callback?next=${encodeURIComponent(nextPath)}` },
      });
      if (error) throw error;
    } catch (e) {
      setError(e instanceof Error ? e.message : '登入失敗');
      setBusy('');
    }
  }

  async function emailLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy('email');
    try {
      const { error } = await createBrowserSupabase().auth.signInWithPassword({ email, password });
      if (error) throw new Error('Email 或密碼不正確');
      await fetch('/api/customers', { method: 'POST' }).catch(() => {});
      window.location.href = nextPath;
    } catch (e) {
      setError(e instanceof Error ? e.message : '登入失敗');
      setBusy('');
    }
  }

  const button = 'flex w-full items-center justify-center gap-2.5 rounded-full py-3.5 text-sm font-semibold transition disabled:opacity-50';

  return (
    <div className="mx-auto max-w-sm px-4 py-12 sm:py-20">
      <h1 className="text-center font-serif-tc text-2xl font-bold tracking-[0.06em]">登入 URBANLINKS</h1>
      <p className="mt-2 text-center text-sm leading-6 text-[#8a7f72]">一個網址,放進你的全部。<br />第一次使用會自動建立帳號。</p>

      <div className="mt-8 space-y-3">
        <button type="button" disabled={Boolean(busy)} onClick={() => void oauth('line')} className={`${button} bg-[#06C755] text-white hover:bg-[#05b14c]`}>
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#fff" d="M21.5 10.6c0-4.3-4.3-7.8-9.5-7.8S2.5 6.3 2.5 10.6c0 3.8 3.4 7 8 7.7.3.1.7.2.8.5.1.3.1.6 0 .9l-.1.8c0 .3-.2 1 .8.5 1-.4 5.2-3.1 7.1-5.3 1.3-1.4 2.4-3.1 2.4-5.1Z" />
          </svg>
          {busy === 'line' ? '前往 LINE…' : '使用 LINE 繼續'}
        </button>
        <button type="button" disabled={Boolean(busy)} onClick={() => void oauth('google')} className={`${button} border border-[#e5ded4] bg-white text-[#1f1b19] hover:border-[#1f1b19]/30`}>
          <svg width="18" height="18" viewBox="0 0 32 32" aria-hidden="true">
            <path fill="#4285F4" d="M29 16.3c0-.9-.1-1.6-.2-2.4H16v4.5h7.3c-.1 1.1-.9 2.8-2.5 3.9v2.9h4c2.4-2.2 4.2-5.4 4.2-8.9Z" />
            <path fill="#34A853" d="M16 29c3.5 0 6.4-1.1 8.5-3.1l-4-2.9c-1.1.7-2.5 1.2-4.5 1.2-3.4 0-6.3-2.3-7.3-5.4H4.6v3C6.7 26 11 29 16 29Z" />
            <path fill="#FBBC05" d="M8.7 18.8c-.3-.8-.4-1.7-.4-2.8s.1-2 .4-2.8v-3H4.6A13 13 0 0 0 3 16c0 2.1.5 4.1 1.6 5.8l4.1-3Z" />
            <path fill="#EA4335" d="M16 7.8c2 0 3.4.9 4.2 1.6l3.1-3C21.4 4.6 18.5 3 16 3 11 3 6.7 6 4.6 10.2l4.1 3C9.7 10.1 12.6 7.8 16 7.8Z" />
          </svg>
          {busy === 'google' ? '前往 Google…' : '使用 Google 繼續'}
        </button>
      </div>

      {showEmail ? (
        <form onSubmit={emailLogin} className="mt-6 space-y-3 rounded-2xl border border-[#e5ded4] bg-white p-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            autoComplete="email"
            className="w-full rounded-xl border border-[#e5ded4] px-3.5 py-3 text-sm outline-none focus:border-[#1f1b19]/40"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="密碼"
            autoComplete="current-password"
            className="w-full rounded-xl border border-[#e5ded4] px-3.5 py-3 text-sm outline-none focus:border-[#1f1b19]/40"
          />
          <button type="submit" disabled={Boolean(busy) || !email || !password} className={`${button} bg-[#1f1b19] text-white hover:bg-[#3a322e]`}>
            {busy === 'email' ? '登入中…' : '登入'}
          </button>
        </form>
      ) : (
        <button type="button" onClick={() => setShowEmail(true)} className="mx-auto mt-6 block text-sm text-[#6b6156] underline underline-offset-4">
          用 Email 登入
        </button>
      )}

      {error ? <p className="mt-4 rounded-xl bg-[#fbf3f0] px-4 py-2.5 text-sm text-[#a33a2b]">{error}</p> : null}

      <p className="mt-10 text-center text-xs leading-5 text-[#a99e8f]">
        已經是 URBANITE 會員?用同一個帳號登入就可以。
      </p>
    </div>
  );
}
